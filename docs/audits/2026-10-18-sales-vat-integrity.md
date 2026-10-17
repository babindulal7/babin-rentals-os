# Audit & Implementation Report: P0 Sales & VAT Report Integrity

**Date:** 2026-10-18  
**Scope:** Finance domain — `SalesVatReports.tsx` & `salesVatReports.ts`  
**Target Repository:** `babindulal7/babin-rentals-os` ONLY  
**Branch:** `fix/p0-sales-vat-truth-20261018`  
**Baseline SHA:** `ad8ce1e4afc54cc88df841425d0e281bd15665bc`  
**Reference PR:** Draft PR #6 (`fix/2026-10-14-sales-vat-real-data-only`)  

---

## 1. Executive Summary & Root Cause Analysis

An audit of the Sales & VAT Register (`src/modules/reports/SalesVatReports.tsx` and `src/lib/queries/salesVatReports.ts`) on `main` revealed critical financial integrity bugs that cause the system to display and export fabricated revenue and VAT numbers in live mode:

1. **Schema Column Incompatibilities (`tax_amount`, `grand_total`, `pan_number`):**
   - `src/lib/queries/salesVatReports.ts:167-173` queries `tax_amount`, `grand_total`, and `clients!client_id(name, pan_number)`.
   - In PostgreSQL (`0005_clients.sql` and `0006_finance.sql`), the actual columns are:
     - `vat_amount numeric(14,2)` (not `tax_amount`)
     - `total_amount numeric(14,2)` (not `grand_total`)
     - `taxable_amount numeric(14,2)` (post-discount VAT base)
     - `outstanding_amount numeric(14,2)`
     - `clients.pan_vat text` (not `pan_number`)
   - Consequently, in production on live Supabase Postgres, the PostgREST query **always fails with a column-not-found error**.

2. **Silent Fallback to Mock Data (`MOCK_SALES` and `MOCK_VAT`):**
   - `src/lib/queries/salesVatReports.ts:183-185`:
     ```ts
     if (error || !rows || rows.length === 0) {
       return { sales: MOCK_SALES, vat: MOCK_VAT }
     }
     ```
   - `src/lib/queries/salesVatReports.ts:295-297`:
     ```ts
     } catch {
       return { sales: MOCK_SALES, vat: MOCK_VAT }
     }
     ```
   - Because the query fails due to invalid column names, or if the database has 0 invoices, or under RLS denial, the application silently returns hardcoded mock fixtures (`MOCK_SALES`, `MOCK_VAT`).
   - Operators and accountants see **42 invoices**, **Rs 54,52,250 total invoiced**, and **Rs 6,27,250 VAT liability**—completely fictitious numbers.

3. **Taxable Base & Discount Misstatement:**
   - Even when rows were parsed, `netSales` and `taxableTurnover` were computed from `totalSubtotal` (pre-discount subtotal), overstating revenue on discounted bookings.
   - For an invoice of Rs 10,000 subtotal with Rs 2,000 discount, the true taxable base is Rs 8,000 (13% VAT = Rs 1,040, total = Rs 9,040). The old query reported Rs 10,000 as net sales and taxable turnover.

4. **Hardcoded Mock Trends and Unbounded Truncation:**
   - In `salesVatReports.ts:276, 290`, `monthlyTrend` and `monthlySchedule` directly referenced `MOCK_SALES.monthlyTrend` and `MOCK_VAT.monthlySchedule`.
   - In `salesVatReports.ts:278, 291`, `invoices.slice(0, 10)` truncated the register and CSV exports to 10 rows regardless of total row count.

5. **UI Fail-Closed Deficits:**
   - `SalesVatReports.tsx` had no `loading` state, no `loadError` banner, and no empty-state recovery.
   - The CSV download button was always active in the toolbar, exporting sample demo invoices labeled *"Nepal Statutory 13% VAT Register (Inland Revenue Department)"*.

---

## 2. Real Schema Column & Constraint Truth

Verified against migrations `0001_enums.sql`, `0005_clients.sql`, `0006_finance.sql`, and `0087_payment_totals_exclude_refunds_and_net_reversals.sql`:

