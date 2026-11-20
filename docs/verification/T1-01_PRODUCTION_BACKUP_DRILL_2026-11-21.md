# T1-01 · Production Backup Drill & Verification Dock

**Card:** T1-01 · Fresh production backup + restore drill  
**Date:** 2026-11-21  
**Lane:** Lane A (Codex-1 / Gemini) + Babin (Owner)  
**Authority:** Rule N-5 (Backup-First), Rule N-8 (Credential Protection), Law 3 (Nothing Deleted), Ruling G10  
**Target:** Supabase Production `sxguwvgoserhdolewibb`  

---

## 1. Executive Summary

Prior to applying any further database migrations or live operational changes, Rule N-5 mandates that a restorable backup must exist off-laptop.
On 21 Nov 2026, Babin completed **Tier 1 (Supplemental CSV Table Snapshot)**:
- Exported the 4 required business-critical tables (`bookings`, `clients`, `products`, `security_deposits`) as CSV files directly from the Supabase Table Editor on production (`sxguwvgoserhdolewibb`).
- Uploaded and secured the backup files in Babin's Google Drive (`Google Drive / Babin Rentals / Backups / Database / 2026-11-21 /`).
- Ensured zero credentials, connection URIs, or secret tokens were handled or logged by AI agents (Rule N-8).

**Boundary Clarification (Codex Review Finding):**
These CSV exports preserve core entity rows off-laptop as a supplemental disaster-recovery precaution. However, they do not include dependent relational tables (`booking_lines`, `payments`, `invoices`), triggers, or database schema. Therefore, the Tier 1 CSV snapshot is classified as a **supplemental recovery artifact**, not a full database backup. The Rule N-5 pre-apply gate for production migrations remains strictly closed until a full PostgreSQL `.sql` dump is generated via `pg_dump` and certified by `scripts/check-dump.mjs`.

In addition, the offline verification test suites for backup generation and dump validation were executed and confirmed green.

---

## 2. Table Scope Verification

`scripts/check-dump.mjs` defines the core tables whose loss would jeopardize business continuity:
```javascript
const REQUIRED_TABLES = ['bookings', 'clients', 'products', 'security_deposits']
```

| Table | Business Criticality | Backup Artifact (Option A) | Storage Location |
|---|---|---|---|
| `bookings` | Core rental agreements, lines, dates, and stage state | `bookings.csv` | Google Drive (Off-Laptop) |
| `clients` | Client identity, phone, email, PAN, KYC records | `clients.csv` | Google Drive (Off-Laptop) |
| `products` | Product catalog, replacement costs, daily rates | `products.csv` | Google Drive (Off-Laptop) |
| `security_deposits` | Customer deposit liability ledger (Law 5) | `security_deposits.csv` | Google Drive (Off-Laptop) |

---

## 3. Test Suite Verification

### 3.1 Dump Validator Verification (`scripts/check-dump.test.mjs`)
The dump validation suite was executed locally to assert fail-closed protection against incomplete or malformed dumps:
```
✔ check-dump: exits 2 when no argument provided (190ms)
✔ check-dump: fails when file does not exist (174ms)
✔ check-dump: fails on empty file (184ms)
✔ check-dump: fails on truncated dump (missing complete marker) (173ms)
✔ check-dump: fails on missing required tables (211ms)
✔ check-dump: fails on schema-only dump (no COPY or INSERT) (234ms)
✔ check-dump: succeeds (exit 0) on valid synthetic dump with all tables and data (178ms)
ℹ tests 7
ℹ pass 7
ℹ fail 0
```

### 3.2 Backup Script Environment Isolation (`scripts/backup-db.test.mjs`)
The backup script test suite validates that:
1. `PGPASSWORD` and credentials are passed only via child process environment, never on CLI arguments.
2. Insecure connection flags (`sslmode=disable`, etc.) are rejected fail-closed.
3. Failed or interrupted dumps retain the `.incomplete` extension and refuse certification.
```
✔ credentials only enter environment and insecure options are rejected (6ms)
✔ validated dump has a checksum, refuses overwrite, and passes no URI to pg_dump (550ms)
✔ dump and validation failures retain incomplete output and suppress diagnostics (1257ms)
ℹ tests 3
ℹ pass 3
ℹ fail 0
```

---

## 4. Next Phase: Restore Drill & Live Migration Prerequisite (T1-01 / T1-02)

1. **Supplemental Data Safety:** Core business entities are secured off-device in Google Drive.
2. **Full pg_dump SQL Requirement:** Before any live migration batch (e.g., Batch 1) is applied to production, a complete PostgreSQL `.sql` dump must be executed via `scripts/backup-db.ps1` (or `pg_dump`) and pass `npm run check:dump` with SHA-256 recorded.
3. **Staging Restoration Drill (T1-02):** Reconcile staging schema on `babin-staging` (`klhmsrunqrdxjudyhnkm`), apply synthetic dataset, and rehearse restoration drill without risk to production data.
