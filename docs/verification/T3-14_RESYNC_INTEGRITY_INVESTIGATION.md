# T3-14 draft-invoice resynchronization investigation

Status: **unresolved; no migration written or applied**. Investigated against main `44300a17`.

`resync_draft_invoice` in migration 0200 deletes every invoice line and rebuilds lines from booking, crew and transport records. Any independently appended line can disappear. A row referenced by `charges.invoice_line_id` instead causes a foreign-key failure, rolling back the enclosing change. The function also retains the draft's old discount and VAT header although `change_booking` updates booking discounts before calling it.

A line's category is not a safe source identifier: the `line_kind` enum contains only equipment, sub-rental, services, crew and transport. The 0239 consumable flow adds an `Equipment Rental` line with a fresh random invoice UUID; 0200 also generates fresh random IDs. Neither identifies the booking source. Filtering by line kind or naively matching descriptions could retain duplicates or delete unrelated charges. The existing reconciliation is not made safe by an invoice being a draft.

A blanket refusal to resync any nonempty draft would protect data but block ordinary confirmed-booking edits and extensions. A correct repair should establish durable source identity for each automatically generated line, preserve independent line IDs and charge references, serialize the invoice and source changes, and handle 0239's consumable append. Existing rows require a strictly unambiguous, auditable reconciliation with ambiguous rows explicitly held for review. Header changes must use the established discount and tax rules, including treatment, and totals must be recomputed through canonical database functions. Add database lifecycle tests covering duplicate-shaped lines, legacy ambiguity, charge FKs, consumables, changed discounts/VAT, retries and concurrency. This is design guidance, not a verified implementation.

Accountant confirmation of O-17 remains required before shipping any change to invoice numbering timing. Existing application behavior and local database were not changed by this investigation. No hosted action was taken.
