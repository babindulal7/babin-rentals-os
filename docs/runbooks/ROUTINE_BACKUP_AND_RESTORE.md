# Routine Backup & Recovery Runbook (T1-12)

**Cadence:** Weekly scripted production backup · Monthly staging restore drill  
**Authority:** Rule N-5, Rule N-8, Law 3, Ruling G10  
**Tools:** `scripts/backup-db.ps1`, `scripts/backup-db.mjs`, `scripts/check-dump.mjs`  

---

## 1. Weekly Backup Procedure (Owner / Admin)

1. **Execution via Secure Terminal:**
   Run from repository root:
   ```powershell
   .\scripts\backup-db.ps1
   ```
   *Note: Prompts for the PostgreSQL connection URI using `Read-Host -AsSecureString`. Zero credentials are written to disk, command history, or console logs (Rule N-8).*

2. **Automated Validation (`npm run check:dump`):**
   The backup script automatically executes `scripts/check-dump.mjs` on the completed dump:
   - Verifies file size exceeds threshold (`MIN_BYTES = 10MB`).
   - Asserts existence of mandatory business tables: `bookings`, `clients`, `products`, `security_deposits`.
   - Confirms trailing completion marker: `-- PostgreSQL database dump complete`.
   - Calculates cryptographic SHA-256 digest.

3. **Off-Device Preservation:**
   - Move the certified `.sql` dump file to Babin's secured Google Drive folder (`/Babin Rentals/Backups/Database/`).
   - Copy the SHA-256 hash alongside the dump file.
   - Retain 8 weekly rolling snapshots.

---

## 2. Monthly Staging Restore Drill (T1-02 Validation)

1. **Restore Target:**
   Restore exclusively into the isolated **Staging Supabase project** (`babin-staging`). **NEVER restore against production**.
2. **Execution Steps:**
   - Verify staging project ref is NOT `sxguwvgoserhdolewibb` (production ref check in `verify-staging-readonly.mjs`).
   - Run `psql -f <dump-file.sql> "$BABIN_STAGING_DB_URL"`.
   - Execute row-count comparison script comparing staging vs production counts across `bookings`, `clients`, `products`, and `invoices`.
3. **Audit Evidence:**
   Record completion in `PROGRESS.md`: Date, dump file name, byte size, SHA-256 hash, and staging restore verification verdict.
