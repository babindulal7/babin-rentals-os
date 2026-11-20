# Owner Production Backup Checklist (T1-01)

**Card:** T1-01 · Fresh production backup + restore drill  
**Authority:** Rule N-5, Rule N-8, Law 3, Ruling G10  
**Executor:** Babin (Owner) exclusively — AI agents are forbidden from holding production DB credentials or running against live database.

---

## 1. Overview & Policy

Rule N-5 dictates backup-first: no live schema mutation is permitted without a fresh, restorable backup stored off-device.
Because Supabase Free tier does not include Point-in-Time Recovery (PITR) or automated backups, the owner maintains independent backups before applying any migration batches.

Two authorized backup methods exist depending on the workstation environment:
- **Option A (Web Table Editor CSV Export — Zero Tooling):** Applicable on any machine without local PostgreSQL client tools or Docker. Exports all critical business tables directly to Google Drive.
- **Option B (Native `pg_dump` CLI via `backup-db.ps1`):** Complete SQL schema + data dump requiring local `pg_dump` client tools (v17+).

---

## 2. Option A: Web Dashboard Core Table Export (Completed 21 Nov 2026)

When local machine tools (`pg_dump`) are not installed:

1. **Log in to Supabase Dashboard:**
   - Project: `sxguwvgoserhdolewibb` (Production)
   - Navigate to **Table Editor** in the left sidebar.

2. **Export Critical Business Tables:**
   For each mandatory table defined in `scripts/check-dump.mjs`:
   - `bookings`
   - `clients`
   - `products`
   - `security_deposits`
   Click the table name → Click **Export** (top right) → Select **Export to CSV**.

3. **Secure Off-Device in Google Drive:**
   - Move downloaded CSVs to Babin's secure Google Drive:
     `Google Drive / Babin Rentals / Backups / Database / 2026-11-21 /`
   - Verify all 4 files are present and non-empty.

---

## 3. Option B: Native PostgreSQL `pg_dump` CLI

When PostgreSQL client tools (`pg_dump`) are installed on PATH:

1. **Prerequisites:**
   - `pg_dump --version` >= 17.0
   - Production connection URI from Supabase Dashboard (**Project Settings** > **Database** > **Connection String** > **URI**, port 5432 session pooler or direct).

2. **Execution via Masked Script:**
   ```powershell
   .\scripts\backup-db.ps1
   ```
   *Prompts for connection string using `Read-Host -AsSecureString`. Zero credentials written to disk, shell history, or logs (Rule N-8).*

3. **Automated Validation:**
   - `pg_dump` streams to `backups/production_backup_<timestamp>.sql.incomplete`.
   - `scripts/check-dump.mjs` executes automatically:
     - Verifies size >= 10 MB (or >= 256 KB suspect threshold).
     - Asserts presence of `bookings`, `clients`, `products`, `security_deposits`.
     - Confirms `-- PostgreSQL database dump complete` marker.
     - Confirms row data (`COPY` / `INSERT`).
     - Calculates cryptographic SHA-256 digest.
   - Atomically renames to `backups/production_backup_<timestamp>.sql`.

4. **Off-Device Transfer:**
   - Move certified `.sql` file and its `.sha256` hash to Google Drive:
     `Google Drive / Babin Rentals / Backups / Database /`

---

## 4. Verification Harness & Selftests

The repository includes offline test harnesses to verify backup logic and dump validation:
```bash
# Test backup environment isolation & safe parameter handling
node --test scripts/backup-db.test.mjs

# Test dump structural validation (7 synthetic scenarios)
node --test scripts/check-dump.test.mjs
```

---

## 5. Acceptance Criteria for Card T1-01 Closeout

- [x] Critical business tables exported and stored off-laptop in Babin's Google Drive (Option A completed 21 Nov 2026).
- [x] Dump validation logic and failure modes verified by `scripts/check-dump.test.mjs`.
- [x] Credential isolation verified by `scripts/backup-db.test.mjs`.
- [x] PROGRESS.md updated with date and backup verification receipt.
- [ ] Restoration drill into staging rehearsed as part of T1-02.
