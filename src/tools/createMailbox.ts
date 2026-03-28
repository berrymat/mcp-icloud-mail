import { z } from "zod";
import { getImapClient } from "../imap.js";

export const createMailboxSchema = {
  path: z.string().describe("Path of the new mailbox/folder to create (e.g., 'Archive/2024')"),
};

interface CreateMailboxArgs {
  path: string;
}

export async function handleCreateMailbox(args: CreateMailboxArgs): Promise<string> {
  const client = await getImapClient();
  const result = await client.mailboxCreate(args.path);

  return JSON.stringify({
    success: true,
    path: result.path,
    created: result.created,
  });
}
