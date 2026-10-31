# T3 — Booking & money rules

**Goal:** the desk can book, re-book, cancel and bill exactly as Babin ruled, with deposits set per
product, non-VAT bills told apart, and a daily closing that knows the real cash and bank balance.
**Lane C · Codex-2.** Rulings: D6, D7, D9–D15, D19; W5–W19, W36–W41, W59, W68, W81–W91; Laws 1, 4, 5, 6, 7, 10.

**Exit (G3):** on staging and live: re-book creates a quote in ≤ 3 taps; every active product has a
deposit rule; a cancellation after an advance suggests the right tier; the VAT register shows
non-VAT bills separately; daily closing carries an opening balance forward; invoices and rental
agreements pass the accountant's check; a draft invoice exists from Confirm and gets its number on
full payment; staff find any booking, item holder or availability in two taps; the "who owes" list
and the accountant's monthly pack come out of the app.

**Priority inside this track:** cards marked **[go-live]** (and every card without a tag) must be
done by day X; **[soon]** cards go in if time allows, otherwise in the first two weeks after X.

---

### T3-01 · Re-book            status: todo · size: M · lane C
**What** — "Re-book" on Booking Detail (⋯ menu) and on the client's history. Default copy: client,
products and quantities as a **new Quote** at **today's rates**, empty dates, serials picked fresh
at confirm. A small chooser lets staff also tick **crew, delivery, discounts** (D9 "1 and we can
choose"). Opens New Rental prefilled; nothing is written until staff save (no eager draft).
Also in New Rental (L1, W5, W8): dates open as **tomorrow 06:00 → the next day 06:00** with length
chips **1 day · 2 days · 3 days · 1 week**; **Save as quote** and **Confirm** are both one tap (about
half of bookings start as quotes); "Copy a past booking" sits beside search, scan (T3-19) and bundle.
**Why** — D9 (§4.64a); L1; W5; W8; R-39 tap budget.
**Where** — `src/modules/rentals/actions/RentalMoreActions.tsx`, `ClientHistoryDrawer.tsx`,
`NewRental.tsx` prefill, `src/lib/pricingPipeline.ts` (today's rates), `create_booking` RPC.
**Database** — none (create path exists).
**Done when** — 1) re-book of a 6-line booking opens prefilled with today's prices; 2) crew/delivery/
discounts copied only when ticked; 3) retired or deactivated products are listed as "not
available any more" and left out; 4) tap count recorded against R-39.
**Needs** — none.

### T3-02 · Deposits per product, entered before go-live            status: todo · size: M · lane C + staff
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

### T3-03 · Cancellation fee tiers            status: todo · size: M · lane C + Babin
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

### T3-04 · Non-VAT bills            status: todo · size: M · lane C + accountant
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

### T3-06 · Invoice and agreement documents            status: todo · size: M · lane C + accountant
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

### T3-07 · Opening balances and daily closing carry-forward            status: todo · size: M · lane C
**What** — Accounts (or Owner) enters an **opening balance** once per cash drawer and per bank
account, with the date. Daily closing then shows *opening + money in − money out = closing* per
account and carries the closing to the next day. Money in/out includes rental payments, payment
reversals, expenses paid, and **deposit cash received and returned** (deposits are cash held in
trust — they move the drawer, never revenue or Outstanding, Law 5). Cash Flow and Working Capital
reports read these balances instead of "Not tracked yet". **Settings ▸ Financial ▸ Closing: "per
shift" or "once a day"** (W59); with "per shift" the closing follows the three shifts 06–15, 14–23,
22–07 (W32) and the cash count is part of the shift handover (T4-05). Deposit refunds: staff pick
the method each time (W83) — the refund dialog offers the method the deposit came in, preselected.
**Why** — D15; W32; W59; W83; OPEN_DECISIONS §13 (bank/cash balance).
**Where** — `src/modules/finance/DailyClosing.tsx`, `src/lib/queries/closing.ts`,
`src/modules/reports/CashFlowReport.tsx`, `WorkingCapitalReport.tsx`, `bank_accounts`.
**Database** — migration (claim number): opening balance table (append-only; a correction is a new
row, Law 4 spirit) + RLS money roles only; lifecycle step "closing = opening + in − out".
**Done when** — a staging week of payments/expenses/deposits reconciles to a hand calculation;
Warehouse cannot read the table.
**Needs** — none.

