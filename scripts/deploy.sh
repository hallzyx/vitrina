#!/usr/bin/env bash
# Deploy (or update) the Vitrina stack. Usage: scripts/deploy.sh [paused=false|true]
set -euo pipefail
cd "$(dirname "$0")/../infra"
PAUSED="${1:-false}"
SAM="${SAM:-sam}"

"$SAM" build
"$SAM" deploy \
  --stack-name vitrina \
  --region us-east-1 \
  --resolve-s3 \
  --capabilities CAPABILITY_IAM \
  --no-confirm-changeset \
  --no-fail-on-empty-changeset \
  --tags project=vitrina \
  --parameter-overrides "Stage=prod" "Paused=${PAUSED}"
