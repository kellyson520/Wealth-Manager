#!/usr/bin/env bash
set -euo pipefail
export METAPI_API_KEY="$(cat /tmp/.metapi_key)"
cd /opt/data/Wealth-Manager
CODEX_BIN="${CODEX_BIN:-/opt/data/home/.local/node_modules/.bin/codex}"
[ -x "$CODEX_BIN" ] || CODEX_BIN="/opt/data/codex-global/node_modules/.bin/codex"
export CODEX_HOME="/opt/data/Wealth-Manager/.codex-gpt55"
exec "$CODEX_BIN" exec --dangerously-bypass-approvals-and-sandbox -C /opt/data/Wealth-Manager "$@"
