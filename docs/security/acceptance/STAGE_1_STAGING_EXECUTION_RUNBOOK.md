# Stage 1 Staging Alignment Execution Runbook

**Document version:** 1.0.0  
**Date:** 21 November 2026 (Nepal Standard Time)  
**Author:** Windows Antigravity (`security_acceptance_audit`)  
**Target Environment:** `babin-staging`  
**Supabase Project Ref:** `klhmsrunqrdxjudyhnkm`  
**Region:** Singapore (`ap-southeast-1`)  
**Scope:** Stage 1 Schema Alignment (Migrations `0245`–`0259`) & Synthetic Identity Seeding  
**Status:** **EXECUTED & CONFIRMED BY OPERATOR (21 Nov 2026)** — Migrations 0245–0259 applied; synthetic test identities seeded.  

---

## ⚠️ CRITICAL OPERATIONAL SAFETY NOTICE (Rule N-5 & N-8)

> [!CAUTION]
> **VERIFY TARGET PROJECT BEFORE EXECUTING ANY SQL.**
> - Target project MUST be **`babin-staging`** (`klhmsrunqrdxjudyhnkm`).
> - **`sxguwvgoserhdolewibb` is PRODUCTION.**
> - **NEVER** paste or execute these scripts against `sxguwvgoserhdolewibb`.
> - **NEVER** apply live changes automatically via CLI commands (`supabase db push` / `db reset` are strictly prohibited).
> - All mutations must be executed manually by the human operator (Babin) in the Supabase Dashboard SQL Editor for `babin-staging`.

---

## 1. Context & Objectives

As established in the **T0 Security Acceptance Audit** (`docs/security/acceptance/T0_SECURITY_AUDIT_RESULTS.md`):
- `babin-staging` was provisioned and migrated through migration `0244_counter_sale.sql` (242 migration records recorded in `supabase_migrations.schema_migrations`).
- Local HEAD has 258 migrations ending at `0259_payment_link_from_any_booking.sql` (plus `0188` dual migration).
- **15 migrations (`0245` through `0259`) are pending** on staging to bring its schema into 100% parity with local HEAD (`3a8d90b9fa197d1a69326483a89140e404385b85`).
- The 9 canonical roles plus cross-client isolation require synthetic test identities to execute read-only API and RLS verification.

---

## 2. Prepared Execution Bundles

Both bundles have been independently tested and verified in local PGlite before packaging:

| Bundle File | Size | Purpose |
|---|---|---|
| [`01_APPLY_PENDING_MIGRATIONS_0245_TO_0259.sql`](./staging_bundles/01_APPLY_PENDING_MIGRATIONS_0245_TO_0259.sql) | 215 KB | Concatenated SQL for migrations `0245` through `0259`, recording each in `supabase_migrations.schema_migrations`. |
| [`02_SEED_SYNTHETIC_STAGE1_USERS.sql`](./staging_bundles/02_SEED_SYNTHETIC_STAGE1_USERS.sql) | ~8 KB | Seeds 10 synthetic identities across the 9 canonical roles + Client B, test client records, and portal bindings. |

---

## 3. Step-by-Step Operator Instructions

