#!/usr/bin/env bash
set -euo pipefail
export METAPI_API_KEY="sk-c0966d48a7a42db4cf424d499e038f32170d939dd58ff5aa2b64f26daca062e9"
cd /opt/data/Wealth-Manager
exec /opt/data/.local/node_modules/.bin/codex exec --dangerously-bypass-approvals-and-sandbox --config-file /opt/data/Wealth-Manager/.codex-gpt55/config.toml "$@"
