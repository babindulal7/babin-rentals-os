# The May page briefs — decisions that need a person (8 October 2026)

Full text of the questions summarised in [`OPEN_DECISIONS.md`](OPEN_DECISIONS.md) §12.
Recovered from the `PLAN.md` §4.61 and §4.62 entries, which were written on the old
`step1-foundation` line. This repository has no root `PLAN.md`, so they live here. The
section numbers inside are the original ones: **§4.61 = §4.64** and **§4.62 = §4.65** in
the numbering `OPEN_DECISIONS.md` uses. Nothing below is decided; nothing is built.

Source: the 34 page briefs in `D:\proects\md` (May 2026, UI only, below Foundation in
precedence), checked against the trunk on 8 Oct 2026. File and line references are to that
trunk and may have moved.

# §4.61 (= §4.64 in OPEN_DECISIONS) — five features nothing builds yet


Raised 8 Oct 2026 by checking the 34 page briefs in `D:\proects\md` (May 2026, UI-only,
below Foundation in precedence) against `step1-foundation` at `c21c1c4`. Almost everything
they describe already exists. These five do not, and each needs a product answer before it
can be built.

**Not filed, on purpose:** brief items that break a law. These are the Edit Payment page
(24, Law 4), the Delete button on Expenses (28, Law 3), "Customer" copy (20/21, Law 17), the
Deposit inside Grand Total (06, Law 5) and a "Reason for discount" field (06, Law 10). The
two items that need no ruling, a live return countdown (brief 11) and the "All times are in
Asia/Kathmandu (NPT)" note (brief 01), are not decisions either. The countdown is being built
in the same worktree by a parallel session.

### (a) Duplicate / re-book a rental (brief 02's row menu, brief 15's event panel)

Nothing duplicates a booking today. The Calendar event panel shows **Duplicate** disabled
("Duplicate needs the booking draft flow", `data/calendar.ts:1163`). An earlier
"Clone / Re-order Equipment" item sits in `src/archive/RentalMoreActionsMenu.tsx`, and nothing
renders it. R-39 (§4.57) argues for building it, because a repeat production client currently
means re-entering every line.

**Decide:** (1) what is copied: client and lines only, or also crew, transport, discount and
notes? (2) Are specific serial units carried over, or only the equipment? (3) Dates: blank,
the same dates, or the same length from a new start? (4) Prices: today's rate card, or the
original booking's rates? (5) What it creates. A Quote writes no reservation (R-26, §4.53),
and it gets a new number and a new `client_uuid` (Law 8).

### (b) VAT-inclusive pricing (brief 06's Tax Panel, brief 07)

VAT is on or off (`VatToggle`, `booking/RentalFinancialRail.tsx:401`). `money.ts:price()`
always adds VAT on top (`vat = taxable × rate`, `rentalTotal = taxable + vat`). A rate quoted
VAT-inclusive therefore cannot be entered unless staff divide by 1.13 by hand.

**Decide:** (1) Are any rates quoted VAT-inclusive, and to whom? (2) If so, is that set per
booking, per client or per rate-card line? (3) Back-calculated VAT has to round somewhere,
which lands on §4.42(b) (paisa or whole rupee). That one should be ruled first.

### (c) Reschedule a delivery (brief 25), and the Delivery workspace is not on the database

A delivery can be marked `Failed` but not moved. The Calendar shows **Move / Drag** disabled
("Drag-to-reschedule is not wired yet", `data/calendar.ts:1164`), and `lib/whatsappTemplates.ts`
has no reschedule message.

**Found while checking, and more serious than the missing button:** `/operations/delivery`
(`DeliveryWorkspace.tsx`) reads and writes the browser's `localStorage`
(`babin_rentals_deliveries_v1`, `lib/queries/delivery.ts:139`). On first load it is seeded
from the hard-coded `INITIAL_DELIVERIES` (`DEL-2601`, "Himalayan Films Pvt. Ltd.", driver
"Suman Rai" and so on). Assign Rider, Start Delivery and Mark Delivered never reach Supabase,
two devices see two different lists, and the seed rows are fabricated records on a routed
screen. A reschedule cannot be built on top of that.

**Decide:** (1) Where does a delivery live: `booking_transport` (the one transport row
`createRental` already writes, §4.58), or a table of its own? (2) Who may reschedule, and
does the client get a WhatsApp? (3) Does a new slot move the booking's `pickup_at` /
`return_at`, and so its availability window, or only the delivery time?

