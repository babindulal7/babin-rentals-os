# Babin Rentals OS — Production vs. Staging vs. Codebase Parity Matrix

**Date:** 23 November 2026 (Asia/Kathmandu)  
**Author:** Babin Rentals OS Security & Engineering (Windows Antigravity)  
**Track:** SEC-01 (Production Read-Only Post-Cutover Audit)  
**Production Project Ref:** `sxguwvgoserhdolewibb` (Singapore `ap-southeast-1`)  
**Staging Project Ref:** `klhmsrunqrdxjudyhnkm` (`babin-staging`)  
**Codebase Head SHA:** `f9330c53443a6d4d1eebba5b79eef3bf41f6f199` (`origin/main`)  
**Mode:** Strictly Read-Only Audit (No SQL mutations or DDL applied)

---

## 1. Environment Topology & Ledger Baseline

| Environment | Host / Identifier | Ledger Source | Applied Count | Latest Migration |
|---|---|---|---|---|
| **Production** | `sxguwvgoserhdolewibb.supabase.co` | `docs/live/schema_migrations_2026-11-23.txt` | **259** | `0260_online_payment_refunds_and_reconciliation` |
| **Staging** | `klhmsrunqrdxjudyhnkm.supabase.co` | `docs/security/acceptance/T0_SECURITY_AUDIT_RESULTS.md` | **250** | `0259_payment_link_from_any_booking` |
| **Codebase (`main`)** | `supabase/migrations/*.sql` | Local directory index | **266** | `0268_sign_in_events_and_new_device` |
| **Local Verification (PGlite)** | WASM In-Memory Postgres 18 | `check-pglite.mjs` | **266** | `0268_sign_in_events_and_new_device` |

---

## 2. Migration Delta & Parity Analysis

### A. Migrations Applied to Production (`0001` through `0260`)
- **Baseline Migrations:** 157 migrations (`0001` to `0156`, plus `0163`, `0164`, `0225` pre-applied).
- **PR #348 Cutover:** 102 migrations (`0157` through `0260`) successfully applied via Bundles 1, 2B, and 3.
- **Total Registered in Production:** 259 rows in `supabase_migrations.schema_migrations`.
- **Status:** Complete for the 0260 cutover batch.

### B. Delta 1: Staging vs. Production Gap (1 Migration)
- **Missing on Staging:** `0260_online_payment_refunds_and_reconciliation.sql`.
- **Observation:** Staging was audited during Phase T0-SAA up to `0259`. The cutover bundle for production included `0260`.
- **Status:** **PENDING STAGING UPDATE** (`OWNER APPROVAL REQUIRED` prior to applying `0260` to staging `klhmsrunqrdxjudyhnkm`).

### C. Delta 2: Codebase (`main`) vs. Production Gap (8 Migrations)
The following 8 migrations exist in git `main` (`supabase/migrations/`) but have **NOT** been applied to production or staging:

| Migration File | Title / Scope | Author / Lane | Status on Prod (`sxguwvgoserhdolewibb`) | Status on Staging (`klhmsrunqrdxjudyhnkm`) |
|---|---|---|---|---|
| `0261_external_holds_and_double_booking_prevention.sql` | External dispute hold statuses and double-booking guard triggers | Lane A | **NOT APPLIED** | **NOT APPLIED** |
| `0262_online_booking_away_mode.sql` | Away mode switch and public intake pause toggle | Lane C | **NOT APPLIED** | **NOT APPLIED** |
| `0263_product_families.sql` | Product family groupings, model variants, options | Lane Nemotron | **NOT APPLIED** | **NOT APPLIED** |
| `0264_public_product_family_options.sql` | Public catalog view for product family options | Lane Nemotron | **NOT APPLIED** | **NOT APPLIED** |
| `0265_submit_request_rates_in_paisa.sql` | Public intake paisa conversion standardization | Lane C | **NOT APPLIED** | **NOT APPLIED** |
| `0266_manager_approvals_to_owner.sql` | Route high-value manager credit approvals to owner | Lane C | **NOT APPLIED** | **NOT APPLIED** |
| `0267_database_enforced_aal2_money_roles.sql` | MFA / AAL2 database enforcement for money-handling roles | Lane B | **NOT APPLIED** | **NOT APPLIED** |
| `0268_sign_in_events_and_new_device.sql` | Server-derived login audit and first-time device alert engine | Lane A | **NOT APPLIED** | **NOT APPLIED** |

> [!IMPORTANT]
> **No unapproved live migrations:** Pursuant to Rule N-5, these 8 migrations remain staged in code only. They must NOT be applied to production or staging without explicit owner approval, pre-cutover testing, and an updated rollback bundle.

---

## 3. Database Objects Parity Matrix

| Object Category | Production (`sxguwvgoserhdolewibb`) | Codebase (`main`) | Delta Notes |
|---|---|---|---|
| **Tables (Public Schema)** | 146 tables | 148 tables | `main` adds `sign_in_events` (`0268`) and `product_families` (`0263`) |
| **Views (Public Schema)** | 45 views | 47 views | `main` adds `external_holds_v` (`0261`) and `public_product_family_options_v` (`0264`) |
| **Security Definer Functions** | 227 functions | 237 functions | `main` adds `record_sign_in_event()`, `get_recent_sign_in_events()`, and away-mode RPCs |
| **Public Intake Anon RPCs** | 2 (`submit_booking_request`, `set_request_context`) | 3 (adds `get_online_booking_away_status`) | Cleanly isolated in both |
| **RLS Tables** | 100% of exposed tables | 100% of exposed tables | All public tables carry `relrowsecurity = true` |
| **RLS No-Policy Tables** | 3 reported by advisor | 1 in PGlite (`staff_auth_pins`) | Production delta due to auxiliary/extension tables |

---

## 4. Staging Alignment Recommendation

1. **Do Not Touch Production:** Production schema is frozen at `0260`.
2. **Staging Alignment Runbook (When Authorized):**
   - Apply `0260_online_payment_refunds_and_reconciliation.sql` to staging `klhmsrunqrdxjudyhnkm` to align staging with current production.
   - Run `scripts/verify-staging-hosted.mjs` to confirm all 9 roles pass before scheduling next release batches (`0261`–`0268`).
