import { getImapClient } from "../imap.js";
import { loadConfig } from "../config.js";
import type { ProgressCallback } from "../types.js";

export const processDeleteRulesSchema = {};

interface SenderResult {
  sender: string;
  count: number;
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

  for (let i = 0; i < senders.length; i++) {
    const sender = senders[i];
    if (progress) await progress(`[delete ${i + 1}/${senders.length}] Searching for: ${sender}`);

    const lock = await client.getMailboxLock("INBOX");
    try {
      const uids = await client.search({ from: sender }, { uid: true });
      const uidList = Array.isArray(uids) ? uids : [];

      if (uidList.length === 0) {
        results.push({ sender, count: 0 });
      } else {
        if (markAsRead) {
          await client.messageFlagsAdd(uidList.join(","), ["\\Seen"], { uid: true });
        }
        await client.messageMove(uidList.join(","), "Deleted Messages", { uid: true });
        totalDeleted += uidList.length;
        results.push({ sender, count: uidList.length });
      }
    } catch (error) {
      results.push({ sender, count: 0, error: error instanceof Error ? error.message : String(error) });
    } finally {
      lock.release();
    }

    if (progress) await progress(`[delete ${i + 1}/${senders.length}] ${sender}: ${results[results.length - 1].count} deleted`);
  }

  return JSON.stringify({ processed: results, totalDeleted }, null, 2);
}
