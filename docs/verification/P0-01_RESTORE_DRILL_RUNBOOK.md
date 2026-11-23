# Babin Rentals OS — P0-01 Disaster Recovery Restore Drill Runbook

**Document Type:** Owner Operational Runbook (`.md`)  
**Target Gate:** [P0-01 Master Blocker Ledger](../plans/P0_BLOCKER_LEDGER.md#2-master-p0-blocker-ledger) (SEC-01 / T1-01 / Issue #56)  
**Target Launch:** Thursday, 31 December 2026  
**Audience:** Babin Dulal (Owner)  
**Security Rules:** Rule N-5 (Zero live writes) & Rule N-8 (Zero credentials in code/commits)  

---

## 1. Objective

Before the December 31, 2026 controlled internal launch can be certified, the live database backup dump must be proven restorable through an isolated restore exercise. A backup file that has never been restored is an unverified file.

This runbook provides the one-command drill script that restores the verified production dump into an isolated local sandbox database (`babin_restore_sandbox`) and executes automated row-count and financial consistency queries.

---

## 2. Target Backup Snapshot

The latest certified production dump is located in the repository:
- **File:** `backups/production_backup_2026-11-07T10-48-06-238Z.sql`
- **Size:** `23,497,610 bytes` (22.41 MB)
- **SHA-256 Digest:** `70d180d6dcac387bef4f7ede7276affdb806cb92d20a81bc3719f47890d276f7`
- **Integrity Validation:** Pass (`npm run check:dump` and `npm run test:backup` 16/16 tests pass)

---

## 3. One-Command Execution (Owner Only)

Open PowerShell in the project root (`c:\Users\use\Desktop\babin-rentals-os`) and run:

```powershell
.\scripts\restore-sandbox-drill.ps1
```

### What Happens Automatically:
1. **Bin Detection:** Checks `C:\Program Files\PostgreSQL\17\bin` and prepends it to `$env:PATH`.
2. **Secure Password Prompt:** Prompts for your local PostgreSQL `postgres` user password using `Read-Host -AsSecureString` (hidden from console and never logged).
3. **Sandbox Provisioning:** Drops any existing `babin_restore_sandbox` test database and creates a fresh clean one (`createdb.exe`).
4. **Physical Restore:** Streams the SQL dump into `babin_restore_sandbox` using `psql.exe`.
5. **Automated Verification:** Runs `scripts/restore-sandbox-drill.mjs` to query table row counts across `bookings`, `clients`, `products`, `security_deposits`, `invoices`, and `payments`.
6. **Report Generation:** Generates and saves the formal audit evidence to:  
   `docs/verification/P0-01_RESTORE_DRILL_EVIDENCE_2026-11-24.md`
7. **Cleanup:** Immediately wipes `$env:PGPASSWORD` from the PowerShell session memory.

---

## 4. Manual Fallback Steps

If you prefer to execute the drill manually step-by-step:

```powershell
# 1. Set PATH to PostgreSQL 17
$env:PATH = "C:\Program Files\PostgreSQL\17\bin;$env:PATH"

# 2. Create local test database
dropdb.exe -U postgres --if-exists babin_restore_sandbox
createdb.exe -U postgres babin_restore_sandbox

# 3. Restore dump into sandbox
psql.exe -U postgres -d babin_restore_sandbox -f backups\production_backup_2026-11-07T10-48-06-238Z.sql -q

# 4. Run automated verification & evidence generator
node scripts\restore-sandbox-drill.mjs backups\production_backup_2026-11-07T10-48-06-238Z.sql babin_restore_sandbox
```

---

## 5. Acceptance Criteria to Close P0-01

The P0-01 blocker is marked **VERIFIED** when:
1. `babin_restore_sandbox` restores cleanly with 0 fatal errors.
2. `public.bookings` has non-zero rows (expected ~246 bookings).
3. `public.clients` has non-zero rows (expected ~40 clients).
4. `public.products` has non-zero rows (expected ~70 products).
5. `public.security_deposits` rows exist and remain separate from rental revenue (Law 5).
6. Evidence report `docs/verification/P0-01_RESTORE_DRILL_EVIDENCE_2026-11-24.md` is committed.
