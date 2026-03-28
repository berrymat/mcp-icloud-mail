import { getImapClient } from "../imap.js";
import { loadConfig } from "../config.js";
import type { ProgressCallback } from "../types.js";

const BATCH_SIZE = 50;
const TIME_BUDGET_MS = 45000;

export const processDeleteRulesSchema = {};

interface SenderResult {
  sender: string;
  count: number;
  remaining: number;
  error?: string;
}

export async function handleProcessDeleteRules(progress?: ProgressCallback): Promise<string> {
  const config = await loadConfig();
  const senders = config.rules.delete.senders;
  const markAsRead = config.rules.delete.markAsRead;

  if (senders.length === 0) {
    return JSON.stringify({ message: "No delete rules configured", totalDeleted: 0 });
  }

  const client = await getImapClient();
  const results: SenderResult[] = [];
  let totalDeleted = 0;
  let hasRemaining = false;
  const startTime = Date.now();

  for (let i = 0; i < senders.length; i++) {
    if (Date.now() - startTime > TIME_BUDGET_MS) {
      hasRemaining = true;
      break;
    }

    const sender = senders[i];
    if (progress) await progress(`[delete ${i + 1}/${senders.length}] ${sender}`);

    const lock = await client.getMailboxLock("INBOX");
    try {
      const uids = await client.search({ from: sender }, { uid: true });
      const uidList = Array.isArray(uids) ? uids : [];

      if (uidList.length === 0) {
        results.push({ sender, count: 0, remaining: 0 });
      } else {
        const batch = uidList.slice(0, BATCH_SIZE);
        const remaining = uidList.length - batch.length;

        if (markAsRead) {
          await client.messageFlagsAdd(batch.join(","), ["\\Seen"], { uid: true });
        }
        await client.messageMove(batch.join(","), "Deleted Messages", { uid: true });
        totalDeleted += batch.length;
        if (remaining > 0) hasRemaining = true;
        results.push({ sender, count: batch.length, remaining });
      }
    } catch (error) {
      results.push({ sender, count: 0, remaining: 0, error: error instanceof Error ? error.message : String(error) });
    } finally {
      lock.release();
    }
  }

  return JSON.stringify({
    processed: results,
    totalDeleted,
    hasRemaining,
    sendersProcessed: results.length,
    sendersTotal: senders.length,
  }, null, 2);
}
