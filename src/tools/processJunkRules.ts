import { getImapClient } from "../imap.js";
import { loadConfig } from "../config.js";
import type { ToolExtra } from "../types.js";

export const processJunkRulesSchema = {};

interface SenderResult {
  sender: string;
  count: number;
  error?: string;
}

export async function handleProcessJunkRules(extra?: ToolExtra): Promise<string> {
  const config = await loadConfig();
  const senders = config.rules.junk.senders;
  const markAsRead = config.rules.junk.markAsRead;

  if (senders.length === 0) {
    return JSON.stringify({ message: "No junk rules configured", totalJunked: 0 });
  }

  const client = await getImapClient();
  const results: SenderResult[] = [];
  let totalJunked = 0;

  for (let i = 0; i < senders.length; i++) {
    const sender = senders[i];
    const lock = await client.getMailboxLock("INBOX");
    try {
      const uids = await client.search({ from: sender }, { uid: true });
      const uidList = Array.isArray(uids) ? uids : [];

      if (uidList.length === 0) {
        results.push({ sender, count: 0 });
      } else {
        const uidRange = uidList.join(",");

        if (markAsRead) {
          await client.messageFlagsAdd(uidRange, ["\\Seen"], { uid: true });
        }

        await client.messageMove(uidRange, "Junk", { uid: true });
        totalJunked += uidList.length;
        results.push({ sender, count: uidList.length });
      }
    } catch (error) {
      results.push({ sender, count: 0, error: error instanceof Error ? error.message : String(error) });
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

  return JSON.stringify({ processed: results, totalJunked }, null, 2);
}
