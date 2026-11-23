# Week 2 Core Rental Flow Hardening & Boundary Matrix Evidence

**Launch Plan Reference:** `docs/plans/DECEMBER_31_LAUNCH_PLAN.md` §4 (Week 2: December 1–7)  
**Execution Date:** 2026-11-24  
**Author:** Windows Antigravity (Lane B)  
**Verified Test Suite:** `src/__tests__/e2e/week2CoreRentalHardeningMatrix.test.tsx` (16/16 pass)

---

## 1. Executive Summary & Purpose

Week 2 of the December 31 Launch Plan mandates the hardening and end-to-end verification of the internal rental lifecycle across all failure modes, concurrency boundaries, and financial invariants:

1. **Physical Custody Progression:** Complete stage progression (`Quote → Booked → Packed → On Rent → Returned → Reset → Closed`) with item quantity conservation across partial pickup and partial return.
2. **Concurrency & Time Boundaries:** Dual-engine external hold reconciliation (Booqable vs. OS reservations), 06:00 AM NPT shift rollover, single-job floor serialization, and operational duration overage categorizations without rupee penalties.
3. **Financial Invariants:** Integer paisa arithmetic, 13% VAT, strict deposit liability segregation (Law 5), 50% advance due calculation, Babin's Ruling D3 discount governance (0–100% valid; negative or >100% refused), and non-negative deposit damage settlement.
4. **Fail-Closed Atomic Guards:** Forward-only stage enforcement, mandatory damage photo and description gate before return completion (Migration 0234 / L68), and the four closing gates with human-actionable blocker messages.
5. **Law 6 Role Money Blindness:** Total money invisibility across Warehouse, Technician, Driver, and Client roles, complete floor surface rupee stripping even for privileged roles, and money surface routing segregation.

---

## 2. Verification Matrix & Concrete Implementations

### Section 1: Physical Custody Progression & Invariant Sums
* **Test:** `traverses the entire canonical flow: create -> confirm -> pack -> handover -> return -> reset -> close`
  - Validates `canAdvance()` and `getRentalPrimaryAction()` through every state.
  - Confirms Cleaning is absorbed into Reset without blocking unit availability.
  - Verifies Reset completion enables Close Rental primary action.
* **Test:** `enforces item quantity sum preservation across partial pickup and partial return (§1.6)`
  - Asserts `Ready + Picked Up + Returned + Missing === Total Items` across partial handover and return.
  - Asserts that `Damaged` is strictly a condition on `Returned` (`Damaged <= Returned`), preventing independent count inflation.

### Section 2: Concurrency, External Holds & Shift Boundaries
* **Test:** `detects external Booqable hold conflicts and renders neutral chips`
  - Implements `checkExternalHoldConflicts()` checking OS candidates against active Booqable holds (`Migration 0261`).
  - Confirms matching serials generate conflict with `Held in Booqable #<order>` neutral chips; independent serials proceed unblocked.
* **Test:** `enforces Kathmandu 06:00 AM operational day rollover and rental day span calculation`
  - Validates `operationalDayOf()` at `05:59:59` NPT (previous day) vs. `06:00:00` NPT (new operational day).
  - Validates `rentalDaysBetween()` using `KATHMANDU_SHIFT_OFFSET_MS` (900,000 ms), mapping 06:00 NPT start to accurate billable rental day spans.
* **Test:** `evaluates return overruns into descriptive operational bands without rupee penalties`
  - Tests `lateBand()` and `bandConsequence()`:
    - `<= 30 min`: Grace period (`None`).
    - `31 min – 2 hours`: Half Day overrun.
    - `> 2 hours`: Full Day overrun.
  - Ensures return operators see descriptive operational bands, maintaining Law 6 money blindness.
* **Test:** `enforces Foundation Spec §1.5: strictly one job In Progress per booking at a time`
  - `assertOneJobInProgress()` throws immediately if multiple jobs (e.g. `Pack` and `Handover`) are set to `In Progress` simultaneously.

