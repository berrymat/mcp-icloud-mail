import { z } from "zod";
import { getImapClient } from "../imap.js";

export const flagMessagesSchema = {
  mailbox: z.string().default("INBOX").describe("Mailbox containing the messages"),
  uids: z.array(z.number().int()).min(1).describe("UIDs of messages to flag"),
  flags: z.array(z.enum(["\\Seen", "\\Flagged", "\\Answered", "\\Deleted", "\\Draft"])).min(1).describe("IMAP flags to set or remove"),
  action: z.enum(["add", "remove", "set"]).default("add").describe("Whether to add, remove, or replace flags"),
};

interface FlagMessagesArgs {
  mailbox: string;
  uids: number[];
  flags: string[];
  action: "add" | "remove" | "set";
}

export async function handleFlagMessages(args: FlagMessagesArgs): Promise<string> {
  const client = await getImapClient();
  const lock = await client.getMailboxLock(args.mailbox);

  try {
    const uidRange = args.uids.join(",");
    const flagSet = new Set(args.flags);

    if (args.action === "add") {
      await client.messageFlagsAdd(uidRange, [...flagSet], { uid: true });
    } else if (args.action === "remove") {
      await client.messageFlagsRemove(uidRange, [...flagSet], { uid: true });
    } else {
      await client.messageFlagsSet(uidRange, [...flagSet], { uid: true });
    }

    return JSON.stringify({
      success: true,
      uids: args.uids,
      flags: args.flags,
      action: args.action,
    });
  } finally {
    lock.release();
  }
}
