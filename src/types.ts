import type { ServerNotification } from "@modelcontextprotocol/sdk/types.js";

export interface ToolExtra {
  progressToken: string | number;
  sendNotification: (notification: ServerNotification) => Promise<void>;
}
