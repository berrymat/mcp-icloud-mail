import { z } from "zod";
import { getImapClient } from "../imap.js";

export const listMailboxesSchema = {};

export async function handleListMailboxes(): Promise<string> {
  const client = await getImapClient();
  const mailboxes = await client.list();

  const result = mailboxes.map((mb) => ({
    path: mb.path,
    name: mb.name,
    delimiter: mb.delimiter,
    flags: Array.from(mb.flags),
    specialUse: mb.specialUse || null,
    listed: mb.listed,
  }));

  return JSON.stringify(result, null, 2);
}
