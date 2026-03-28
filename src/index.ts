#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

import { listMailboxesSchema, handleListMailboxes } from "./tools/listMailboxes.js";
import { listMessagesSchema, handleListMessages } from "./tools/listMessages.js";
import { searchMessagesSchema, handleSearchMessages } from "./tools/searchMessages.js";
import { getMessageSchema, handleGetMessage } from "./tools/getMessage.js";
import { moveMessagesSchema, handleMoveMessages } from "./tools/moveMessages.js";
import { deleteMessagesSchema, handleDeleteMessages } from "./tools/deleteMessages.js";
import { flagMessagesSchema, handleFlagMessages } from "./tools/flagMessages.js";
import { createMailboxSchema, handleCreateMailbox } from "./tools/createMailbox.js";
import { deleteMailboxSchema, handleDeleteMailbox } from "./tools/deleteMailbox.js";
import { sendMessageSchema, handleSendMessage } from "./tools/sendMessage.js";
import { disconnectImap } from "./imap.js";

const server = new McpServer({
  name: "icloud-mail",
  version: "1.0.0",
});

// --- Read Operations ---

server.tool(
  "list_mailboxes",
  "List all mailboxes/folders with their flags and special use attributes",
  listMailboxesSchema,
  async () => {
    try {
      const result = await handleListMailboxes();
      return { content: [{ type: "text", text: result }] };
    } catch (error) {
      return { content: [{ type: "text", text: `Error: ${error instanceof Error ? error.message : String(error)}` }], isError: true };
    }
  }
);

server.tool(
  "list_messages",
  "List message headers in a mailbox with pagination (newest first). Returns UIDs, from, to, subject, date, flags.",
  listMessagesSchema,
  async (args) => {
    try {
      const result = await handleListMessages(args);
      return { content: [{ type: "text", text: result }] };
    } catch (error) {
      return { content: [{ type: "text", text: `Error: ${error instanceof Error ? error.message : String(error)}` }], isError: true };
    }
  }
);

server.tool(
  "search_messages",
  "Search messages by criteria: sender, recipient, subject, body text, date range, read/unread status, flagged status",
  searchMessagesSchema,
  async (args) => {
    try {
      const result = await handleSearchMessages(args);
      return { content: [{ type: "text", text: result }] };
    } catch (error) {
      return { content: [{ type: "text", text: `Error: ${error instanceof Error ? error.message : String(error)}` }], isError: true };
    }
  }
);

server.tool(
  "get_message",
  "Fetch full message content by UID: headers, text/HTML body, and attachment metadata",
  getMessageSchema,
  async (args) => {
    try {
      const result = await handleGetMessage(args);
      return { content: [{ type: "text", text: result }] };
    } catch (error) {
      return { content: [{ type: "text", text: `Error: ${error instanceof Error ? error.message : String(error)}` }], isError: true };
    }
  }
);

// --- Organize Operations ---

server.tool(
  "move_messages",
  "Move messages by UID to a different mailbox/folder",
  moveMessagesSchema,
  async (args) => {
    try {
      const result = await handleMoveMessages(args);
      return { content: [{ type: "text", text: result }] };
    } catch (error) {
      return { content: [{ type: "text", text: `Error: ${error instanceof Error ? error.message : String(error)}` }], isError: true };
    }
  }
);

server.tool(
  "delete_messages",
  "Delete messages by UID. By default moves to Trash; set permanent=true to expunge immediately.",
  deleteMessagesSchema,
  async (args) => {
    try {
      const result = await handleDeleteMessages(args);
      return { content: [{ type: "text", text: result }] };
    } catch (error) {
      return { content: [{ type: "text", text: `Error: ${error instanceof Error ? error.message : String(error)}` }], isError: true };
    }
  }
);

server.tool(
  "flag_messages",
  "Add, remove, or set IMAP flags on messages (\\Seen, \\Flagged, \\Answered, etc.)",
  flagMessagesSchema,
  async (args) => {
    try {
      const result = await handleFlagMessages(args);
      return { content: [{ type: "text", text: result }] };
    } catch (error) {
      return { content: [{ type: "text", text: `Error: ${error instanceof Error ? error.message : String(error)}` }], isError: true };
    }
  }
);

// --- Folder Operations ---

server.tool(
  "create_mailbox",
  "Create a new mailbox/folder",
  createMailboxSchema,
  async (args) => {
    try {
      const result = await handleCreateMailbox(args);
      return { content: [{ type: "text", text: result }] };
    } catch (error) {
      return { content: [{ type: "text", text: `Error: ${error instanceof Error ? error.message : String(error)}` }], isError: true };
    }
  }
);

server.tool(
  "delete_mailbox",
  "Delete a mailbox/folder",
  deleteMailboxSchema,
  async (args) => {
    try {
      const result = await handleDeleteMailbox(args);
      return { content: [{ type: "text", text: result }] };
    } catch (error) {
      return { content: [{ type: "text", text: `Error: ${error instanceof Error ? error.message : String(error)}` }], isError: true };
    }
  }
);

// --- Send Operations ---

server.tool(
  "send_message",
  "Compose and send an email via SMTP. Supports plain text, HTML, CC, BCC, and reply threading.",
  sendMessageSchema,
  async (args) => {
    try {
      const result = await handleSendMessage(args);
      return { content: [{ type: "text", text: result }] };
    } catch (error) {
      return { content: [{ type: "text", text: `Error: ${error instanceof Error ? error.message : String(error)}` }], isError: true };
    }
  }
);

// --- Start Server ---

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);

  // Graceful shutdown
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
