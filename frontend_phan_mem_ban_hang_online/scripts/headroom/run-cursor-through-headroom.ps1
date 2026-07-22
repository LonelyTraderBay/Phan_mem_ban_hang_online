$ErrorActionPreference = "Stop"

$ProjectRoot = Resolve-Path (Join-Path $PSScriptRoot "..\..")
. (Join-Path $PSScriptRoot "headroom-env.ps1")

$Headroom = Get-HeadroomExe -ProjectRoot $ProjectRoot
Set-HeadroomEnv -Profile balanced

$proxyRunning = Test-HeadroomProxyRunning

Write-Host ""
Write-Host "Headroom for Cursor (subscription, balanced profile)"
Write-Host "===================================================="
Write-Host ""
Write-Host "This setup does NOT require Override Base URL or BYOK."
Write-Host "Cursor Agent traffic stays on Cursor's backend; savings come from:"
Write-Host "  - Headroom MCP tools (headroom_compress / retrieve / stats)"
Write-Host "  - Shared memory and live learning (.cursor/rules/)"
Write-Host "  - Hybrid Codex CLI for heavy agent tasks"
Write-Host ""
Write-Host "Before using Cursor, ensure MCP is installed:"
Write-Host "  .\scripts\headroom\install-headroom-mcp-cursor.ps1"
Write-Host ""
Write-Host "Then restart Cursor and verify Settings > MCP > headroom (3 tools)."
Write-Host ""

if ($proxyRunning) {
  & $Headroom wrap cursor --no-proxy --memory --learn
} else {
  & $Headroom wrap cursor --port 8787 --memory --learn
}
