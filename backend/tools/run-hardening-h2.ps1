# Hardening H2 - Fly deploy after login
# Usage:
#   flyctl auth login
#   cd backend
#   .\tools\run-hardening-h2.ps1

# flyctl writes progress/warnings to stderr; do not treat as terminating
$ErrorActionPreference = "Continue"
$env:Path = "$env:USERPROFILE\.fly\bin;$env:Path"
Set-Location $PSScriptRoot\..

flyctl auth whoami
if ($LASTEXITCODE -ne 0) {
  throw "Run flyctl auth login first, or set FLY_API_TOKEN."
}

flyctl apps create ai-sales-oidc-staging --org personal 2>$null
flyctl deploy -c fly.oidc.toml --remote-only
if ($LASTEXITCODE -ne 0) { throw "OIDC deploy failed" }
$oidcUrl = "https://ai-sales-oidc-staging.fly.dev"
flyctl secrets set -a ai-sales-oidc-staging "MOCK_OIDC_ISSUER=$oidcUrl" "MOCK_OIDC_CLIENT_ID=web-admin-staging" "MOCK_OIDC_EMAIL=owner@staging.ai-sales.local"
if ($LASTEXITCODE -ne 0) { throw "OIDC secrets failed" }

flyctl apps create ai-sales-api-staging --org personal 2>$null

if (-not (Test-Path .env.staging)) {
  throw "Missing .env.staging - fill Auth0 or interim OIDC first."
}

$envFile = Get-Content .env.staging -Raw
if ($envFile -notmatch "auth0.com") {
  Write-Host "Updating local .env.staging OIDC to Fly OIDC interim (secrets not printed)..."
  node tools/bootstrap-env-staging.mjs --api-url=https://ai-sales-api-staging.fly.dev --oidc-url=$oidcUrl
  if ($LASTEXITCODE -ne 0) { throw "bootstrap-env-staging failed" }
}

Get-Content .env.staging | flyctl secrets import -a ai-sales-api-staging
if ($LASTEXITCODE -ne 0) { throw "API secrets import failed" }
flyctl deploy -c fly.toml --remote-only
if ($LASTEXITCODE -ne 0) { throw "API deploy failed" }

curl.exe -sS -o NUL -w "health=%{http_code}`n" https://ai-sales-api-staging.fly.dev/health
Write-Host "Done. Next: H3 FE + Auth0 swap (HARDENING-H1-AUTH0.md)."
