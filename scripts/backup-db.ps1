param (
    [string]$DbUrl = $env:SUPABASE_DB_URL,
    [string]$BackupFile
)
$ErrorActionPreference = 'Stop'
if (-not $DbUrl) {
    $secure = Read-Host -AsSecureString 'Database connection string (hidden)'
    $pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
    try { $DbUrl = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer) }
    finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer) }
}
$previousUrl = $env:SUPABASE_DB_URL
$previousFile = $env:BABIN_BACKUP_FILE
try {
    $env:SUPABASE_DB_URL = $DbUrl
    $env:BABIN_BACKUP_FILE = $BackupFile
    & node (Join-Path $PSScriptRoot 'backup-db.mjs')
    $result = $LASTEXITCODE
}
finally {
    $env:SUPABASE_DB_URL = $previousUrl
    $env:BABIN_BACKUP_FILE = $previousFile
    $DbUrl = $null
}
exit $result
