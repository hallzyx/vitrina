#!/usr/bin/env bash
# Build the SPA and publish it to the frontend bucket of the `vitrina` stack, then invalidate CloudFront.
# Usage: scripts/deploy-frontend.sh
set -euo pipefail
REGION=us-east-1
STACK=vitrina
cd "$(dirname "$0")/../frontend"

output() {
  aws cloudformation describe-stacks --stack-name "$STACK" --region "$REGION" \
    --query "Stacks[0].Outputs[?OutputKey=='$1'].OutputValue" --output text
}
BUCKET="$(output FrontendBucketName)"
DIST_ID="$(output DistributionId)"

if [ ! -e node_modules/typescript/package.json ] || [ ! -e node_modules/vite/package.json ]; then
  npm ci --ignore-scripts --no-audit --no-fund
  npm rebuild esbuild
fi
npm run build

# Hashed assets are immutable; index.html must always be revalidated.
aws s3 sync dist "s3://$BUCKET" --region "$REGION" --delete \
  --exclude "index.html" --cache-control "public,max-age=31536000,immutable"
aws s3 cp dist/index.html "s3://$BUCKET/index.html" --region "$REGION" \
  --cache-control "no-cache" --content-type "text/html; charset=utf-8"

MSYS_NO_PATHCONV=1 aws cloudfront create-invalidation --distribution-id "$DIST_ID" --paths "/index.html" "/favicon.svg" \
  --query Invalidation.Status --output text
echo "Deployed: $(output SiteUrl)"