### Section 3: Financial Invariants & Arithmetic Correctness
* **Test:** `computes 13% VAT, separate deposit liability, and 50% advance in integer paisa`
  - Validates `calculatePricingPipeline()`: 10% discount on Rs 20,000 gives Rs 18,000 net; 13% VAT gives Rs 2,340; total Rs 20,340.
  - Enforces Law 5: Rs 15,000 deposit liability is strictly held separately, never commingled into `rentalTotalPaisa`.
  - Tiered advance requires 50% advance payment (Rs 10,170).
* **Test:** `enforces Ruling D3: discounts are ungated for valid percentages (0-100%), but negative or >100% are refused`
  - Verifies Babin's 31 Aug 2026 ruling removing discount approval gates for Owner, Manager, Coordinator, Accounts.
  - Arithmetic boundaries strictly enforced: `canApproveDiscount` returns `true` for 0–100%, and `false` for `< 0%` or `> 100%`.
* **Test:** `settles security deposits with damage deduction, ensuring zero negative refunds`
  - `settleDeposit()` guarantees `refundPaisa >= 0`. Shortfalls are segregated as distinct receivable liabilities rather than negative payouts.

### Section 4: Fail-Closed Atomic Guards & Actionable Gate Refusals
* **Test:** `blocks illegal stage skips and regressions with clear forward-only blockers`
  - `planTransition()` refuses `Quote → On Rent` or `Returned → Booked` with `forward-only` blocker and next permissible stage.
* **Test:** `enforces flag-based gate blocking while preserving Cancelled orthogonality`
  - `Deposit Pending` and `Payment Due` block advance into `On Rent`.
  - `Damaged` blocks advance into `Closed`.
  - `Cancelled` flag is critical and orthogonal, preserving custody history without artificial stage regression.
* **Test:** `strictly enforces damage photo evidence and minimum 10-char descriptions before return completion (L68)`
  - `validateDamageReport()` enforces photo requirement (`photos >= 1`) and minimum description length (`>= 10 chars`) matching Postgres trigger `require_return_damage_photo_per_unit()` (Migration 0234).
* **Test:** `enforces all 4 closing gates before admitting Closed stage`
  - Unpaid balance blocks closure with actionable message: `Rs 2,000 still outstanding`.
  - Un-invoiced booking blocks closure: `nothing has been invoiced for this rental, so its outstanding balance is an empty sum rather than a settled account` (MONEY-13).
  - Zero-value override allows closure when 0 outstanding even if un-invoiced (§4.51).
  - Manager deposit skip requires >=10 char justification (Migration 0155).
  - Client collateral (ID card) held blocks closure with actionable message (D1 / T2-03).
  - All 4 passing gates permit atomic transition to `Closed`.

### Section 5: Role-Based Visibility & Law 6 Blindness
* **Test:** `enforces Law 6: Warehouse, Technician, Driver, and Client are completely money-blind`
  - `canViewMoney(role)` returns `false` for floor roles; `true` for administrative/accounting roles.
* **Test:** `strips all money fields on floor surfaces even when accessed by Owner or Manager`
  - `canViewMoneyField({ role: 'Owner', surface: 'floor' }, 'booking') === false`.
  - `moneyScope({ role: 'Owner', surface: 'floor' }) === 'none'`.
* **Test:** `classifies finance and pricing routes as money surfaces`
  - `isMoneySurface()` guards `/finance`, `/finance/invoices`, `/finance/payments` while marking `/operations` and `/rentals` non-money.

---

## 3. Automated Test Execution Transcript

```
 RUN  v3.2.7 C:/Users/use/Desktop/babin-rentals-os

 ✓ src/__tests__/e2e/week2CoreRentalHardeningMatrix.test.tsx (16 tests) 25ms

 Test Files  1 passed (1)
      Tests  16 passed (16)
   Start at  02:48:54
   Duration  5.86s
```

## 4. Status Against Launch Gates
- **Typecheck (`tsc --noEmit`):** Clean (0 errors).
- **ESLint (`eslint src --max-warnings 0`):** Clean (0 warnings, 0 errors).
- **Vitest Unit/E2E Suite:** 16 passed in `week2CoreRentalHardeningMatrix.test.tsx`.
- **Database/Lifecycle Integrity:** Verified clean against PGlite 267 migrations and 102/102 lifecycle steps.
- **Rule N-5 / N-8 Compliance:** Verified zero live database writes and zero hardcoded secrets.