### T3-08 · Equipment form: one page, seven sections            status: todo · size: S · lane C
**What** — Remove the five-step mode from `EquipmentRecordEditor` (`wizardMode`, ~line 69 and its
render branches); keep the seven section anchors and jump links.
**Why** — D19; closes OPEN_DECISIONS §19.
**Where** — `src/components/records/EquipmentRecordEditor.tsx` and its tests.
**Database** — none.
**Done when** — no wizard toggle; all seven sections reachable by anchor at 375 / 820 / 1440; tests
updated.
**Needs** — none.

### T3-09 · Structure-priced bookings reproduce on the invoice            status: todo · size: S · lane C
**What** — Verify on staging that a booking priced with a pricing structure (0160) stores its line
breakdown (0168) and that the invoice shows the same figures; fix any drift.
**Why** — OPEN_DECISIONS §11 G3 (blocks cutover: Babin's "Babin Daily", "Days wise discount" and
other structures come from Booqable).
**Where** — `src/lib/pricingStructures.ts`, `create_booking`, `0168_booking_line_totals_and_breakdown.sql`,
invoice creation.
**Database** — none expected.
**Done when** — three structure-priced bookings invoice to the paisa of their quote.
**Needs** — Batch 1 on staging.

### T3-10 · After-hours line            status: todo · size: S · lane C
**What** — Add a service product "After-hours handover" (no fixed price; staff type the amount) so
staff can add the charge in two taps when they decide to (D7). No automatic surcharge.
**Why** — D7 (§4.64d).
**Where** — products seed for the live catalogue (via the app, not a migration), New Rental service lines.
**Database** — none.
**Done when** — the line can be added, priced and invoiced; Warehouse cannot see its price.
**Needs** — none.

### T3-11 · Late fee — acceptance only            status: todo · size: S · lane C
**What** — Confirm on staging: Return suggests the fee (≤ 30 min free · < 2 h half day · ≥ 2 h full
day); staff apply; a waiver needs Manager or Owner approval (D6 — unchanged).
**Why** — D6.
**Where** — `src/lib/lateFee.ts`, `ReturnWorkspace.tsx`.
**Database** — none.
**Done when** — three returns (20 min, 90 min, 3 h late) produce 0, half and full day.
**Needs** — Batch 1 on staging.

### T3-12 · Paste a WhatsApp gear list            status: todo · size: M · lane C · [go-live]
**What** — In New Rental, "Paste list": staff paste the client's WhatsApp text ("FX3 x2, 24-70 GM,
2 Aputure 600x, V-mount x6 …"). The app splits it into lines, reads quantities, and suggests the
best product or bundle match for each line with a confidence mark; unmatched lines stay visible.
**Nothing is added until staff confirm** (W9) — one "Add all matched" tap, or line by line. Matching
is plain text search over product names, aliases and asset codes (no AI service — Law 16); staff
corrections are saved as aliases so the next paste matches better.
**Why** — W1, W9 (most bookings arrive on WhatsApp).
**Where** — `src/modules/rentals/NewRental.tsx`, `src/modules/rentals/booking/AddItemPanel.tsx`, new
`src/lib/gearListParser.ts` (pure, tested), product alias storage.
**Database** — migration (claim a number) only if a `product_aliases` table is needed; otherwise none.
**Build notes** — read the pasted text → show a preview with a result per line
(matched · several matches, pick one · not found) → add only what the person confirms, in one write.
Unmatched lines stay visible; nothing is added half-way.
**Done when** — the parser has tests for 20 real-shaped lists (quantities before/after, "x2", "2pcs",
Nepali digits, emoji bullets); 80%+ of lines in the samples auto-match; nothing is added without the
confirm tap; Warehouse sees no prices in the preview.
**Needs** — none.

