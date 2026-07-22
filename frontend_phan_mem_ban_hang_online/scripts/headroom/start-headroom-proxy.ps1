$ErrorActionPreference = "Stop"

$ProjectRoot = Resolve-Path (Join-Path $PSScriptRoot "..\..")
$VenvPath = Join-Path $ProjectRoot ".venv-headroom"
$Activate = Join-Path $VenvPath "Scripts\Activate.ps1"

if (-not (Test-Path $Activate)) {
  Write-Host "Headroom virtual environment was not found."
  Write-Host "Run setup first:"
  Write-Host ".\scripts\headroom\setup-headroom.ps1"
  exit 1
}

. $Activate
. (Join-Path $PSScriptRoot "headroom-env.ps1")

Set-HeadroomEnv -Profile max-savings
$mode = Get-HeadroomProxyMode -Profile max-savings
$label = Get-HeadroomProfileLabel -Profile max-savings

Write-Host "Starting Headroom proxy at http://localhost:8787 with $label ..."
Write-Host "Dashboard: run 'headroom dashboard' in another activated PowerShell."

headroom proxy --port 8787 --mode $mode --memory --code-aware
