#!/usr/bin/env bash
# Pause (true) or resume (false) the public site. Data is kept.
# Usage: scripts/pause.sh          -> pause
#        scripts/pause.sh resume   -> resume
set -euo pipefail
if [ "${1:-}" = "resume" ]; then
  exec "$(dirname "$0")/deploy.sh" false
else
  exec "$(dirname "$0")/deploy.sh" true
fi
