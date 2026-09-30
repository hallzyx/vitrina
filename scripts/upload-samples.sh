#!/usr/bin/env bash
# Upload the demonstration photo sets and their manifest to the processed bucket (samples/).
# Photos come from test-photos/<sampleId>/01.jpg..NN.jpg, made with scripts/render_turntable.py from
# CC0 scans. They are served by CloudFront at /samples/* and are always labeled as renders in the app.
# Usage: scripts/upload-samples.sh
set -euo pipefail
REGION=us-east-1
STACK=vitrina
cd "$(dirname "$0")/.."

BUCKET="$(aws cloudformation describe-stacks --stack-name "$STACK" --region "$REGION" \
  --query "Stacks[0].Outputs[?OutputKey=='ProcessedBucketName'].OutputValue" --output text)"

for dir in test-photos/*/; do
  id="$(basename "$dir")"
  [ "$id" = "_models" ] && continue
  grep -q "\"id\": \"$id\"" scripts/samples.json || continue
  echo "Uploading $id ..."
  aws s3 cp "$dir" "s3://$BUCKET/samples/$id/" --recursive --exclude "*" --include "*.jpg" \
    --content-type image/jpeg --cache-control "public, max-age=86400" --region "$REGION" --no-progress
done
aws s3 cp scripts/samples.json "s3://$BUCKET/samples/index.json" \
  --content-type application/json --cache-control "public, max-age=300" --region "$REGION" --no-progress
echo "Done."
