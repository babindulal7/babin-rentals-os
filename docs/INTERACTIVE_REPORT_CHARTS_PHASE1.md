# Interactive Reports implementation — Phase 0/1 notes

Date: 2026-10-15. Source: `BABIN_RENTALS_INTERACTIVE_REPORTS_CHARTS_IMPLEMENTATION.md` supplied in ChatGPT.

## Source and scope
- Target: current `babindulal7/babin-rentals-os` only; branch based on main at `f5ee531b74fe07a38a848fd5e1c8297ee3abbfad`.
- Existing `RevenueReport.tsx` rendered fixed 2026 numbers from a Pulse fixture and prefilled equipment-category and project totals. Those are not verified operational accounts, so this PR replaces them with a clearly scoped issued-invoice revenue trend.
- Query reads authenticated Supabase `invoices` with bounded 500-row pages, deterministic ordering, issue dates and nonvoid issued statuses; subject to existing database RLS.
- Metric: SUM(`taxable_amount`) from *issued, non-void NPR invoices*, counted by `issue_date` AD month, **before VAT**. Not cash collected, not net sales after independent credit notes, not operating profit. Reconciliation with independent credit note and reversal entries remains outstanding.
- Aggregation rejects unsafe money, duplicate IDs, invalid date range and mixed currencies. Page shows explicit scope and absence of audited net-sales claim.
- The interactive SVG chart reuses `src/components/ui/Charts.tsx` categorical tokens; keyboard arrows, touch selection and HTML monthly breakdown table are implemented.
- Only Owner/Admin/Manager/Accounts can request this executive revenue report in the frontend; RLS remains the hard boundary. Coordinator is not granted executive P&L figures.
- Missing category/project attribution is **not replaced with invented figures**.

## Outstanding Phase 1/2 work
- Reviewed secure SQL aggregate/credit-note policy for net revenue, branch authorization and end-to-end reconciliation to final reports.
- Additional server-side report aggregation for larger volumes and history; current page fail-closed limit is 50,000 invoices.
- Full drilldowns, previous-period comparison and formal keyboard/mobile accessibility verification in browser.
- Pulse, cash, equipment, asset ROI and forecasting scenarios are later phases.

## Safety and verification
- No schema migration, live Supabase calls, deployment, merge, or permission widening performed.
- Local test runs and a browser smoke test are NOT claimed. Check GitHub Actions on PR and execute the full repo gate list before merge.
- The feature should remain a draft if CI is failing or not run.

## Revert
Revert this feature branch/PR. No persisted data is changed.
