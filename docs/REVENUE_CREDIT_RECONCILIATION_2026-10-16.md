# Issued revenue and credit-note reconciliation — October 16, 2026

## Financial definitions

- **Displayed revenue:** sum of invoices.taxable_amount (NPR/paisa) for nonvoid invoices in the selected Gregorian issue_date period and statuses Sent/Partially Paid/Paid. Excludes VAT, Draft and Void. Not cash receipts, profit or audited net sales.
- **Credit note amount:** credit_notes.amount, which is a paid-value correction. Migration 0117 defines it as a positive amount; the void_invoice implementation in 0150 auto-creates it from invoices.paid_amount. It is **not a tax-base reversal amount**, so it MUST NOT be subtracted from taxable revenue.
- **Voided taxable amount:** sum of taxable_amount for voided invoices *issued in the window*. It is excluded from the displayed revenue and is not a second deduction.
- **Paid void mismatch:** a voided invoice with paid_amount > 0 whose linked credit note amounts do not sum to paid_amount. This is a **manual review warning**, not an automatic write-off.
- **Notes on active invoices:** displayed separately for review. Their tax meaning requires a dedicated legally reviewed credit-note adjustment ledger.
- **Currency guard:** because credit_notes has no currency field, voided invoices and any invoice linked to a credit note must be NPR-denominated or the reconciliation refuses to display a combined NPR number. Other currencies require separate currency-aware reporting.
- **Restatement:** the chart is a current snapshot of nonvoid invoices grouped by original issue date. Later voids can change prior-month totals. It is not a point-in-time issued-sales ledger.
- Notes attached to invoices issued **outside** the selected window are not evaluated by this invoice-issue-date report, even if the note was created during the period. A true credit-note-period ledger will require separate date-basis reconciliation.

## Read path / access

- src/lib/queries/reportRevenueTrend.ts is the sole source and imports the common aggregation/audit functions.
- src/lib/queries/revenueTrend.ts is a backwards-compatible re-export, not another database reader.
- Read all period invoices, including voided, in ordered 500-row pages; read linked credit_notes in bounded ID batches and ordered pages.
- All queries use the authenticated user Supabase client; both invoice and credit-note RLS must be enforced in the deployed database. This change does **not** alter security policies, schemas or permissions.
- An invalid date, ambiguous amount, source error, duplicate, unsafe total or pagination cap throws; the screen does not substitute demo/zero data.
- UI is explicitly permission-gated for Owner/Admin/Manager/Accounts; floor roles never initiate this read.

## Test gates

Run on the dedicated branch, without live Supabase:

    npm ci
    npm run typecheck
    npm run test -- src/lib/intel/revenueTrend.test.ts src/lib/intel/__tests__/revenueTrend.test.ts src/lib/intel/__tests__/revenueCredits.test.ts src/lib/queries/__tests__/reportRevenueTrend.test.ts
    VITE_DATA_SOURCE=mock npm run test
    npm run build
    npm run check:pglite
    npm run check:lifecycle

## Outside scope / release gates

- Need a legally reviewed credit-note taxonomy (taxable base, VAT, adjustment effective date, partial credits) before publishing audited net revenue.
- Review grant baseline 0093, credit-notes RLS in 0117, and security-definer void RPC in 0150; source-only review does not prove effective deployed grants, applied migrations, tenant isolation or complete visibility in live Supabase.
- Need report-by-note-date and cross-period journal reconciliation, including all notes whose original invoice date falls outside the window.
- Need accounting-system totals and bank/payment reconciliation with a read-only authorized role; synthetic tests alone do not substantiate finance statements.
- Need live read-only RLS verification on a safely configured staging environment before release (particularly money-blind users).
- Do not merge, deploy or alter live Supabase until CI, accounting and security reviews have been completed.
