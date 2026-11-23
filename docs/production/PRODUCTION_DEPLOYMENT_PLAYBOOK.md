# Babin Rentals OS — Production Deployment Playbook & Execution Runbook

**Date:** 22 November 2026 (Asia/Kathmandu)  
**Author:** Babin Rentals OS Engineering (Lane B / Security & Release)  
**Target Environment:** Production Supabase (`sxguwvgoserhdolewibb`, Singapore `ap-southeast-1`)  
**Scope:** 102 Pending Database Migrations (`0157` through `0260`), Frontend Cloudflare Pages Cutover, Verification & Rollback Protocols  
**Governing Authorities:** Rule N-5 (Zero direct mutations to production by AI agents; Babin executes) · Rule N-8 (Zero credentials in logs, code, or commits) · `BACKUP_PROTOCOL.md` · `docs/00_READ_FIRST.md` · `docs/PERMISSIONS.md`

---

## 1. Executive Summary & Readiness Certification

As of 22 November 2026, the codebase has achieved full deployment readiness:

1. **Stage 0, 1, and 2 Hosted Staging Audit:** **100% PASS** on hosted staging (`klhmsrunqrdxjudyhnkm`). 61/61 assertion tests passed across all 9 canonical roles (`artifacts/staging-verification/2026-11-21T19-16-32-680Z/REPORT.md`).
2. **Local Engineering Gates:**
   - `npm run check:pglite`: 258/258 migrations apply cleanly from scratch.
   - `npm run check:lifecycle`: 98/98 lifecycle steps verified green under real Postgres + RLS.
   - `npm test`: 710 test files / 7,659 tests passing with zero failures.
   - `npm run typecheck` & `npm run lint`: Zero errors, zero warnings.
3. **Migration Plan Parity (`plan-migrations.mjs`):**
   - Live production holds 157 applied records up to `0156`, plus `0163` (applied in Batch 0), `0164`, and `0225`.
   - Exactly **102 migrations** (`0157` through `0260`) remain pending.
   - Quarantined hazard `0047_seed_reference_corpus.sql` is strictly excluded.
   - 7 historic rename mappings from T1-03 are verified and preserved.

All 102 migrations have been bundled into **three ordered, transactional SQL batches** in `docs/production/bundles/`.

---

## 2. Phase 0 — Pre-Cutover Backup & Safety Freeze

> [!CRITICAL]
> Under Rule N-5 and `BACKUP_PROTOCOL.md`, no migration may be executed against production until an authoritative, verified physical database dump is captured and its SHA-256 hash is recorded.

### Step 0.1: Capture Timestamped Dump
Open PowerShell on your local workstation and run:
```powershell
.\scripts\backup-db.ps1
```
*Note: The script prompts for your production database connection string with hidden secure input. It never writes credentials to disk or PowerShell history.*

### Step 0.2: Verify Dump Completion & Integrity
Confirm the backup file was generated in `backups/production_backup_YYYYMMDD_HHmmss.sql` and that it completed successfully:
```powershell
Get-Item backups\production_backup_*.sql | Sort-Object LastWriteTime -Descending | Select-Object -First 1 Name, Length, LastWriteTime
```
Confirm:
1. File size is > 2 MB.
2. The file does **not** have a `.incomplete` suffix.
3. The final line of the dump contains: `-- PostgreSQL database dump complete`.
4. Record the SHA-256 printed by `backup-db.ps1` in your deployment notes.

---

## 3. Phase 1 — Execute Batch 1: Core Audit Triggers, Settings & Reservations

- **Bundle File:** `docs/production/bundles/01_PRODUCTION_BATCH_1_0157_TO_0177.sql`
- **Scope:** 19 migrations (`0157` to `0177`, skipping already applied `0164` and non-existent `0175`).
- **Key Modules:**
  - `0157`: Audit triggers for trigger-less tables (cleaning queue, purchase requests, stock transfers, products).
  - `0158`: System `settings` and `settings_history` tables (removes localStorage drift).
  - `0159`–`0162`: Saved views, pricing structures, project type and non-money column grants.
  - `0163`: Formalized schema recording of anonymous business RPC closures.
  - `0165`–`0174`: Delivery jobs, event RPCs, transport dispatch, rental revert archive, line totals, operations branch grants, section saves, client membership change.
  - `0176`–`0177`: Partial return reservation release and verified return reservations.

