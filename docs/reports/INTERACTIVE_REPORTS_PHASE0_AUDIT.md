# Interactive reports — Phase 0 audit and metric definitions

**Date:** 14 October 2026 (Asia/Kathmandu) · **Baseline:** `main` at `f5ee531` · **Branch:** `claude/new-session-yrv8p9`
**Source brief:** `BABIN_RENTALS_INTERACTIVE_REPORTS_CHARTS_IMPLEMENTATION.md` v1.0 (supplied by Babin). Where it and
the repository disagree, the repository's laws and `docs/PERMISSIONS.md` win (§0.2 of the brief says the same).

This is the brief's Phase 0 deliverable: what each report reads today, what is real, what is not, and the metric
definitions Phase 1 implements. It is a dated measurement, not current status — `PROGRESS.md` is the ledger.

---

## 1. Governance read

Read in order: `docs/00_READ_FIRST.md`, `CLAUDE.md`, `docs/PERMISSIONS.md` (§3.1, §4, §5), `docs/PRODUCT_RULES.md`,
`docs/CURRENT_STATE.md`, `PROGRESS.md` (newest entries + the 6 Oct Forecasting ruling), `docs/OPEN_DECISIONS.md`.

- **`PLAN.md` is not in this clean repository** (`CLEAN_SOURCE_MANIFEST.md` §2 excludes it) and no `RULINGS-*.md`
  was at the baseline. Decisions from this work are R14-15 … R14-21 in `docs/RULINGS-2026-10-14.md`, in `PROGRESS.md`
  and at the code site (B-2). Open questions go to `docs/OPEN_DECISIONS.md`.
- No rule in the brief needed overriding. Two points needed reconciling — see §4.

## 2. Open pull requests touching reports (checked 14 Oct 2026, 22:10 NPT)

| PR | Overlap | Disposition |
|---|---|---|
| babindulal7/babin-rentals-os#12 — *interactive issued-revenue trend (Phase 1)* | **Same scope as this work.** Written through the GitHub connector; its description says no gate or browser run. | This branch supersedes it: it reuses #12's definition (pre-VAT, issued, non-voided, by `issue_date`) and fixes what #12 lacks — see §6. Only one of the two should merge. |
| babindulal7/babin-rentals-os#6 — *Sales/VAT never shows demo totals* | Fixes `salesVatReports.ts` (§3 row "Sales & VAT"). | Not touched here. |
| babindulal7/babin-rentals-os#7 — *Client Reports real metrics* | Different report. | Not touched here. |

## 3. Audit — what each report reads today

"Seed" = figures generated or typed into the browser bundle (`src/data/*`, `MOCK_*` constants).

| Report | Source today | Real? | Correctness risk found | Permission today | Plan |
|---|---|---|---|---|---|
| **Revenue** (`RevenueReport.tsx`) | Trend chart and table: `data/pulse.ts` seed ledger. Category and project tabs: hardcoded constants. KPIs: first 100 rows of `listInvoices`, falling back to seed. | **No** (register tab was real) | KPI total summed **voided** invoices; "42 invoices" and "Rs 35,000" fallbacks; trend clipped to the seed's coverage. | `useCanViewMoney` — **Coordinator saw it** (C7 conflict, §4) | **Phase 1 — this branch.** |
| **Pulse** (`Pulse.tsx`) | `data/pulse.ts` seed ledger (disclosed on screen via `MODEL_DISCLOSURE`); `getPulseLiveSummary` unbounded selects that turn any error into zeros. | Seed (disclosed) | `catch → 0` reads a failure as "no business". Revenue recognition basis is itself `TODO(decision)` (`PERIOD_BASIS`). | `useCanViewMoney` | Phase 2: the Revenue view can adopt this branch's engine; Expense/Profit, Cash and Utilization views need their sources first. One chart, switchable views — kept. |
| **Cash Flow / Working Capital** (`queries/liquidity.ts`) | Selects `invoices.total, balance` — **columns that do not exist** (`total_amount`, `outstanding_amount`). Falls back to `data/liquidityReports` seed when everything is empty, otherwise sums the failed read as **Rs 0 invoiced**. | **No** | Silent zero on a failed read; seed fallback. | `useCanViewMoney` — Coordinator sees cash flow (C7 says no) | Phase 2. Needs the payment/expense/deposit outflow policy written first. |
| **Sales & VAT** (`queries/salesVatReports.ts`) | Selects `tax_amount, grand_total` — **columns that do not exist**; every read errors and returns `MOCK_SALES`/`MOCK_VAT`. | **No** | Demo totals presented as the VAT register. | `useCanViewMoney` | PR #6. |
| **Rental Reports** (`queries/rentalReports.ts`) | `bookings`, with `MOCK_*` returned on error or empty. | Mixed | Seed on empty DB looks like real activity. | `useCanViewMoney` for money columns | Phase 2. |
| **Equipment Performance** | `data/equipmentPerformance` seed + `products_v`, `invoices.total_amount`; `catch` → seed. | Mixed | Seed fallback. | `useCanViewMoney` — utilisation is Owner-tier only (§5) | Phase 2. Needs per-unit 06:00 rental-day intervals. |
| **Asset ROI** | `product_units_v.purchase_price`, `maintenance_records.cost`. | Partly | Revenue attribution per unit not verified. | `useCanViewMoney` — ROI is Owner-tier (§5) | Phase 4. |
| **Expenses** | `expenses` table + `data/expenseReports` seed errors. | Mixed | — | `useCanViewMoney` | Phase 2. |
| **Forecasting & AI** | Nothing — "Not computed yet" (RULING 2026-10-06, Law 16). | n/a | — | none | Phase 3 (illustrative scenarios only, after provenance controls). **Unchanged here.** |

