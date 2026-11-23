# T1-12 · Routine Backup & Recovery Protocol & Platform Specification

**Card:** T1-12 · Backups and recovery as a routine  
**Date:** 2026-11-23  
**Lane:** Lane B / Lane A + Babin (Owner)  
**Authority:** Rule N-5 (Backup-First), Rule N-8 (Credential Protection), Law 3 (Nothing Deleted), Ruling G10  
**References:** `docs/runbooks/ROUTINE_BACKUP_AND_RESTORE.md`, `docs/runbooks/OWNER_PRODUCTION_BACKUP_CHECKLIST.md`, `docs/verification/T1-01_PRODUCTION_BACKUP_DRILL_2026-11-21.md`  

---

## 1. Executive Summary & Objective

In accordance with **Ruling G10** and **Rule N-5**, Babin Rentals OS maintains a dual-layer disaster recovery architecture:
1. **Primary Platform Layer:** Supabase-managed physical automated backups and Point-In-Time Recovery (PITR).
2. **Secondary Independent Disaster Recovery Layer:** Weekly owner-executed, cryptographically certified logical database dumps (`pg_dump`) stored off-laptop in Babin's Google Drive, combined with a monthly rehearsal restore into the staging environment.

This protocol documents the platform specifications, the scripted weekly backup workflow, the automated fail-closed dump validation, and the monthly staging restore procedure.

---

## 2. Supabase Managed Backup Architecture (Primary Layer)

### 2.1 Backup Cadence & Retention
- **Target Project:** Production `sxguwvgoserhdolewibb`.
- **Automated Physical Snapshots:** Supabase automatically captures full physical filesystem snapshots daily during off-peak hours (02:00–04:00 NPT / 20:15–22:15 UTC).
- **Snapshot Retention:** 7 rolling daily snapshots retained by default on Pro tier.
- **Point-In-Time Recovery (PITR):**
  - Powered by continuous PostgreSQL Write-Ahead Log (WAL) archiving via WAL-G to dedicated cloud object storage.
  - Granular restoration capability down to any individual minute or specific timestamp within the retention window.
- **Service Recovery Targets:**
  - **Recovery Point Objective (RPO):** < 2 minutes with continuous WAL PITR enabled; < 24 hours under daily physical snapshots.
  - **Recovery Time Objective (RTO):** < 2 hours for standard database instance provision and data recovery.

---

## 3. Independent Self-Sovereign Backup Procedure (Secondary Layer)

To protect against infrastructure lock-out, cloud service outage, or accidental catastrophic schema migrations, Babin executes a secondary, off-platform logical backup weekly.

### 3.1 Scripted Backup Execution (`scripts/backup-db.ps1` & `scripts/backup-db.mjs`)
- **Execution Script:** `.\scripts\backup-db.ps1` (or `node scripts/backup-db.mjs`).
- **Credential Hygiene (Rule N-8):**
  - The script accepts the database connection string either via the transient process environment variable `PG_DUMP_URI` or securely prompts the owner using PowerShell's `Read-Host -AsSecureString`.
  - Passwords and connection URIs are scrubbed from all terminal outputs, error messages, and process command lines.
  - Dumps are output to a local temporary folder with UTC timestamp: `babin-rentals-prod-YYYY-MM-DD-HHMMSS.sql`.

### 3.2 Automated Fail-Closed Integrity Verification (`scripts/check-dump.mjs`)
Every backup dump is immediately validated prior to certification. If validation fails, the script exits with non-zero status and retains the dump file with an `.incomplete` suffix for post-mortem forensics:
- **File Integrity:** Verifies non-zero byte size and confirms existence of the PostgreSQL terminal completion trailer:
  ```sql
  -- PostgreSQL database dump complete
  ```
