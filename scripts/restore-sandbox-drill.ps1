# scripts/restore-sandbox-drill.ps1
#
# Babin Rentals OS — P0-01 Disaster Recovery Restore Drill Runner (Owner Only)
# Runs the physical dump restoration into an isolated local sandbox database
# and verifies schema tables, row counts, and accounting invariants.

param (
    [string]$BackupFile = "backups\production_backup_2026-11-07T10-48-06-238Z.sql",
    [string]$TargetDatabase = "babin_restore_sandbox",
    [string]$PgUser = "postgres",
    [string]$PgHost = "localhost",
    [string]$PgPort = "5432"
)

$ErrorActionPreference = 'Stop'

Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host " Babin Rentals OS — P0-01 Disaster Recovery Restore Drill" -ForegroundColor Cyan
Write-Host "==========================================================" -ForegroundColor Cyan

# 1. Ensure standard PostgreSQL bin paths are available in PATH
foreach ($ver in @('17', '18', '16', '15')) {
    $pgBin = "C:\Program Files\PostgreSQL\$ver\bin"
    if ((Test-Path $pgBin) -and ($env:PATH -notlike "*$pgBin*")) {
        $env:PATH = "$pgBin;$env:PATH"
    }
}

if (-not (Get-Command psql.exe -ErrorAction SilentlyContinue)) {
    Write-Error "PostgreSQL client tools (psql, createdb) not found in PATH or C:\Program Files\PostgreSQL."
    exit 1
}

# 2. Locate backup file
$resolvedBackup = Resolve-Path $BackupFile -ErrorAction SilentlyContinue
if (-not $resolvedBackup) {
    Write-Error "Backup file not found at: $BackupFile"
    exit 1
}
Write-Host "[1/5] Located backup file: $resolvedBackup" -ForegroundColor Green

# 3. Securely obtain local database password if not in environment
if (-not $env:PGPASSWORD) {
    $secure = Read-Host -AsSecureString "Enter local PostgreSQL '$PgUser' password (masked)"
    $pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
    try { $env:PGPASSWORD = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer) }
    finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer) }
}

try {
    # 4. Clean & create sandbox target database
    Write-Host "[2/5] Preparing clean isolated sandbox database: $TargetDatabase..." -ForegroundColor Yellow
    & dropdb.exe -h $PgHost -p $PgPort -U $PgUser --if-exists $TargetDatabase 2>$null
    & createdb.exe -h $PgHost -p $PgPort -U $PgUser $TargetDatabase
    if ($LASTEXITCODE -ne 0) {
        Write-Error "Failed to create sandbox database '$TargetDatabase'."
        exit 1
    }
    Write-Host "[3/5] Created isolated sandbox database '$TargetDatabase'." -ForegroundColor Green

    # 5. Restore backup dump into sandbox
    Write-Host "[4/5] Restoring backup dump into sandbox (this takes ~15-30s)..." -ForegroundColor Yellow
    & psql.exe -h $PgHost -p $PgPort -U $PgUser -d $TargetDatabase -f $resolvedBackup -q
    Write-Host "✓ Dump restoration completed." -ForegroundColor Green

    # 6. Run automated verification & evidence generation
    Write-Host "[5/5] Running verification queries and generating audit evidence..." -ForegroundColor Yellow
    & node (Join-Path $PSScriptRoot "restore-sandbox-drill.mjs") $resolvedBackup $TargetDatabase
    if ($LASTEXITCODE -eq 0) {
        Write-Host ""
        Write-Host "==========================================================" -ForegroundColor Green
        Write-Host " ✓ P0-01 DISASTER RECOVERY DRILL VERIFIED & CERTIFIED!" -ForegroundColor Green
        Write-Host " Evidence report saved to docs/verification/P0-01_RESTORE_DRILL_EVIDENCE_2026-11-24.md" -ForegroundColor Green
        Write-Host "==========================================================" -ForegroundColor Green
    } else {
        Write-Error "Restore drill verification queries failed."
        exit 1
    }
}
finally {
    # Always wipe password from environment (Rule N-8)
    $env:PGPASSWORD = $null
}
