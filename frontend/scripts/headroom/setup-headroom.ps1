$ErrorActionPreference = "Stop"

$ProjectRoot = Resolve-Path (Join-Path $PSScriptRoot "..\..")
$VenvPath = Join-Path $ProjectRoot ".venv-headroom"
$PythonLauncher = "py"
$VsDevCmd = "${env:ProgramFiles(x86)}\Microsoft Visual Studio\2022\BuildTools\Common7\Tools\VsDevCmd.bat"

Write-Host "Checking Python 3.12..."
& $PythonLauncher -3.12 --version

$env:Path = "$env:USERPROFILE\.cargo\bin;$env:Path"

Write-Host "Checking Rust/Cargo..."
if (-not (Get-Command cargo -ErrorAction SilentlyContinue)) {
  Write-Host "Cargo was not found on PATH."
  Write-Host "Install Rust first: winget install Rustlang.Rustup"
  Write-Host "Then open a fresh PowerShell and run: rustup default stable-x86_64-pc-windows-msvc"
  exit 1
}

Write-Host "Checking MSVC compiler..."
if (-not (Get-Command cl -ErrorAction SilentlyContinue)) {
  if (-not (Test-Path $VsDevCmd)) {
    Write-Host "MSVC cl.exe was not found on PATH."
    Write-Host "Install Visual Studio Build Tools with 'Desktop development with C++'."
    exit 1
  }

  Write-Host "MSVC cl.exe is not on PATH; setup will load Visual Studio Build Tools automatically."
}

if (-not (Test-Path $VenvPath)) {
  Write-Host "Creating Headroom virtual environment at $VenvPath..."
  & $PythonLauncher -3.12 -m venv $VenvPath
}

$Activate = Join-Path $VenvPath "Scripts\Activate.ps1"
. $Activate

Write-Host "Upgrading pip..."
python -m pip install --upgrade pip

Write-Host "Installing Headroom..."
if (Get-Command cl -ErrorAction SilentlyContinue) {
  pip install "headroom-ai[proxy,code,memory]"
} else {
  $InstallCommand = "call `"$VsDevCmd`" -arch=x64 && set PATH=%USERPROFILE%\.cargo\bin;%PATH% && `"$VenvPath\Scripts\python.exe`" -m pip install `"headroom-ai[proxy,code,memory]`""
  cmd /c $InstallCommand
}

Write-Host "Verifying install..."
python -c "import headroom; print('headroom', headroom.__version__)"

Write-Host ""
Write-Host "Installing Headroom MCP for Cursor..."
& (Join-Path $PSScriptRoot "install-headroom-mcp-cursor.ps1")

Write-Host ""
Write-Host "Done. For Cursor (subscription):"
Write-Host "  .\scripts\headroom\run-cursor-through-headroom.ps1"
Write-Host ""
Write-Host "For Codex CLI (max-savings):"
Write-Host "  .\scripts\headroom\run-codex-through-headroom.ps1"
