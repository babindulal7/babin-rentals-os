# USER-RUN ONLY under N-5. Retained filename for runbook links; covers 0157-0169.
# Agents never execute this against live. Complete staging and backup/restore review first.
$ErrorActionPreference = 'Stop'
$taskNames = @('BABIN_CUTOVER_DB_URL', 'BABIN_CUTOVER_BACKUP', 'BABIN_CUTOVER_BACKUP_SHA256', 'BABIN_CUTOVER_CONFIRM')
$taskPrevious = @{}
foreach ($taskName in $taskNames) { $taskPrevious[$taskName] = [Environment]::GetEnvironmentVariable($taskName, 'Process') }
try {
    $env:BABIN_CUTOVER_BACKUP = Read-Host 'Validated backup file path'
    $env:BABIN_CUTOVER_BACKUP_SHA256 = Read-Host 'Recorded SHA-256 from the backup'
    $taskSecure = Read-Host -AsSecureString 'Babin database URI (hidden; direct or session pooler 5432)'
    $taskPointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($taskSecure)
    try { $env:BABIN_CUTOVER_DB_URL = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($taskPointer) }
    finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($taskPointer); $taskSecure = $null }
    Write-Host 'Only missing migrations in 0157-0169 run; seeds and historical renames are excluded.'
    Write-Host 'Each migration and ledger receipt commit together. Stop at first failure.'
    $env:BABIN_CUTOVER_CONFIRM = Read-Host 'After staging and backup review, type APPLY-LIVE to apply to Babin production'
    if ($env:BABIN_CUTOVER_CONFIRM -ne 'APPLY-LIVE') { Write-Host 'Aborted; no changes made.'; return }
    & node (Join-Path $PSScriptRoot 'cutover-user-run.mjs')
    if ($LASTEXITCODE -ne 0) { throw 'Cutover stopped. Refresh the ledger before retrying.' }
}
finally {
    foreach ($taskName in $taskNames) { [Environment]::SetEnvironmentVariable($taskName, $taskPrevious[$taskName], 'Process') }
}