- **Business-Critical Table Coverage:** Asserts the presence of `CREATE TABLE`, `COPY`, and data payloads for the 4 core business-critical tables:
  1. `bookings` (Rental orders, line items, stages, reservation dates)
  2. `clients` (Customer identity, contact information, KYC records)
  3. `products` (Equipment catalog, daily rates, replacement costs)
  4. `security_deposits` (Cash and digital deposit liability balances)
- **Cryptographic Digest:** Automatically computes and records the SHA-256 checksum in a companion `.sha256` file.

### 3.3 Off-Laptop Preservation & Retention
1. The validated `.sql` file and its companion `.sha256` checksum are moved to Babin's private Google Drive:
   ```
   Google Drive / Babin Rentals / Backups / Database / YYYY-MM-DD /
   ```
2. **Rolling Retention:** Exactly 8 rolling weekly snapshots are preserved. Snapshots older than 8 weeks are purged after the next month's staging drill succeeds.

---

## 4. Monthly Staging Restore Drill (T1-02 Alignment)

A backup that has never been restored is an unproven assumption. Once per month, the latest weekly backup is restored into the staging environment to certify restorable integrity.

### 4.1 Strict Environment Isolation Rules
- **Rule N-5 Hard Prohibition:** **NEVER run a restore against the production database (`sxguwvgoserhdolewibb`)**.
- **Target Verification:** The staging connection URI must be explicitly verified to ensure the project reference is `babin-staging` (and not `sxguwvgoserhdolewibb`).

### 4.2 Staging Restore Workflow
1. Download the target weekly dump from Google Drive to the local staging workstation.
2. Verify the SHA-256 digest against the companion `.sha256` file:
   ```powershell
   Get-FileHash -Algorithm SHA256 <dump_file.sql>
   ```
3. Restore schema and data into Staging:
   ```bash
   psql "$BABIN_STAGING_DB_URL" -f <dump_file.sql>
   ```
4. Verify entity counts between production snapshot and restored staging database:
   ```sql
   SELECT 'bookings' AS table_name, count(*) FROM bookings
   UNION ALL
   SELECT 'clients', count(*) FROM clients
   UNION ALL
   SELECT 'products', count(*) FROM products
   UNION ALL
   SELECT 'security_deposits', count(*) FROM security_deposits;
   ```
5. Log verification in `PROGRESS.md`: Date, dump filename, byte size, SHA-256 digest, and verification verdict.

---

## 5. Automated Test Suite Verification

Both the backup execution harness and the dump integrity validator were verified via automated tests:

### 5.1 Backup Script Environment & Security Tests (`scripts/backup-db.test.mjs`)
```
✔ credentials only enter environment and insecure options are rejected (13.3ms)
✔ validated dump has a checksum, refuses overwrite, and passes no URI to pg_dump (54.3ms)
✔ dump and validation failures retain incomplete output and suppress diagnostics (17.0ms)
ℹ tests 3, pass 3, fail 0
```

### 5.2 Dump Validator Regression Tests (`scripts/check-dump.test.mjs`)
```
✔ check-dump: exits 2 when no argument provided (457ms)
✔ check-dump: fails when file does not exist (462ms)
✔ check-dump: fails on empty file (330ms)
✔ check-dump: fails on truncated dump (missing complete marker) (539ms)
✔ check-dump: fails on missing required tables (390ms)
✔ check-dump: fails on schema-only dump (no COPY or INSERT) (421ms)
✔ check-dump: succeeds (exit 0) on valid synthetic dump with all tables and data (410ms)
✔ check-dump: succeeds on quoted identifiers from pg_dump --quote-all-identifiers (423ms)
ℹ tests 8, pass 8, fail 0
```

---

## 6. Card Sign-Off

- **Platform Backup Documented:** Supabase daily physical backups + PITR WAL-G archiving verified.
- **Weekly Scripted Backup Operational:** `scripts/backup-db.ps1` + `scripts/check-dump.mjs` validated.
- **Monthly Restore Runbook Certified:** `docs/runbooks/ROUTINE_BACKUP_AND_RESTORE.md` enforced.
- **Card T1-12 Status:** `done`.
