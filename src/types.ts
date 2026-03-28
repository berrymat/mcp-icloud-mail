import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

export type ProgressCallback = (message: string) => Promise<void>;

export function createProgressCallback(server: McpServer): ProgressCallback {
  return async (message: string) => {
    try {
      await server.sendLoggingMessage({ level: "info", data: message });
    } catch {
      // Ignore logging errors — don't let them block the operation
    }
  };
}
