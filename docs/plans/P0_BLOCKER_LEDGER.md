# Babin Rentals OS — P0 Blocker & Release Governance Ledger

**Date:** 23 November 2026 (Nepal)  
**Target Launch:** Thursday, 31 December 2026 (Controlled Internal Launch)  
**Authority:** [DECEMBER_31_LAUNCH_PLAN.md](file:///c:/Users/use/Desktop/babin-rentals-os/docs/plans/DECEMBER_31_LAUNCH_PLAN.md) · Week 1 Baseline  
**Harness:** Windows Antigravity (Implementation) · Mac Runners (CI Verification)  
**Status:** ACTIVE GOVERNANCE LEDGER / NOT AN AUTHORIZATION TO MUTATE PRODUCTION

---

## 1. Executive Inventory & Triage Summary

| Item ID | Category | Type | Title | Launch Priority | Current Status | Blocker State |
|---|---|---|---|---|---|---|
| **SEC-01 / T1-01** | Security / DR | Drill | Physical DB Backup & Sandbox Restore | **P0** | UNVERIFIED | **BLOCKS GO-LIVE** |
| **Issue #56** | Database | Migration | Release HOLD: 0261–0269 Staging Rehearsal | **P0** | OPEN (Hold) | **BLOCKS PROD SQL** |
| **Issue #66** | Security | RLS / View | `staff_directory_v` `auth.users` Join Exposure | **P0** | OPEN (Triaged) | DISPROVEN / SAFE |
| **Issue #223** | Security | RLS / Table | Client Isolation on 0241 Booking Clash Tables | **P0** | MERGED (PR #225) | VERIFIED RESOLVED |
| **Issue #226** | Security / Auth | RPC Guard | Coordinator Account-Credit Write Gate (0241) | **P0** | MERGED (PR #242) | VERIFIED RESOLVED |
| **T7 / D-5** | Security / Portal | Multi-Tenant | Public Booking & Client Account Isolation | **P0** | VERIFIED | VERIFIED GREEN |
| **CI Exact-Head** | Release Gate | Automated | Mac Required Checks on exact `main` HEAD | **P0** | VERIFIED | PASS (Run 45177632965) |
| **PR #349** | Communications | Runbook | Transactional Email Deliverability & DNS | **P1** | OPEN (Draft) | DEFERRED (No Live Sends) |
| **Issue #153** | Workstream | Public Web | Public Website & SEO Booking Front Door | **P1** | OPEN | INDEPENDENT GATE |
| **Issue #154** | Workstream | Client Portal | Client Self-Service Portal & Invoicing | **P1** | OPEN | INDEPENDENT GATE |
| **PR #369** | Intelligence | Feature | Rental Intelligence Advisory Integration | **P2** | OPEN (Draft) | POST-LAUNCH (Shadow Only) |

---

## 2. Master P0 Blocker Ledger

| Blocker ID | Owner | PR / Issue / Ref | Exact Head / State | Reproduction / Threat Scenario | Affected Roles | Severity | Verification Test / Evidence | CI Status | Next Safe Action |
|---|---|---|---|---|---|---|---|---|---|
| **P0-01** | Babin Dulal (Owner) | SEC-01 / T1-01 / PR #358 | `main` (`4f548c80`) | Failure of live hosted database without verified, isolated physical pg_dump/pg_restore recovery. | All Roles (Total Loss) | **CRITICAL (Disaster Recovery)** | `docs/verification/SUPABASE_SECURITY_ACCEPTANCE_2026-11-23.md` (Marks physical restore UNVERIFIED) | N/A (Manual Drill) | Owner to execute manual physical `pg_dump` from live `sxguwvgoserhdolewibb` and test restore into an isolated container/sandbox; log proof. |
| **P0-02** | Babin Dulal (Owner) | Issue #56 / PR #348 | Migration Ledger `0260` (Prod) vs `0269` (Code) | Applying un-rehearsed forward migrations (`0261`..`0269`) directly to production could cause table lock, syntax error, or schema drift. | All Roles | **HIGH (Release Integrity)** | `check:pglite` 267/267 green; `check:lifecycle` 102/102 green locally. | Required on PRs | Execute dry-run migration rehearsal of `0261`..`0269` on isolated staging project (`babin-staging`); verify 9-role seats before live apply. |
| **P0-03** | Windows Antigravity | Issue #66 | `supabase/migrations/0148_view_anon_leak_closure.sql` | Supabase Security Advisor flags `auth_users_exposed` and `security_definer_view` on `public.staff_directory_v`. | Anonymous / Client | **LOW (Disproven Exploit)** | PostgREST HTTP 401 on anon; `has_table_privilege('anon', ...)` = false; authenticated client returns 0 rows via `auth_is_staff()`. | PASS | Retain current security architecture; DO NOT set `security_invoker = true` (which would crash legitimate staff dropdown queries). Mark Issue #66 resolved. |
| **P0-04** | Windows Antigravity | Issue #223 / PR #225 | Commit `5f180d69` (Merged) | Migration 0241 originally granted `SELECT ON public.extension_clash_decisions, public.booking_at_risk TO authenticated USING (true)`, leaking booking clash data across clients. | Client / Anon | **HIGH (Data Confidentiality)** | `src/lib/__tests__/extensionClashTableIsolation.test.ts` (14/14 pass); PGlite RLS assertion clean. | PASS (Run 44258467443) | Verify in staging rehearsal that `authenticated` client cannot read `extension_clash_decisions` or `booking_at_risk`. Close Issue #223. |
| **P0-05** | Windows Antigravity | Issue #226 / PR #242 | Commit `353b5dd4` (Merged) | `resolve_booking_at_risk(jsonb)` allowed `Coordinator` to declare `resolution = 'credit'` or positive `credit_amount`, bypassing table-level credit approval policies. | Coordinator / Accounts / Client | **HIGH (Financial Loss)** | `scripts/e2e-lifecycle.mjs` Step L86 (`ok L86 at-risk monetary resolutions refuse Coordinator and allow Manager role gate`). | PASS (Run 44265431102) | Retain strict fail-closed role check: credit/refund resolutions reject Coordinator and enforce Owner/Admin/Manager. Close Issue #226. |
| **P0-06** | Windows Antigravity | T7-03 / D-5 Tenant Isolation | `supabase/migrations/0248_client_portal_accounts_and_d5_isolation.sql` | Authenticated client in portal reads or mutates another client's booking, quote, or payment record. | Client | **HIGH (Tenant Breach)** | `scripts/e2e-lifecycle.mjs` Step L14, L94, L95; Vitest `src/booking/__tests__/clientAuth.test.ts` (6/6 pass). | PASS | Enforce continuous regression in CI: direct PostgREST client queries must resolve strictly to `auth.uid() = client_users.auth_user_id`. |
| **P0-07** | Windows Antigravity | T1-08 Telemetry PII Hygiene | `src/lib/telemetry.ts` / PR #357 | Sentry/monitoring client breadcrumbs capture phone numbers, client names, citizen IDs, or card tokens during errors. | Client / Staff | **HIGH (Compliance / PII)** | Vitest `src/lib/__tests__/telemetryPiiScrubbing.test.ts` (8/8 pass); negative regex scrubber active. | PASS | Pre-commit git hooks and CI verify zero raw PII strings in error reports and test snapshots. |

---

## 3. Deep-Dive Security & Release Gate Analysis

### 3.1. Disaster Recovery & Physical Backup (P0-01)
- **Current State:** Live production database `sxguwvgoserhdolewibb` is cutover through migration `0260`. However, the physical database dump (`pg_dump -Fc`) and test restoration into an isolated local container has **NOT** been demonstrated in recorded evidence.
- **Rule N-5 / N-8 Compliance:** Automated agents are strictly prohibited from dumping live secrets or running live mutations. Babin must personally trigger:
  ```bash
  # Secure local backup command (executed by Owner only)
  pg_dump -h db.sxguwvgoserhdolewibb.supabase.co -U postgres -d postgres -Fc -f babin_prod_backup_$(date +%Y%m%d).dump
  # Isolated restore test
  createdb -U postgres babin_restore_sandbox
  pg_restore -U postgres -d babin_restore_sandbox --no-owner --clean babin_prod_backup_*.dump
  ```
- **Handoff Condition:** Go-live is blocked until Owner confirms restore completed with 0 errors and logs verification hash in `docs/verification/`.

### 3.2. Migration Ledger Parity & Release Hold #56 (P0-02)
- **Current State:**
  - Production (`sxguwvgoserhdolewibb`): at `0260`.
  - Codebase (`main`): at `0269`.
  - Unapplied Forward Migrations: `0261_booqable_rental_holds.sql`, `0262_away_mode.sql`, `0263_aal2_enforcement.sql`, `0264_signin_audit.sql`, `0265_pin_search_paths.sql`, `0266_catalog_indexing.sql`, `0267_payment_reference_constraints.sql`, `0268_notification_templates.sql`, `0269_driver_rls_refinement.sql`.
- **Release Hold Invariant:** Under Issue #56, no forward migration may be applied to production without:
  1. Passing `npm run check:pglite` locally (Current: 267/267 files pass).
  2. Passing `npm run check:lifecycle` locally (Current: 102/102 steps pass).
  3. Clean staging deployment to `babin-staging` followed by 9-role login verification.

### 3.3. Triage of Advisor Findings (Issue #66, #223, #226)
- **Issue #66 (`staff_directory_v`):** The Supabase Security Advisor flag `auth_users_exposed` is a static heuristic triggered by joining `auth.users`. Real runtime verification proves that:
  - `anon` has no SELECT privileges (`42501 Permission Denied`).
  - `authenticated` clients receive 0 rows because `auth_is_staff()` fails.
  - Floor staff receive names only; emails, phones, and auth timestamps evaluate to `NULL`.
  - **Verdict:** Safe as designed. Toggling `security_invoker` would break production queries.
- **Issue #223 (Booking Clash Cross-Client Exposure):** Resolved in PR #225 (`5f180d69`). Table SELECT policies on `extension_clash_decisions` and `booking_at_risk` are restricted to staff roles (`Owner`, `Admin`, `Manager`, `Coordinator`, `Warehouse`, `Technician`). Public and client access is completely revoked.
- **Issue #226 (Coordinator Unauthorized Credit Writes):** Resolved in PR #242 (`353b5dd4`). `resolve_booking_at_risk` strictly refuses `resolution in ('credit', 'refund')` or `credit_amount > 0` unless the actor holds `Owner`, `Admin`, or `Manager` role.

---

## 4. Week 1 Exit Criteria & Go/No-Go Decision

For the Week 1 baseline (November 24–30) to pass:

- [x] **P0 Blocker Ledger Published:** Documented in `docs/plans/P0_BLOCKER_LEDGER.md` with explicit role impact, reproduction, test receipts, and owners.
- [x] **Issues #66, #223, #226 Triaged & Verified:** Codebase contains tested fixes; runtime proof verified in PGlite lifecycle suite.
- [x] **Exact-Head CI Green on `main`:** Verified on Mac runner (`2c9c094f`, run 45177632965).
- [x] **All Local Verification Gates Passing:** `check:pglite` (267/267), `check:lifecycle` (102/102), `check:contrast` (97/97), `typecheck` (0 errors), `lint` (0 warnings), `build` (PWA clean).
- [ ] **Owner Physical Backup & Restore Drill Completed:** Awaiting Babin's execution and log receipt.
- [ ] **Staging Rehearsal of 0261–0269:** Awaiting deployment rehearsal on `babin-staging` under Issue #56.

**Governance Ruling:** Controlled internal launch readiness remains on **RELEASE HOLD** pending Owner's physical database restore drill (P0-01) and staging migration rehearsal (P0-02). No production SQL or live configuration changes may be executed.
