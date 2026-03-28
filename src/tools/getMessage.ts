import { z } from "zod";
import { getImapClient } from "../imap.js";
import { simpleParser } from "mailparser";

export const getMessageSchema = {
  mailbox: z.string().default("INBOX").describe("Mailbox containing the message"),
  uid: z.number().int().describe("UID of the message to fetch"),
};

interface GetMessageArgs {
  mailbox: string;
  uid: number;
}

export async function handleGetMessage(args: GetMessageArgs): Promise<string> {
  const client = await getImapClient();
  const lock = await client.getMailboxLock(args.mailbox);

  try {
    const raw = await client.download(String(args.uid), undefined, { uid: true });

    if (!raw || !raw.content) {
      return JSON.stringify({ error: `Message UID ${args.uid} not found in ${args.mailbox}` });
    }

    const parsed = await simpleParser(raw.content);

    const attachments = parsed.attachments?.map((att) => ({
      filename: att.filename,
      contentType: att.contentType,
      size: att.size,
    })) ?? [];

    return JSON.stringify({
      uid: args.uid,
      mailbox: args.mailbox,
      messageId: parsed.messageId,
      from: parsed.from?.value.map((a) => ({ name: a.name, address: a.address })),
      to: parsed.to ? (Array.isArray(parsed.to) ? parsed.to : [parsed.to]).flatMap(t => t.value.map((a) => ({ name: a.name, address: a.address }))) : [],
      cc: parsed.cc ? (Array.isArray(parsed.cc) ? parsed.cc : [parsed.cc]).flatMap(t => t.value.map((a) => ({ name: a.name, address: a.address }))) : [],
      subject: parsed.subject,
      date: parsed.date?.toISOString(),
      inReplyTo: parsed.inReplyTo,
      references: parsed.references,
      text: parsed.text,
      html: parsed.html || null,
      attachments,
    }, null, 2);
  } finally {
    lock.release();
  }
}
