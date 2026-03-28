import { z } from "zod";
import { getImapClient } from "../imap.js";

export const deleteMessagesSchema = {
  mailbox: z.string().default("INBOX").describe("Mailbox containing the messages"),
  uids: z.array(z.number().int()).min(1).describe("UIDs of messages to delete"),
  permanent: z.boolean().default(false).describe("If true, permanently expunge; otherwise move to Trash"),
};

interface DeleteMessagesArgs {
  mailbox: string;
  uids: number[];
  permanent: boolean;
}

export async function handleDeleteMessages(args: DeleteMessagesArgs): Promise<string> {
  const client = await getImapClient();
  const lock = await client.getMailboxLock(args.mailbox);

  try {
    const uidRange = args.uids.join(",");

    if (args.permanent) {
      await client.messageDelete(uidRange, { uid: true });
    } else {
      // Move to Trash folder (iCloud uses "Deleted Messages")
      await client.messageMove(uidRange, "Deleted Messages", { uid: true });
    }

    return JSON.stringify({
      success: true,
      deleted: args.uids.length,
      permanent: args.permanent,
      uids: args.uids,
    });
  } finally {
    lock.release();
  }
}
