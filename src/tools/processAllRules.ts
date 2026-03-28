import { handleProcessDeleteRules } from "./processDeleteRules.js";
import { handleProcessJunkRules } from "./processJunkRules.js";
import { handleProcessKeepLatestRules } from "./processKeepLatestRules.js";

export const processAllRulesSchema = {};

export async function handleProcessAllRules(): Promise<string> {
  const deleteResult = JSON.parse(await handleProcessDeleteRules());
  const junkResult = JSON.parse(await handleProcessJunkRules());
  const keepLatestResult = JSON.parse(await handleProcessKeepLatestRules());

  return JSON.stringify({
    delete: deleteResult,
    junk: junkResult,
    keepLatest: keepLatestResult,
    summary: {
      totalDeleted: deleteResult.totalDeleted ?? 0,
      totalJunked: junkResult.totalJunked ?? 0,
      totalTrashed: keepLatestResult.totalTrashed ?? 0,
    },
  }, null, 2);
}