### (d) A late / night charge at booking time (brief 06's Additional Charges)

Late fees exist only at Return (`lib/lateFee.ts`, `money.ts:lateFee()`). Nothing prices an
after-hours handover or a night call when the booking is made.

**Decide:** (1) Is a Service or Manual line (already priced by `price()`) enough, or is this a
rule, for example handover after a set hour adds a set amount? (2) If it is a rule: fixed or
percentage, set where, and is it discountable and VAT-able?

### (e) Depreciation Reserve on Reports (brief 29)

The method is ruled: straight line, per-category lives, 10% residual (§4.4). `depreciation_logs`
exists (`0004`). The per-category **lives were never supplied**, though. Add Equipment renders
`DEPRECIATION_UNAVAILABLE_REASON` (`data/addEquipment.ts:247`, its own `TODO(decision)`), and
the Asset Register report is parked on the same columns (`reports/catalog.ts`). Until then, a
reserve card would be a fabricated figure (Law 16).

**Decide:** the useful life in years for each inventory category, from Babin's accountant or
the IRD pool rates. Nothing else blocks it.


---

# §4.62 (= §4.65 in OPEN_DECISIONS) — three more gaps, each blocked on a ruling


Raised 8 Oct 2026, alongside §4.61, from the same check of `D:\proects\md` against
`step1-foundation`. That session built the three items that needed no ruling: Fonepay as a
payment method, the live return countdown, and **Create & add another** on Add Client / Add
Equipment (PROGRESS.md, 8 Oct). It did not build these three, because each one is a product
call.

### (a) Reset: show which units are needed next (brief 14, "show next booking conflict if item is needed soon")

§4.31(3) removed Reset's hand-set `demand` / `vip` / `rush` flags, because none of them had a
column behind it. `data/reset.ts:148–169` records the honest way back if prioritisation is
wanted: derive it from the next booking's pickup (`queue entry → product_units.id →
inventory_reservations.asset_id → bookings.pickup_at`), with no new column and never a
hand-set flag. Nothing builds it today, so a unit due out in an hour waits in Reset like any
other.

**Decide:** (1) Is this wanted back? (2) Should it be a label only ("Needed 14:00 for B-912"),
or should it also change the queue order? (3) Does it count as "needed" only inside a window, or
should it always show the next pickup? Today's "Due Soon" flag was left underived for exactly
this reason (`data/today.ts`, `toMovementRow` note: no spec states how soon is soon). If a
window, how long?

### (b) Handover: a manager override for gates that have not passed (brief 10)

Brief 10 says "do not allow handover if required checks are incomplete unless admin override".
Today gates 3 and 4 (payment, deposit) are cleared by a money-sighted role pressing **Mark
cleared**, and R-06's money override with a named reason is real and recorded. Gate 1
(**Receiver Verified**: government ID and booking authorization) has no override at all.
`HandoverWorkspace.tsx:89` and `OVERRIDE_UNAVAILABLE` (`:824`) refuse it on purpose: "no rule
defines who may override a session gate, and no action records the approver".

**Decide:** (1) May anyone hand gear to a receiver whose ID was not checked? If not, this
stays closed and the brief is answered. (2) If yes, which roles may do it (P-laws:
`docs/PERMISSIONS.md` §6 approval gates), is the approver a second person or the operator,
and is a reason required? (3) Where is it recorded: a column on the handover session, or an
`audit_log` row only?

### (c) A document held as the deposit (brief 07: "Deposit type: cash / cheque / bank / document")

Kathmandu rental houses often hold a citizenship card, passport or licence instead of, or as
well as, a money deposit. The OS has no way to record that. Law 5 makes a deposit a money
liability (never in Rental Total, never a payment), and a held passport is not money, so it
cannot go in `deposit_required` or the deposit ledger.

**Decide:** (1) Is it recorded at all? (2) If so, it should be its own record (type, number,
photo, received by, held where), not a deposit row. Does it satisfy Handover gate 4 on its
own, or only alongside money? (3) Its terminal action (Law 3): "Returned to client" with who
and when, and is return of the document a Return/Close gate? (4) Who may see the ID photo and
for how long. This is PII; §4.32(b) evidence retention is still unresolved, and Warehouse
sees no money but would see this.

