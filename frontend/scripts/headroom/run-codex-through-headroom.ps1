$ErrorActionPreference = "Stop"

$ProjectRoot = Resolve-Path (Join-Path $PSScriptRoot "..\..")
. (Join-Path $PSScriptRoot "headroom-env.ps1")

$Headroom = Get-HeadroomExe -ProjectRoot $ProjectRoot
Set-HeadroomEnv -Profile max-savings

$proxyRunning = Test-HeadroomProxyRunning

if ($proxyRunning) {
  & $Headroom wrap codex --no-proxy --memory -- @args
} else {
  & $Headroom wrap codex --port 8787 --memory -- @args
}
