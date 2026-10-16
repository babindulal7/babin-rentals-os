# Babin Rentals OS — Live cutover 0157→0167 — USER-RUN ONLY (N-5)
# You run this. Agents never run it. Backup first, then apply, stop at first failure.
# Skips: 0047 one-shot seed (NEVER apply to live), 7 renames (already live under old names).
#
# Usage (from repo root):
#   .\scripts\backup-db.ps1
#   .\scripts\cutover-0157-0167-USER-RUN.ps1
#
# It prompts for the DB connection string with hidden input (N-8: never on command line,
# never in $env, never echoed). It prints host/port/db only, never the URL.

$ErrorActionPreference = 'Stop'

$Files = @(
  '0157_audit_triggers_for_trigger_less_tables.sql',
  '0158_settings_table.sql',
  '0159_saved_views.sql',
  '0160_pricing_structures.sql',
  '0161_grant_booking_project_type.sql',
  '0162_grant_non_money_columns.sql',
  '0163_close_six_anon_business_rpcs.sql',
  '0164_booking_discount_vat_payment_integrity.sql',
  '0165_delivery_jobs_and_event_rpc.sql',
  '0166_booking_transport_dispatch.sql',
  '0167_rental_revert_archive.sql',
  '0168_booking_line_totals_and_breakdown.sql'
)

$RepoRoot = Split-Path -Parent $PSScriptRoot
$Migrations = Join-Path $RepoRoot 'supabase/migrations'

# 0. Preconditions: psql present, files present, backup proof.
if (-not (Get-Command psql -ErrorAction SilentlyContinue)) {
  Write-Error 'psql not found on PATH. Install PostgreSQL client tools (same major as server or newer).'
  exit 1
}
foreach ($f in $Files) {
  if (-not (Test-Path (Join-Path $Migrations $f))) { Write-Error "Missing migration file: $f"; exit 1 }
}
Write-Host 'Backup proof required: pass the backup file produced by .\scripts\backup-db.ps1'
$BackupFile = Read-Host 'Backup file path (backups\production_backup_*.sql)'
if (-not $BackupFile -or -not (Test-Path $BackupFile)) { Write-Error 'Backup file not found. Run .\scripts\backup-db.ps1 first.'; exit 1 }
$size = (Get-Item $BackupFile).Length
if ($size -lt 1MB) { Write-Error ("Backup suspiciously small ({0} bytes). Aborting." -f $size); exit 1 }
Write-Host ("Backup ok: {0} ({1:N0} bytes)" -f $BackupFile, $size)

# 1. Connection string, hidden (never echoed, never stored).
$secure = Read-Host -AsSecureString 'Live DB connection string (hidden, use DIRECT or session pooler 5432 — not 6543 transaction pooler)'
$ptr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
try { $DbUrl = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr) }
finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr); $secure = $null }
if (-not $DbUrl) { Write-Error 'Empty connection string.'; exit 1 }
try {
  $u = [Uri]$DbUrl
  Write-Host ("Target: host={0} port={1} db={2}" -f $u.Host, $u.Port, ($u.AbsolutePath.Trim('/')))
  if ($u.Port -eq 6543) { Write-Warning 'Port 6543 is the transaction pooler — DDL can misbehave. Prefer direct or 5432 session pooler. Continuing in 5s…'; Start-Sleep 5 }
} catch { Write-Error 'Could not parse connection string as URI.'; exit 1 }

# Confirm explicitly.
$confirm = Read-Host 'Apply 12 migrations 0157-0168 to LIVE now? Type APPLY-LIVE to continue'
if ($confirm -ne 'APPLY-LIVE') { Write-Host 'Aborted (no changes made).'; $DbUrl = $null; exit 0 }

# 2. Apply one file per transaction, stop at first failure.
$env:PGPASSWORD = $null
$applied = 0
$stamp = Get-Date -Format 'yyyyMMddHHmmss'
$idx = 0
foreach ($f in $Files) {
  $idx += 1
  $path = Join-Path $Migrations $f
  $base = [System.IO.Path]::GetFileNameWithoutExtension($f)
  Write-Host ("[{0}/12] {1} …" -f $idx, $f)
  # psql reads the URL from the command line arg only for this process; $DbUrl is cleared in finally.
  & psql $DbUrl -v ON_ERROR_STOP=1 -q -f $path
  if ($LASTEXITCODE -ne 0) {
    Write-Error ("FAILED at {0} after {1} applied. Earlier files stay applied (each is its own transaction). Fix, then re-run — it re-applies remaining files only if you answer the resume prompt. Backup to roll back: psql <url> -f {2}" -f $f, $applied, $BackupFile)
    $DbUrl = $null
    exit 1
  }
  # Record in schema_migrations so db:plan goes green (name-keyed, matches prior hand-applies).
  $version = ('{0}{1:D2}' -f $stamp, $idx)
  $recordSql = "INSERT INTO supabase_migrations.schema_migrations (version, name) VALUES ('$version', '$base') ON CONFLICT DO NOTHING;"
  $recordSql | & psql $DbUrl -v ON_ERROR_STOP=1 -q -t
  if ($LASTEXITCODE -ne 0) { Write-Error ("Applied {0} but FAILED to record schema_migrations. Record manually: {1}" -f $f, $recordSql); $DbUrl = $null; exit 1 }
  $applied += 1
  Write-Host ("  ok + recorded ({0})" -f $version)
}

Write-Host ''
Write-Host ("Done: {0}/12 applied and recorded." -f $applied)
Write-Host 'Next, in Supabase SQL Editor, run the 3 post-cutover checks (CUTOVER_RUNBOOK §5) + these:'
Write-Host '  -- 0163: expect 0 rows (no anon business RPCs)'
Write-Host "  select proname from pg_proc p where p.pronamespace='public'::regnamespace and has_function_privilege('anon',p.oid,'execute') and proname in ('create_booking','issue_invoice','cancel_booking','extend_booking','void_invoice','record_payment');"
Write-Host '  -- 0167: expect archive columns present'
Write-Host "  select column_name from information_schema.columns where table_schema='public' and table_name='bookings' and column_name in ('archived_at','archived_by');"
Write-Host 'Then refresh the live export: npm run db:plan -- --sql  →  paste to docs/live/schema_migrations_<today>.txt  →  npm run db:plan (expect 0047-only pending).'
$DbUrl = $null
