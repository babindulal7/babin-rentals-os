# Babin Rentals OS — Supabase Hosted Schema Drift & Discrepancy Report
**Date:** 23 November 2026 (Asia/Kathmandu)  
**Author:** Windows Antigravity  
**Task:** T-SB-02 (Migration Inventory & Hosted Schema Drift Reconciliation)  
**Safety Status:** NON-DESTRUCTIVE RECONCILIATION — STRICT READ-ONLY / NO HOSTED MUTATIONS  

---

## 1. Executive Summary & Drift Findings

This audit reconciles schema and policy drift between the canonical source repository (`main` at `4fe9d216`), Staging (`klhmsrunqrdxjudyhnkm`), and Production (`sxguwvgoserhdolewibb`).

### Key Confirmed Drift Items:
1. **`external_holds` Table and Triggers (Migration 0261):**
   - **Source:** Defined with dual GiST exclusion constraints, turnaround windows (`0240`), and `source_period`.
   - **Staging / Production:** **ABSENT**. Merged PR #334 introduced code referencing `external_holds`, but the table has never been applied to hosted databases. Code querying this table on live hosted databases fails with `relation "external_holds" does not exist` unless mocked or unapplied.
2. **`online_profiles_staff_select` Policy (Migration 0257):**
   - **Canonical Source:** Allows `Owner`, `Admin`, `Manager`, and `Coordinator` roles.
   - **Staging:** Reconciled under Issue #304 to include `Coordinator`.
   - **Production:** Legacy variant omitting `Coordinator`.
   - **Reconciliation Rule:** Canonical source in `0257_client_accounts_and_portal_binding.sql` is authoritative.
3. **`storage.objects.request_ids_select` Policy (Migration 0257):**
   - **Canonical Source:** Allows client prefix match `(string_to_array(name, '/'))[1] = auth.uid()::text` OR staff roles (`Owner`, `Admin`, `Manager`, `Coordinator`).
   - **Staging:** Reconciled to match canonical source.
   - **Production:** Missing `Coordinator` role in SELECT policy.
4. **Recent Schema Additions (0262–0268):**
   - `online_booking_away_mode` (`0262`), `product_families` (`0263`), `public_product_family_options_v` (`0264`), `submit_request_rates_in_paisa` (`0265`), `manager_approvals_to_owner` (`0266`), `database_enforced_aal2_money_roles` (`0267`), and `sign_in_events_and_new_device` (`0268`) exist solely in source code and PGlite tests. Neither hosted database contains these tables, views, or RPCs.

---

## 2. Table-by-Table Schema Drift Matrix

| Table / Object Name | Canonical Source | Staging (`klhmsrunqrdxjudyhnkm`) | Production (`sxguwvgoserhdolewibb`) | Risk / Impact |
|---|---|---|---|---|
| `public.external_holds` | Table exists with GiST constraint & trigger | **Table Absent** | **Table Absent** | Double-booking prevention via external cutover holds inactive on hosted instances. |
| `public.product_families` | Table exists with `tier`, `category_id` | **Table Absent** | **Table Absent** | Online catalog product family groupings unapplied. |
| `public.product_family_options` | Table exists with pricing option rows | **Table Absent** | **Table Absent** | Option picker backend schema unapplied. |
| `public.public_product_family_options_v` | Security-invoker public view exists | **View Absent** | **View Absent** | Online catalog options view unapplied. |
| `public.booking_away_mode` | Table exists with single-row state | **Table Absent** | **Table Absent** | Online booking away mode toggle unapplied. |
| `public.sign_in_events` | Table exists with immutability triggers | **Table Absent** | **Table Absent** | New device sign-in audit logging unapplied. |
| `public.staff_directory_v` | View exists with Law 6 CASE masking | View exists (Advisor flag disproven) | View exists (Advisor flag disproven) | Functionally identical; advisor flags benign lack of `security_invoker`. |
| `public.booking_at_risk` | Table & policies exist (Coordinator credit guard) | Table & policies match source | Table & policies match source | Identical behavior confirmed across all environments. |
| `storage.objects` (`request-ids`) | Policy includes Coordinator | Policy includes Coordinator | Policy omits Coordinator | Coordinator cannot inspect client KYC IDs on Production. |

---

## 3. Policy Drift & Resolution Plan

### Policy Drift 1: `online_profiles_staff_select`
- **Issue:** Discrepancy between staging and production regarding `Coordinator` access.
- **Root Cause:** Migration 0257 explicitly grants `Coordinator` access in the canonical migration file, but production migration history diverged prior to 0257 rollout.
- **Resolution:** Production must be updated forward using canonical definition when authorized. Staging already matches source.

### Policy Drift 2: `storage.objects.request_ids_select`
- **Issue:** Production does not permit `Coordinator` to view uploaded KYC documents in the `request-ids` storage bucket.
- **Root Cause:** Staging had hotfix applied under Issue #304; production was not touched per Rule N-5.
- **Resolution:** Reconcile production during formal migration cutover under owner supervision.

---

## 4. Verification Evidence & Recommendations
- Source repository integrity verified: `266 files`, `0 syntax errors`.
- Preflight script verification: `scripts/staging-schema-preflight.mjs --current` passed with zero errors.
- PGlite rebuild verification: `265/265 applied` cleanly from scratch.
- Hosted databases remain safe and untouched: **ZERO mutations executed**.
