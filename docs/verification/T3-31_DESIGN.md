# T3-31 counter sale — design for review

**Status: proposed; not implemented.** Review before code, per the card prompt. Invoice numbering remains subject to accountant confirmation of VAT timing. T3-14 invoice integrity and T3-30 staging acceptance remain dependencies.

## Choice and boundaries

Prefer a booking with an explicit, database-enforced counter-sale kind over a separate sales table: invoices and payments already reference bookings. A distinct sales table would require expanding those financial relationships and all related reporting. This is an engineering proposal for review, not a new product ruling. Existing bookings default to rental and keep their existing custody and reservation behavior. A sale must not be made by merely moving a rental through custody stages.

## Transaction and permissions

`create_counter_sale` should validate the actor and branch server-side, accept only active consumables and positive integer quantities, lock products in stable order, reject insufficient stock, calculate prices on the server in integer paisa, and atomically create the sale, stock movements and one numberless draft invoice. A unique client UUID and transactional retry return the original result without a second stock deduction or invoice. Failure rolls back all three. Floor callers receive only non-money results; money fields and financial tables remain protected by database permissions. Desk payment uses existing immutable payment and closing paths.

Before any payment, a named cancellation transaction must lock the sale, verify payment state, record the cancellation and compensating stock movements exactly once, and invalidate its draft invoice without deleting history. Concurrent payment and cancellation must serialize. Cancellation after payment is refused until an explicitly ruled financial correction workflow exists. The draft and finalized invoice flows must preserve invoice and payment history; never silently renumber or overwrite an issued invoice.

## Application

An action validates input and calls the atomic RPC; a small `src/lib` module handles sale draft validation and display state, not financial recomputation. Today and New Rental expose the entry point. Floor users select items and quantities without prices; the desk handles payment. The screen needs loading, empty, error, restricted and offline states, and must never report a queued or partial sale as complete.

## Required proof

PGlite and lifecycle checks must prove: three units deducted once on create and retry; exactly one draft; rollback on invalid line or insufficient stock; concurrent attempts cannot oversell; no rental reservation or custody stage is created; cancellation restores stock once; cancellation/payment races cannot both succeed; floor roles cannot read prices or invoice/payment data; desk payment appears once in closing; numbered invoice behavior follows the accountant-approved timing. Verify existing rentals and reservations unchanged. Drive the screen at required widths and roles and record tap counts. This note alone does not certify implementation or staging acceptance.
