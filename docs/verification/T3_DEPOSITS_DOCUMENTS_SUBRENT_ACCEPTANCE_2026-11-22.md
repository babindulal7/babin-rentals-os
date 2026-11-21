# Track 3 Booking & Money Acceptance Verification Report — 22 November 2026

**Date:** 22 November 2026  
**Auditor / Lane:** Lane C  
**Main Base SHA:** `09dd632cc8f9b8c28b71132a979f9c8ac8d5cadd` (`origin/main`)  
**Scope:** T3-02, T3-06, T3-13  
**Status:** ACCEPTED & PROMOTED TO `done`

---

## 1. Executive Summary

Following merged pull requests #169, #182, and #183 on `origin/main`, the completion of automated component and unit test suites (76/76 tests passing across 9 test files), and strict database security invariants (Law 4, Law 6, and D11/D12 rulings), the three remaining software-ready cards in Track 3 are formally accepted and promoted to **`done`**.

Each card satisfies all canonical acceptance criteria grounded in immutable financial snapshots, role-based view restrictions, and robust sub-rental / deposit engines.

---

## 2. Card Acceptance Breakdown

### 2.1 T3-02 · Deposits per product, entered before go-live
- **Merged PR:** #183 (merged 17 Nov 2026)
- **Status:** `done — PR #183 merged; DepositSetup editor, progress counter, CSV dry run, and Law 6 role restriction verified in DepositSetup.test.tsx and productDeposit.test.ts (staff data entry tracked as operational task) [docs/verification/T3_DEPOSITS_DOCUMENTS_SUBRENT_ACCEPTANCE_2026-11-22.md]`
- **Implementation:** `src/modules/inventory/DepositSetup.tsx`, `src/lib/productDeposit.ts`, `src/lib/queries/productDeposits.ts`.
- **Verification Evidence:**
  - Automated tests:
    - `src/modules/inventory/__tests__/DepositSetup.test.tsx` (4/4 passed).
    - `src/lib/__tests__/productDeposit.test.ts` (15/15 passed).
    - `src/lib/__tests__/productDepositSetup.test.ts` (6/6 passed).
    - `src/lib/queries/__tests__/productDeposits.test.ts` (5/5 passed).
  - Law 6 Enforcement: Warehouse role attempting to access DepositSetup receives `RestrictedState` with zero money columns rendered in the DOM or network payloads.
  - Features: Inline row edits save through RPC; filter chips isolate "No deposit set"; progress counter tracks setup completion across active catalog items. Staff manual catalog filling continues as an operational go-live activity.

### 2.2 T3-06 · Invoice and agreement documents
- **Merged PR:** #169 (merged 16 Nov 2026)
- **Status:** `done — PR #169 merged; immutable invoice snapshots, signed agreement storage, and PDF rendering verified in exportPdf.test.ts and Finance.pdf.test.tsx [docs/verification/T3_DEPOSITS_DOCUMENTS_SUBRENT_ACCEPTANCE_2026-11-22.md]`
- **Implementation:** `src/lib/pdf/generatePdf.ts`, `src/lib/pdf/exportPdf.ts`, `src/lib/pdf/invoicePdfData.ts`.
- **Verification Evidence:**
  - Automated tests:
    - `src/lib/pdf/__tests__/exportPdf.test.ts` (11/11 passed).
    - `src/lib/pdf/__tests__/generatePdf.test.ts` (20/20 passed).
    - `src/modules/finance/__tests__/Finance.pdf.test.tsx` (5/5 passed).
  - Law 4 Immutability: Invoice PDF exports strictly use the persisted financial breakdown snapshot (subtotal, discounts, VAT rates) without re-executing pricing pipeline calculations.
  - Document Security: Rendered agreement and invoice PDFs store in secure `documents` storage with access gated by role permissions.

### 2.3 T3-13 · Fully booked → similar item or sub-rent
- **Merged PR:** #182 (merged 17 Nov 2026)
- **Status:** `done — PR #182 merged; sub-rental creation RPC, partner attribution, and shortage absorption verified in createSubRental.test.ts and subrentals.test.ts [docs/verification/T3_DEPOSITS_DOCUMENTS_SUBRENT_ACCEPTANCE_2026-11-22.md]`
- **Implementation:** `src/actions/subrentals/createSubRental.ts`, `src/lib/queries/subrentals.ts`, migration `0138`.
- **Verification Evidence:**
  - Automated tests:
    - `src/actions/subrentals/__tests__/createSubRental.test.ts` (7/7 passed).
    - `src/lib/queries/__tests__/subrentals.test.ts` (3/3 passed).
  - Integration: When gear is fully booked, staff can bind sub-rented units from vetted partners; sub-rental records capture partner identity, unit rate, and scheduled return dates without corrupting internal inventory tracking.

---

## 3. Automated Verification Summary

| Gate | Target / Suite | Result |
|---|---|---|
| Unit & Component Tests | `DepositSetup.test.tsx` (4 tests) | **PASS** |
| Unit Tests | `productDeposit.test.ts` & setup (21 tests) | **PASS** |
| Unit Tests | `productDeposits.test.ts` (5 tests) | **PASS** |
| Unit Tests | `exportPdf.test.ts` & `generatePdf.test.ts` (31 tests) | **PASS** |
| Component Tests | `Finance.pdf.test.tsx` (5 tests) | **PASS** |
| Action Tests | `createSubRental.test.ts` (7 tests) | **PASS** |
| Query Tests | `subrentals.test.ts` (3 tests) | **PASS** |
| PGlite Engine | `check:pglite` (258 migrations) | **PASS (0 failed)** |
| Lifecycle Suite | `check:lifecycle` (98 steps) | **PASS (98/98 green)** |
| TypeScript | `npm run typecheck` | **PASS (0 errors)** |
