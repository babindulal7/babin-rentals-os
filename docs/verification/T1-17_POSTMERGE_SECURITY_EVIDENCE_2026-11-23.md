# Post-Merge MFA Security Proof, Issue #304 Audit Correction, and Verification Evidence Ledger

**Document ID:** `docs/verification/T1-17_POSTMERGE_SECURITY_EVIDENCE_2026-11-23.md`  
**Date:** 23 November 2026 (Nepal time)  
**Target Repository:** `babindulal7/babin-rentals-os`  
**Base Commit (main):** `fb26793bcb6e07555f2611c11fa17b3eab702148` (PR #345 merged)  
**Predecessor Commits:** `0abb127ed680ca2646b2d6dd4ca57c6923759ff5` (PR #344 merged), `3e7c96e2` (PR #343 merged), `4c8fe9d7` (PR #339 & PR #338 merged)  
**Active Worktree Branch:** `fix/t1-17-postmerge-provider-proof-audit-integrity-20261123`  
**Release Gate:** **STRICT HOLD — NOT APPROVED FOR PRODUCTION**  
**Task Status:** **ACCEPTANCE PENDING** (Held until hosted staging auth receipts are authorized & collected)

---

## 1. Executive Summary & Status Corrections

1. **PR Status Truth:** PR #344 was merged at `2026-11-23T00:16:31Z` into `main`, followed by PR #345 at `2026-11-23T00:23:08Z`. No branch rebase on #344 was performed; work is grounded on current `origin/main` exact head `fb26793bcb6e07555f2611c11fa17b3eab702148`.
2. **P0 Trust-Boundary Repair (Migration 0269):** The merged RPC `record_staff_mfa_enrolment()` in migration 0267 allowed any authenticated caller or Owner to mark records as `status = 'verified'` in `public.staff_mfa_factors` without genuine factor verification in Supabase Auth. This has been remediated via forward-only migration `0269_mfa_provider_proof_and_session_safety.sql`. The RPC now strictly enforces self-enrolment (`auth.uid()`), removes all parameter overrides, and validates that a verified factor exists in `auth.mfa_factors` (failing closed with `GATE:gate.security.mfa_factor_unverified`).
3. **P0 Lost-Phone Recovery & Session Safety (Migration 0269):** `reset_staff_mfa()` now explicitly forbids self-reset via administrative recovery (`GATE:gate.security.mfa_self_reset_forbidden`), preserves the AD2 hierarchy (Admin cannot reset Owner or other Admin), and atomically clears factors and invalidates active sessions in `auth.sessions` and refresh tokens in `auth.refresh_tokens`.
4. **P0 Issue #304 Audit Script Correction:** `scripts/audit-issue-304-staging.mjs` has been refactored to enforce strict TLS verification (`ssl: { rejectUnauthorized: true }`). It no longer assigns `verifiedRevocation: true` from session counts and no longer claims credential rotation without active sign-in receipts. PostgREST `staff_directory_v` checks explicitly distinguish HTTP 401/403 authorization rejection from HTTP 200 `[]` empty views. Deterministic local fixture tests were added in `scripts/audit-issue-304-staging.test.mjs` (8/8 pass).
5. **Card T1-17 Status Reconciled:** Promoted claims of "done" or full acceptance in documentation have been corrected to `acceptance_pending`. Local PGlite and mock tests confirm logic, but production release remains on strict HOLD pending authorized hosted staging trial.

---

## 2. Per-Claim Evidence Ledger

Every security claim is tracked individually with discrete verification outcomes (**CONFIRMED**, **NOT PROVED**, **FAILED**, or **BLOCKED**):

| Claim / Subsystem | Evidence Source | Verified Now? | Classification | Risk | Next Safe Action |
|---|---|---|---|---|---|
| Real Supabase Auth TOTP enrolment & challenge flow | Supabase Auth API (`enroll`, `challengeAndVerify`) + mock unit tests | **CONFIRMED (Local / Unit)**<br>**NOT PROVED (Hosted)** | P0 | Local logic green; hosted GoTrue challenge verification requires authorized staging maintenance window. | Execute staging sign-in test during authorized window. |
| MFA tracking row cannot be forged by direct RPC | Migration 0269 + `test-mfa-db-gate.mjs` Suite 5 | **CONFIRMED** | P0 | Resolved vulnerability. Direct RPC calls without verified provider factor fail closed (`42501`). | Keep forward-only migration 0269. |
| Owner/Admin reset truly removes factor and invalidates sessions | Migration 0269 + `test-mfa-db-gate.mjs` Suite 5 | **CONFIRMED (DB / Local)**<br>**NOT PROVED (Hosted)** | P0 | Database atomically invalidates `staff_mfa_factors`, `auth.mfa_factors`, `auth.sessions`, and `auth.refresh_tokens`. | Test against live GoTrue sessions during staging window. |
| Armed AAL1 money denied, AAL2 money allowed | Migration 0267/0269 + `test-mfa-db-gate.mjs` Suites 1-4 + `e2e-lifecycle.mjs` Step L100 | **CONFIRMED (PGlite / Engine)** | P0 | Money roles at AAL1 receive `false` from `auth_can_view_money()` and `NULL` in views when armed; AAL2 receives unmasked figures. | Verify under live PostgREST role gateway. |
| Floor and client money blindness (Law 6) | `test-mfa-db-gate.mjs` Suites 1, 3 + `check:anon` | **CONFIRMED** | P0 | Warehouse, Technician, Driver, Client, and Anon return `false` from `auth_can_view_money()` even if session presents `aal2`. | No action needed; strict allow-list intact. |
| Nine staging seat credential rotations (Issue #304) | Read-only inspection of `auth.users` | **NOT PROVED** | P0 | Read-only script only proved accounts exist. Password rotation receipts do not exist in Git. | Plan separate staging test with synthetic accounts. |
| Staging legacy sessions invalidated (Issue #304) | Query on `auth.sessions` (239 active sessions) | **NOT PROVED** | P0 | 239 active sessions exist. Token/refresh rejection receipts required. | Conduct session invalidation test during staging window. |
| Anonymous `staff_directory_v` access denied | Database grant (`pg_class`) + PostgREST 401 check | **CONFIRMED** | P1 | Anon SELECT privilege revoked; PostgREST returns HTTP 401 Unauthorized. | Re-verify after every migration. |
| Staff and client Pages artifacts isolated | `npm run build:staff`, `build:client`, `verify:sites` | **CONFIRMED** | P1 | 1 entrypoint for ops app (`dist-staff`), 2 entrypoints for marketing/booking (`dist-client`). Zero staff routing in client. | Automated in PR CI workflow. |
| Cloudflare Pages & Access protection | Dashboard config memo (`CLOUDFLARE_PAGES_PREVIEW_DECISION_MEMO_2026-11-23.md`) | **BLOCKED (Pre-Launch HOLD)** | P0 | Automatic deployment OFF. Custom domains unmapped. Browser login/deny trial pending. | Await Owner Decision C before enabling preview. |

---

## 3. Minimum Security Acceptance Matrix (Local Verification)

All local test assertions were executed on Windows in an isolated worktree against WASM PGlite:

| Test Case | Expected Security Behavior | Test Command / Suite | Actual Result |
|---|---|---|---|
| Unknown / NULL role at AAL1 or AAL2 | Financial reads and writes denied; `auth_can_view_money() = false` | `node scripts/test-mfa-db-gate.mjs` (Suite 1) | **PASS** |
| Floor roles (Warehouse, Technician, Driver, Client) at AAL2 | Financial reads and writes denied; rates mask to `NULL` (Law 6) | `node scripts/test-mfa-db-gate.mjs` (Suites 1 & 3) | **PASS** |
| Money roles (Owner, Admin, Manager, Coordinator, Accounts) at AAL1 (Armed) | `auth_can_view_money() = false`; views return `NULL` / 0 payment rows | `node scripts/test-mfa-db-gate.mjs` (Suites 3 & 4), `check:lifecycle` L100 | **PASS** |
| Money roles at AAL2 (Armed) | `auth_can_view_money() = true`; views return unmasked figures | `node scripts/test-mfa-db-gate.mjs` (Suites 3 & 4), `check:lifecycle` L100 | **PASS** |
| Direct RPC `record_staff_mfa_enrolment()` without factor in provider | Throws `GATE:gate.security.mfa_factor_unverified`; mirror row NOT created | `node scripts/test-mfa-db-gate.mjs` (Suite 5) | **PASS** |
| Direct RPC with unverified provider factor (`status = 'unverified'`) | Throws `GATE:gate.security.mfa_factor_unverified`; mirror row NOT created | `node scripts/test-mfa-db-gate.mjs` (Suite 5) | **PASS** |
| Owner or Admin cross-user enrolment attempt via RPC parameter | Throws `GATE:gate.security.mfa_enrol_forbidden`; enrolment is strictly self-only | `node scripts/test-mfa-db-gate.mjs` (Suite 5) | **PASS** |
| Genuine provider verification (`status = 'verified'` in `auth.mfa_factors`) | Mirrors factor into `public.staff_mfa_factors`; logs `verified` audit entry | `node scripts/test-mfa-db-gate.mjs` (Suite 5) | **PASS** |
| Self-reset via administrative recovery RPC (`reset_staff_mfa`) | Throws `GATE:gate.security.mfa_self_reset_forbidden` | `node scripts/test-mfa-db-gate.mjs` (Suite 5) | **PASS** |
| Admin resets Owner MFA factor (AD2 violation) | Throws `GATE:gate.security.mfa_reset_forbidden` | `node scripts/test-mfa-db-gate.mjs` (Suite 5) | **PASS** |
| Authorized Admin resets Coordinator MFA factor | Atomically deletes mirror row, provider factor row, active sessions, and refresh tokens | `node scripts/test-mfa-db-gate.mjs` (Suite 5) | **PASS** |
| Overview RPC `get_staff_mfa_overview()` caller check | Owner, Admin, Manager allowed; Coordinator/Warehouse refused (`42501`) | `node scripts/test-mfa-db-gate.mjs` (Suite 6) | **PASS** |
| PostgREST anonymous request to `/rest/v1/staff_directory_v` | Returns HTTP 401 Unauthorized; distinguished from HTTP 200 empty array | `scripts/audit-issue-304-staging.test.mjs` | **PASS** |
| Isolated client/staff site artifacts | Zero staff JS chunks or HTML entrypoints in `dist-client` | `npm run build:staff && npm run build:client && npm run verify:sites` | **PASS** |

---

## 4. Issue #304 Staging Read-Only Correction

1. **TLS Transport Security:** `scripts/audit-issue-304-staging.mjs` previously disabled certificate verification (`rejectUnauthorized: false`). It now strictly requires `ssl: { rejectUnauthorized: true }`.
2. **Honest Inventory Reporting:** The script now checks for:
   - 9 required seats: `staging-{owner, admin, manager, coordinator, warehouse, technician, accounts, driver, client}@babinrentals.test`.
   - Confirmed email status.
   - Redacted references in public documentation.
3. **Revocation Truth:** The count of 239 active sessions is reported as **NOT VERIFIED**. The report explicitly states:
   > *"Active session count alone is NOT proof of revocation. Rejection of stale tokens and invalidation receipts required."*
4. **PostgREST Response Discrimination:** The parser now explicitly differentiates:
   - `PASS`: HTTP 401 or 403 (proper authorization denial).
   - `INCOMPLETE_OR_EMPTY_VIEW`: HTTP 200 with `[]` (indicates accessible endpoint with 0 rows or RLS row-suppression, not HTTP denial).
   - `FAIL`: HTTP 200 with records (unauthorized data exposure).
5. **Deterministic Unit Tests:** 8/8 tests pass in `scripts/audit-issue-304-staging.test.mjs`.

---

## 5. Cloudflare Pages vs Workers Decision Memo (Recommendation: Option A)

As detailed in `docs/verification/CLOUDFLARE_PAGES_PREVIEW_DECISION_MEMO_2026-11-23.md`:
- **Current State:** Cloudflare Pages dual-site artifact separation is merged (PR #338). Automatic deployment is disabled.
- **Root Cause of Legacy Preview Failure:** `npx wrangler preview` is a Workers command expecting a `wrangler.toml` with worker execution bindings (`previews: {}`). Babin Rentals OS hosts static SPA assets on Cloudflare Pages; introducing a dummy `wrangler.toml` creates architectural confusion and violates Clean Code.
- **Recommendation:** **Option A (Pure Pages Architecture).** Use standard Pages commands (`npx wrangler pages dev`) for local preview and official Pages CI integration. Decommission the legacy Workers check after downstream GitHub branch-protection review.
- **Safety Boundary:** No branch-protection checks were removed or altered in this task.

---

## 6. Migration Ledger Reconciled

Forward-only migration claimed and verified:
- Migration `0269_mfa_provider_proof_and_session_safety.sql` claimed in `docs/plans/MIGRATION_LEDGER.md`.
- Status: `verified` (`check:pglite` 267/267 green, `check:lifecycle` 101/101 green).
- Next free migration number in ledger: **`0270`**.
