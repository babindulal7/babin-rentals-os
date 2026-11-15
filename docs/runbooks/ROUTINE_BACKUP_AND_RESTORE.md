# Routine Backup & Recovery Runbook (T1-12)

**Cadence:** Weekly scripted production backup · Monthly staging restore drill  
**Authority:** Rule N-5, Rule N-8, Law 3, Ruling G10  
**Tools:** `scripts/backup-db.ps1`, `scripts/backup-db.mjs`, `scripts/check-dump.mjs`, `scripts/verify-staging-readonly.mjs`  

---

## 1. Governance & Retention Policy

### A. Cadence & Storage Tier
1. **Weekly Scripted Backup (Owner-Triggered):**
   - Executed every Sunday evening (Asia/Kathmandu).
   - Target format: Plain SQL dump with `--clean --if-exists --quote-all-identifiers`.
   - Location: Encrypted local staging (`backups/`), immediately relocated to Babin's Google Drive (`/Babin Rentals/Backups/Database/`).
2. **Rolling Retention Schedule:**
   - **Weekly Rolling Snapshots:** Retain 8 consecutive weekly dumps.
   - **Monthly Archival Snapshots:** Retain 1 dump per month for 12 months.
   - Older weekly snapshots (> 8 weeks) are pruned by Babin after monthly archival verification.
3. **No Automatic Background Tasks Without Approval:**
   - AI agents are strictly forbidden from creating automatic scheduled cron jobs or Windows Task Scheduler tasks that hold credentials or push to external clouds without explicit owner authorization.

---

## 2. Weekly Backup Procedure (Owner / Admin)

1. **Execution via Secure Terminal:**
   Run from repository root on Windows:
   ```powershell
   .\scripts\backup-db.ps1
   ```
   *Prompts for the PostgreSQL connection URI using `Read-Host -AsSecureString`. Zero credentials are written to disk, command history, or console logs (Rule N-8).*

2. **Automated Validation (`npm run check:dump`):**
   The backup script automatically executes `scripts/check-dump.mjs` on the completed dump:
   - Verifies file size exceeds threshold (`MIN_BYTES = 10MB`).
   - Asserts existence of mandatory business tables: `bookings`, `clients`, `products`, `security_deposits`.
   - Confirms trailing completion marker: `-- PostgreSQL database dump complete`.
   - Calculates cryptographic SHA-256 digest.
   - Atomically renames `.incomplete` file to final `.sql` file upon passing.

3. **Checksum & Off-Device Preservation:**
   - Move the certified `.sql` dump file to Babin's secured Google Drive folder (`/Babin Rentals/Backups/Database/`).
   - Create a matching `.sha256` sidecar file containing the 64-character hash.
   - Confirm local working copy is deleted or gitignored (`backups/` is in `.gitignore`).

---

## 3. Failure Notification & Recovery Protocol

If a backup fails during execution:
1. **Incomplete File Isolation:**
   - Any failed or interrupted transfer remains named `*.sql.incomplete`.
   - The script exits with non-zero status and explicitly displays:
     `"Dump validation failed. The file remains marked incomplete; no backup is certified."`
2. **Credential Sanitization:**
   - Error messages are scrubbed. Connection details, passwords, and hosts are never output to stderr or log files.
3. **Remediation Action:**
   - Inspect PostgreSQL client tool installation (`pg_dump --version`).
   - Verify network connectivity to Supabase pooler (port 5432).
   - Do NOT attempt to use an `.incomplete` file for any restore drill.

---

## 4. Monthly Staging Restore Drill (T1-02 Validation)

Execute once per month to certify disaster recovery capability (Ruling G10):

1. **Target Verification:**
   - Target MUST be `babin-staging` (`klhmsrunqrdxjudyhnkm`).
   - Production ref (`sxguwvgoserhdolewibb`) is REJECTED with exit error.

2. **Execution Steps:**
   ```powershell
   # 1. Target staging connection string
   $env:BABIN_STAGING_DB_URL = "postgresql://postgres.klhmsrunqrdxjudyhnkm:[PASSWORD]@aws-0-ap-south-1.pooler.supabase.com:5432/postgres"

   # 2. Execute restore
   psql "$env:BABIN_STAGING_DB_URL" -f "backups\production_backup_<YYYYMMDD_HHmmss>.sql"
   ```

3. **Post-Restore Integrity & Row-Count Verification:**
   - Execute aggregate count query across `bookings`, `clients`, `products`, `invoices`, and `security_deposits`.
   - Verify table counts match the backup expectations.
   - Run role-permission verification harness:
     ```powershell
     node scripts/verify-staging-readonly.mjs
     ```

---

## 5. Staging Restore Drill Log

Record each monthly drill below (Law 3, Ruling G10):

| Drill Date | Dump File Used | Size (MB) | SHA-256 Digest (First 16 chars) | Duration | Row Counts Verified | Staging Status | Certified By |
|---|---|---|---|---|---|---|---|
| *Sample / Baseline* | `production_backup_20261116.sql` | 14.2 MB | `e3b0c44298fc1c14...` | 4m 12s | Bookings, Clients, Products, Deposits | PASS | Babin (Owner) |
| *2026-12-15* | *(Scheduled)* | — | — | — | — | Pending | — |
| *2027-01-15* | *(Scheduled)* | — | — | — | — | Pending | — |

---

## 6. Acceptance Criteria for Card T1-12
Per task specification, card acceptance requires:
- [ ] Documented weekly backup routine and retention schedule.
- [ ] Documented failure handling and checksum verification.
- [ ] Two consecutive weekly backups deposited in Babin's Drive.
- [ ] One complete monthly restore drill logged on `babin-staging`.
