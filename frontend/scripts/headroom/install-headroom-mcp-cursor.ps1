$ErrorActionPreference = "Stop"

$ProjectRoot = Resolve-Path (Join-Path $PSScriptRoot "..\..")
$Headroom = Join-Path $ProjectRoot ".venv-headroom\Scripts\headroom.exe"
$CursorDir = Join-Path $ProjectRoot ".cursor"
$McpFile = Join-Path $CursorDir "mcp.json"

if (-not (Test-Path $Headroom)) {
  Write-Host "Headroom is not installed yet. Run:"
  Write-Host ".\scripts\headroom\setup-headroom.ps1"
  exit 1
}

if (-not (Test-Path $CursorDir)) {
  New-Item -ItemType Directory -Path $CursorDir -Force | Out-Null
}

$mcpConfig = @{
  mcpServers = @{
    headroom = @{
      command = $Headroom
      args    = @("mcp", "serve")
      env     = @{
        HEADROOM_ACCURACY_GUARD = "strict"
      }
    }
  }
}

$mcpConfig | ConvertTo-Json -Depth 10 | Set-Content -Path $McpFile -Encoding UTF8

Write-Host "Wrote Cursor MCP config: $McpFile"
Write-Host ""
Write-Host "Restart Cursor, then check Settings > MCP > headroom (3 tools)."
Write-Host ""

$Activate = Join-Path $ProjectRoot ".venv-headroom\Scripts\Activate.ps1"
. $Activate
headroom mcp status
