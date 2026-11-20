# T2-23 — Per-product overbooking: design for review

**Status: PRE-MERGE DRAFT — reconciliation required.** Local main `44300a17` already contains T2-21 (PR #170) and T3-13 (PR #182), and `feat/windows-t2-23-product-overbooking` is an existing active implementation checkout. This older draft is review input, not the current implementation or proof of acceptance. Inspect those changes and obtain the required review before further coding. This note makes no live changes and is not an implementation approval.

## Invariant and default

B12/K4 allow a product to be confirmed beyond available stock only when its product-level switch is on. The excess is an explicit short quantity, never a reservation or a duplicated physical unit. The GiST exclusion constraint remains in force. `products.allow_overbooking` defaults to false for existing and new products, so an untouched account retains current behavior. Owner, Admin and Manager may change it through the equipment form and bulk edit, subject to existing database permissions. Remove the browser-local rule and any unconditional allow fallback only after all consumers use the database value.

## Database design and concurrency

After dependencies are merged, claim a migration number before SQL. Add the flag and a non-negative, database-maintained short quantity on booking lines. Confirm and hold conversion determine available capacity under the same transaction and locking discipline as T2-21; reserve only the actually available units/quantity, record the short remainder, and audit the confirmation. Ensure concurrent confirms cannot both claim the same capacity and that a disabled switch fails closed without creating partial lines or reservations. Use the latest deployed definitions of `create_booking`, `confirm_booking_atomic` and stage transitions rather than assuming migration 0188 is still authoritative. Keep active holds, downtime and released reservations in the same capacity calculation. Do not weaken GiST or accept a client-supplied assertion that a shortage is covered.

Existing confirmed bookings, historical reservations and payments must not be rewritten by rollout or by switching the flag. A shortage is cleared only by a durable, authorized replacement or sub-rent outcome linked to the affected line; distinguish a proposed choice from a confirmed covering quantity, make retry/idempotency safe, and retain audit history. Pack's database gate must refuse while any required quantity remains short, even if a stale UI enables its button. Decide the exact linkage and atomic update with the reviewed T3-13 implementation; never erase a short merely because the dialog was opened.

## Client behavior and permissions

`src/lib/availability.ts` and `availabilityEvaluation.ts` should calculate/display the same free versus short quantities as Postgres; the server result remains authoritative. Booking detail, booking list and Today show the shortage and actionable similar-item/sub-rent choices to desk and Warehouse, without disclosing supplier cost or prices to money-blind roles. Remove localStorage's device-only switch and the permissive no-op in `AddItemPanel.tsx`; include existing settings/migration users so old cached values cannot influence behavior. Product editing uses existing role checks and database policy; any changed permission cell must follow the permission matrix and its fixture.

## Required proof before ready

- With the switch off, a request past stock is refused with no partial write. With it on, requesting three when two are free confirms exactly two reserved and one short; repeat confirm/holds and race two simultaneous bookings, demonstrating no duplicate allocation and no invented stock.
- Lifecycle proof that Pack rejects the uncovered short; confirmed sub-rent or replacement covers the right quantity, clears the short once and permits Pack. Verify only actual coverage changes the remainder and audit history remains. Test quantity and serialized equipment, downtime, expiration, legacy bookings and flag toggling.
- Test Owner/Manager product and bulk edits; Warehouse and desk Today/booking views; ensure cost is absent from money-blind DOM and payload. Run PGlite and lifecycle together, every card gate, and the 375/820/1440 screen check. No live migration application.

**Review needed:** Claude/Babin should review the capacity locking, coverage-link and Pack-gate design after T2-21/T3-13 merge, before implementation. Do not assume the existing sub-rent UI is a confirmed coverage record.

## Review of the implementation at 7fb24785 & Remediation in 0246

Migration 0244 previously cleared the booking line’s entire `short_quantity` when an overbooking risk was marked resolved, even with mere textual notes without durable coverage.

**Remediation implemented in Migration 0246 & Lifecycle Steps L87–L89:**
1. **Renumbered migration to 0246**: Resolves collision with 0244 (`counter_sale`) and 0245 (`booking_site_and_public_catalogue`).
2. **Strict coverage requirement in `resolve_booking_at_risk`**:
   - The RPC inspects actual active sub-rental lines (`line_type in ('Sub-rental', 'sub_rental', 'sub-rental')`) on the booking, or accepts a verified `covering_qty` parameter.
   - If resolving with notes alone without active sub-rental lines or explicit `covering_qty`, `short_quantity` is NOT reduced and `resolved_at` remains NULL.
   - If partial coverage is provided (e.g., short is 2, covering is 1), `short_quantity` reduces only by the covered amount to 1, leaving the risk unresolved and Pack refused.
   - Only when `short_quantity` reaches 0 is `resolved_at` set and Pack allowed.
3. **Lifecycle step L89 explicitly asserts**:
   - Step 3a: Attempting resolution with notes only without coverage leaves `resolved: false` and `short_quantity = 1`.
   - Step 3b: Pack attempt is STILL refused with `gate.pack.shortage`.
   - Step 3c: Providing durable sub-rent coverage (`covering_qty: 1`) clears `short_quantity` to 0, sets `resolved_at`, and allows Pack to succeed.
