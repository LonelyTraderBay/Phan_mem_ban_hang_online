# Hardening H2 — Fly deploy after login
# Usage (interactive PowerShell / Windows Terminal):
#   flyctl auth login
#   cd backend
#   .\tools\run-hardening-h2.ps1

$ErrorActionPreference = "Stop"
$env:Path = "$env:USERPROFILE\.fly\bin;$env:Path"
Set-Location $PSScriptRoot\..

flyctl auth whoami
if ($LASTEXITCODE -ne 0) {
  Write-Error "Run 'flyctl auth login' first (interactive terminal), or set FLY_API_TOKEN."
}

# OIDC interim app (HTTPS IdP until Auth0)
flyctl apps create ai-sales-oidc-staging --org personal 2>$null
flyctl deploy -c fly.oidc.toml --remote-only
$oidcUrl = "https://ai-sales-oidc-staging.fly.dev"
flyctl secrets set -a ai-sales-oidc-staging "MOCK_OIDC_ISSUER=$oidcUrl" "MOCK_OIDC_CLIENT_ID=web-admin-staging" "MOCK_OIDC_EMAIL=owner@staging.ai-sales.local"

# API app
flyctl apps create ai-sales-api-staging --org personal 2>$null

if (-not (Test-Path .env.staging)) {
  Write-Error "Missing .env.staging — fill Auth0 or interim OIDC first."
}

# Point OIDC at Fly OIDC if still using interim IdP
$envFile = Get-Content .env.staging -Raw
if ($envFile -notmatch "auth0.com") {
  Write-Host "Updating local .env.staging OIDC_* to Fly OIDC interim (not printed)..."
  node tools/bootstrap-env-staging.mjs --api-url=https://ai-sales-api-staging.fly.dev --oidc-url=$oidcUrl
}

Get-Content .env.staging | flyctl secrets import -a ai-sales-api-staging
flyctl deploy -c fly.toml --remote-only

curl.exe -sS -o NUL -w "health=%{http_code}`n" https://ai-sales-api-staging.fly.dev/health
Write-Host "Done. Next: H3 FE + Auth0 swap (HARDENING-H1-AUTH0.md)."
