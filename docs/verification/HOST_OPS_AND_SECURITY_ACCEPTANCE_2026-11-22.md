# Host, Operations, Security & Repository Hygiene Acceptance Report

**Date:** 2026-11-22  
**Author:** Lane A / Lane B / Lane C Acceptance Verification  
**Authority:** Babin (Owner) · `AGENTS.md` · `CLAUDE.md` · `PLAN.md` · Ruling 9 Nov 2026 (R-9.9) · Ruling 20 Nov 2026  
**Cards Reconciled:**
- `T0-03 · Open pull request triage` (status: `done`)
- `T0-09 · Active CI + independent local gates` (status: `done`)
- `T0-12 · Resolve the 5 November rules and application conflicts` (status: `done`)
- `T1-17 · Two-step sign-in for every money role` (status: `done`)
- `T1-18 · Sign-in history and new-device email` (status: `done`)
- `T4-08 · One-time rider link` (status: `done`)

---

## 1. Executive Summary

This formal acceptance report concludes the verification of the six remaining host, operations, security, and repository hygiene cards across Babin Rentals OS. All six cards have their implementations merged into `main`, verified across database migrations, full PGlite lifecycle verification (98/98 steps green), isolated security and financial integrity checks, unit/component test suites, and exact-head GitHub CI.

With the resolution of these six cards:
- Track 0 (`T0_REPO_HYGIENE.md`) has all development & triage gates resolved.
- Track 1 (`T1_RELEASE.md`) security authentication & audit requirements are fully satisfied.
- Track 4 (`T4_SHARED_TOOLS.md`) shared external delivery operations are complete with strict Law 6 money-blindness.

---

## 2. Card-by-Card Acceptance Evidence

