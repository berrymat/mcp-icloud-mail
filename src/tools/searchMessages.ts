import { z } from "zod";
import { getImapClient } from "../imap.js";
import type { SearchObject } from "imapflow";

export const searchMessagesSchema = {
  mailbox: z.string().default("INBOX").describe("Mailbox to search in"),
  from: z.string().optional().describe("Filter by sender address or name"),
  to: z.string().optional().describe("Filter by recipient address or name"),
  subject: z.string().optional().describe("Filter by subject (substring match)"),
  body: z.string().optional().describe("Filter by body text (substring match)"),
  since: z.string().optional().describe("Messages since this date (YYYY-MM-DD)"),
  before: z.string().optional().describe("Messages before this date (YYYY-MM-DD)"),
  unseen: z.boolean().optional().describe("Only unread messages"),
  flagged: z.boolean().optional().describe("Only flagged/starred messages"),
  limit: z.number().int().min(1).max(200).default(50).describe("Max results to return"),
};

interface SearchMessagesArgs {
  mailbox: string;
  from?: string;
  to?: string;
  subject?: string;
  body?: string;
  since?: string;
  before?: string;
  unseen?: boolean;
  flagged?: boolean;
  limit: number;
}

export async function handleSearchMessages(args: SearchMessagesArgs): Promise<string> {
  const client = await getImapClient();
  const lock = await client.getMailboxLock(args.mailbox);

  try {
    const criteria: SearchObject = {};

    if (args.from) criteria.from = args.from;
    if (args.to) criteria.to = args.to;
    if (args.subject) criteria.subject = args.subject;
    if (args.body) criteria.body = args.body;
    if (args.since) criteria.since = new Date(args.since);
    if (args.before) criteria.before = new Date(args.before);
    if (args.unseen) criteria.seen = false;
    if (args.flagged) criteria.flagged = true;

    const searchResult = await client.search(criteria, { uid: true });
    const uids = Array.isArray(searchResult) ? searchResult : [];

    if (uids.length === 0) {
      return JSON.stringify({ mailbox: args.mailbox, total: 0, messages: [] });
    }

    // Take the last N UIDs (newest) and reverse for newest-first
    const limitedUids = uids.slice(-args.limit).reverse();
    const uidRange = limitedUids.join(",");

    const messages: Array<Record<string, unknown>> = [];

    for await (const msg of client.fetch(uidRange, {
      uid: true,
      envelope: true,
      flags: true,
      size: true,
    }, { uid: true })) {
      const env = msg.envelope;
      messages.push({
        uid: msg.uid,
        from: env?.from?.map((a) => ({ name: a.name, address: a.address })),
        to: env?.to?.map((a) => ({ name: a.name, address: a.address })),
        subject: env?.subject,
        date: env?.date?.toISOString(),
        messageId: env?.messageId,
        flags: msg.flags ? Array.from(msg.flags) : [],
        size: msg.size,
      });
    }

    return JSON.stringify({
      mailbox: args.mailbox,
      totalMatches: uids.length,
      returned: messages.length,
      messages,
    }, null, 2);
  } finally {
    lock.release();
  }
}
