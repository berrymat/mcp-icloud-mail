import { z } from "zod";
import { mkdir, stat, writeFile } from "node:fs/promises";
import { basename, join, resolve } from "node:path";
import { simpleParser, type Attachment } from "mailparser";
import { getImapClient } from "../imap.js";

/** Largest attachment returned inline; bigger ones must be saved with saveDir. */
const MAX_INLINE_BYTES = 2 * 1024 * 1024;

export const getAttachmentSchema = {
  mailbox: z.string().default("INBOX").describe("Mailbox containing the message"),
  uid: z.number().int().describe("UID of the message"),
  filename: z.string().optional().describe("Attachment filename, as listed by get_message"),
  index: z.number().int().min(0).optional().describe("0-based attachment index, as listed by get_message (alternative to filename)"),
  saveDir: z.string().optional().describe("Directory to save the file into; the result then returns the saved path instead of the content"),
  asBase64: z.boolean().default(false).describe("Return inline content as base64 even for text types"),
};

interface GetAttachmentArgs {
  mailbox: string;
  uid: number;
  filename?: string;
  index?: number;
  saveDir?: string;
  asBase64: boolean;
}

const TEXT_TYPES = /^(text\/|application\/(json|xml|javascript|x-yaml|yaml|csv|x-sh)$)/i;

function isTextual(contentType: string | undefined): boolean {
  return !!contentType && TEXT_TYPES.test(contentType);
}

function pickAttachment(attachments: Attachment[], args: GetAttachmentArgs): Attachment {
  if (attachments.length === 0) {
    throw new Error(`Message UID ${args.uid} in ${args.mailbox} has no attachments`);
  }
  if (args.index !== undefined) {
    const att = attachments[args.index];
    if (!att) throw new Error(`Attachment index ${args.index} out of range (message has ${attachments.length})`);
    return att;
  }
  if (args.filename) {
    const matches = attachments.filter((a) => a.filename === args.filename);
    if (matches.length === 0) {
      const names = attachments.map((a, i) => `${i}: ${a.filename ?? "(unnamed)"}`).join(", ");
      throw new Error(`No attachment named "${args.filename}". Available: ${names}`);
    }
    if (matches.length > 1) {
      throw new Error(`${matches.length} attachments are named "${args.filename}"; select one with index`);
    }
    return matches[0];
  }
  if (attachments.length === 1) return attachments[0];
  const names = attachments.map((a, i) => `${i}: ${a.filename ?? "(unnamed)"}`).join(", ");
  throw new Error(`Message has ${attachments.length} attachments; specify filename or index. Available: ${names}`);
}

/** Pick a path inside dir that does not clobber an existing file. */
async function uniquePath(dir: string, filename: string): Promise<string> {
  const safeName = basename(filename) || "attachment";
  const dot = safeName.lastIndexOf(".");
  const stem = dot > 0 ? safeName.slice(0, dot) : safeName;
  const ext = dot > 0 ? safeName.slice(dot) : "";
  for (let n = 0; ; n++) {
    const candidate = join(dir, n === 0 ? safeName : `${stem}-${n}${ext}`);
    try {
      await stat(candidate);
    } catch {
      return candidate;
    }
  }
}

export async function handleGetAttachment(args: GetAttachmentArgs): Promise<string> {
  const client = await getImapClient();
  const lock = await client.getMailboxLock(args.mailbox);

  let attachment: Attachment;
  try {
    const raw = await client.download(String(args.uid), undefined, { uid: true });
    if (!raw || !raw.content) {
      throw new Error(`Message UID ${args.uid} not found in ${args.mailbox}`);
    }
    const parsed = await simpleParser(raw.content);
    attachment = pickAttachment(parsed.attachments ?? [], args);
  } finally {
    lock.release();
  }

  const filename = attachment.filename ?? "attachment";
  const meta = {
    uid: args.uid,
    mailbox: args.mailbox,
    filename,
    contentType: attachment.contentType,
    size: attachment.content.length,
    cid: attachment.cid || undefined,
  };

  if (args.saveDir) {
    const dir = resolve(args.saveDir);
    await mkdir(dir, { recursive: true });
    const path = await uniquePath(dir, filename);
    await writeFile(path, attachment.content);
    return JSON.stringify({ ...meta, savedTo: path }, null, 2);
  }

  if (attachment.content.length > MAX_INLINE_BYTES) {
    throw new Error(
      `Attachment "${filename}" is ${attachment.content.length} bytes, above the ${MAX_INLINE_BYTES}-byte inline limit; pass saveDir to write it to disk`
    );
  }

  if (!args.asBase64 && isTextual(attachment.contentType)) {
    return JSON.stringify({ ...meta, encoding: "utf8", content: attachment.content.toString("utf8") }, null, 2);
  }
  return JSON.stringify({ ...meta, encoding: "base64", content: attachment.content.toString("base64") }, null, 2);
}
