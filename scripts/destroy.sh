#!/usr/bin/env bash
# Destroy the Vitrina stack and everything in it. IRREVERSIBLE: uploaded data is deleted.
# Usage: scripts/destroy.sh [--yes]
set -euo pipefail
REGION=us-east-1
STACK=vitrina
SAM="${SAM:-sam}"

if [ "${1:-}" != "--yes" ]; then
  read -r -p "This deletes stack '$STACK' and ALL its data in $REGION. Type the stack name to confirm: " ans
  [ "$ans" = "$STACK" ] || { echo "Aborted."; exit 1; }
fi

# Buckets must be empty before CloudFormation can delete them.
for BUCKET in $(aws cloudformation describe-stack-resources --stack-name "$STACK" --region "$REGION" \
    --query "StackResources[?ResourceType=='AWS::S3::Bucket'].PhysicalResourceId" --output text); do
  echo "Emptying s3://$BUCKET"
  aws s3 rm "s3://$BUCKET" --recursive --region "$REGION"
done

"$SAM" delete --stack-name "$STACK" --region "$REGION" --no-prompts
echo "Stack deleted. The SAM artifact bucket (stack aws-sam-cli-managed-default) is kept; remove it separately if unused."
