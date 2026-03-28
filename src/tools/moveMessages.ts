import { z } from "zod";
import { getImapClient } from "../imap.js";

export const moveMessagesSchema = {
  mailbox: z.string().default("INBOX").describe("Source mailbox containing the messages"),
  uids: z.array(z.number().int()).min(1).describe("UIDs of messages to move"),
  destination: z.string().describe("Destination mailbox/folder path"),
};

interface MoveMessagesArgs {
  mailbox: string;
  uids: number[];
  destination: string;
}

export async function handleMoveMessages(args: MoveMessagesArgs): Promise<string> {
  const client = await getImapClient();
  const lock = await client.getMailboxLock(args.mailbox);

  try {
    const uidRange = args.uids.join(",");
    await client.messageMove(uidRange, args.destination, { uid: true });

    return JSON.stringify({
      success: true,
      moved: args.uids.length,
      from: args.mailbox,
      to: args.destination,
      uids: args.uids,
    });
  } finally {
    lock.release();
  }
}
