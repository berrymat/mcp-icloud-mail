import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

export type ProgressCallback = (message: string) => Promise<void>;

export function createProgressCallback(server: McpServer): ProgressCallback {
  return async (message: string) => {
    await server.sendLoggingMessage({ level: "info", data: message });
  };
}
