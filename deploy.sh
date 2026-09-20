#!/usr/bin/env bash
set -euo pipefail
REGION="${1:-us-east-1}"
STACK_NAME="${2:-raktasetu}"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT"

fail() { echo "[!] $*" >&2; exit 1; }
step() { echo; echo "==> $*"; }

command -v aws >/dev/null || fail "AWS CLI not found. Install: pip install awscli or use your package manager"
command -v sam >/dev/null || fail "SAM CLI not found. Install: pip install aws-sam-cli"

step "Checking AWS identity..."
aws sts get-caller-identity --region "$REGION" >/dev/null || fail "Not authenticated. Run 'aws configure' first."

step "Building SAM app..."
sam build
step "Deploying stack '$STACK_NAME' in $REGION..."
sam deploy --stack-name "$STACK_NAME" --resolve-s3 --region "$REGION" \
  --capabilities CAPABILITY_IAM --no-confirm-changeset

step "Reading stack outputs..."
OUT=$(aws cloudformation describe-stacks --stack-name "$STACK_NAME" --region "$REGION" \
  --query "Stacks[0].Outputs[]" --output text)
api=$(echo "$OUT" | awk '/^ApiEndpoint/{print $2}')
url=$(echo "$OUT" | awk '/^FrontendUrl/{print $2}')
bucket=$(echo "$OUT" | awk '/^FrontendBucket/{print $2}')
pool=$(echo "$OUT" | awk '/^UserPoolId/{print $2}')
client=$(echo "$OUT" | awk '/^UserPoolClientId/{print $2}')
[ -n "$api" ] || fail "Could not read stack outputs."

step "Writing frontend/config.js..."
sed -e "s|{{API_BASE}}|$api|" \
    -e "s|{{POOL_ID}}|$pool|" \
    -e "s|{{CLIENT_ID}}|$client|" \
    -e "s|{{REGION}}|$REGION|" \
    frontend/config.template.js > frontend/config.js

step "Uploading frontend to S3 (bucket: $bucket)..."
aws s3 sync frontend "s3://$bucket" --exclude "config.template.js" --region "$REGION"

echo
echo "Live URL : $url"
echo "API      : $api"