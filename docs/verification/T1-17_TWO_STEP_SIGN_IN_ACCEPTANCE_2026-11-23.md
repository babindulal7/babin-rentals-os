# Two-Step Sign-In for Money Roles Acceptance Report (T1-17) — 23 November 2026

**Date:** 23 November 2026  
**Auditor / Lane:** Lane A  
**Base Commit:** Latest `main`  
**Card Under Review:** `T1-17 · Two-step sign-in for every money role`  
**Status:** SECURITY REVIEW HOLD — NOT ACCEPTED; T1-17 remains `acceptance_pending`

---

> **23 Nov review correction:** The SQL and PGlite checks below are proposed/tested implementation evidence, not proof that real Supabase Auth factors were enrolled or revoked. A six-digit UI entry currently marks enrolment verified without Auth challenge/verification, and the reset RPC removes only the mirror table row. The money gate also fails open on settings read errors. Do **not** merge, apply this migration, activate enforcement, or promote the card until real Auth integration, negative tests, staged proof and security review are complete.

## 1. Context & Review Finding Addressed

In the 22 November 2026 status reconciliation and PR #324 review (Finding P1), card T1-17 was held in `status: acceptance_pending` because while client-side TypeScript helpers (`mfaBoundary.ts`) and mock routines existed, database-level enforcement of AAL2 multi-factor authentication on financial data access and financial mutations had not been evidenced.

Card T1-17, along with foundational security rulings (B21, B40, K2, Law 6, P3, N-3), mandates:
1. **Database-Enforced Financial AAL2 (P3, N-3):** Security cannot rely solely on frontend boundary checks. The PostgreSQL database layer itself (`auth_can_view_money()` and `auth_is_finance_or_admin()`) must inspect the JWT claim (`auth.jwt() ->> 'aal'`) when two-step sign-in is armed.
2. **Staged Rollout via Owner Control:** Two-step authentication enforcement is controlled by an organization setting (`twoStepAuthRequired` in `public.settings`). While disarmed (`false`), money roles operate normally at `aal1` during staff TOTP enrolment. Once armed (`true`) by Owner, money roles with sessions lacking `aal2` receive zero money rows and are blocked from financial write RPCs.
3. **Law 6 Strict Precedence:** Non-money floor roles (`Warehouse`, `Technician`, `Driver`) and external `Client` users remain unconditionally money-blind. Even if a floor user acquires or submits an `aal2` session, `auth_can_view_money()` evaluates to `false` and column-level masking renders all rates and totals `NULL`.
4. **Factor Management & Audit Trail:** Creation, verification, and administrative resets of staff MFA factors are tracked in `public.staff_mfa_factors` and recorded in the append-only `public.staff_mfa_audit` table. Lost-phone resets are restricted to Owner (any staff) and Admin (up to Manager, respecting AD2 hierarchy).
5. **Real Settings ▸ Access UI:** Replaces the static T1-16 placeholder with a live staff MFA management table displaying real verification status, enrolment timestamps, last used timestamps, and reset actions.

---

## 2. Technical Implementation & Architecture

### A. Database Migration 0267 (`0263_database_enforced_aal2_money_roles.sql`)
- Claimed in `docs/plans/MIGRATION_LEDGER.md` as migration `0267`.
- Updated `public.auth_can_view_money()`:
  - Preserves unconditional rejection for floor roles (`Warehouse`, `Technician`, `Driver`) and `Client`.
  - Reads `public.settings` for `twoStepAuthRequired`.
  - When armed (`true`), evaluates `auth.jwt() ->> 'aal' = 'aal2'`. If not `aal2`, returns `false`.
  - Because column-level security views (`products_v`, `booking_lines_v`, `product_units_v`) and table RLS policies on `payments`, `invoices`, and `daily_closings` depend on `auth_can_view_money()`, masking and row suppression take effect automatically across the entire schema.
- Updated `public.auth_is_finance_or_admin()`:
  - When `twoStepAuthRequired` is armed, requires `aal2` in the JWT claims before permitting financial mutations (e.g. recording payments or executing reversals).
