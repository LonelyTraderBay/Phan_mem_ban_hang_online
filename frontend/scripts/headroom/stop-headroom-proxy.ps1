$ErrorActionPreference = "Stop"

$connections = Get-NetTCPConnection -LocalPort 8787 -State Listen -ErrorAction SilentlyContinue

if (-not $connections) {
  Write-Host "No process is listening on port 8787."
  exit 0
}

$pids = $connections | Select-Object -ExpandProperty OwningProcess -Unique

foreach ($pidValue in $pids) {
  $process = Get-Process -Id $pidValue -ErrorAction SilentlyContinue
  if ($process) {
    Write-Host "Stopping Headroom proxy PID=$pidValue ($($process.ProcessName))..."
    Stop-Process -Id $pidValue -Force
  }
}

Write-Host "Stopped processes listening on port 8787."
