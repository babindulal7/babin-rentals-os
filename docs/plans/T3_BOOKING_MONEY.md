# T3 — Booking & money rules

**Goal:** the desk can book, re-book, cancel and bill exactly as Babin ruled, with deposits set per
product, non-VAT bills told apart, and a daily closing that knows the real cash and bank balance.
**Lane B.** Rulings: D6, D7, D9–D15, D19; Laws 1, 4, 5, 6, 7, 10.

**Exit (G3):** on staging and live: re-book creates a quote in ≤ 3 taps; every active product has a
deposit rule; a cancellation after an advance suggests the right tier; the VAT register shows
non-VAT bills separately; daily closing carries an opening balance forward; invoices and rental
agreements pass the accountant's check.

---

### T3-01 · Re-book            status: todo · size: M · lane B
**What** — "Re-book" on Booking Detail (⋯ menu) and on the client's history. Default copy: client,
products and quantities as a **new Quote** at **today's rates**, empty dates, serials picked fresh
at confirm. A small chooser lets staff also tick **crew, delivery, discounts** (D9 "1 and we can
choose"). Opens New Rental prefilled; nothing is written until staff save (no eager draft).
**Why** — D9 (§4.64a); R-39 tap budget.
**Where** — `src/modules/rentals/actions/RentalMoreActions.tsx`, `ClientHistoryDrawer.tsx`,
`NewRental.tsx` prefill, `src/lib/pricingPipeline.ts` (today's rates), `create_booking` RPC.
**Database** — none (create path exists).
**Done when** — 1) re-book of a 6-line booking opens prefilled with today's prices; 2) crew/delivery/
discounts copied only when ticked; 3) retired or deactivated products are listed as "not
available any more" and left out; 4) tap count recorded against R-39.
**Needs** — none.

### T3-02 · Deposits per product, entered before go-live            status: todo · size: M · lane B + staff
**What** — A bulk editor for `products.deposit_fixed` / `deposit_percent` (and `replacement_value`
where missing): an Inventory view "Deposit setup" listing every active product with its rule, inline
edit, filter "no deposit set", and CSV round-trip through the products import (dry run first).
Staff fill all ~180 products before the trial; the screen shows progress ("142 / 178 set").
**Why** — D11; Booqable's global default is "no deposit", so imported products carry none.
**Where** — `src/modules/inventory/Inventory.tsx`, `src/lib/productImport.ts`,
`src/modules/inventory/ProductsImportCenter.tsx`, `src/lib/productDeposit.ts`.
**Database** — none (columns exist); writes through existing equipment update RPC.
**Done when** — money roles edit; Warehouse cannot see the view (Law 6); CSV dry run reports changes
before applying; progress counter correct.
**Needs** — none. Data entry: BABIN_ACTIONS (staff, December).

### T3-03 · Cancellation fee tiers            status: todo · size: M · lane B + Babin
**What** — Settings ▸ Financial ▸ "Cancellation fee tiers": rows of *notice before pickup* → *fee %*.
⭐ Fee base: the booking's rental total **before VAT**. When a booking with a paid advance is
cancelled, the cancel sheet **suggests** the fee from the tiers (staff may lower it with a reason —
same shape as the late-fee waiver), then: fee → an invoice line "Cancellation fee"; any advance
above the fee → refund as a **reversal row** (Law 4). No tiers set → no fee suggested (today's
behaviour) and the card says so.
**Why** — D12; replaces `CANCELLATION_TIERS_UNAVAILABLE` (`src/data/settings.ts` ~line 644).
**Where** — `src/modules/settings/sections/Financial.tsx`, `src/actions/rentals/cancelRental.ts`,
`src/modules/rentals/modals/CancelRentalModal.tsx`, settings table (0158).
**Database** — migration (claim number) if tiers need a typed table rather than a settings key;
lifecycle step "cancel with advance → fee line + reversal, totals reconcile".
**Done when** — tiers 48 h / 24 h / 0 h example on staging produce the right fee and refund; VAT on
the fee follows the accountant's answer (ask with O-7).
**Needs** — Babin enters the real tiers (O-10).

### T3-04 · Non-VAT bills            status: todo · size: M · lane B + accountant
**What** — Each invoice carries a VAT treatment: **Standard 13%** or **Non-VAT bill** (D13). The VAT
toggle on a booking sets it; the Sales/VAT register and VAT report show non-VAT bills in their own
section with their own total — never mixed into exempt or zero-rated. Existing zero-VAT invoices
are labelled Non-VAT bill by a backfill that records how each was classified.
**Why** — D13; OPEN_DECISIONS §15 (a zero amount alone is not a tax status — now Babin has ruled).
**Where** — `invoices`, `src/modules/reports/SalesVatReports.tsx`, `src/lib/queries/salesVatReports.ts`,
invoice PDF footer.
**Database** — migration (claim number): enum + column + backfill with an audit note per row.
**Done when** — register totals = standard VAT section + non-VAT section; accountant confirms the
layout (O-7).
**Needs** — accountant answer O-7 for the report wording.

