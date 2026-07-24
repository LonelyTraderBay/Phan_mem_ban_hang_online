# Requires Administrator — configures local PostgreSQL for AI Sales OS smoke.
$ErrorActionPreference = "Stop"
$pgBin = "C:\Program Files\PostgreSQL\17\bin"
$pgData = "C:\Program Files\PostgreSQL\17\data"
$hba = Join-Path $pgData "pg_hba.conf"
$bak = "$hba.bak-ai-sales"
$localPass = "change-me-local-only"
$dbName = "ai_sales"
$userName = "app_schema_owner"

if (-not ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole(
  [Security.Principal.WindowsBuiltInRole]::Administrator)) {
  Write-Error "Must run elevated."
  exit 1
}

$env:Path = "$pgBin;" + $env:Path

# Backup + temporary trust for localhost so we can reset password without knowing installer secret.
if (-not (Test-Path $bak)) { Copy-Item $hba $bak -Force }
$lines = Get-Content $hba
$newLines = foreach ($line in $lines) {
  if ($line -match '^\s*host\s+all\s+all\s+127\.0\.0\.1/32\s+') {
    "host    all             all             127.0.0.1/32            trust"
  } elseif ($line -match '^\s*host\s+all\s+all\s+::1/128\s+') {
    "host    all             all             ::1/128                 trust"
  } else {
    $line
  }
}
$utf8 = New-Object System.Text.UTF8Encoding $false
[System.IO.File]::WriteAllLines($hba, $newLines, $utf8)
& "$pgBin\pg_ctl.exe" reload -D $pgData | Out-Host
Start-Sleep -Seconds 1

$sql = @"
ALTER USER postgres WITH PASSWORD '$localPass';
DO `$`$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = '$userName') THEN
    CREATE ROLE $userName LOGIN PASSWORD '$localPass' CREATEDB CREATEROLE;
  ELSE
    ALTER ROLE $userName WITH LOGIN PASSWORD '$localPass' CREATEDB CREATEROLE;
  END IF;
END
`$`$;
SELECT 'role_ok' AS step;
"@

& psql -U postgres -h 127.0.0.1 -p 5432 -d postgres -v ON_ERROR_STOP=1 -c $sql | Out-Host

$dbExists = & psql -U postgres -h 127.0.0.1 -p 5432 -d postgres -tAc "SELECT 1 FROM pg_database WHERE datname='$dbName'"
if (-not $dbExists.Trim()) {
  & psql -U postgres -h 127.0.0.1 -p 5432 -d postgres -v ON_ERROR_STOP=1 -c "CREATE DATABASE $dbName OWNER $userName;" | Out-Host
} else {
  & psql -U postgres -h 127.0.0.1 -p 5432 -d postgres -c "ALTER DATABASE $dbName OWNER TO $userName;" | Out-Host
}

# Restore scram auth
$restore = foreach ($line in (Get-Content $bak)) { $line }
# Prefer scram on restored file; if bak still scram, use it as-is.
[System.IO.File]::WriteAllLines($hba, (Get-Content $bak), $utf8)
# Ensure scram (in case bak was already edited)
$final = Get-Content $hba
$final2 = foreach ($line in $final) {
  if ($line -match '^\s*host\s+all\s+all\s+127\.0\.0\.1/32\s+') {
    "host    all             all             127.0.0.1/32            scram-sha-256"
  } elseif ($line -match '^\s*host\s+all\s+all\s+::1/128\s+') {
    "host    all             all             ::1/128                 scram-sha-256"
  } else { $line }
}
[System.IO.File]::WriteAllLines($hba, $final2, $utf8)
& "$pgBin\pg_ctl.exe" reload -D $pgData | Out-Host

$env:PGPASSWORD = $localPass
& psql -U $userName -h 127.0.0.1 -p 5432 -d $dbName -c "SELECT current_user, current_database();" | Out-Host

$url = "postgres://${userName}:${localPass}@127.0.0.1:5432/${dbName}"
Set-Content -Path "$env:USERPROFILE\.ai-sales-local-database-url.txt" -Value $url -Encoding ASCII
Write-Host "OK DATABASE_URL saved to %USERPROFILE%\.ai-sales-local-database-url.txt"
Write-Host $url
