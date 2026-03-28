import { z } from "zod";
import { getImapClient } from "../imap.js";

export const deleteMailboxSchema = {
  path: z.string().describe("Path of the mailbox/folder to delete"),
};

interface DeleteMailboxArgs {
  path: string;
}

export async function handleDeleteMailbox(args: DeleteMailboxArgs): Promise<string> {
  const client = await getImapClient();
  const result = await client.mailboxDelete(args.path);

  return JSON.stringify({
    success: true,
    path: result.path,
  });
}
