import { getImapClient } from "../imap.js";
import { loadConfig } from "../config.js";
import type { ProgressCallback } from "../types.js";

const BATCH_SIZE = 100;

export const processKeepLatestRulesSchema = {};

interface SenderResult {
  sender: string;
  kept: number | null;
  trashed: number;
  remaining: number;
  error?: string;
}

export async function handleProcessKeepLatestRules(progress?: ProgressCallback): Promise<string> {
  const config = await loadConfig();
  const senders = config.rules.keepLatest.senders;
  const markAsRead = config.rules.keepLatest.markAsRead;

  if (senders.length === 0) {
    return JSON.stringify({ message: "No keep-latest rules configured", totalTrashed: 0 });
  }

  const client = await getImapClient();
  const results: SenderResult[] = [];
  let totalTrashed = 0;
  let hasRemaining = false;

  for (let i = 0; i < senders.length; i++) {
    const sender = senders[i];
    if (progress) await progress(`[keepLatest ${i + 1}/${senders.length}] ${sender}`);

    const lock = await client.getMailboxLock("INBOX");
    try {
      const uids = await client.search({ from: sender }, { uid: true });
      const uidList = Array.isArray(uids) ? uids : [];

      if (uidList.length === 0) {
        results.push({ sender, kept: null, trashed: 0, remaining: 0 });
      } else {
        const sorted = [...uidList].sort((a, b) => b - a);
        const keepUid = sorted[0];
        const allTrashUids = sorted.slice(1);

        if (markAsRead) {
          await client.messageFlagsAdd(String(keepUid), ["\\Seen"], { uid: true });
        }

        if (allTrashUids.length > 0) {
          const batch = allTrashUids.slice(0, BATCH_SIZE);
          const remaining = allTrashUids.length - batch.length;

          if (markAsRead) {
            await client.messageFlagsAdd(batch.join(","), ["\\Seen"], { uid: true });
          }
          await client.messageMove(batch.join(","), "Deleted Messages", { uid: true });
          totalTrashed += batch.length;
          if (remaining > 0) hasRemaining = true;
          results.push({ sender, kept: keepUid, trashed: batch.length, remaining });
        } else {
          results.push({ sender, kept: keepUid, trashed: 0, remaining: 0 });
        }
      }
    } catch (error) {
      results.push({ sender, kept: null, trashed: 0, remaining: 0, error: error instanceof Error ? error.message : String(error) });
    } finally {
      lock.release();
    }
  }

  return JSON.stringify({ processed: results, totalTrashed, hasRemaining }, null, 2);
}