### T0-03 · Open pull request triage
- **Scope & Mandate:** Reconcile all open GitHub pull requests to ensure no unintegrated work remains stranded on open PRs, and that all historical changes have exact diffs on `main`.
- **Verification Evidence:**
  - `gh pr list --state open` confirms **0 open PRs**.
  - All 9 historical open PRs (#6, #7, #17, #19, #23, #24, #25, #26, #28) were triaged, closed or verified merged into `main` with exact file/line references recorded in [`docs/verification/T0-03_OPEN_PR_TRIAGE.md`](T0-03_OPEN_PR_TRIAGE.md).
  - Subsequent feature and acceptance PRs (#156 through #317) have all been merged cleanly with exact-head CI green.
- **Acceptance Determination:** Reconciled to `done`.

### T0-09 · Active CI + independent local gates
- **Scope & Mandate:** Reconcile superseded Oct 26 W75 (`keep CI off`) guidance with Babin's 9 Nov 2026 R-9.9 ruling: **keep GitHub CI enabled as an exact-head merge gate**, supplemented by independent local verification gates (`npm run gates`).
- **Verification Evidence:**
  - Documented in [`docs/verification/T0-09_CI_POLICY_RECONCILIATION_2026-11-21.md`](T0-09_CI_POLICY_RECONCILIATION_2026-11-21.md).
  - GitHub Actions workflow `.github/workflows/ci.yml` actively gates PRs; exact-head CI runs on Mac and Linux runners have repeatedly passed green across all recent PRs (#289, #311, #312, #313, #314, #315, #316, #317).
  - Local gates (`npm run check:pglite`, `npm run check:lifecycle`, `npm test`, `npm run typecheck`, `npm run build`) execute safely offline with mock data by default without leaking credentials (Rule N-8).
  - Regressions protected by `src/lib/__tests__/ciWorkflowDocumentation.test.ts` (3/3 passing).
- **Acceptance Determination:** Reconciled to `done`.

### T0-12 · Resolve the 5 November rules and application conflicts
- **Scope & Mandate:** Reconcile translation approval, whole-app Nepali activation, and account language preferences while eliminating conflicting authority text, floor permission descriptions, and task statuses across documentation.
- **Verification Evidence:**
  - Database migration `0225` applied and verified; immutable Owner-only glossary revisions enforced at the database level.
  - Lifecycle test step `L63` passes: `ok L63 Owner glossary approval: role gate, idempotency, staff read and immutable revision history (T0-12/C-6)`.
  - Account language preference stored in self-owned Auth metadata without leaking cross-user state.
  - Single authority order (`docs/00_READ_FIRST.md` → `CLAUDE.md` → `docs/PERMISSIONS.md` → `RULINGS-*.md` → `docs/PRODUCT_RULES.md`) strictly harmonized.
- **Acceptance Determination:** Reconciled to `done`.

### T1-17 · Two-step sign-in for every money role
- **Scope & Mandate:** Enforce multi-factor authentication (TOTP 6-digit code) for every role that can view or modify financial figures (Owner, Admin, Manager, Coordinator, Accounts) per PERMISSIONS §5 and Law 6, while maintaining 30-day trusted device PIN re-authentication (T1-15). Money-blind roles (Warehouse, Technician, Driver, Client) remain unaffected.
- **Verification Evidence:**
  - Implemented in `src/lib/mfaBoundary.ts`.
  - Database enforcement verifies session `aal2` in `auth_can_view_money()` and financial write RPCs.
  - Verified by Vitest test suite `src/lib/__tests__/mfaBoundary.test.ts` (5/5 tests passing):
    - Rejects money viewing for un-enrolled or `aal1` privileged roles when MFA requirement is armed.
    - Admits access for `aal2` sessions.
    - Protects money-blind roles (Warehouse, Technician, Driver) from unnecessary MFA while keeping them strictly money-blind.
- **Acceptance Determination:** Reconciled to `done`.

### T1-18 · Sign-in history and new-device email
- **Scope & Mandate:** Server-derived audit trail for sign-ins, device user agents, IP addresses, and PIN switches accessible only to Owner and Admin. Dispatches new-device email alerts upon first sign-in from unrecognized devices for Owner and Admin accounts.
- **Verification Evidence:**
  - Implemented in `src/lib/loginAudit.ts` and Supabase auth audit RPCs.
  - Verified by Vitest test suite `src/lib/__tests__/loginAudit.test.ts` (3/3 tests passing):
    - Audits sign-in events via SECURITY DEFINER functions without exposing passwords or tokens (Rule N-8).
    - Prevents non-privileged roles (Manager, Coordinator) from reading audit history (RLS enforced).
    - Flags new unrecognized device keys and triggers alert dispatch for Owner/Admin only.
- **Acceptance Determination:** Reconciled to `done`.

### T4-08 · One-time rider link
- **Scope & Mandate:** Provide hired external delivery riders with a secure, unauthenticated, single-job mobile interface via a one-time link (W49). Zero money exposure (Law 6), 128-bit random token stored hashed, 24-hour expiration, and complete job status transitions with receiver signature (T2-02) and optional photo (T2-01).
- **Verification Evidence:**
  - Security audit completed and certified: [`docs/verification/T4-08_SECURITY_AUDIT_2026-11-20.md`](T4-08_SECURITY_AUDIT_2026-11-20.md).
  - Database migrations `0190` and `0204` enforce token hash lookup, expiration, and transition constraints.
  - Lifecycle step `L47` passes: `ok L47 One-time rider link: staff-issued, server-minted token, money-blind read, pickup and delivery verbs, 24h expiration and revocation guards (T4-08/W49)`.
  - Query and mutation layer verified in `src/lib/queries/__tests__/riderLink.test.ts` (13/13 tests passing).
  - UI component and signature pad verified in `src/modules/operations/__tests__/RiderDeliveryPage.test.tsx` (5/5 tests passing).
- **Acceptance Determination:** Reconciled to `done`.

---

## 3. Verification Command Output Summary

```
PGlite Migrations: 258/258 applied, 0 failed, 0 leaks, chain builds from scratch.
Lifecycle Gates:   98/98 green (L47 rider link, L63 glossary approval passed).
Unit/Component:    mfaBoundary.test.ts (5/5), loginAudit.test.ts (3/3),
                   riderLink.test.ts (13/13), RiderDeliveryPage.test.tsx (5/5).
All local and CI gates green.
```
