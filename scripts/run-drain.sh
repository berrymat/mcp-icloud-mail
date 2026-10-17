#!/bin/bash
# Scheduled drain runner for mcp-icloud-mail
# Reads credentials from drain.env and runs all rules

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
ENV_FILE="$SCRIPT_DIR/drain.env"
LOG_FILE="$SCRIPT_DIR/drain-scheduled.log"

# Load credentials
if [ ! -f "$ENV_FILE" ]; then
  echo "$(date): ERROR: $ENV_FILE not found" >> "$LOG_FILE"
  exit 1
fi
set -a
source "$ENV_FILE"
set +a

# Run drain (all rules)
echo "$(date): Starting scheduled drain" >> "$LOG_FILE"
/opt/homebrew/bin/node "$PROJECT_DIR/scripts/drain-rules.mjs" all >> "$LOG_FILE" 2>&1
EXIT_CODE=$?
echo "$(date): Drain finished (exit code $EXIT_CODE)" >> "$LOG_FILE"
