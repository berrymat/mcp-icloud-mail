import { handleProcessDeleteRules } from "./processDeleteRules.js";
import { handleProcessJunkRules } from "./processJunkRules.js";
import { handleProcessKeepLatestRules } from "./processKeepLatestRules.js";
import { handleProcessArchiveRead } from "./processArchiveRead.js";
import type { ProgressCallback } from "../types.js";

export const processAllRulesSchema = {};

export async function handleProcessAllRules(progress?: ProgressCallback): Promise<string> {
  const deleteResult = JSON.parse(await handleProcessDeleteRules(progress));
  const junkResult = JSON.parse(await handleProcessJunkRules(progress));
  const keepLatestResult = JSON.parse(await handleProcessKeepLatestRules(progress));
  const archiveReadResult = JSON.parse(await handleProcessArchiveRead(progress));

  return JSON.stringify({
    delete: deleteResult,
    junk: junkResult,
    keepLatest: keepLatestResult,
    archiveRead: archiveReadResult,
    summary: {
      totalDeleted: deleteResult.totalDeleted ?? 0,
      totalJunked: junkResult.totalJunked ?? 0,
      totalTrashed: keepLatestResult.totalTrashed ?? 0,
      totalArchived: archiveReadResult.totalArchived ?? 0,
    },
  }, null, 2);
}
