#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { fileURLToPath } from "url";
import { dirname, resolve } from "path";
import { pathToFileURL } from "url";

// Static schema imports — these define the tool API and rarely change
import { listMailboxesSchema } from "./tools/listMailboxes.js";
import { listMessagesSchema } from "./tools/listMessages.js";
import { searchMessagesSchema } from "./tools/searchMessages.js";
import { getMessageSchema } from "./tools/getMessage.js";
import { moveMessagesSchema } from "./tools/moveMessages.js";
import { deleteMessagesSchema } from "./tools/deleteMessages.js";
import { flagMessagesSchema } from "./tools/flagMessages.js";
import { createMailboxSchema } from "./tools/createMailbox.js";
import { deleteMailboxSchema } from "./tools/deleteMailbox.js";
import { sendMessageSchema } from "./tools/sendMessage.js";
import { processDeleteRulesSchema } from "./tools/processDeleteRules.js";
import { processJunkRulesSchema } from "./tools/processJunkRules.js";
import { processKeepLatestRulesSchema } from "./tools/processKeepLatestRules.js";
import { processAllRulesSchema } from "./tools/processAllRules.js";
import { disconnectImap } from "./imap.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * Dynamically import a handler module, bypassing Node's module cache.
 * This lets us pick up code changes after `npm run build` without restarting.
 */
async function load<T>(modulePath: string, exportName: string): Promise<T> {
  const fullPath = resolve(__dirname, modulePath);
  const url = pathToFileURL(fullPath).href + "?t=" + Date.now();
  const mod = await import(url);
  return mod[exportName] as T;
}

// Helper: wrap a handler invocation with error handling
function wrap(fn: () => Promise<string>) {
  return async () => {
    try {
      const result = await fn();
      return { content: [{ type: "text" as const, text: result }] };
    } catch (error) {
      return { content: [{ type: "text" as const, text: `Error: ${error instanceof Error ? error.message : String(error)}` }], isError: true as const };
    }
  };
}

function wrapArgs<A>(fn: (args: A) => Promise<string>) {
  return async (args: A) => {
    try {
      const result = await fn(args);
      return { content: [{ type: "text" as const, text: result }] };
    } catch (error) {
      return { content: [{ type: "text" as const, text: `Error: ${error instanceof Error ? error.message : String(error)}` }], isError: true as const };
    }
  };
}

const server = new McpServer({
  name: "icloud-mail",
  version: "1.0.0",
});

// --- Read Operations ---

server.tool("list_mailboxes",
  "List all mailboxes/folders with their flags and special use attributes",
  listMailboxesSchema,
  wrap(async () => {
    const h = await load<(args?: unknown) => Promise<string>>("./tools/listMailboxes.js", "handleListMailboxes");
    return h();
  })
);

server.tool("list_messages",
  "List message headers in a mailbox with pagination (newest first). Returns UIDs, from, to, subject, date, flags.",
  listMessagesSchema,
  wrapArgs(async (args) => {
    const h = await load<(args: unknown) => Promise<string>>("./tools/listMessages.js", "handleListMessages");
    return h(args);
  })
);

server.tool("search_messages",
  "Search messages by criteria: sender, recipient, subject, body text, date range, read/unread status, flagged status",
  searchMessagesSchema,
  wrapArgs(async (args) => {
    const h = await load<(args: unknown) => Promise<string>>("./tools/searchMessages.js", "handleSearchMessages");
    return h(args);
  })
);

server.tool("get_message",
  "Fetch full message content by UID: headers, text/HTML body, and attachment metadata",
  getMessageSchema,
  wrapArgs(async (args) => {
    const h = await load<(args: unknown) => Promise<string>>("./tools/getMessage.js", "handleGetMessage");
    return h(args);
  })
);

// --- Organize Operations ---

server.tool("move_messages",
  "Move messages by UID to a different mailbox/folder",
  moveMessagesSchema,
  wrapArgs(async (args) => {
    const h = await load<(args: unknown) => Promise<string>>("./tools/moveMessages.js", "handleMoveMessages");
    return h(args);
  })
);

server.tool("delete_messages",
  "Delete messages by UID. By default moves to Trash; set permanent=true to expunge immediately.",
  deleteMessagesSchema,
  wrapArgs(async (args) => {
    const h = await load<(args: unknown) => Promise<string>>("./tools/deleteMessages.js", "handleDeleteMessages");
    return h(args);
  })
);

server.tool("flag_messages",
  "Add, remove, or set IMAP flags on messages (\\Seen, \\Flagged, \\Answered, etc.)",
  flagMessagesSchema,
  wrapArgs(async (args) => {
    const h = await load<(args: unknown) => Promise<string>>("./tools/flagMessages.js", "handleFlagMessages");
    return h(args);
  })
);

// --- Folder Operations ---

server.tool("create_mailbox",
  "Create a new mailbox/folder",
  createMailboxSchema,
  wrapArgs(async (args) => {
    const h = await load<(args: unknown) => Promise<string>>("./tools/createMailbox.js", "handleCreateMailbox");
    return h(args);
  })
);

server.tool("delete_mailbox",
  "Delete a mailbox/folder",
  deleteMailboxSchema,
  wrapArgs(async (args) => {
    const h = await load<(args: unknown) => Promise<string>>("./tools/deleteMailbox.js", "handleDeleteMailbox");
    return h(args);
  })
);

// --- Send Operations ---

server.tool("send_message",
  "Compose and send an email via SMTP. Supports plain text, HTML, CC, BCC, and reply threading.",
  sendMessageSchema,
  wrapArgs(async (args) => {
    const h = await load<(args: unknown) => Promise<string>>("./tools/sendMessage.js", "handleSendMessage");
    return h(args);
  })
);

// --- Rule-Based Cleanup ---

server.tool("process_delete_rules",
  "Delete all messages from senders listed in config.json delete rules. Moves them to Deleted Messages.",
  processDeleteRulesSchema,
  wrap(async () => {
    const { createProgressCallback } = await import("./types.js");
    const h = await load<(progress?: unknown) => Promise<string>>("./tools/processDeleteRules.js", "handleProcessDeleteRules");
    return h(createProgressCallback(server));
  })
);

server.tool("process_junk_rules",
  "Move all messages from senders listed in config.json junk rules to the Junk folder.",
  processJunkRulesSchema,
  wrap(async () => {
    const { createProgressCallback } = await import("./types.js");
    const h = await load<(progress?: unknown) => Promise<string>>("./tools/processJunkRules.js", "handleProcessJunkRules");
    return h(createProgressCallback(server));
  })
);

server.tool("process_keep_latest_rules",
  "For senders in config.json keepLatest rules, keep only the most recent message and trash the rest.",
  processKeepLatestRulesSchema,
  wrap(async () => {
    const { createProgressCallback } = await import("./types.js");
    const h = await load<(progress?: unknown) => Promise<string>>("./tools/processKeepLatestRules.js", "handleProcessKeepLatestRules");
    return h(createProgressCallback(server));
  })
);

server.tool("process_all_rules",
  "Run all configured email cleanup rules (delete, junk, keep-latest) from config.json in sequence.",
  processAllRulesSchema,
  wrap(async () => {
    const { createProgressCallback } = await import("./types.js");
    const h = await load<(progress?: unknown) => Promise<string>>("./tools/processAllRules.js", "handleProcessAllRules");
    return h(createProgressCallback(server));
  })
);

// --- Start Server ---

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);

  process.on("SIGINT", async () => {
    await disconnectImap();
    process.exit(0);
  });
  process.on("SIGTERM", async () => {
    await disconnectImap();
    process.exit(0);
  });
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
