# Rulings — 14 October 2026 — Record Payment default invoice (build-time, PERMISSIONS.md §15)

Branch `claude/payment-no-wrong-client-default`. No permission, schema, migration, gate or
payment-write change: what changes is which invoice the Record Payment dialog has chosen when it
opens. Logged here, in `PROGRESS.md` under *Ruled*, and as `RULING 2026-10-14:` comments in
`RecordPaymentModal.tsx` and `RentalsList.tsx` (B-2). Flip by row number.

| # | Ruling | Why | Revert |
|---|---|---|---|
| P14-1 | The dialog preselects an invoice only when the choice is unambiguous: the caller names one, there is only one, or every offered invoice belongs to one booking. Otherwise the picker opens on "Select an invoice…" with the amount empty, and the existing "Please select an invoice." refusal applies. | Seen in the browser on 14 Oct: Rentals list, rental #903 (Lumbini Rentals) selected → More → Record Payment opened on INV-91 for Dhaulagiri Weddings with Rs 33,448 typed in, one press from an immutable payment. The R-39 D1/D2 prefill (19 Sep) assumed the list was one booking's; on the Rentals list, the Payments page and Finance's generic launcher it is every client's payable invoices. A wrong money default is worse than none (B-1, payments are immutable). | `defaultInvoiceId` returns `initialInvoiceId \|\| invoices[0]?.id \|\| ''`. |
| P14-2 | On the Rentals list, with exactly one rental selected, that rental's own payable invoice is the default (amount = its outstanding). | Keeps R-39's fewest-taps intent where the choice IS known: select → More → Record Payment → Confirm = 4 taps, 0 typed fields, within the ≤ 4 budget. | Remove the `initialInvoiceId` prop on the list's `<RecordPaymentModal>`. |

Booking Detail is unchanged: its invoices all belong to the booking, so the first owed invoice is
still preselected (2 taps from the booking to a recorded payment, measured 14 Oct).