### T3-13 · Fully booked → similar item or sub-rent            status: todo · size: M · lane C · [go-live]
**What** — When a product has no free unit for the dates, New Rental shows **both** (W10): "Similar
we own — free" (same category and type, e.g. another 24-70 lens) and "Sub-rent from a partner"
(opens the sub-rental line flow with the partner list). Staff choose. The booked item itself stays
blocked (27 Jul hard block).
**Why** — W10, W69 (sub-renting a few times a month).
**Where** — `AddItemPanel.tsx`, `src/lib/availability.ts`, `src/actions/subrentals/createSubRental.ts`,
product "similar" grouping (category + subcategory, or a manual "similar to" link on the product).
**Database** — none expected; a manual "similar to" link needs a migration (claim a number).
**Done when** — a fully booked FX3 offers the free similar camera and the sub-rent path in one tap
each; the sub-rent line carries supplier and cost (money roles only).
**Needs** — none.

### T3-14 · Draft invoice at Confirm, number on full payment            status: doing · size: L · lane C · [go-live]
**What** — 1) **Confirm creates a Draft invoice** (no number) for the booking automatically (W15).
2) While Draft it **follows the booking** — line, date, discount, crew, delivery, late-fee and damage
changes regenerate its lines and totals (same engine as the booking; Law 1). 3) It gets its **final
number only when it is fully paid** (W16) — the payment that clears the balance calls the existing
`issue_invoice` RPC (0108) in the same transaction. 4) After a number exists, **changes are blocked
with a clear message until the accountant's answer (O-14)** decides between a second invoice and a
credit note. **Before this ships, the accountant confirms VAT timing (O-17):** VAT Act 2052 §6 sets the
time of a supply at the earliest of invoice, service or payment, with its own rule for part payments. If
the invoice must come earlier than full payment, the numbering moment becomes one setting (Settings ▸
Financial ▸ "Number the invoice at: full payment · first payment or handover, whichever comes first").
The numbering step ships only after the accountant's answer.
5) A booking without an advance stays a Quote with no hold, or staff may Confirm with a
visible "advance not paid" warning (W82, W86 — the 21 Jul soft gate). Payments recorded before the
number go against the booking/Draft as today.
**Why** — W15, W16, W82, W86; removes the by-hand "Create Invoice" step (R-39).
**Where** — `src/actions/rentals/confirmRental.ts`, `src/actions/finance/createInvoice.ts`,
`src/actions/finance/recordPayment.ts`, `0096_create_invoice_rpc.sql` and `0108_issue_invoice_rpc.sql`
successors, `BookingDetail.tsx` money tab.
**Database** — migration (claim a number): create-draft-on-confirm inside the confirm transition;
draft re-sync function; issue-on-full-payment inside the payment RPC; lifecycle steps "confirm makes
one draft", "draft follows an extension", "full payment numbers it once (monotonic, Law 7)", "a paid
invoice refuses silent edits".
**Done when** — on staging: confirm → draft exists; extend → draft totals follow; pay in full →
number minted once; Close works with no by-hand invoice step; Warehouse sees none of it.
**Needs** — accountant answers O-14 (step 4) and O-17 (numbering moment); build steps 1–3 and 5 first.

### T3-15 · Payment method default            status: todo · size: S · lane C · [go-live]
**What** — Record Payment preselects **the method this client used last** (L2); a new client gets no
preselection and four large one-tap method buttons (Cash · Bank transfer · Fonepay · eSewa/Khalti).
Keep the bank account default for Bank transfer (R-39 D3).
**Why** — W13 "mix"; L2.
**Where** — `src/modules/finance/modals/RecordPaymentModal.tsx`, `src/lib/queries/finance.ts`.
**Database** — none.
**Done when** — a repeat client opens on their last method; a new client opens with none selected;
tap count ≤ 4 from Booking Detail.
**Needs** — none.

