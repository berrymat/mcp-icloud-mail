# mcp-icloud-mail

MCP server for iCloud Mail (IMAP/SMTP) with rule-based inbox cleanup tools.

## Tools

- `list_mailboxes` — list all mailboxes
- `list_messages` — paginated message list
- `search_messages` — search by sender, subject, date, etc.
- `get_message` — read a message
- `send_message` — send an email (a copy is saved to the Sent mailbox)
- `move_messages` — move messages between mailboxes
- `delete_messages` — permanently delete messages
- `flag_messages` — flag/unflag messages
- `process_delete_rules` — move messages from configured senders to Deleted Messages
- `process_junk_rules` — move messages from configured senders to Junk
- `process_keep_latest_rules` — keep only the newest message per sender, trash the rest
- `process_archive_read` — move read messages older than `daysOld` to Archive, or to a sender-specific mailbox
- `process_all_rules` — run all four rule passes in sequence

## Configuration

Copy `config.json.example` to `config.json` and add your sender rules:

```json
{
  "rules": {
    "delete": {
      "senders": ["potterybarn", "newsletter@example.com"],
      "markAsRead": false
    },
    "junk": {
      "senders": ["spammer", "unwanted@example.com"],
      "markAsRead": false
    },
    "keepLatest": {
      "senders": ["nytimes", "github"],
      "markAsRead": true
    },
    "archiveRead": {
      "daysOld": 60,
      "defaultMailbox": "Archive",
      "senderRules": [
        { "senders": ["jira@", "atlassian.net"], "mailbox": "Archive/Work" },
        { "senders": ["chase.com", "fidelity"], "mailbox": "Archive/Finance" }
      ]
    }
  }
}
```

The `archiveRead` rule is optional. It only touches messages in INBOX that are already read (`\Seen`) and older than `daysOld` days. Sender rules are applied first, so a match lands in that rule's mailbox; everything else goes to `defaultMailbox`. Destination mailboxes are created if missing.

Sender entries can be:
- A **keyword** (dot-free substring) — e.g. `"nytimes"` matches any address containing `nytimes`
- A **full email address** — e.g. `"newsletter@example.com"` for exact matching

> Note: iCloud IMAP FROM search does not support domain fragments containing dots as substrings. Use dot-free keywords or full email addresses.

## Environment Variables

| Variable | Description |
|---|---|
| `ICLOUD_EMAIL` | Your iCloud email address |
| `ICLOUD_PASSWORD` | App-specific password (generate at appleid.apple.com) |
| `MCP_MAIL_CONFIG` | Optional path override for config.json |

## Bulk Drain Script

For large inboxes, run rules directly (bypasses MCP 60s timeout):

```bash
ICLOUD_EMAIL=you@icloud.com ICLOUD_PASSWORD=xxxx-xxxx-xxxx-xxxx \
  node scripts/drain-rules.mjs [delete|junk|keepLatest|archiveRead|all]
```

Or use the wrapper script (reads credentials from `scripts/drain.env`):

```bash
./scripts/run-drain.sh
```

Logs are written to `scripts/drain-scheduled.log`.

## Scheduled Automatic Runs

A launchd job runs the drain daily at 3am:

```bash
# Check the job is loaded
launchctl list | grep mcp-icloud-mail

# Run it right now manually
launchctl start com.berrymat.mcp-icloud-mail-drain

# Watch the log
tail -f scripts/drain-scheduled.log

# Disable
launchctl unload ~/Library/LaunchAgents/com.berrymat.mcp-icloud-mail-drain.plist

# Re-enable
launchctl load ~/Library/LaunchAgents/com.berrymat.mcp-icloud-mail-drain.plist
```

The plist is at `~/Library/LaunchAgents/com.berrymat.mcp-icloud-mail-drain.plist`.

## Development

```bash
npm install
npm run build      # compile TypeScript
npm run dev        # watch mode
```

Handler code is hot-reloaded via mtime-based module caching — rebuild with `npm run build` after changes, no MCP server restart needed.

## Setup

```bash
npm install
npm run build
cp config.json.example config.json
# edit config.json with your sender rules
```

Add to Claude Desktop `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "icloud-mail": {
      "command": "node",
      "args": ["/path/to/mcp-icloud-mail/dist/index.js"],
      "env": {
        "ICLOUD_EMAIL": "you@icloud.com",
        "ICLOUD_PASSWORD": "xxxx-xxxx-xxxx-xxxx"
      }
    }
  }
}
```