## 4. Reconciliations with the repository's rules

1. **Coordinator and the Revenue report.** `PERMISSIONS.md` §5 gives Coordinator *booking* money; §3.1 C7 lists the
   reports Coordinator may read (Rentals, Clients, Operations, Fulfillment, Discounts) and Revenue is not one. The page
   used `useCanViewMoney`, which admits Coordinator. Stricter wins (B-1): new `canViewFinancialReports` =
   Owner · Admin · Manager · Accounts, mirroring `auth_is_finance_or_admin()` as 0117 last defined it. Logged as a
   ruling. Coordinator still reads invoices row by row through RLS exactly as before.
2. **Credit notes.** The brief says billed revenue is "net of credit notes". Here the only writer of `credit_notes` is
   `void_invoice()` (0121), which mints a note for a *paid* invoice it is voiding. Excluding voided invoices already
   removes that revenue; subtracting the note too would count the reversal twice. The adapter checks every period for
   a credit note against a still-live invoice and, if one exists, labels the report **Partial data** with the reason.

## 5. Metric definitions

| Metric | Definition | Source | Status |
|---|---|---|---|
| **Billed revenue** | Σ `taxable_amount` (after discount, **before VAT**) over invoices with status Sent / Partially Paid / Paid (or a stored Overdue) and `voided_at IS NULL`, NPR only, bucketed by `issue_date` (AD date). VAT and the VAT-inclusive total carried alongside for reconciliation. | `invoices` (0006, totals fixed by the 0098 trigger: `taxable = subtotal − discount`, `total = taxable + VAT`) | **Implemented** (`lib/intel/revenueTrend.ts`) |
| Cash collected | Completed incoming payments minus reversal rows, by payment date. | `payments`, `payment_reversals` | Not wired — Phase 2 |
| Cash out | Approved expense postings + supplier payouts; loan principal separate. | `expenses`, payouts | Not wired — needs an outflow policy (decision) |
| Deposits | Held / Applied / Released movements; never revenue, never reduce outstanding (Law 5). | `security_deposits`, `deposit_movements` | Not wired |
| Outstanding receivable | Σ `outstanding_amount` on issued, non-voided invoices. | `invoices` | Not wired as a trend |
| Operating expense / profit | Revenue − approved operating expense, accrual. | `expenses` | Not wired — needs the expense category policy |
| Utilization / rental days | Unit-days on rent ÷ available unit-days, 06:00→06:00 business day (`rentalDays.ts`), per physical unit. | `booking_line_units`, `product_units`, maintenance downtime | Not wired |
| Asset ROI | Verified purchase cost + maintenance vs attributed revenue. | `product_units_v`, `maintenance_records` | Not wired — attribution unverified |

**Buckets.** Windows of ≤ 62 days are drawn daily; longer windows by **AD calendar month** (labelled "AD"). BS months
are not offered: `lib/bs.ts` vouches only for its table's years, and an AD month must never be labelled as a BS one.
A bucket the window cuts is labelled *part month*; the bucket holding today is *month to date*. No actual point is
plotted after today — a future end date is clamped to today and the page says so.

**Data caveat (pre-existing, not changed).** `invoices.issue_date` defaults to `current_date` on the database
server (UTC on Supabase). An invoice issued between 00:00 and 05:45 Nepal time without an explicit date is stamped
with the previous day. The report reads the stored date as written.

## 6. What this branch changes, and how it differs from PR #12

| Concern | PR #12 | This branch |
|---|---|---|
| Completeness | Stops paging at the first short page — silently truncates if PostgREST `max-rows` is below 500. | Advances by rows received, requires the server's exact count, refuses on mismatch or change mid-read. |
| Axis | No value axis; the chart is unreadable without hovering. | Labelled lakh/crore value axis, thinned period labels, legend with status in words. |
| Current month | Plotted as a complete month. | *Month to date* label; clipped edges labelled *part month*. |
| Window | Last 90 days only; "All dates" ignored. | All dates = from first issued invoice; daily ≤ 62 days, else monthly; ≤ 60 months. |
| Compare | — | The equal-length window immediately before (as the toolbar promises); each bucket is compared with the same-length span shifted back, so buckets align 1:1 and both totals reconcile. Offered only for a bounded period. |
| Views | — | One chart, three measures: before VAT / incl. VAT / invoice count. |
| Register | Removed (it was real data). | Kept, with count, error state, and voids marked. |
| Coordinator | Hidden in the page only. | `canViewFinancialReports` in `rbac.ts`, nav link gated too. |
| Credit notes | Not checked. | Partial-data guard (§4.2). |
| Tests | Two duplicate engine files. | Engine, scale, adapter (paging/count), chart (keyboard/touch/a11y) and page (roles/states) suites. |

## 7. Not done here (by design)

- Pulse, Cash Flow, Rentals, Equipment, Expenses charts (Phase 2) and the five-year illustrative scenario explorer
  (Phase 3). The brief says not to bundle them into Phase 1.
- A SQL aggregate RPC. Invoice volume is in the hundreds; a new RPC could not run on live until Babin applies it (N-5).
  The adapter's contract is written so an RPC can replace its body without touching the engine or page.
- Branch filter: one location today (OPEN_DECISIONS D-1), so the toolbar draws no branch control.
