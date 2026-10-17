import { z } from "zod";
import { stat } from "node:fs/promises";
import { basename, resolve } from "node:path";
import MailComposer from "nodemailer/lib/mail-composer/index.js";
import type { Attachment } from "nodemailer/lib/mailer/index.js";
import { getSmtpTransporter } from "../smtp.js";
import { getImapClient } from "../imap.js";
import type { ImapFlow } from "imapflow";

export const sendMessageSchema = {
  to: z.array(z.string()).min(1).describe("Recipient email addresses"),
  cc: z.array(z.string()).optional().describe("CC email addresses"),
  bcc: z.array(z.string()).optional().describe("BCC email addresses"),
  subject: z.string().describe("Email subject"),
  text: z.string().optional().describe("Plain text body"),
  html: z.string().optional().describe("HTML body"),
  inReplyTo: z.string().optional().describe("Message-ID of the email being replied to"),
  references: z.array(z.string()).optional().describe("Message-ID references for threading"),
  attachments: z.array(z.object({
    path: z.string().optional().describe("Absolute path to a local file to attach (preferred for files on disk)"),
    content: z.string().optional().describe("Base64-encoded file content (use instead of path for generated content)"),
    filename: z.string().optional().describe("Filename shown to the recipient; defaults to the basename of path. Required with content."),
    contentType: z.string().optional().describe("MIME type, e.g. application/pdf; inferred from filename if omitted"),
    cid: z.string().optional().describe("Content-ID for inline images referenced from the HTML body as <img src=\"cid:...\">"),
  })).optional().describe("Files to attach. Each entry needs exactly one of path or content."),
};

interface SendMessageArgs {
  to: string[];
  cc?: string[];
  bcc?: string[];
  subject: string;
  text?: string;
  html?: string;
  inReplyTo?: string;
  references?: string[];
  attachments?: AttachmentArg[];
}

interface AttachmentArg {
  path?: string;
  content?: string;
  filename?: string;
  contentType?: string;
  cid?: string;
}

interface AttachmentSummary {
  filename: string;
  size: number;
  contentType?: string;
  cid?: string;
}

/**
 * Validate attachment arguments up front so a bad path or missing filename
 * fails before anything is sent, and convert them to nodemailer's shape.
 */
async function buildAttachments(
  args: AttachmentArg[] | undefined
): Promise<{ attachments: Attachment[]; summary: AttachmentSummary[] }> {
  const attachments: Attachment[] = [];
  const summary: AttachmentSummary[] = [];

  for (const [i, a] of (args ?? []).entries()) {
    const label = `attachments[${i}]`;
    if (!!a.path === !!a.content) {
      throw new Error(`${label}: provide exactly one of path or content`);
    }

    if (a.path) {
      const fullPath = resolve(a.path);
      let size: number;
      try {
        const info = await stat(fullPath);
        if (!info.isFile()) throw new Error("not a regular file");
        size = info.size;
      } catch (err) {
        throw new Error(`${label}: cannot read ${fullPath}: ${err instanceof Error ? err.message : String(err)}`);
      }
      const filename = a.filename ?? basename(fullPath);
      attachments.push({ path: fullPath, filename, contentType: a.contentType, cid: a.cid });
      summary.push({ filename, size, contentType: a.contentType, cid: a.cid });
    } else {
      if (!a.filename) throw new Error(`${label}: filename is required when using content`);
      const buffer = Buffer.from(a.content!, "base64");
      if (buffer.length === 0) throw new Error(`${label}: content is empty or not valid base64`);
      attachments.push({ content: buffer, filename: a.filename, contentType: a.contentType, cid: a.cid });
      summary.push({ filename: a.filename, size: buffer.length, contentType: a.contentType, cid: a.cid });
    }
  }

  return { attachments, summary };
}

let sentMailboxPath: string | null = null;

/**
 * Resolve the mailbox that mail clients treat as Sent.
 *
 * Order matters: iCloud's real Sent folder is "Sent Messages", which the
 * server advertises with the \Sent SPECIAL-USE attribute (in `flags`).
 * imapflow's `specialUse` property, by contrast, can come from a name-based
 * guess and may land on a stale folder literally named "Sent", so it is
 * only a fallback here.
 */
async function getSentMailboxPath(imap: ImapFlow): Promise<string> {
  if (sentMailboxPath) return sentMailboxPath;

  const mailboxes = await imap.list();
  const sent =
    mailboxes.find((mb) => mb.flags.has("\\Sent")) ??
    mailboxes.find((mb) => mb.path === "Sent Messages") ??
    mailboxes.find((mb) => mb.specialUse === "\\Sent") ??
    mailboxes.find((mb) => mb.name.toLowerCase() === "sent");

  if (!sent) {
    throw new Error("Could not find a Sent mailbox on the server");
  }

  sentMailboxPath = sent.path;
  return sentMailboxPath;
}

export async function handleSendMessage(args: SendMessageArgs): Promise<string> {
  const transporter = getSmtpTransporter();
  const fromEmail = process.env.ICLOUD_EMAIL;
  if (!fromEmail) {
    throw new Error("ICLOUD_EMAIL environment variable is required.");
  }

  const { attachments, summary: attachmentSummary } = await buildAttachments(args.attachments);

  // Build the MIME message once so the copy saved to Sent is byte-for-byte
  // the message that went over the wire (same Message-ID, Date, boundaries).
  const node = new MailComposer({
    from: fromEmail,
    to: args.to.join(", "),
    cc: args.cc?.join(", "),
    bcc: args.bcc?.join(", "),
    subject: args.subject,
    text: args.text,
    html: args.html,
    inReplyTo: args.inReplyTo,
    references: args.references?.join(" "),
    attachments,
  }).compile();

  const messageId = node.messageId();
  const wireMessage = await node.build(); // Bcc header stripped (keepBcc=false)

  // Note: for raw sends nodemailer generates an unrelated info.messageId,
  // so we report the ID from the built message instead.
  await transporter.sendMail({
    envelope: {
      from: fromEmail,
      to: [...args.to, ...(args.cc ?? []), ...(args.bcc ?? [])],
    },
    raw: wireMessage,
  });

  // Save a copy to the Sent mailbox. Keep the Bcc header in this copy, as
  // mail clients do, so the sender can see who was blind-copied.
  let sentCopy: { mailbox: string; uid?: number } | { error: string };
  try {
    node.keepBcc = true;
    const sentMessage = await node.build();
    const client = await getImapClient();
    const mailbox = await getSentMailboxPath(client);
    const appended = await client.append(mailbox, sentMessage, ["\\Seen"], new Date());
    sentCopy = { mailbox, uid: appended ? appended.uid : undefined };
  } catch (err) {
    // The message was already sent; don't fail the call over the Sent copy.
    sentCopy = { error: err instanceof Error ? err.message : String(err) };
  }

  return JSON.stringify({
    success: true,
    messageId,
    to: args.to,
    subject: args.subject,
    attachments: attachmentSummary,
    sentCopy,
  });
}
