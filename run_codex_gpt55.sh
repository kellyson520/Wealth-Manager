#!/usr/bin/env bash
set -euo pipefail
export METAPI_API_KEY="$(cat /tmp/.metapi_key)"
cd /opt/data/Wealth-Manager
exec /opt/data/.local/node_modules/.bin/codex exec --dangerously-bypass-approvals-and-sandbox --config-file /opt/data/Wealth-Manager/.codex-gpt55/config.toml "$@"
