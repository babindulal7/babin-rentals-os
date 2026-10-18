# P0 Audit: Sales & VAT Report Ledger Integrity

**Date:** 2026-10-18  
**Context:** Babin Rentals OS — Sales & VAT Register (`src/modules/reports/SalesVatReports.tsx` and `src/lib/queries/salesVatReports.ts`)  
**Main SHA at audit:** `ad8ce1e4afc54cc88df841425d0e281bd15665bc`  
**Priority:** P0 — False Financial Reporting Risk  

---

## 1. Baseline Findings & Bug Reproduction

### 1.1 Invented Financial Data on Query Failure or Empty Ledger
- **Location:** `src/lib/queries/salesVatReports.ts:181-185`, `295-297`
- **Observed Behavior:**
  ```ts
  const { data: rows, error } = await query
  if (error || !rows || rows.length === 0) {
    return { sales: MOCK_SALES, vat: MOCK_VAT }
  }
  ...
  catch {
    return { sales: MOCK_SALES, vat: MOCK_VAT }
  }
  ```
- **Financial Risk:** An empty production database, network error, or RLS permission denial causes the system to return `MOCK_SALES` (NPR 5,452,250 total invoiced, 42 invoices) and `MOCK_VAT` (NPR 627,250 output VAT). Staff and auditors are shown fictional sales and tax liabilities.

### 1.2 Schema Column Name Incompatibilities
- **Location:** `src/lib/queries/salesVatReports.ts:167-173`
- **Observed Query:**
  - Requested `tax_amount` (database column is `vat_amount` per migration `0006_finance.sql:93`)
  - Requested `grand_total` (database column is `total_amount` per migration `0006_finance.sql:94`)
  - Requested `clients!client_id(name, pan_number)` (database column is `pan_vat` per migration `0005_clients.sql:47`)
- **Missing Columns:** `taxable_amount`, `vat_rate`, `outstanding_amount`, `currency`, `voided_at`.

### 1.3 Unissued Draft and Voided Invoice Inclusion
- **Location:** `src/lib/queries/salesVatReports.ts:197-240`
- **Observed Behavior:** All returned rows are included regardless of status. Draft invoices (without invoice numbers) and voided invoices (`status = 'Void'` or `voided_at != null`) pollute statutory sales.

### 1.4 PostgREST Silent 1,000-Row Truncation
- **Location:** `src/lib/queries/salesVatReports.ts:155-181`
- **Observed Behavior:** A single `.from('invoices').select(...)` query hits PostgREST's default 1,000-row limit without pagination. Above 1,000 invoices, reports silently understate revenue and tax.

### 1.5 Hardcoded Monthly Schedules and 10-Row Truncation
- **Location:** `src/lib/queries/salesVatReports.ts:276, 278, 290, 291`
- **Observed Behavior:**
  - `monthlyTrend: MOCK_SALES.monthlyTrend` (hardcoded mock array)
  - `monthlySchedule: MOCK_VAT.monthlySchedule` (hardcoded mock array)
  - `invoices: invoices.slice(0, 10)` (artificially truncates real invoice export to 10 rows)

### 1.6 Premature Whole-Rupee Rounding
- **Location:** `src/lib/queries/salesVatReports.ts:266-271`
- **Observed Behavior:** `rupees(Math.round(totalInvoiced / 100))` prematurely divides integer paisa by 100 and rounds, losing paisa precision required by Foundation §2.3.

---

## 2. Test Suite Reproduction Record

Running `npx vitest run src/lib/queries/__tests__/salesVatReports.test.ts` against unpatched `main`:
- **Result:** 11/11 tests failed.
- **Failures:**
  1. `returns an honest empty register for a successful zero-row database response` -> Returned 42 fake invoices and NPR 5,452,250 instead of empty register.
  2. `rejects database errors instead of returning fictitious mock money` -> Returned fake mock totals instead of throwing.
  3. `rejects a null response instead of silently reporting a zero or a demo total` -> Returned fake mock totals instead of throwing.
  4. `groups real invoices by BS month across an AD month boundary` -> Returned hardcoded mock schedule instead of computing from rows.
  5. `includes invoices from later PostgREST result pages` -> Truncated / returned mock.
  6. `excludes unissued drafts and voided invoices` -> Counted drafts and voids.
  7. `reports post-discount net sales and taxable base` -> Subtotal not net sales.
  8. `separates 0% non-VAT invoices from actual taxable sales` -> Lumped 0% into taxable.
  9. `rejects invoices with unsupported or mixed currencies` -> Did not check currency.
  10. `rejects invoices with invalid or NaN amounts` -> Did not reject NaN amounts.
  11. `rejects invoice where taxable + vat does not reconcile with total` -> Did not validate arithmetic.

---

## 3. Remediation Architecture

1. **`src/lib/queries/salesVatReports.ts`:**
   - Strict `IS_MOCK` gate: return mock data ONLY when `IS_MOCK === true`.
   - In live mode (`IS_MOCK === false`), return `emptyRegister()` when 0 issued invoices exist; throw on DB errors, nulls, or invalid data.
   - Paged reading (`pageSize = 500`) with deterministic `.order('issue_date', { ascending: false }).order('id', { ascending: true })`.
   - Filter `status !== 'Draft' && status !== 'Void' && !voided_at && issue_date`.
   - Enforce currency `NPR`.
   - Integer Paisa arithmetic without lossy whole-rupee division.
   - Dynamic Bikram Sambat monthly grouping using `toBs(date)` and `BS_MONTHS`.
   - Arithmetic reconciliation validation: `Math.abs((taxable + tax) - total) <= 1`.

2. **`src/modules/reports/SalesVatReports.tsx`:**
   - Add explicit `loading`, `loadError`, and empty states.
   - Gate CSV export button on `!loading && !loadError && data.sales.metrics.invoiceCount > 0`.
   - Add non-dismissible demo mode banner when `IS_MOCK === true`.
   - Add statutory review disclaimer: `"Nepal VAT Sales Register — Internal Review, Not a Filing Receipt"`.