| Concept | Live Column / Table | Data Type | Notes |
|---|---|---|---|
| **Invoice No** | `invoices.invoice_no` | `text` | e.g. `INV-2026-0001` |
| **Issue Date** | `invoices.issue_date` | `date` | Actual invoice date (AD) |
| **Status** | `invoices.status` | `invoice_status` | `'Draft'`, `'Sent'`, `'Partially Paid'`, `'Paid'`, `'Overdue'`, `'Void'` |
| **Void Marker** | `invoices.voided_at` | `timestamptz` | Exclude if non-null or status `'Void'` |
| **Currency** | `invoices.currency` | `text` | Default `'NPR'`; error on mixed currencies |
| **Subtotal** | `invoices.subtotal` | `numeric(14,2)` | Pre-discount line sum |
| **Discount** | `invoices.discount_amount` | `numeric(14,2)` | Booking/invoice discount |
| **Taxable Base** | `invoices.taxable_amount` | `numeric(14,2)` | Post-discount taxable base |
| **VAT Rate** | `invoices.vat_rate` | `numeric(5,4)` | `0.1300` (13%) or `0.0000` (0%) |
| **VAT Amount** | `invoices.vat_amount` | `numeric(14,2)` | 13% output VAT |
| **Grand Total** | `invoices.total_amount` | `numeric(14,2)` | `taxable_amount + vat_amount` |
| **Paid Amount** | `invoices.paid_amount` | `numeric(14,2)` | Sum of non-reversal payments |
| **Outstanding** | `invoices.outstanding_amount` | `numeric(14,2)` | `total_amount - paid_amount` |
| **Customer PAN** | `clients.pan_vat` | `text` | 9-digit PAN/VAT identifier |
| **Booking No** | `bookings.booking_no` | `text` | e.g. `BK-2026-0042` |

---

## 3. Example Reconciliation Table

| Metric | Invoice A (Standard 13%) | Invoice B (20% Discount) | Invoice C (0% VAT / Review) | Consolidated Total |
|---|---|---|---|---|
| **Gross Subtotal** | NPR 50,000.00 | NPR 10,000.00 | NPR 15,000.00 | NPR 75,000.00 |
| **Discount** | NPR 0.00 | NPR 2,000.00 | NPR 0.00 | NPR 2,000.00 |
| **Taxable Base** | NPR 50,000.00 | NPR 8,000.00 | NPR 0.00 | NPR 58,000.00 |
| **0%-VAT Turnover** | NPR 0.00 | NPR 0.00 | NPR 15,000.00 | NPR 15,000.00 |
| **VAT Rate** | 13.00% | 13.00% | 0.00% | 13.00% (effective on taxable) |
| **Output VAT** | NPR 6,500.00 | NPR 1,040.00 | NPR 0.00 | NPR 7,540.00 |
| **Invoice Total** | NPR 56,500.00 | NPR 9,040.00 | NPR 15,000.00 | NPR 80,540.00 |
| **Paid Amount** | NPR 56,500.00 | NPR 4,000.00 | NPR 15,000.00 | NPR 75,500.00 |
| **Outstanding Balance**| NPR 0.00 | NPR 5,040.00 | NPR 0.00 | NPR 5,040.00 |
| **Reconciliation Check**| `50,000 + 6,500 = 56,500` | `8,000 + 1,040 = 9,040` | `15,000 + 0 = 15,000` | `58,000 + 15,000 + 7,540 = 80,540` |

---

## 4. PR #6 Porting Matrix

| Change in PR #6 | Status in this Fix | Rationale |
|---|---|---|
| Use `IS_MOCK` gate | **Ported** | MOCK fixtures only in explicit mock mode (`IS_MOCK === true`). |
| Empty register returns zeros | **Ported** | Live zero rows returns clean 0 metrics and empty arrays. |
| Query column fixes (`vat_amount`, `total_amount`, etc.) | **Ported** | Replaced non-existent columns with true Postgres schema. |
| Stable pagination loop (500-row chunks) | **Ported** | Prevents PostgREST 1000-row silent truncation. |
| Exclude Draft & Void (`status !== 'Draft' && status !== 'Void' && !voided_at`) | **Ported** | Only issued legal invoices belong to statutory register. |
| Integer paisa accuracy (`asPaisa` / `rupees`) | **Ported** | No premature rounding or whole-rupee truncation. |
| Dynamic BS-month grouping via `toBs()` | **Ported** | Dynamic monthly trend and BS schedule; removes mock trend. |
| UI loading and error banners | **Ported & Enhanced** | Added accessible alerts and disabled CSV when no real data exists. |
| CSV disclaimer ("Internal Review, Not a Filing Receipt") | **Ported** | Prevents misleading operators into thinking CSV is statutory IRD filing receipt. |
