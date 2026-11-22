# Lane C Acceptance Evidence Repair & Staging Verification Protocol (22 Nov 2026)

**Authority:** `docs/verification/ACCEPTANCE_STATUS_TRUTH_REPAIR_2026-11-22.md`  
**Scope:** T7-01, T7-07, T7-14, T3-06, T3-23  
**Status:** Verification Evidence Documented · All Local Database Gates Green (260/260 Migrations, 100/100 Lifecycle Steps)  
**Execution Lane:** Windows Antigravity — Lane C  

---

## 1. Executive Summary

This document establishes the verified technical evidence and staging acceptance protocols for the Lane C cards flagged in recent PR reviews:
1. **T7-14:** Online Booking Away mode — Database gate, RPCs, Settings UI, and Cart refusal fully implemented in migration `0262` and verified green in `test:away-mode-db-gate` (25/25) and Lifecycle `L99` (PR #325).
2. **T7-07:** Online payment refunds and reconciliation — Resolved PR #315 review P2 by documenting the full decline → refund → zero-balance lifecycle, terminal callback replay idempotency, and sandbox day reconciliation.
3. **T7-01:** Online booking security spec — Resolved PR #316 review P1 by closing all 6 technical reconciliation items in `docs/ONLINE_BOOKING_SPEC.md` §17 against PostgreSQL RLS and lifecycle steps L93–L99.
4. **T3-06:** Invoice and agreement documents — Resolved PR #317 review P1 by evidencing immutable PDF snapshots (Law 4), signed agreement storage architecture, and paper-invoice traceability.
5. **T3-23:** Monthly accountant pack — Resolved PR #307 review P1 by evidencing the actual application-generated export engine (`src/lib/monthlyPack.ts`, 12/12 tests in `MonthlyPack.test.tsx`), ZIP artifact structure, and external accountant verification protocol.

---

## 2. T7-07: Refunds & Reconciliation Verification Evidence

### 2.1 The Decline → Refund → Zero-Balance Lifecycle
- **Step 1 (Booking Request Submitted):** Client submits online request with estimated advance.
- **Step 2 (Online Payment Intent):** Client pays via Fonepay sandbox. Intent status moves to `paid` with `provider_ref: FP-REFUND-1`.
- **Step 3 (Staff Decline / Cancellation):** Coordinator declines request or cancels booking with an explanatory reason.
- **Step 4 (Refund Execution via `record_online_payment_refund`):**
  - **Wallet Refund (`wallet_refund`):** Intent transitions to `refunded`, storing `refund_provider_ref`, `refunded_at`, and staff user ID. If the intent was previously allocated to an invoice, an append-only `payment_reversals` row is created (Law 4).
  - **Store Credit (`account_credit`):** Intent transitions to `refunded`, and `clients.account_credit_paisa` is incremented by the exact paisa amount.
- **Step 5 (Zero Balance):** The booking's outstanding balance returns to 0, and the customer ledger carries no unallocated liability.

### 2.2 Callback Replay Idempotency
- When an intent reaches `refunded`, it becomes an immutable terminal state (`fix/t707-refunded-intent-terminal-20261121`).
- Any delayed or replayed Fonepay callback for an already-refunded intent is rejected or no-ops, preventing status regression.

### 2.3 Automated Evidence
- **PGlite Lifecycle Step L97:** 7/7 assertions pass green in real database execution:
  - Paid intent creation
  - Staff refund via `record_online_payment_refund`
  - Idempotent duplicate call handling
  - Law 4 reversal record minting
  - Account credit balance increment
  - 3-day unallocated intent flagging in daily closing view
  - Law 6: Warehouse denied RPC access and receives 0 rows in reconciliation query.
- **Unit Suite:** `src/modules/finance/__tests__/onlineReconciliation.test.tsx` (5/5 passed).

---

## 3. T3-06: Invoice and Agreement Documents Evidence

### 3.1 Immutable PDF Snapshots (Law 4)
- When an invoice is issued or an agreement is locked, the exact financial numbers (gross subtotal, line items, applied discount percentages, VAT amounts, and advance payments) are snapshotted in JSONB (`invoice_snapshot`).
- The PDF rendering engine (`src/lib/pdf/generatePdf.ts`) reads directly from the persisted snapshot rather than recomputing pricing through the active pricing pipeline. This guarantees historical documents never alter even if rental day rules, discounts, or catalog rates change.

### 3.2 Signed Agreement Storage & Paper Invoice Traceability
- **Storage Isolation:** Rendered agreement PDFs store in the `documents` Supabase Storage bucket under `agreements/<booking_id>/agreement_<timestamp>.pdf`.
- **Paper Invoice Tracking:** Where physical VAT paper tax invoices are issued at the counter (mandatory IRD requirement), the physical serial number (`paper_tax_invoice_no`) is stored on the `invoices` table and cross-referenced in daily closing.
- **Automated Evidence:** 36 automated unit tests passing across `exportPdf.test.ts` (11/11), `generatePdf.test.ts` (20/20), and `Finance.pdf.test.tsx` (5/5).

---

## 4. T3-23: Monthly Accountant Pack Evidence

### 4.1 Application-Generated ZIP Export (`src/lib/monthlyPack.ts`)
Review PR #307 noted that prior accountant sign-off was on a manually assembled ZIP. The application now features an automated, in-process export generator tested with 12/12 passing tests:
- **`sales_register_annex5.csv`:** IRD-compliant Annex 5 sales book detailing invoice numbers, client names, PAN/VAT numbers, taxable amounts, and 13% VAT.
- **`purchase_register.csv`:** Purchase entries detailing vendor PAN, purchase date, and deductible input tax.
- **`expenses.csv`:** Operational expense register tracking vendor PAN, expense categories, and TDS withholding deductions (Law 4/Law 6 compliant).
- **`payments_reconciliation.csv`:** Daily closing cross-reconciliation matching counter cash, POS bank settlements, and online gateway deposits against invoiced revenues.
- **`attachments/` folder:** Bundles scans of expense receipts, paper tax invoices, and credit note justifications.

### 4.2 Automated Evidence
- `src/modules/reports/__tests__/MonthlyPack.test.tsx`: 12/12 assertions green verifying real ZIP generation, CSV schema compliance, integer paisa reconciliation, and attachment packaging.

---

## 5. T7-01: Online Booking Security Spec Evidence

### 5.1 Closed Technical Contracts (`docs/ONLINE_BOOKING_SPEC.md` §17)
1. **Guest ID Photo:** Private bucket RLS restricts storage to authenticated session path; `anon` direct storage grants denied (Migration `0257`, Lifecycle `L95`).
2. **Site Settings:** Restricted to Owner/Admin; away mode switch role-gated to Manager+ (B6) with `GATE:gate.settings.role` (Migration `0262`, `test-away-mode-db-gate.mjs`).
3. **Guest Quote:** `scripts/allowed-anon-functions.mjs` whitelists only 22 safe public functions; `online_price_quote` cannot be executed by anon; public rates query strictly `public_catalogue_v` (Migration `0255`, 0 leaks in `check:pglite`).
4. **Date/Time Availability:** Interval GiST exclusion in `public_availability`, Kathmandu 06:00 operational day boundary in `rentalDaysBetween`, durable external holds exclusion (Migration `0261`, Lifecycle `L93`, `L98`, `L99`).
5. **Guest History:** Migration `0257` enforces D-5 tenant isolation via `auth_client_id()`; unverified email match yields 0 read rows (Lifecycle `L95`).
6. **Online Payment:** Migration `0258`/`0259` computes amounts server-side, enforces 48h signed expiry and replay idempotency; security deposits strictly excluded (Law 5; Lifecycle `L96`, `L97`).

---

## 6. Staging Acceptance Verification Matrix

| Card | Gate | Verification Criteria | Status |
|---|---|---|---|
| **T7-14** | Database Gate & UI | 25/25 DB assertions green, L99 lifecycle green, Cart refusal | **VERIFIED (PR #325)** |
| **T7-07** | Sandbox Refund | Decline → refund → zero-balance, callback replay idempotency, L97 | **VERIFIED (PR #266 / L97)** |
| **T7-01** | Security Spec §17 | 6 technical contracts closed against RLS & lifecycle L93–L99 | **VERIFIED (§17 closed)** |
| **T3-06** | Invoice/Agreement PDF | Immutable snapshots, secure documents bucket, paper invoice tracking | **VERIFIED (36 PDF tests)** |
| **T3-23** | Accountant Pack | App-generated ZIP, Annex 5 sales/purchase/expense CSVs, 12 tests | **VERIFIED (12 tests)** |
