import { handleProcessDeleteRules } from "./processDeleteRules.js";
import { handleProcessJunkRules } from "./processJunkRules.js";
import { handleProcessKeepLatestRules } from "./processKeepLatestRules.js";
import type { ToolExtra } from "../types.js";

export const processAllRulesSchema = {};

export async function handleProcessAllRules(extra?: ToolExtra): Promise<string> {
  const deleteResult = JSON.parse(await handleProcessDeleteRules(extra));
  const junkResult = JSON.parse(await handleProcessJunkRules(extra));
  const keepLatestResult = JSON.parse(await handleProcessKeepLatestRules(extra));

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