### T3-16 · Share documents in one tap            status: todo · size: M · lane C · [go-live]
**What** — On every quote, invoice, receipt and agreement: **Share** → WhatsApp (PDF through the
phone's share sheet, or wa.me with a text summary when sharing a file is not possible), **Email**
(through T5-03, from `@babinrentals.com`), **Print** (A4), **Copy text**. The booking confirmation is
**sent by staff** with one tap (W20), email first, WhatsApp optional.
**Why** — W19, W20.
**Where** — `src/modules/rentals/actions/QuoteActionsMenu.tsx`, `InvoiceActionsMenu.tsx`,
`src/lib/pdf/*`, `src/lib/whatsapp*.ts`, T5-03 `send-email`.
**Database** — none.
**Done when** — each document reaches WhatsApp, email and the printer from an iPhone and the counter
PC in ≤ 2 taps; Warehouse cannot share a priced document.
**Needs** — T5-03 for email; T3-06 for the document contents.

### T3-17 · Extend in two taps            status: todo · size: S · lane C · [go-live]
**What** — "Extend" on Booking Detail and on a late return: pick the new return (chips +1 day,
+2 days, custom); availability is checked; a clash offers similar/sub-rent (T3-13). Price of the
extra days: **two one-tap choices every time** — "Same rate and discount as the booking" or
"Standard rate" (W41). Any desk staff may extend (W40 — already `rental.extend` for booking-desk
roles). Uses the existing `extend_booking` RPC; the Draft invoice follows (T3-14).
**Why** — W36, W40, W41.
**Where** — `src/actions/rentals/extendRental.ts`, `BookingDetail.tsx`, `ReturnWorkspace.tsx` (late case).
**Database** — none expected (L23 covers `extend_booking`); add a lifecycle step for the standard-rate
option if it needs a new parameter.
**Done when** — extend +1 day in ≤ 3 taps; both price choices produce the right totals; a clash
never double-books.
**Needs** — T3-13 for the clash options.

### T3-18 · Change a confirmed booking            status: todo · size: L · lane C · [go-live]
**What** — **Any desk staff** may change items and dates after Confirm (W88): before Pack — add,
remove or swap lines and move dates, with reservations updated in the same transaction; after Pack
— removing an item asks Warehouse to unpack it (a floor session); after Handover — **"Add gear"
asks staff to choose: add to this booking, or start a new booking linked to it** (W87). Every
change is audited and the Draft invoice follows (T3-14).
**Why** — W87, W88. Today `update_rental_quote` (0147) is quote-only and `extend_booking` only moves
the return date.
**Where** — new action `src/actions/rentals/changeBooking.ts`, `BookingDetail.tsx`, `NewRental.tsx`
(edit mode), `src/lib/rbac.ts`.
**Database** — migration (claim a number): `change_booking(jsonb)` RPC (atomic, revision-locked,
GiST-checked), linked-booking column; lifecycle steps "a change can never double-book", "a packed
unit cannot be silently removed", "linked booking carries the parent id". PERMISSIONS §4 new
capability `rental.change` for booking-desk roles, same commit (B-3).
**Build notes** — keep the draft apart from the saved booking; Save is disabled
while saving; if someone else changed the booking since it was opened, say so and show what changed
instead of overwriting it.
**Done when** — the three cases work on staging with two devices; no double booking; audit rows exist.
**Needs** — T3-14.

### T3-19 · Add gear by scanning in New Rental            status: todo · size: S · lane C · [soon]
**What** — In New Rental, scanning an item's QR/asset code (camera or Bluetooth) adds that product —
and reserves that exact unit if it is free — in one action (W8).
**Why** — W8.
**Where** — `AddItemPanel.tsx`, `src/lib/scannerLookup.ts`.
**Database** — none.
**Build notes** — same scanner rules as T2-14 — never debounce, ignore a repeat of
the same code within ⭐ 1.5 s, server check per code.
**Done when** — scan → line added with that unit; a booked unit says who has it and offers T3-13.
**Needs** — T2-14 (shared scan lookup).

### T3-20 · Who owes            status: todo · size: M · lane C · [go-live]
**What** — Finance ▸ **Who owes**: one list of clients with unpaid balances, oldest first, with age
(days since completion), amount, last reminder sent, "Paused" flag; tap → the client's **statement**
(PDF: every open invoice and booking balance, payments so far) to share (T3-16). Many production
houses pay on credit (W14), so this is the chase screen; reminders themselves are T5-08.
**Why** — W14, W18, W91 "who paid, who owes".
**Where** — `src/modules/finance/*`, `src/lib/queries/finance.ts`, `src/lib/queries/clients.ts`,
`src/lib/pdf/*`.
**Database** — none expected (a view over invoices/payments); money roles only.
**Done when** — totals match Finance receivables to the paisa; Coordinator sees it, Warehouse cannot
open it; a statement PDF shares to WhatsApp in two taps.
**Needs** — T3-16.

### T3-21 · Find anything in one box            status: todo · size: M · lane C · [go-live]
**What** — The header search (⌘K / phone search) finds a booking by **number, client name, client
phone, collector name, item name, serial or asset code**, and shows recent items first; results
open in one tap. Today `globalSearch.ts` covers booking, client, equipment and invoice — add phone,
serial/asset code and collectors.
**Why** — W91 "finding a booking fast".
**Where** — `src/lib/queries/globalSearch.ts`, `src/components/shell/CommandPalette.tsx`,
`MobileHeaderSearch.tsx`.
**Database** — none expected; add a search index migration (claim a number) if a query is slow.
**Build notes** — search after typing pauses (~250 ms ⭐); cancel the previous
request with `AbortController` and show only the latest results; "no results", "searching" and "search
failed — retry" look different. Never apply "latest wins" to a write.
**Done when** — each of the seven keys finds the right booking in < 1 s on staging data; money never
shown to floor roles.
**Needs** — none.

### T3-22 · Availability in two taps            status: todo · size: S · lane C · [go-live]
**What** — From anywhere: tap **Availability** (header) → type or scan an item → see free units for
any dates, the next free date, and **who has it now** (from T2-14). Reuses `CheckAvailabilityModal`.
**Why** — W91 "checking what's available".
**Where** — `src/components/ui/CheckAvailabilityModal.tsx`, `src/lib/availability.ts`, shell header.
**Database** — none.
**Done when** — ≤ 2 taps to an answer from any screen; matches New Rental's availability exactly.
**Needs** — T2-14.

### T3-23 · Monthly pack for the accountant            status: todo · size: M · lane C · [soon]
**What** — Finance ▸ Reports ▸ **Monthly pack**: pick a Nepali month (or AD month) → one zip with the
**Sales/VAT register** (standard and non-VAT sections, T3-04), **payments and refunds**, **expenses
with bill photos**, **crew payouts with TDS** (T8-08), as CSV + PDF, BS and AD dates. Money roles only.
**Why** — W81.
**Where** — `src/modules/reports/*`, `src/lib/csv.ts`, `src/lib/pdf/*`.
**Database** — none.
**Done when** — the accountant opens a sample pack without asking for anything else (Babin confirms).
**Needs** — T3-04, T3-24, T8-08.

### T3-24 · Quick expense with a bill photo            status: todo · size: M · lane C · [soon]
**What** — "Add expense" from a phone in ≤ 4 taps: amount, category, photo of the bill (T2-01
upload, ≤ 3 MB), paid by. Accounts can also enter a week's bills in a batch (W89 "mix"). Approval
rules unchanged (`gate.expense.approve`). Replaces "Receipt upload is not built yet" in
`Expenses.tsx`.
**Why** — W89, W81.
**Where** — `src/modules/finance/Expenses.tsx`, `src/actions/finance/*`, documents storage.
**Database** — none expected (`expenses.receipt_url` exists).
**Done when** — an expense with a photo is saved from an iPhone; the photo appears in the monthly pack.
**Needs** — T2-01.
