# T8 Acceptance Reconciliation — 20 November 2026

## Overview
Reconciles card statuses in `docs/plans/T8_MEMBERSHIP_CREW.md` for four cards in Track T8:
1. **T8-02 · Plans admin screen**
2. **T8-04 · Renew a lapsed membership**
3. **T8-07 · Timesheet by the day**
4. **T8-09 · Staff renting gear**

This reconciliation is grounded in:
1. **Full Implementation Merged:** PR #174 (T8-02 & T8-04), PR #175 (T8-07), and PR #177 (T8-09) are merged into `main`.
2. **All Automated Gates & Unit Suites Passing:** 
   - 20/20 tests pass for T8-02 (`PlansAdmin.test.tsx` 5/5, `ClientDetail.membership.test.tsx` 15/15, and Lifecycle step L51).
   - 6/6 tests pass for T8-04 (`membership.test.ts` and Lifecycle step L53).
   - 25/25 tests pass for T8-07 (`timesheet.test.ts`).
   - 28/28 tests pass for T8-09 (`pricingPipeline.test.ts` 22/22, `RentalPricingSection.test.tsx` 6/6).
3. **Role & Permission Isolation (Law 6 & Law 10):**
   - Floor and non-finance roles are strictly money-blind in DOM and payloads.
   - Staff discounts operate ungated without approval gates per Law 10.

---

## Detailed Card Breakdown

### 1. T8-02 · Plans admin screen
- **Merged PR:** #174
- **Status:** `done (PR #174 merged; plans management, Coordinator read-only gate, Law 6 masking and lifecycle L51 verified)`
- **Implementation:** `src/modules/clients/PlansAdmin.tsx`, `src/actions/clients/retireMembershipPlan.ts`, `src/actions/clients/saveMembershipPlan.ts`.
- **Verification Evidence:**
  - `PlansAdmin.test.tsx` (5/5 passed):
    - Renders plans list with active and retired counts for Manager.
    - Displays read-only view for Coordinator without create or edit buttons.
    - Enforces Law 6 money-blindness for floor role (Warehouse).
    - Filters by status when clicking Retired pill.
    - Filters by search input matching level or label.
  - `ClientDetail.membership.test.tsx` (15/15 passed):
    - Role action availability verified (Owner, Admin, Manager, Coordinator).
    - Accounts, Warehouse, Technician, Driver denied plan mutation actions.
  - Lifecycle step L51 passed.

### 2. T8-04 · Renew a lapsed membership
- **Merged PR:** #174
- **Status:** `done (PR #174 merged; renewal term start, plan fee charge, term history and lifecycle L53 verified)`
- **Implementation:** `src/actions/clients/saveMembershipPlan.ts`, `src/lib/queries/membership.ts`.
- **Verification Evidence:**
  - `membership.test.ts` (6/6 passed):
    - Starts a new term from the renewal date.
    - Charges expected fee.
    - Preserves previous expired terms in history.
    - Coordinator and above authorized.
  - Lifecycle step L53 passed.

### 3. T8-07 · Timesheet by the day
- **Merged PR:** #175
- **Status:** `done (PR #175 merged; day-based timesheet rate calculation and money masking verified)`
- **Implementation:** `src/lib/queries/timesheet.ts`, `src/modules/crew/TimesheetTab.tsx`.
- **Verification Evidence:**
  - `timesheet.test.ts` (25/25 passed):
    - Replaces hourly estimate (`STANDARD_DAY_HOURS = 8`) with `days × day_rate + overtime_days`.
    - Hours remain display-only metadata.
    - Money fields masked for non-finance roles (Warehouse, Technician, Driver).
    - Totals agree with Crew Assist payout amounts.

### 4. T8-09 · Staff renting gear
- **Merged PR:** #177
- **Status:** `done (PR #177 merged; automatic 20% discount, Law 10 ungated toggle and audit verified)`
- **Implementation:** `src/lib/pricingPipeline.ts`, `src/modules/rentals/booking/RentalPricingSection.tsx`.
- **Verification Evidence:**
  - `pricingPipeline.test.ts` (22/22 passed):
    - Automatic 20% staff discount applied when booking client is linked to staff.
    - Staff discount lines isolated from non-staff bookings.
  - `RentalPricingSection.test.tsx` (6/6 passed):
    - Renders staff discount banner and toggles removal without approval gate (Law 10 / W68).
    - Displays removed note when discount is removed and allows re-applying.
