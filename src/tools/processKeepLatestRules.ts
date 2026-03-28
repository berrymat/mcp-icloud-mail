import { getImapClient } from "../imap.js";
import { loadConfig } from "../config.js";
import type { ToolExtra } from "../types.js";

export const processKeepLatestRulesSchema = {};

interface SenderResult {
  sender: string;
  kept: number | null;
  trashed: number;
  error?: string;
}

export async function handleProcessKeepLatestRules(extra?: ToolExtra): Promise<string> {
  const config = await loadConfig();
  const senders = config.rules.keepLatest.senders;
  const markAsRead = config.rules.keepLatest.markAsRead;

  if (senders.length === 0) {
    return JSON.stringify({ message: "No keep-latest rules configured", totalTrashed: 0 });
  }

  const client = await getImapClient();
  const results: SenderResult[] = [];
  let totalTrashed = 0;

  for (let i = 0; i < senders.length; i++) {
    const sender = senders[i];
    const lock = await client.getMailboxLock("INBOX");
    try {
      const uids = await client.search({ from: sender }, { uid: true });
      const uidList = Array.isArray(uids) ? uids : [];

      if (uidList.length === 0) {
        results.push({ sender, kept: null, trashed: 0 });
      } else {
        // Highest UID = newest message
        const sorted = [...uidList].sort((a, b) => b - a);
        const keepUid = sorted[0];
        const trashUids = sorted.slice(1);

        if (markAsRead) {
          await client.messageFlagsAdd(String(keepUid), ["\\Seen"], { uid: true });
        }

        if (trashUids.length > 0) {
          const trashRange = trashUids.join(",");
          if (markAsRead) {
            await client.messageFlagsAdd(trashRange, ["\\Seen"], { uid: true });
          }
          await client.messageMove(trashRange, "Deleted Messages", { uid: true });
          totalTrashed += trashUids.length;
        }

        results.push({ sender, kept: keepUid, trashed: trashUids.length });
      }
    } catch (error) {
      results.push({ sender, kept: null, trashed: 0, error: error instanceof Error ? error.message : String(error) });
    } finally {
      lock.release();
    }

    if (extra) {
      await extra.sendNotification({
        method: "notifications/progress",
        params: { progressToken: extra.progressToken!, progress: i + 1, total: senders.length, message: `Processed ${sender}` },
      });
    }
  }

  return JSON.stringify({ processed: results, totalTrashed }, null, 2);
}
