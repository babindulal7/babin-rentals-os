# T3-13 supplier repair status

**Open; not verified or ready to merge.** The owner requested manually entered supplier names. The earlier preset partner roster and rate defaults must not be presented as real data.

The current T3-13 draft includes a manual-name modal, but `BookingLineDraft` and the New Rental submit path do not carry a durable supplier name into the booking. The database currently has a supplier ID foreign key and supplier cost; manual text needs a durable, explicitly validated database contract, and the create, edit, snapshot and draft paths must all preserve it. The money-blind database and client boundaries must continue to exclude supplier cost. Existing confirmed-booking edits and supplier IDs must not be erased. A supplier name embedded in display text or a fake partner record is not a substitute.

The preserved containment draft refuses sub-rental saves and removes parts of the existing picker. It has not been certified and is not a complete implementation. Its broad refusal would also affect edits of existing bookings and needs review. The T2-23 lane has overlapping picker files in its open card, so do not replace those files; coordinate integration after that lane's changes are available.

The worktree predates newer main migrations and T3-31. Reconcile against current main and the migration ledger before claiming a migration number; the unrelated invoice worktree's draft `0244` conflicts with the counter-sale migration and must never be applied. Test creation, draft restoration, quote/confirmed edit, retries, role masking, partner input, amount validation and database lifecycle on the final integration source. Staging and device acceptance remain outstanding.
