# Interactive reports — Phase 0 audit and metric definitions

**Date:** 14 October 2026, revised 18 October 2026 after babindulal7/babin-rentals-os#12 merged (Asia/Kathmandu) ·
**Baseline:** `main` at `ad8ce1e` · **Branch:** `claude/new-session-yrv8p9`
**Source brief:** `BABIN_RENTALS_INTERACTIVE_REPORTS_CHARTS_IMPLEMENTATION.md` v1.0 (supplied by Babin). Where it and
the repository disagree, the repository's laws and `docs/PERMISSIONS.md` win (§0.2 of the brief says the same).

This is the brief's Phase 0 deliverable: what each report reads today, what is real, what is not, and the metric
definitions Phase 1 implements. It is a dated measurement, not current status — `PROGRESS.md` is the ledger.

---

## 1. Governance read

Read in order: `docs/00_READ_FIRST.md`, `CLAUDE.md`, `docs/PERMISSIONS.md` (§3.1, §4, §5), `docs/PRODUCT_RULES.md`,
`docs/CURRENT_STATE.md`, `PROGRESS.md` (newest entries + the 6 Oct Forecasting ruling), `docs/OPEN_DECISIONS.md`.

- **`PLAN.md` is not in this clean repository** (`CLEAN_SOURCE_MANIFEST.md` §2 excludes it). Decisions from this
  work are R17-1 … R17-8 in `docs/RULINGS-2026-10-17.md`, in `PROGRESS.md` and at the code site (B-2). Open
  questions go to `docs/OPEN_DECISIONS.md` (17 October entry).
- No rule in the brief needed overriding. Two points needed reconciling — see §4.

## 2. Pull requests touching reports (checked 18 Oct 2026)

| PR | Overlap | Disposition |
|---|---|---|
| babindulal7/babin-rentals-os#12 — *interactive issued-revenue trend* | Same scope. **Merged** into `main`, with a credit-note reconciliation follow-up. | This branch is now a port on top of it: #12's engine, reader and reconciliation are kept; §6 lists what is added. |
| babindulal7/babin-rentals-os#16 — the first version of this work | Superseded by #12's merge. | **Closed.** Its rulings R14-15…R14-21 were never merged; the ones still needed are re-issued as R17-n. |
| babindulal7/babin-rentals-os#6 — *Sales/VAT never shows demo totals* | Fixes `salesVatReports.ts` (§3 row "Sales & VAT"). | Open, not touched here. |
| babindulal7/babin-rentals-os#7 — *Client Reports real metrics* | Different report. | Open, not touched here. |

## 3. Audit — what each report reads today

"Seed" = figures generated or typed into the browser bundle (`src/data/*`, `MOCK_*` constants).

| Report | Source today | Real? | Correctness risk found | Permission today | Plan |
|---|---|---|---|---|---|
| **Revenue** (`RevenueReport.tsx`) | Before #12: seed ledger and hardcoded tables. After #12: `invoices` + `credit_notes`, paged; no axis, no compare, no register. | **Yes since #12** | Pager stops on a short page; toolbar said "All dates" while the chart drew 90 days; seeded mock invoices lacked `currency`, so the demo errored. | Page: Owner · Admin · Manager · Accounts; nav still linked Coordinator (C7, §4) | **Phase 1 — this branch completes it.** |
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
   reports Coordinator may read (Rentals, Clients, Operations, Fulfillment, Discounts) and Revenue is not one. #12's
   page already refused Coordinator, but the report nav still linked it. Stricter wins (B-1): `canViewFinancialReports`
   = Owner · Admin · Manager · Accounts, mirroring `auth_is_finance_or_admin()` (0117), used by the page and the nav
   (R17-1). Coordinator still reads invoices row by row through RLS exactly as before.
2. **Credit notes.** The brief says billed revenue is "net of credit notes". The only writer of `credit_notes` is
   `void_invoice()`, which records the *paid* amount of an invoice it voids. #12 resolved this before the port:
   voided invoices are excluded and their notes are reconciled in a separate section (paid voids whose notes do not
   match, and notes on live invoices, are flagged for manual review), never subtracted from taxable revenue. Kept.