### Execution Instructions:
1. Open the [Supabase Dashboard](https://supabase.com/dashboard/project/sxguwvgoserhdolewibb/sql).
2. Click **SQL Editor** -> **New Query**.
3. Copy the full content of `docs/production/bundles/01_PRODUCTION_BATCH_1_0157_TO_0177.sql`.
4. Paste into the editor and click **RUN**.
5. Verify execution completes with **Success**.

### Batch 1 Verification Query:
Run in SQL Editor:
```sql
select 'BATCH 1' as batch, count(*) as applied_count
from supabase_migrations.schema_migrations
where name in (
  '0157_audit_triggers_for_trigger_less_tables', '0158_settings_table',
  '0159_saved_views', '0160_pricing_structures', '0161_grant_booking_project_type',
  '0162_grant_non_money_columns', '0163_close_six_anon_business_rpcs',
  '0165_delivery_jobs_and_event_rpc', '0166_booking_transport_dispatch',
  '0167_rental_revert_archive', '0168_booking_line_totals_and_breakdown',
  '0169_pin_intel_and_guard_search_paths', '0170_astra_phase0_authorization',
  '0171_operations_branch_grants', '0172_reset_branch_write_boundary',
  '0173_section_saves_and_unit_lifecycle', '0174_change_client_membership',
  '0176_partial_return_reservation_release', '0177_verified_return_reservations'
);
```
**Expected Result:** `applied_count = 19`.

---

## 4. Phase 2 — Execute Batch 2: Operations Lifecycle, Floor Gates & Stock

- **Bundle File:** `docs/production/bundles/02_PRODUCTION_BATCH_2_0178_TO_0244.sql`
- **Scope:** 67 migrations (`0178` to `0244`, skipping already applied `0225`).
- **Key Modules:**
  - `0178`–`0187`: Quantity reset, floor handover gate overrides, self-QC reset, team notes, crew availability calendar, smart reservation holds, staff renting gear.
  - `0189`–`0200`: Delivery zones, staff shifts, damage tracking, equipment catalog photos, renewal of client membership.
  - `0201`–`0210`: Stock check audit, crew overtime calculation, staff 4-digit PINs, calendar feed tokens, problem reports.
  - `0211`–`0220`: Delivery proof capture, cancellation tiers, non-VAT bills, email sending & logs, morning digest queries, push subscriptions.
  - `0221`–`0244`: Unit identity guard, atomic booking confirmation repair, product aliases, offer campaigns, booking tags, project names, pro-forma documents, temporary hold RPCs, return damage signatures, consumables pricing & low-stock triggers, counter sales.

### Execution Instructions:
1. In Supabase **SQL Editor**, create a **New Query**.
2. Copy the full content of `docs/production/bundles/02_PRODUCTION_BATCH_2_0178_TO_0244.sql`.
3. Paste into the editor and click **RUN**.
4. Verify execution completes with **Success**.

### Batch 2 Verification Query:
Run in SQL Editor:
```sql
select 'BATCH 2' as batch, count(*) as applied_count
from supabase_migrations.schema_migrations
where version >= '20261122030019' and version <= '20261122030085';
```
**Expected Result:** `applied_count = 67`.

---

## 5. Phase 3 — Execute Batch 3: Delivery Fee Grid, Portal & Online Payments

- **Bundle File:** `docs/production/bundles/03_PRODUCTION_BATCH_3_0245_TO_0260.sql`
- **Scope:** 16 migrations (`0245` to `0260`).
- **Key Modules:**
  - `0245`–`0251`: Delivery fee distance grid, vehicle rates, outsourced vehicle quotes, waiting charge lines.
  - `0252`–`0253`: Product overbooking allowance flags, temporary partner stock.
  - `0254`: Draft invoice settlement numbering & VAT resync integrity.
  - `0255`–`0257`: Public booking site catalog view, anonymous booking requests intake queue (`submit_booking_request`), client portal account binding (`client_portal_access`).
  - `0258`–`0260`: Fonepay dynamic QR payment intents, booking payment links, online payment refunds & transaction reconciliation.

### Execution Instructions:
1. In Supabase **SQL Editor**, create a **New Query**.
2. Copy the full content of `docs/production/bundles/03_PRODUCTION_BATCH_3_0245_TO_0260.sql`.
3. Paste into the editor and click **RUN**.
4. Verify execution completes with **Success**.

### Batch 3 Verification Query:
Run in SQL Editor:
```sql
select 'BATCH 3' as batch, count(*) as applied_count
from supabase_migrations.schema_migrations
where version >= '20261122030086' and version <= '20261122030101';
```
**Expected Result:** `applied_count = 16`.

---

## 6. Phase 4 — Post-Cutover Database Verification

Run the comprehensive post-cutover verification script:
1. In Supabase **SQL Editor**, paste the content of `docs/production/bundles/04_PRODUCTION_POST_CUTOVER_VERIFICATION.sql`.
2. Click **RUN**.
3. Confirm the following assertion checks:

| Check Item | Target Metric | Expected Outcome |
|---|---|---|
| `MISSING MIGRATIONS` | `missing_count` | **0** (All 102 migrations registered) |
| `TOTAL SCHEMA MIGRATIONS` | `total_count` | **>= 259** (157 baseline + 102 pending) |
| `UNAUTHORIZED ANON RPCS` | `unexpected_anon_rpcs` | **0** (6 business RPCs denied to `anon`) |
| `PUBLIC INTAKE RPCS` | `anon_allowed` | `submit_booking_request` = **true**, `set_request_context` = **true** |
| `CORE CUTOVER TABLES` | Table count | **15 tables** created and queryable |
| `CRITICAL COLUMN EXTENSIONS` | Column availability | `bookings.project_name`, `booking_lines.line_total`, `inventory_units.status` present |

### Step 4.1: Export Updated Live Migration Registry
In SQL Editor, run:
```sql
select version, name
from supabase_migrations.schema_migrations
order by version;
```
Copy the output rows and save to `docs/live/schema_migrations_2026-11-22.txt` to maintain permanent ledger continuity.

---

## 7. Phase 5 — Cloudflare Pages Frontend Deployment

Once the database migration cutover is verified, deploy the production frontend bundle:

### Step 5.1: Configure Cloudflare Pages Environment Variables
In your Cloudflare Pages dashboard for the `babin-rentals-os` project, ensure production environment variables are configured:
```ini
VITE_SUPABASE_URL=https://sxguwvgoserhdolewibb.supabase.co
VITE_SUPABASE_ANON_KEY=<production anon publishable key>
VITE_DEV_AUTH_BYPASS=false
VITE_DATA_SOURCE=supabase
```

### Step 5.2: Trigger Production Build
Merge the release branch into `main` and push:
```bash
git push origin main
```
Cloudflare Pages will run `npm run build` and deploy the output to edge CDN nodes worldwide.

### Step 5.3: Production Smoke Test (User-Run)
1. Open the production URL in an incognito window.
2. Sign in as Owner (`babin@babinrentals.com`).
3. Verify:
   - Dashboard renders without console errors.
   - Nepali/English language toggle switches seamlessly.
   - Booking table loads live records with correct lakh formatting (`1,85,000`).
   - Settings page (`/settings`) displays org-level settings from the new `settings` table.

---

## 8. Phase 6 — Rollback & Disaster Recovery Protocol

If any critical issue or failure occurs during cutover, follow this rollback procedure:

1. **Stop execution immediately.** Do not run subsequent batches.
2. If a batch failed midway, Postgres transactions automatically rolled back any individual failing migration that was wrapped in `BEGIN ... COMMIT`.
3. To restore the database to the exact pre-deployment state captured in Phase 0:
   ```powershell
   # Restore from backup dump using psql:
   psql -h db.sxguwvgoserhdolewibb.supabase.co -U postgres -d postgres -f backups\production_backup_YYYYMMDD_HHmmss.sql
   ```
4. Verify the database restored to 157 migrations:
   ```sql
   select count(*) from supabase_migrations.schema_migrations;
   ```
5. File an incident report detailing the exact error message, migration name, and line number.
