#!/usr/bin/env node

/**
 * Standalone script to run all cleanup rules until fully drained.
 * Bypasses MCP timeout — runs directly against IMAP.
 *
 * Usage: ICLOUD_EMAIL=... ICLOUD_PASSWORD=... node scripts/drain-rules.mjs [delete|junk|keepLatest|archiveRead|all]
 */

import { handleProcessDeleteRules } from "../dist/tools/processDeleteRules.js";
import { handleProcessJunkRules } from "../dist/tools/processJunkRules.js";
import { handleProcessKeepLatestRules } from "../dist/tools/processKeepLatestRules.js";
import { handleProcessArchiveRead } from "../dist/tools/processArchiveRead.js";
import { disconnectImap } from "../dist/imap.js";

const runners = {
  delete: { fn: handleProcessDeleteRules, totalKey: "totalDeleted" },
  junk: { fn: handleProcessJunkRules, totalKey: "totalJunked" },
  keepLatest: { fn: handleProcessKeepLatestRules, totalKey: "totalTrashed" },
  archiveRead: { fn: handleProcessArchiveRead, totalKey: "totalArchived" },
};

const which = process.argv[2] || "all";
const targets = which === "all" ? Object.keys(runners) : [which];

for (const name of targets) {
  const runner = runners[name];
  if (!runner) {
    console.error(`Unknown rule: ${name}. Use: delete, junk, keepLatest, archiveRead, all`);
    process.exit(1);
  }

  console.log(`\n=== Processing ${name} rules ===`);
  let grandTotal = 0;
  let pass = 0;

  while (true) {
    pass++;
    const start = Date.now();
    const result = JSON.parse(await runner.fn());
    const elapsed = ((Date.now() - start) / 1000).toFixed(1);
    const moved = result[runner.totalKey] ?? 0;
    grandTotal += moved;

    const active = result.processed?.filter((r) => (r.count ?? r.archived ?? 0) > 0) ?? [];
    const remaining = result.processed?.reduce((sum, r) => sum + (r.remaining ?? 0), 0) ?? 0;

    console.log(
      `  Pass ${pass}: ${moved} moved in ${elapsed}s | Total: ${grandTotal} | Remaining: ${remaining}`
    );
    for (const r of active) {
      const label = r.sender ?? r.mailbox ?? "?";
      const count = r.count ?? r.archived ?? 0;
      const extra = r.remaining > 0 ? ` (${r.remaining} left)` : "";
      console.log(`    ${label}: ${count}${extra}`);
    }

    if (!result.hasRemaining || moved === 0) {
      if (moved === 0 && result.hasRemaining) {
        console.log(`  Stopping — 0 moved this pass with hasRemaining=true (all senders exhausted).`);
      } else {
        console.log(`  Done! ${grandTotal} total ${name} messages processed.`);
      }
      break;
    }
  }
}

await disconnectImap();
console.log("\nAll done.");
