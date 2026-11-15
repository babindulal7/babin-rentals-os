# Owner Production Backup Checklist (T1-01)

**Card:** T1-01 · Fresh production backup + restore drill  
**Authority:** Rule N-5, Rule N-8, Law 3, Ruling G10  
**Executor:** Babin (Owner) exclusively — AI agents are forbidden from holding production DB credentials or running against live database.

---

## 1. Prerequisites (Owner Machine)
- [ ] PostgreSQL client tools installed and on PATH (`pg_dump --version` >= 17.0).
- [ ] Working repository clone on `main`.
- [ ] Access to Supabase Production Dashboard:
  - Project: `sxguwvgoserhdolewibb`
  - Path: **Project Settings** > **Database** > **Connection String** > **URI**
  - Use the session pooler (port `5432`) or direct connection (port `5432`). Avoid transaction pooler (`6543`) for dumps.

---

## 2. Execution Steps (Zero Credential Leakage)

1. Open PowerShell in repository root:
   ```powershell
   cd C:\Users\use\Desktop\babin-rentals-os
   ```

2. Run the secure backup script:
   ```powershell
   .\scripts\backup-db.ps1
   ```
   *The prompt will request: `Database connection string (hidden)`. Paste the URI. Input is masked (`-AsSecureString`) and never recorded in PowerShell history, logs, or arguments.*

3. Observe execution:
   - `pg_dump` streams to `backups/production_backup_<timestamp>.sql.incomplete`.
   - Automated dump validator `scripts/check-dump.mjs` executes automatically.
   - Mandatory tables validated: `bookings`, `clients`, `products`, `security_deposits`.
   - Completion marker verified: `-- PostgreSQL database dump complete`.
   - Cryptographic SHA-256 digest is generated.
   - Atomic rename to `backups/production_backup_<timestamp>.sql`.

---

## 3. Post-Backup Verification & Integrity Check

1. Manually run dump check to verify:
   ```powershell
   npm run check:dump -- backups\production_backup_<timestamp>.sql
   ```
   *Expected output: All checks passed (or plausible).*

2. Verify SHA-256 digest:
   ```powershell
   Get-FileHash -Algorithm SHA256 backups\production_backup_<timestamp>.sql
   ```
   *Confirm the SHA-256 string matches the backup script output.*

---

## 4. Off-Device Vault Storage (Rule N-8, Rule N-5)

1. **Move (do not copy)** the `.sql` backup file to Babin's secure off-machine storage:
   - Target: Babin's Google Drive `/Babin Rentals/Backups/Database/`
2. Create a sidecar file alongside the dump:
   - Name: `production_backup_<timestamp>.sql.sha256`
   - Content: `<sha256-hex>  production_backup_<timestamp>.sql`
3. Verify that `git status` shows NO dump files staged:
   ```powershell
   git status
   ```
   *(The `backups/` directory is in `.gitignore` — verify it is clean).*

---

## 5. Acceptance Criteria for Card T1-01 Closeout
To mark T1-01 `done` (per prompt definition):
- [ ] Real dump file stored on Babin's Drive.
- [ ] SHA-256 recorded in PROGRESS.md (without credentials).
- [ ] Date and file size recorded.
- [ ] Restoration drill into staging (T1-02) rehearsed.