### T3-05 · IRD e-billing check            status: todo · size: S · Babin + accountant
**What** — Babin asks the accountant whether Babin Rentals must use IRD-certified electronic billing
with real-time invoice sync. If **no**, close the card with the answer and date. If **yes**, write a
spec card set (certification, sync, offline invoices, invoice cancellation rules) and re-plan.
**Why** — D14.
**Where** — `docs/OPEN_DECISIONS.md`.
**Database** — none now.
**Done when** — written answer recorded by 30 Nov 2026 (14 Mangsir 2083).
**Needs** — accountant.

### T3-06 · Invoice and agreement documents            status: todo · size: M · lane B + accountant
**What** — 1) The accountant checks the invoice PDF (`src/lib/pdf/generatePdf.ts`) against what an
invoice in Nepal must show (business PAN, invoice number, date — add the BS date beside AD, buyer
PAN when given, VAT lines); fix what they mark. 2) Rental Agreement PDF from the booking with
Babin's terms text (O-11), signed at Handover (T2-02). 3) Quote PDF uses the same header.
**Why** — 21 Jul lock (OS generates Quote, Invoice, Rental Agreement, Packing List).
**Where** — `src/lib/pdf/*`, `src/actions/documents/createDocument.ts`, `QuoteActionsMenu.tsx`,
`InvoiceActionsMenu.tsx`.
**Database** — none.
**Done when** — accountant signs off a sample invoice; a signed agreement PDF is stored on a staging
booking.
**Needs** — T2-02; Babin's terms text; accountant.

### T3-07 · Opening balances and daily closing carry-forward            status: todo · size: M · lane B
**What** — Accounts (or Owner) enters an **opening balance** once per cash drawer and per bank
account, with the date. Daily closing then shows *opening + money in − money out = closing* per
account and carries the closing to the next day. Money in/out includes rental payments, payment
reversals, expenses paid, and **deposit cash received and returned** (deposits are cash held in
trust — they move the drawer, never revenue or Outstanding, Law 5). Cash Flow and Working Capital
reports read these balances instead of "Not tracked yet".
**Why** — D15; OPEN_DECISIONS §13 (bank/cash balance).
**Where** — `src/modules/finance/DailyClosing.tsx`, `src/lib/queries/closing.ts`,
`src/modules/reports/CashFlowReport.tsx`, `WorkingCapitalReport.tsx`, `bank_accounts`.
**Database** — migration (claim number): opening balance table (append-only; a correction is a new
row, Law 4 spirit) + RLS money roles only; lifecycle step "closing = opening + in − out".
**Done when** — a staging week of payments/expenses/deposits reconciles to a hand calculation;
Warehouse cannot read the table.
**Needs** — none.

### T3-08 · Equipment form: one page, seven sections            status: todo · size: S · lane B
**What** — Remove the five-step mode from `EquipmentRecordEditor` (`wizardMode`, ~line 69 and its
render branches); keep the seven section anchors and jump links.
**Why** — D19; closes OPEN_DECISIONS §19.
**Where** — `src/components/records/EquipmentRecordEditor.tsx` and its tests.
**Database** — none.
**Done when** — no wizard toggle; all seven sections reachable by anchor at 375 / 820 / 1440; tests
updated.
**Needs** — none.

### T3-09 · Structure-priced bookings reproduce on the invoice            status: todo · size: S · lane B
**What** — Verify on staging that a booking priced with a pricing structure (0160) stores its line
breakdown (0168) and that the invoice shows the same figures; fix any drift.
**Why** — OPEN_DECISIONS §11 G3 (blocks cutover: Babin's "Babin Daily", "Days wise discount" and
other structures come from Booqable).
**Where** — `src/lib/pricingStructures.ts`, `create_booking`, `0168_booking_line_totals_and_breakdown.sql`,
invoice creation.
**Database** — none expected.
**Done when** — three structure-priced bookings invoice to the paisa of their quote.
**Needs** — Batch 1 on staging.

### T3-10 · After-hours line            status: todo · size: S · lane B
**What** — Add a service product "After-hours handover" (no fixed price; staff type the amount) so
staff can add the charge in two taps when they decide to (D7). No automatic surcharge.
**Why** — D7 (§4.64d).
**Where** — products seed for the live catalogue (via the app, not a migration), New Rental service lines.
**Database** — none.
**Done when** — the line can be added, priced and invoiced; Warehouse cannot see its price.
**Needs** — none.

### T3-11 · Late fee — acceptance only            status: todo · size: S · lane B
**What** — Confirm on staging: Return suggests the fee (≤ 30 min free · < 2 h half day · ≥ 2 h full
day); staff apply; a waiver needs Manager or Owner approval (D6 — unchanged).
**Why** — D6.
**Where** — `src/lib/lateFee.ts`, `ReturnWorkspace.tsx`.
**Database** — none.
**Done when** — three returns (20 min, 90 min, 3 h late) produce 0, half and full day.
**Needs** — Batch 1 on staging.
