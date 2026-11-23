param (
    [string]$DbUrl = $env:SUPABASE_DB_URL,
    [string]$BackupFile
)
$ErrorActionPreference = 'Stop'

# Ensure standard PostgreSQL bin paths are available in PATH
foreach ($ver in @('17', '18', '16', '15')) {
    $pgBin = "C:\Program Files\PostgreSQL\$ver\bin"
    if ((Test-Path $pgBin) -and ($env:PATH -notlike "*$pgBin*")) {
        $env:PATH = "$pgBin;$env:PATH"
    }
}

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