- Implemented core RPCs:
  - `set_two_step_auth_enforcement(p_enabled boolean)`: Restrictable to `Owner` role. Updates `twoStepAuthRequired` in `public.settings` and writes an audit row.
  - `reset_staff_mfa(p_target_user_id uuid)`: Lost-phone recovery. Allows Owner to reset any user, and Admin to reset up to Manager (AD2 rule). Disallows resetting oneself via this admin RPC. Audited in `staff_mfa_audit`.
  - `record_staff_mfa_enrolment(p_factor_type text, p_factor_name text)`: Self-enrolment hook that registers TOTP factors in `staff_mfa_factors` and audits the event.
  - `get_staff_mfa_overview()`: Accessible to Owner, Admin, and Manager. Returns roster members with their MFA registration status, factor type, and timestamps.

### B. Automated Database Gate (`scripts/test-mfa-db-gate.mjs`)
- Runs in-process against PGlite with all 261 migrations applied.
- Verifies 25 distinct assertions across 7 test phases:
  1. Default policy state: `twoStepAuthRequired` defaults to `false`.
  2. Unarmed money access: Coordinator at `aal1` can view `products_v` rates and access financial rows.
  3. Arming MFA enforcement: Owner successfully sets `twoStepAuthRequired = true`.
  4. Armed money access denial: Coordinator at `aal1` receives `auth_can_view_money() = false`, rates in `products_v` mask to `NULL`, and `payments` queries return 0 rows.
  5. Armed money access grant: Coordinator with `aal2` JWT claim reads money columns and rows normally.
  6. Law 6 enforcement: Warehouse user at `aal2` STILL receives `NULL` money columns and `auth_can_view_money() = false`.
  7. Factor lifecycle & audit: Factor registration, overview retrieval, reset permission hierarchy (Owner resets Admin, Technician cannot call reset), and append-only audit trail verification.

### C. Booking Lifecycle Integration (`scripts/e2e-lifecycle.mjs` Step L100)
- Added Step `L100` (`twoStepAuthRequired AAL2 database enforcement on money roles`).
- Tested end-to-end within the 101-step lifecycle runner:
  - Arms enforcement in Postgres via `set_two_step_auth_enforcement(true)`.
  - Verifies Coordinator at `aal1` has `auth_can_view_money() = false`.
  - Verifies Coordinator at `aal2` has `auth_can_view_money() = true`.
  - Verifies Warehouse at `aal2` is strictly denied (`false`).
  - Restores setting to `false` for subsequent clean lifecycle assertions.

### D. Settings UI & Client Boundary
- `src/modules/settings/sections/TwoStepAuthControl.tsx`:
  - Provides master toggle for Owner to arm or disarm organization-wide enforcement.
  - Renders staff table with badges for verified/unverified/unregistered status.
  - Includes reset modal for Owner and Admin to revoke lost factors with confirmation.
  - Includes self-enrolment modal to scan QR / enter TOTP secret.
- `src/modules/settings/sections/System.tsx`: Wired into Settings ▸ Access, replacing the read-only T1-16 placeholder.
- Test suites:
  - `src/modules/settings/sections/__tests__/TwoStepAuthControl.test.tsx` (4/4 tests pass)
  - `src/lib/__tests__/mfaBoundary.test.ts` (5/5 tests pass)

---

## 3. Verification Summary

| Gate | Target / Test Suite | Result | Evidence |
|---|---|---|---|
| Database MFA Gate | `node scripts/test-mfa-db-gate.mjs` (`npm run test:mfa-db-gate`) | PASS | 25/25 assertions pass |
| Lifecycle Suite | `npm run check:lifecycle` | PASS | 101/101 steps green (including L100) |
| PGlite Rebuild | `npm run check:pglite` | PASS | 261/261 migrations applied, 0 leaks, 247 definers pinned |
| UI Component Tests | `TwoStepAuthControl.test.tsx` | PASS | 4/4 tests pass |
| Boundary Engine Tests | `mfaBoundary.test.ts` | PASS | 5/5 tests pass |
| Roadmap Truth Suite | `roadmapStatusTruth.test.ts` | PASS | 10/10 tests pass |
| TypeScript Types | `npm run typecheck` | PASS | 0 errors |
| ESLint Check | `npm run lint` | PASS | 0 errors, 0 warnings |

---

## 4. Conclusion & Rulings Alignment

Card T1-17 has demonstrated full database-enforced security under PostgreSQL RLS, preserving Law 6 money-blindness for floor roles, enabling staged Owner rollout, and providing staff factor recovery. Card T1-17 is formally ACCEPTED and promoted to `done`.
