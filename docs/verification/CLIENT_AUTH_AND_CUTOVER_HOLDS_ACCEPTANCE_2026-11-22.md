# Client Authentication, Away Mode & Cutover Calendar Holds Acceptance Verification Report — 22 November 2026

**Date:** 22 November 2026  
**Auditor / Lane:** Lane C  
**Main Base SHA:** `4b9ab93d37d50eaf9a2cf47c1b077d12d8718ccc` (`origin/main`)  
**Scope:** T7-01, T7-03, T7-14, T9-02  
**Status:** ACCEPTED & PROMOTED TO `done`

---

## 1. Executive Summary

Following merged pull requests #200, #202, #276, and #301, the implementation of database migrations `0206` and `0257`, and the successful verification of database lifecycle step `L95` and automated test suites, four essential online booking, authentication, and cutover synchronization cards are formally accepted and promoted to **`done`**.

Each card satisfies all canonical acceptance criteria grounded in PostgreSQL RLS policies, D-5 tenant isolation invariants, fail-closed access controls, and unit/integration test suites.

---

## 2. Card Acceptance Breakdown

### 2.1 T7-01 · Online booking spec
- **Merged PR:** #301 (draft and security reconciliation merged on `main`)
- **Status:** `done — PR #301 merged; owner defaults UL-01 to UL-09 and security contracts reconciled and verified in docs/ONLINE_BOOKING_SPEC.md [docs/verification/CLIENT_AUTH_AND_CUTOVER_HOLDS_ACCEPTANCE_2026-11-22.md]`
- **Implementation:** `docs/ONLINE_BOOKING_SPEC.md`, `docs/plans/T7_ONLINE_BOOKING.md`.
- **Verification Evidence:**
  - Owner decisions `UL-01` through `UL-09` explicitly codified (guest checkout, quote issuance, exact time pickup/return, binding rules, ID document uploads).
  - Cross-client security contracts and N-7 gate prerequisites defined and verified against database schemas.

### 2.2 T7-03 · Client accounts by verified email
- **Merged PR:** #276 (merged 21 Nov 2026), migration `0257_client_accounts_and_kyc_storage.sql`
- **Status:** `done — PR #276 merged; passwordless email OTP sign-in, KYC storage, and strict D-5 tenant isolation verified across migration 0257, lifecycle L95, and clientAuth.test.ts [docs/verification/CLIENT_AUTH_AND_CUTOVER_HOLDS_ACCEPTANCE_2026-11-22.md]`
- **Implementation:** `src/booking/auth/`, `src/booking/lib/clientAuthApi.ts`, migration `0257`.
- **Verification Evidence:**
  - Automated tests: `src/booking/__tests__/clientAuth.test.ts` (6/6 passed).
  - Database Lifecycle: Step `L95` passed green (`client accounts, KYC upload, and D-5 tenant isolation (T7-03) — anon denied, self-registration, D-5 isolation, warehouse Law 6 masked, binding audited`).
  - D-5 Tenant Isolation: Client accounts access only their own requests, bookings, invoices, and payments. Attempts to query or mutate another client's records return 0 rows.
  - KYC Storage: Private ID documents upload to secure `documents` bucket under client-scoped paths, accessible only by the owning client and staff with clearance.

### 2.3 T7-14 · "Away" switch for online booking
- **Merged PR:** #200 (merged 18 Nov 2026)
- **Status:** `done — PR #200 merged; away mode toggle, customizable public message, and server-side request rejection verified in awayMode.test.ts [docs/verification/CLIENT_AUTH_AND_CUTOVER_HOLDS_ACCEPTANCE_2026-11-22.md]`
- **Implementation:** `src/lib/awayMode.ts`, `src/booking/components/AwayNotice.tsx`.
- **Verification Evidence:**
  - Automated tests: `src/lib/__tests__/awayMode.test.ts` (5/5 passed).
  - Behavior: When the Away switch is turned on (Owner/Admin/Manager), the public catalogue remains browseable with daily rates, but new booking request submissions are refused with the configured return date or contact notice.

### 2.4 T9-02 · Booqable rentals block the OS calendar
- **Merged PR:** #202 (merged 18 Nov 2026), migration `0206_external_holds.sql`
- **Status:** `done — PR #202 merged; migration 0206, Booqable calendar synchronization, and double-booking prevention verified in externalHolds.test.ts [docs/verification/CLIENT_AUTH_AND_CUTOVER_HOLDS_ACCEPTANCE_2026-11-22.md]`
- **Implementation:** `src/lib/externalHolds.ts`, migration `0206`.
- **Verification Evidence:**
  - Automated tests: `src/lib/__tests__/externalHolds.test.ts` (5/5 passed).
  - Invariants: Pre-cutover bookings from the active Booqable system synchronize into `external_holds`, blocking inventory availability in Babin Rentals OS and eliminating double-booking risk during the transition.

---

## 3. Automated Verification Summary

| Gate | Target / Suite | Result |
|---|---|---|
| Lifecycle L95 | Client accounts, KYC upload & D-5 isolation | **PASS** |
| Unit Tests | `clientAuth.test.ts` (6 tests) | **PASS** |
| Unit Tests | `awayMode.test.ts` (5 tests) | **PASS** |
| Unit Tests | `externalHolds.test.ts` (5 tests) | **PASS** |
| PGlite Engine | `check:pglite` (258 migrations) | **PASS (0 failed)** |
| Lifecycle Suite | `check:lifecycle` (98 steps) | **PASS (98/98 green)** |
| TypeScript | `npm run typecheck` | **PASS (0 errors)** |
