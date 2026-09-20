param(
  [string]$Region = "us-east-1",
  [string]$StackName = "raktasetu",
  [switch]$FrontendOnly
)
$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $root

function Fail([string]$msg) { Write-Host "[!] $msg" -ForegroundColor Red; exit 1 }
function Step([string]$msg) { Write-Host "`n==> $msg" -ForegroundColor Cyan }

if (-not (Get-Command aws -ErrorAction SilentlyContinue)) { Fail "AWS CLI not found. Install with: winget install Amazon.AWSCLI" }
if (-not (Get-Command sam -ErrorAction SilentlyContinue)) { Fail "SAM CLI not found. Install with: winget install aws-sam-cli" }

Step "Checking AWS identity..."
$ident = aws sts get-caller-identity --region $Region 2>&1
if ($LASTEXITCODE -ne 0) { Fail "Not authenticated. Run 'aws configure' first.`n$ident" }

if (-not $FrontendOnly) {
  Step "Building SAM app..."
  sam build 2>&1 | Out-Host
  if ($LASTEXITCODE -ne 0) { Fail "sam build failed" }

  Step "Deploying stack '$StackName' in $Region (free-tier serverless)..."
  sam deploy --stack-name $StackName --resolve-s3 --region $Region --capabilities CAPABILITY_IAM --no-confirm-changeset 2>&1 | Out-Host
  if ($LASTEXITCODE -ne 0) { Fail "sam deploy failed - see message above" }
}

Step "Reading stack outputs..."
$out = aws cloudformation describe-stacks --stack-name $StackName --region $Region --query "Stacks[0].Outputs" --output json 2>&1 | ConvertFrom-Json
if ($LASTEXITCODE -ne 0 -or -not $out) { Fail "Could not read stack outputs. Did the deploy complete?" }
$map = @{}
foreach ($o in $out) { $map[$o.OutputKey] = $o.OutputValue }

Step "Writing frontend/config.js from template..."
$tpl = Get-Content "$root\frontend\config.template.js" -Raw
$tpl = $tpl.Replace("{{API_BASE}}", $map["ApiEndpoint"])
$tpl = $tpl.Replace("{{POOL_ID}}", $map["UserPoolId"])
$tpl = $tpl.Replace("{{CLIENT_ID}}", $map["UserPoolClientId"])
$tpl = $tpl.Replace("{{REGION}}", $Region)
Set-Content -Path "$root\frontend\config.js" -Value $tpl -Encoding UTF8

Step "Uploading frontend to S3 (bucket: $($map['FrontendBucket']))..."
aws s3 sync "$root\frontend" "s3://$($map['FrontendBucket'])" --exclude "config.template.js" --region $Region 2>&1 | Out-Host
if ($LASTEXITCODE -ne 0) { Fail "s3 sync failed" }

Write-Host ""
Write-Host "Live URL : $($map['FrontendUrl'])" -ForegroundColor Green
Write-Host "API      : $($map['ApiEndpoint'])" -ForegroundColor Green
Write-Host ""
Write-Host "Next: open the Live URL, sign up, confirm the email code, post a request." -ForegroundColor Yellow
Write-Host "Re-run with -FrontendOnly to just push frontend changes afterwards." -ForegroundColor Yellow