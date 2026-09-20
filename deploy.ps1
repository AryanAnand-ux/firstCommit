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
function Invoke-NativeCapture([scriptblock]$Command) {
  $prev = $ErrorActionPreference
  $ErrorActionPreference = "Continue"
  try {
    $output = & $Command 2>&1
    $code = $LASTEXITCODE
  } finally {
    $ErrorActionPreference = $prev
  }

  [pscustomobject]@{
    ExitCode = $code
    Output = (@($output) | ForEach-Object { $_.ToString() }) -join "`n"
  }
}
function Invoke-NativeStream([scriptblock]$Command, [string]$FailureMessage) {
  $result = Invoke-NativeCapture $Command
  if ($result.Output) { $result.Output | Out-Host }
  if ($result.ExitCode -ne 0) { Fail $FailureMessage }
}

if (-not (Get-Command aws -ErrorAction SilentlyContinue)) { Fail "AWS CLI not found. Install with: winget install Amazon.AWSCLI" }
if (-not (Get-Command sam -ErrorAction SilentlyContinue)) { Fail "SAM CLI not found. Install with: winget install aws-sam-cli" }

Step "Checking AWS identity..."
$ident = Invoke-NativeCapture { aws sts get-caller-identity --region $Region }
if ($ident.ExitCode -ne 0) { Fail "Not authenticated. Run 'aws configure' first.`n$($ident.Output)" }

if (-not $FrontendOnly) {
  Step "Building SAM app..."
  Invoke-NativeStream { sam build } "sam build failed"

  Step "Deploying stack '$StackName' in $Region (free-tier serverless)..."
  Invoke-NativeStream { sam deploy --stack-name $StackName --resolve-s3 --region $Region --capabilities CAPABILITY_IAM --no-confirm-changeset } "sam deploy failed - see message above"
}

Step "Reading stack outputs..."
$stackOutputs = Invoke-NativeCapture { aws cloudformation describe-stacks --stack-name $StackName --region $Region --query "Stacks[0].Outputs" --output json }
if ($stackOutputs.ExitCode -ne 0) { Fail "Could not read stack outputs. Did the deploy complete?`n$($stackOutputs.Output)" }
$out = $stackOutputs.Output | ConvertFrom-Json
if (-not $out) { Fail "Could not read stack outputs. Did the deploy complete?" }
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
Invoke-NativeStream { aws s3 sync "$root\frontend" "s3://$($map['FrontendBucket'])" --exclude "config.template.js" --region $Region } "s3 sync failed"

Step "Invalidating CloudFront cache so new frontend goes live immediately..."
$cfId = $map["CloudFrontDistributionId"]
if ($cfId -and $cfId -ne "none") {
  $invalidation = Invoke-NativeCapture { aws cloudfront create-invalidation --distribution-id $cfId --paths "/*" --region $Region }
  if ($invalidation.ExitCode -ne 0) { Write-Host "  [warn] invalidation failed - re-run manually if the page looks stale." -ForegroundColor Yellow }
} else {
  Write-Host "  [warn] CloudFrontDistributionId not found - skipping invalidation." -ForegroundColor Yellow
}

Write-Host ""
Write-Host "Live URL : $($map['FrontendUrl'])" -ForegroundColor Green
Write-Host "API      : $($map['ApiEndpoint'])" -ForegroundColor Green
Write-Host ""
Write-Host "Next: open the Live URL, sign up, confirm the email code, post a request." -ForegroundColor Yellow
Write-Host "Re-run with -FrontendOnly to just push frontend changes afterwards." -ForegroundColor Yellow