## 5. Metric definitions

| Metric | Definition | Source | Status |
|---|---|---|---|
| **Billed revenue** | Σ `taxable_amount` (after discount, **before VAT**) over invoices with status Sent / Partially Paid / Paid and `voided_at IS NULL`, NPR only, bucketed by `issue_date` (AD date). #12's definition, kept. Credit notes are reconciled beside it, never subtracted. | `invoices` (0006, totals fixed by the 0098 trigger: `taxable = subtotal − discount`, `total = taxable + VAT`) | **Implemented** (`lib/intel/revenueTrend.ts`) |
| Cash collected | Completed incoming payments minus reversal rows, by payment date. | `payments`, `payment_reversals` | Not wired — Phase 2 |
| Cash out | Approved expense postings + supplier payouts; loan principal separate. | `expenses`, payouts | Not wired — needs an outflow policy (decision) |
| Deposits | Held / Applied / Released movements; never revenue, never reduce outstanding (Law 5). | `security_deposits`, `deposit_movements` | Not wired |
| Outstanding receivable | Σ `outstanding_amount` on issued, non-voided invoices. | `invoices` | Not wired as a trend |
| Operating expense / profit | Revenue − approved operating expense, accrual. | `expenses` | Not wired — needs the expense category policy |
| Utilization / rental days | Unit-days on rent ÷ available unit-days, 06:00→06:00 business day (`rentalDays.ts`), per physical unit. | `booking_line_units`, `product_units`, maintenance downtime | Not wired |
| Asset ROI | Verified purchase cost + maintenance vs attributed revenue. | `product_units_v`, `maintenance_records` | Not wired — attribution unverified |

**Buckets.** AD calendar months (labelled "AD"), as #12 built them; up to 24 per read. BS months are not offered:
`lib/bs.ts` vouches only for its table's years, and an AD month must never be labelled as a BS one. A bucket the
window cuts is labelled *part month*; the bucket holding today is *month to date*. No actual point is plotted after
today — a future end date is clamped to today and the page says so.

**Data caveat (pre-existing, not changed).** `issue_invoice()` dates an invoice with `current_date` on the database
server (UTC on Supabase) when no date is passed (0108:85). An invoice issued between 00:00 and 05:45 Nepal time without an explicit date is stamped
with the previous day. The report reads the stored date as written.

## 6. What this branch adds on top of #12

| Concern | `main` after #12 | This branch |
|---|---|---|
| Completeness | Stops paging at the first short page — silently truncates if PostgREST `max-rows` is below 500. | Advances by rows received, requires the server's exact count, refuses on mismatch or change mid-read (R17-4). |
| Axis | No value axis; unreadable without hovering. | Shared `InteractiveTrendChart`: labelled lakh/crore axis, thinned period labels, legend with status in words, keyboard/touch/tooltip. |
| Current month | Plotted as a complete month. | *Month to date*; clipped edges *part month* (R17-3). |
| Window | 90 days drawn while the toolbar read "All dates". | Opens on the toolbar's "Last 90 days"; All dates = first issued invoice → today; future end clamped and said; #12's 24-month cap kept (R17-7). |
| Compare | — | Same number of days immediately before, buckets shifted 1:1; bounded periods only (R17-2). |
| Views | — | One switcher: taxable amount or invoice count (R17-8). |
| Register | Removed. | Issued + voids, true count, inline error, links into Finance (R17-5). |
| Coordinator | Page only. | `canViewFinancialReports` in `rbac.ts`; nav link gated too (R17-1). |
| Credit notes | #12's reconciliation section and CSV rows. | Kept unchanged. |

## 7. Not done here (by design)

- Pulse, Cash Flow, Rentals, Equipment, Expenses charts (Phase 2) and the five-year illustrative scenario explorer
  (Phase 3). The brief says not to bundle them into Phase 1.
- A SQL aggregate RPC. Invoice volume is in the hundreds; a new RPC could not run on live until Babin applies it (N-5).
  The adapter's contract is written so an RPC can replace its body without touching the engine or page.
- Branch filter: one location today (OPEN_DECISIONS D-1), so the toolbar draws no branch control.
