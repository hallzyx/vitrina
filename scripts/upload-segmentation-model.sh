#!/usr/bin/env bash
# Download the background-removal model (ISNet, Apache-2.0) and upload it to the processed bucket.
# The pipeline Lambda copies it to /tmp at cold start. Run once after the first deploy.
# Usage: scripts/upload-segmentation-model.sh
set -euo pipefail
REGION=us-east-1
STACK=vitrina
MODEL=isnet-general-use
URL="https://github.com/danielgatis/rembg/releases/download/v0.0.0/${MODEL}.onnx"

BUCKET="$(aws cloudformation describe-stacks --stack-name "$STACK" --region "$REGION" \
  --query "Stacks[0].Outputs[?OutputKey=='ProcessedBucketName'].OutputValue" --output text)"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

echo "Downloading ${MODEL}.onnx ..."
curl -sSL --fail -o "$TMP/${MODEL}.onnx" "$URL"
echo "Uploading to s3://$BUCKET/models/${MODEL}.onnx ..."
aws s3 cp "$TMP/${MODEL}.onnx" "s3://$BUCKET/models/${MODEL}.onnx" --region "$REGION" --no-progress
aws s3api head-object --bucket "$BUCKET" --key "models/${MODEL}.onnx" --region "$REGION" --query ContentLength --output text
