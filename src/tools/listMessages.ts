import { z } from "zod";
import { getImapClient } from "../imap.js";

export const listMessagesSchema = {
  mailbox: z.string().default("INBOX").describe("Mailbox/folder path to list messages from"),
  page: z.number().int().min(1).default(1).describe("Page number (1-based)"),
  pageSize: z.number().int().min(1).max(100).default(20).describe("Messages per page (max 100)"),
};

interface ListMessagesArgs {
  mailbox: string;
  page: number;
  pageSize: number;
}

export async function handleListMessages(args: ListMessagesArgs): Promise<string> {
  const client = await getImapClient();
  const lock = await client.getMailboxLock(args.mailbox);

  try {
    const status = client.mailbox;
    if (!status) {
      return JSON.stringify({ error: "Could not open mailbox" });
    }

    const total = status.exists ?? 0;
    if (total === 0) {
      return JSON.stringify({ mailbox: args.mailbox, total: 0, page: args.page, pageSize: args.pageSize, messages: [] });
    }

    // Calculate sequence range for pagination (newest first)
    const start = Math.max(1, total - (args.page * args.pageSize) + 1);
    const end = Math.max(1, total - ((args.page - 1) * args.pageSize));

    if (start > total) {
      return JSON.stringify({ mailbox: args.mailbox, total, page: args.page, pageSize: args.pageSize, messages: [] });
    }

    const messages: Array<Record<string, unknown>> = [];

    for await (const msg of client.fetch(`${start}:${end}`, {
      uid: true,
      envelope: true,
      flags: true,
      size: true,
    })) {
      const env = msg.envelope;
      messages.push({
        uid: msg.uid,
        seq: msg.seq,
        from: env?.from?.map((a) => ({ name: a.name, address: a.address })),
        to: env?.to?.map((a) => ({ name: a.name, address: a.address })),
        subject: env?.subject,
        date: env?.date?.toISOString(),
        messageId: env?.messageId,
        flags: msg.flags ? Array.from(msg.flags) : [],
        size: msg.size,
      });
    }

    // Reverse so newest is first
    messages.reverse();

    return JSON.stringify({
      mailbox: args.mailbox,
      total,
      page: args.page,
      pageSize: args.pageSize,
      messages,
    }, null, 2);
  } finally {
    lock.release();
  }
}