### Step 1: Log in to Supabase and Select Staging Project
1. Navigate to [https://supabase.com/dashboard](https://supabase.com/dashboard).
2. Select the organization and open project **`babin-staging`** (`klhmsrunqrdxjudyhnkm`).
3. Check the URL bar to verify it ends in `/project/klhmsrunqrdxjudyhnkm`.

### Step 2: Apply Schema Migrations (0245–0259)
1. In the left navigation, click on **SQL Editor**.
2. Click **New query** (or open a clean tab).
3. Open [`docs/security/acceptance/staging_bundles/01_APPLY_PENDING_MIGRATIONS_0245_TO_0259.sql`](./staging_bundles/01_APPLY_PENDING_MIGRATIONS_0245_TO_0259.sql) in your code editor.
4. Copy the entire contents of the file and paste them into the SQL Editor.
5. Click **Run** (or press `Ctrl+Enter` / `Cmd+Enter`).
6. Verify output:
   - Output should indicate `Success. No rows returned` (or transaction notices).
   - Expected execution time: ~3–8 seconds.

### Step 3: Seed Synthetic Test Identities
1. Click **New query** in the SQL Editor.
2. Open [`docs/security/acceptance/staging_bundles/02_SEED_SYNTHETIC_STAGE1_USERS.sql`](./staging_bundles/02_SEED_SYNTHETIC_STAGE1_USERS.sql) in your code editor.
3. Copy the entire contents and paste into the SQL Editor.
4. Click **Run**.
5. Verify output:
   - The query concludes with a verification `SELECT` displaying the seeded test identities:
     - `owner@babinrentals.test` (`Owner`)
     - `admin@babinrentals.test` (`Admin`)
     - `manager@babinrentals.test` (`Manager`)
     - `coordinator@babinrentals.test` (`Coordinator`)
     - `warehouse@babinrentals.test` (`Warehouse`)
     - `technician@babinrentals.test` (`Technician`)
     - `accounts@babinrentals.test` (`Accounts`)
     - `driver@babinrentals.test` (`Driver`)
     - `client-a@babinrentals.test` (`Client`, mapped to `C-9901`)
     - `client-b@babinrentals.test` (`Client`, mapped to `C-9902`)

---

## 4. Post-Execution Verification

From the local Windows terminal, run the following verification checks:

### 1. Verify Source Migration Preflight
```powershell
node scripts/staging-schema-preflight.mjs --current
```
*Expected Result:*
- `sourceIdentityVerified: true`
- `status: "SOURCE_IDENTITY_VERIFIED_REVIEW_STILL_REQUIRED"`
- `errors: []`

### 2. Stage 2: Verify Staging Read-Only API & RLS Gates
1. Run `03_SEED_SYNTHETIC_STAGE2_FIXTURES.sql` in the Supabase SQL Editor for `babin-staging` (`klhmsrunqrdxjudyhnkm`):
   - Sets the synthetic test password (`BabinSynthetic2026!`) on all 10 synthetic test accounts in `auth.users`.
   - Seeds test product (`10000000-0000-4000-8000-000000000001`), bookings (`b0000000-0000-4000-8000-000000000001` and `b0000000-0000-4000-8000-000000000002`), booking line, and driver delivery job matching `docs/security/acceptance/staging_fixtures_manifest.json`.
2. Populate `.env.staging.local` with the staging anon key:
   ```env
   BABIN_STAGING_PROJECT_REF=klhmsrunqrdxjudyhnkm
   BABIN_STAGING_SUPABASE_URL=https://klhmsrunqrdxjudyhnkm.supabase.co
   BABIN_STAGING_ANON_KEY=<your_staging_anon_key>
   BABIN_STAGING_FIXTURES=docs/security/acceptance/staging_fixtures_manifest.json
   BABIN_STAGING_SYNTHETIC_PASSWORD=BabinSynthetic2026!
   ```
3. Run the automated hosted acceptance script:
   ```powershell
   node scripts/verify-staging-hosted.mjs
   ```
   *Expected Result:*
   - Automatically logs in via GoTrue to mint real JWTs for all 9 canonical roles.
   - 9-role authorization matrix verified live against PostgREST.
   - Money-blind roles (`Warehouse`, `Technician`, `Driver`, `Client`) confirmed to receive 0 financial values.
   - Cross-client isolation verified: Client A cannot read Client B's bookings.
   - Driver verified to read assigned booking only and denied unassigned trips.

---

## 5. Rollback & Troubleshooting

### In Case of Migration Failure:
- Each migration in `01_APPLY_PENDING_MIGRATIONS_0245_TO_0259.sql` runs in a linear sequence. If any migration fails, Postgres rolls back the active transaction block.
- Inspect the specific error message, identify the migration number, and report the exact PostgreSQL error message in `docs/security/acceptance/T0_SECURITY_AUDIT_RESULTS.md`.

### In Case of Seed Script Conflict:
- `02_SEED_SYNTHETIC_STAGE1_USERS.sql` is structured to be re-runnable:
  - `auth.users` uses `ON CONFLICT (id) DO NOTHING`.
  - `public.users` uses `ON CONFLICT (id) DO UPDATE SET ...`.
  - `public.clients` uses `ON CONFLICT (client_code) DO NOTHING`.
  - `public.portal_users` uses `ON CONFLICT (auth_user_id) DO NOTHING`.
- To completely reset synthetic users without touching existing data:
  ```sql
  DELETE FROM public.portal_users WHERE email LIKE '%@babinrentals.test';
  DELETE FROM public.clients WHERE client_code IN ('C-9901', 'C-9902');
  DELETE FROM public.users WHERE email LIKE '%@babinrentals.test';
  DELETE FROM auth.users WHERE email LIKE '%@babinrentals.test';
  ```
