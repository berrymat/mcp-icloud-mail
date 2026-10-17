import { getImapClient } from "../imap.js";
import { loadConfig } from "../config.js";
import type { ProgressCallback } from "../types.js";

const BATCH_SIZE = 50;
const TIME_BUDGET_MS = 45000;

export const processArchiveReadSchema = {};

interface MailboxResult {
  sender: string;
  mailbox: string;
  archived: number;
  remaining: number;
  error?: string;
}

export async function handleProcessArchiveRead(progress?: ProgressCallback): Promise<string> {
  const config = await loadConfig();
  const rule = config.rules.archiveRead;

  if (!rule) {
    return JSON.stringify({ message: "No archiveRead rule configured", totalArchived: 0 });
  }

  const { daysOld, defaultMailbox, senderRules } = rule;
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - daysOld);

  const client = await getImapClient();
  const results: MailboxResult[] = [];
  let totalArchived = 0;
  let hasRemaining = false;
  const startTime = Date.now();

  // Ensure all destination mailboxes exist up front
  const allMailboxes = new Set<string>([defaultMailbox]);
  for (const sr of senderRules) allMailboxes.add(sr.mailbox);
  for (const mailbox of allMailboxes) {
    try { await client.mailboxCreate(mailbox); } catch { /* already exists */ }
  }

  // Phase 1: Per-sender searches → specific destination mailboxes.
  // Search by (from + seen + before) for each sender keyword, move to
  // the rule's mailbox. Because we move these out of INBOX first,
  // the Phase 2 catch-all won't double-process them.
  for (const senderRule of senderRules) {
    for (const sender of senderRule.senders) {
      if (Date.now() - startTime > TIME_BUDGET_MS) {
        hasRemaining = true;
        break;
      }

      if (progress) await progress(`[archiveRead] ${sender} → ${senderRule.mailbox}`);

      const lock = await client.getMailboxLock("INBOX");
      let uids: number[] = [];
      try {
        const found = await client.search(
          { from: sender, seen: true, before: cutoffDate },
          { uid: true }
        );
        uids = Array.isArray(found) ? found : [];
      } finally {
        lock.release();
      }

      if (uids.length === 0) continue;

      const batch = uids.slice(0, BATCH_SIZE);
      const remaining = uids.length - batch.length;
      if (remaining > 0) hasRemaining = true;

      const moveLock = await client.getMailboxLock("INBOX");
      try {
        await client.messageMove(batch.join(","), senderRule.mailbox, { uid: true });
        totalArchived += batch.length;
        results.push({ sender, mailbox: senderRule.mailbox, archived: batch.length, remaining });
      } catch (error) {
        results.push({ sender, mailbox: senderRule.mailbox, archived: 0, remaining: uids.length, error: error instanceof Error ? error.message : String(error) });
      } finally {
        moveLock.release();
      }
    }
    if (hasRemaining) break;
  }

  // Phase 2: Catch-all — any remaining seen+before messages go to defaultMailbox.
  // Sender-rule matches were already moved in Phase 1, so this only catches
  // messages that didn't match any specific rule.
  if (Date.now() - startTime < TIME_BUDGET_MS) {
    if (progress) await progress(`[archiveRead] catch-all → ${defaultMailbox}`);

    const lock = await client.getMailboxLock("INBOX");
    let uids: number[] = [];
    try {
      const found = await client.search(
        { seen: true, before: cutoffDate },
        { uid: true }
      );
      uids = Array.isArray(found) ? found : [];
    } finally {
      lock.release();
    }

    if (uids.length > 0) {
      const batch = uids.slice(0, BATCH_SIZE);
      const remaining = uids.length - batch.length;
      if (remaining > 0) hasRemaining = true;

      const moveLock = await client.getMailboxLock("INBOX");
      try {
        await client.messageMove(batch.join(","), defaultMailbox, { uid: true });
        totalArchived += batch.length;
        results.push({ sender: "(catch-all)", mailbox: defaultMailbox, archived: batch.length, remaining });
      } catch (error) {
        results.push({ sender: "(catch-all)", mailbox: defaultMailbox, archived: 0, remaining: uids.length, error: error instanceof Error ? error.message : String(error) });
      } finally {
        moveLock.release();
      }
    }
  }

  return JSON.stringify({
    processed: results,
    totalArchived,
    hasRemaining,
    cutoffDate: cutoffDate.toISOString(),
    daysOld,
  }, null, 2);
}
