function Set-HeadroomEnv {
  param(
    [ValidateSet("balanced", "max-savings")]
    [string]$Profile = "balanced"
  )

  $env:HEADROOM_PORT = "8787"
  $env:HEADROOM_HOST = "127.0.0.1"
  $env:HEADROOM_TELEMETRY = "off"
  $env:HEADROOM_OUTPUT_SHAPER = "1"
  $env:HEADROOM_CODE_AWARE_ENABLED = "1"
  $env:HEADROOM_COMPRESS_USER_MESSAGES = "1"
  $env:HEADROOM_COMPRESS_SYSTEM_MESSAGES = "1"
  $env:HEADROOM_PROTECT_ANALYSIS_CONTEXT = "1"
  $env:HEADROOM_MIN_TOKENS = "120"
  $env:HEADROOM_MAX_ITEMS = "8"
  $env:HEADROOM_FORCE_KOMPRESS = "1"
  $env:HEADROOM_ACCURACY_GUARD = "strict"

  switch ($Profile) {
    "balanced" {
      $env:HEADROOM_MODE = "cache"
      $env:HEADROOM_SAVINGS_PROFILE = "balanced"
      $env:HEADROOM_SAVINGS_TARGET = "0.55"
      $env:HEADROOM_TARGET_RATIO = "0.45"
      $env:HEADROOM_PROTECT_RECENT = "4"
    }
    "max-savings" {
      $env:HEADROOM_MODE = "token"
      $env:HEADROOM_SAVINGS_PROFILE = "agent-90"
      $env:HEADROOM_SAVINGS_TARGET = "0.90"
      $env:HEADROOM_TARGET_RATIO = "0.10"
      $env:HEADROOM_PROTECT_RECENT = "2"
    }
  }
}

function Get-HeadroomProxyMode {
  param(
    [ValidateSet("balanced", "max-savings")]
    [string]$Profile = "balanced"
  )

  switch ($Profile) {
    "balanced" { return "cache" }
    "max-savings" { return "token" }
  }
}

function Get-HeadroomProfileLabel {
  param(
    [ValidateSet("balanced", "max-savings")]
    [string]$Profile = "balanced"
  )

  switch ($Profile) {
    "balanced" { return "balanced (~55% target)" }
    "max-savings" { return "agent-90 (max-savings)" }
  }
}

function Test-HeadroomProxyRunning {
  param(
    [int]$Port = 8787
  )

  return [bool](Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue)
}

function Get-HeadroomExe {
  param(
    [string]$ProjectRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\.."))
  )

  $headroom = Join-Path $ProjectRoot ".venv-headroom\Scripts\headroom.exe"
  if (-not (Test-Path $headroom)) {
    Write-Host "Headroom is not installed yet. Run:"
    Write-Host ".\scripts\headroom\setup-headroom.ps1"
    exit 1
  }

  return $headroom
}
