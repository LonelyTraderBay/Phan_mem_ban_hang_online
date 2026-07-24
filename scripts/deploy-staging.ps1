# Deploy all Phan_mem_ban_hang_online staging apps on Fly.io
# Usage (from repo root):
#   .\scripts\deploy-staging.ps1
#   .\scripts\deploy-staging.ps1 -Only api
#   .\scripts\deploy-staging.ps1 -Only web,ops

param(
  [ValidateSet("all", "api", "oidc", "web", "ops")]
  [string[]]$Only = @("all")
)

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
$doAll = $Only -contains "all"

function Deploy-App {
  param([string]$Label, [string]$Dir, [string[]]$FlyArgs)
  Write-Host "`n=== $Label ===" -ForegroundColor Cyan
  Push-Location $Dir
  try {
    & flyctl deploy @FlyArgs
    if ($LASTEXITCODE -ne 0) { throw "flyctl deploy failed for $Label (exit $LASTEXITCODE)" }
  } finally {
    Pop-Location
  }
}

if ($doAll -or ($Only -contains "api")) {
  Deploy-App "API" (Join-Path $Root "backend") @("--remote-only", "--yes")
}
if ($doAll -or ($Only -contains "oidc")) {
  Deploy-App "OIDC" (Join-Path $Root "backend") @("-c", "fly.oidc.toml", "--remote-only", "--yes")
}
if ($doAll -or ($Only -contains "web")) {
  Deploy-App "Web Admin" (Join-Path $Root "frontend") @("-c", "fly.web-admin.staging.toml", "--remote-only", "--yes")
}
if ($doAll -or ($Only -contains "ops")) {
  Deploy-App "Super Admin" (Join-Path $Root "frontend") @("-c", "fly.ops.staging.toml", "--remote-only", "--yes")
}

Write-Host "`nSmoke checks..." -ForegroundColor Cyan
@(
  "https://phan-mem-ban-hang-online-api.fly.dev/health",
  "https://phan-mem-ban-hang-online-web.fly.dev/health",
  "https://phan-mem-ban-hang-online-ops.fly.dev/",
  "https://phan-mem-ban-hang-online-oidc.fly.dev/health"
) | ForEach-Object {
  try {
    $code = (Invoke-WebRequest -Uri $_ -UseBasicParsing -TimeoutSec 60).StatusCode
    Write-Host "$_ -> $code"
  } catch {
    Write-Host "$_ -> FAIL: $($_.Exception.Message)" -ForegroundColor Red
  }
}

Write-Host "`nDone. Prefer this script over Fly Launch from monorepo root." -ForegroundColor Green
Write-Host "Docs: backend/docs/release/FLY-DEPLOY.md"
