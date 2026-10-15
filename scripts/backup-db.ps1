<#
.SYNOPSIS
    Docker-free pg_dump of the production Supabase database (BACKUP_PROTOCOL.md section 1).

.DESCRIPTION
    The connection string carries the database password, so this script:
      - never prints it (only host, port and database name are shown);
      - never puts the password on the pg_dump command line, where every process on the
        machine can read it; it is handed over in PGPASSWORD for the one call, then cleared;
      - prompts for it with hidden input when it is not supplied, so it stays out of the
        PowerShell history file.
    The dump holds client PII and auth tables, so it is written to the git-ignored
    backups/ folder by default, and it only counts as a backup once pg_dump's own
    "dump complete" footer is present.

    RULING 2026-10-15: the backup script must not print or expose the database URL (N-8).
    Revert = restore the previous script from git; the pg_dump flags are unchanged.

.EXAMPLE
    .\scripts\backup-db.ps1
    Prompts for the connection string (hidden) and writes backups\production_backup_<timestamp>.sql.
#>
param (
    [string]$DbUrl = $env:SUPABASE_DB_URL,
    [string]$BackupFile
)

$repoRoot = Split-Path -Parent $PSScriptRoot

if (-not $BackupFile) {
    $backupDir = Join-Path $repoRoot 'backups'
    if (-not (Test-Path $backupDir)) { New-Item -ItemType Directory -Path $backupDir | Out-Null }
    $BackupFile = Join-Path $backupDir ("production_backup_{0}.sql" -f (Get-Date -Format 'yyyyMMdd_HHmmss'))
}

$pgDump = Get-Command pg_dump -ErrorAction SilentlyContinue
if (-not $pgDump) {
    Write-Host "Error: pg_dump was not found on PATH." -ForegroundColor Red
    Write-Host "Install the PostgreSQL client tools (the same major version as the Supabase server, or newer) and run this again." -ForegroundColor Yellow
    exit 1
}

if (-not $DbUrl) {
    Write-Host "Paste the production connection string (Supabase > Project Settings > Database > URI)." -ForegroundColor Yellow
    Write-Host "Input is hidden and is not saved to history." -ForegroundColor Yellow
    $secure = Read-Host -AsSecureString "Connection string"
    $bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
    try { $DbUrl = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr) }
    finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr) }
}
if (-not $DbUrl) {
    Write-Host "Error: no connection string was given." -ForegroundColor Red
    exit 1
}

# postgresql://user:password@host:port/db?params. The password is matched greedily up to
# the LAST '@', so a password containing '@' or '#' still splits correctly.
$pattern = '^(?<scheme>postgres(?:ql)?)://(?<user>[^:@/]+)(?::(?<pass>.*))?@(?<host>[^@/?#]+)(?<rest>[/?].*)?$'
$match = [regex]::Match($DbUrl.Trim(), $pattern)
if (-not $match.Success) {
    Write-Host "Error: the connection string is not a postgresql:// URI. It is not echoed here." -ForegroundColor Red
    exit 1
}

$hostPart = $match.Groups['host'].Value
$rest = $match.Groups['rest'].Value
$dbName = 'postgres'
if ($rest -match '^/(?<db>[^?]+)') { $dbName = $Matches['db'] }
$safeUrl = '{0}://{1}@{2}{3}' -f $match.Groups['scheme'].Value, $match.Groups['user'].Value, $hostPart, $rest

Write-Host ("Target: {0}/{1}" -f $hostPart, $dbName) -ForegroundColor Cyan
if ($hostPart -match ':6543$') {
    Write-Host "Note: port 6543 is Supabase's transaction pooler. Supabase recommends the session pooler (port 5432) or the direct connection for pg_dump." -ForegroundColor Yellow
}
Write-Host "Writing $BackupFile" -ForegroundColor Cyan

# --clean includes DROP statements so a restore is idempotent.
$hadPassword = $match.Groups['pass'].Success
try {
    if ($hadPassword) {
        # libpq percent-decodes a password given inside a URI; do the same here.
        $env:PGPASSWORD = [System.Uri]::UnescapeDataString($match.Groups['pass'].Value)
    }
    & $pgDump.Source --clean --if-exists --quote-all-identifiers -d $safeUrl -f $BackupFile
    $exitCode = $LASTEXITCODE
}
finally {
    if ($hadPassword) { Remove-Item Env:PGPASSWORD -ErrorAction SilentlyContinue }
    $DbUrl = $null
    $match = $null
}

function Set-Incomplete([string]$path) {
    if (Test-Path $path) {
        $incomplete = "$path.incomplete"
        Move-Item -Path $path -Destination $incomplete -Force
        Write-Host "The partial file was renamed to $incomplete so it cannot be mistaken for a backup." -ForegroundColor Yellow
    }
}

if ($exitCode -ne 0) {
    Write-Host "pg_dump failed with exit code $exitCode." -ForegroundColor Red
    Set-Incomplete $BackupFile
    exit $exitCode
}

if (-not (Test-Path $BackupFile) -or (Get-Item $BackupFile).Length -eq 0) {
    Write-Host "Error: pg_dump reported success but $BackupFile is missing or empty." -ForegroundColor Red
    exit 1
}

$footer = Get-Content -Path $BackupFile -Tail 10 | Where-Object { $_ -match 'PostgreSQL database dump complete' }
if (-not $footer) {
    Write-Host "Error: the dump has no 'PostgreSQL database dump complete' footer; it is incomplete." -ForegroundColor Red
    Set-Incomplete $BackupFile
    exit 1
}

$item = Get-Item $BackupFile
$hash = (Get-FileHash -Path $BackupFile -Algorithm SHA256).Hash
Write-Host "Backup complete: $($item.FullName)" -ForegroundColor Green
Write-Host ("Size: {0} MB" -f [math]::Round($item.Length / 1MB, 2)) -ForegroundColor Green
Write-Host "SHA-256: $hash" -ForegroundColor Green
Write-Host "Record the size and hash with the off-site copy. The file contains client PII; do not commit or share it." -ForegroundColor Yellow
exit 0
