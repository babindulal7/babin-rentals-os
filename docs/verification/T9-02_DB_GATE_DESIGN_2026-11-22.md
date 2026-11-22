# T9-02 — Booqable external holds: database-first implementation design

**Date:** 2026-11-22. **Base:** main at `772c62614dbaf3adc1d38ef5e17740cd95e4e013`. **Status:** DRAFT / NOT VERIFIED / HOLD; no live or staging changes.

## Evidence behind this repair

- Merged PR #202 introduced `src/lib/externalHolds.ts` and five pure tests only. There is no database migration named `0206_external_holds.sql` — current 0206 is delivery route map pins.
- The booked inventory arbiter is `public.inventory_reservations`: serial GiST exclusion and quantity capacity triggers. `0188` adds active/confirmed reservation states, `0240` adds turnaround windows, `0252` adds shortage behavior, and `0253` modifies capacity for temporary partner stock. All these paths must remain enforced.
- Existing Booqable sync schema `0040_booqable_sync.sql` has `external_refs`, `sync_state`, `sync_inbox`, `sync_outbox`; it does not persist reservation holds or prove feeds are complete. **No integration of open Booqable rentals into the booking availability arbiter was found.**
- Original card: `docs/plans/T9_CUTOVER.md` §T9-02 and `docs/plans/prompts/T9-02.md`. Independent P1 finding: PR #316.

## Phase 1: additive SQL-only protection (migration 0261)

1. Add `external_holds`, a dedicated non-billing table, keyed by provider + external line identity, with mandatory mapped product, optional mapped serial, the raw Booqable window in `source_period` and the effective window in `period` (derived from it; see the repair below), qty, source order display number, active/completed/cancelled state, last observed timestamp and append-preserving release reason. It may **never** be interpreted as an OS booking, packed, invoiced or billed.
2. A serial-level GiST exclusion on external holds prevents external double claims of the same known physical asset. New after triggers on **both** `external_holds` and `inventory_reservations` acquire the same product row lock and evaluate active OS and Booqable stock together, to avoid simultaneous inserts escaping cross-table reads. Cross-table serial overlaps are rejected even if aggregate capacity remains.
3. Combined quantity checking uses a sweep at interval starts, exactly as the existing capacity code, with temporary partner capacity from migration 0253. This check must **not** remove, disable or weaken existing GiST, money, custody, or lifecycle rules. Overbooking permission does not bypass Booqable commitments.
4. A private `booqable_hold_feed_state` row defaults to **disabled**, to preserve current operations while integration is incomplete. When explicitly enabled by an authorized cutover process, any missing, unsuccessful, or stale successful full-sync watermark rejects new OS reservations. The maximum healthy age is deliberately `NULL` until an Owner-approved value is configured; enabled with no configured age fails closed.
5. Only service_role may write external hold rows or the feed state; staff receive a read-only, non-financial projection, filtered by their existing role. Do not embed Booqable personal, financial, or payment details.

**Important boundary:** Phase 1 alone does **not** make T9-02 Done. The Booqable full/delta importer, external-id mapping, a reconciled and complete daily sync, product/serial UI availability, calendar chips, negative RLS and reservation concurrency verification, and a real safe staging rehearsal are still missing.

## Phase 2: importer and sync transaction (Windows Antigravity)

- Reuse the Booqable bridge's existing external references and inbound queue. Normalize each open/upcoming Booqable order line to an explicit local product/asset mapping. Do not silently map unmapped records or collapse several serial units to one order line; duplicates must be idempotent by source line.
- Stage the **whole** fetched dataset for validation (pagination completeness, date/time, mapping, status and expected count); on error, set feed unhealthy in an independent transaction and leave prior active holds intact. Never release old holds after a partial page or failed pull.
- Apply the validated snapshot transactionally with deterministic product locks. If a Booqable promise overlaps a pre-existing OS commitment, report and fail closed, not silently skip that promise. Release only on authoritative returned/cancelled/closed source state, with a reason and retained row; never delete.
- Refresh per the agreed 07:00 Kathmandu trial schedule, maintain health/failure evidence, and stop only at an owner-approved cutover end. Source credentials stay exclusively in server secrets.
- A row with an unknown mapping must block go-live/availability. Existing text-only `syncExternalHolds()` is not a durable substitute for importing.

## Phase 3: UI and query integration

- Query the new read-only holds alongside OS reservations in `src/lib/queries/availability.ts`, `src/lib/queries/productAvailability.ts`, New Rental and Calendar; display exactly `Held in Booqable #<number>`, visually neutral, never as gold/external gear.
- Block both **availability display** and **database confirmation**. If source feed is unhealthy or stale, display explicit `Availability needs Booqable sync` and block confirmation; no optimistic 'available' or silent background retry.
- Serial-aware matching when source serial is mapped; quantity consumption otherwise. All half-open ranges/turnaround adjustments must match `get_effective_rental_window`.

## Required negative and concurrency acceptance before merging

- Two sessions: simultaneous Booqable hold insert vs OS serial reservation on same asset/time — **one must roll back**; neither may silently double-book.
- Quantity: available 2, existing OS qty 1, external qty 1, next OS qty 1 — reject. Staggered nonoverlapping intervals — allow. Two external lines over the same window must count additively. Unknown serial holds must consume product capacity.
- Different serials that fit overall capacity — allow. Same serial — reject even with spare capacity. Partner units only inside their agreement period. Half-open touching endpoints pass where turnaround rules permit.
- A healthy full sync that receives an explicitly completed/returned order releases that one line; failed/partial sync preserves every active hold. Historical rows remain.
- Authenticated floor/client users cannot insert/update/delete feed or hold rows; service_role writes only with source validation and idempotency keys. No prices or client PII exposed.
- When feed enabled with missing/expired healthy watermark, all new OS reservations fail closed. When disabled with no holds, prior behavior remains unchanged.
- Counterexamples for `create_booking`, `confirm_booking_atomic`, direct stage transitions, `create_or_extend_hold`, changes/extensions, cancellation and returns; ensure core GiST and shortage gates remain intact.
- Complete `npm run check:pglite` **and** `npm run check:lifecycle` in the same run; run all 17 required local gates and exact-head Mac CI. Do not claim these were run here.

## Phase 1 Verification Results (2026-11-22)

- `npm run check:pglite`: PASS (259/259 migrations applied cleanly, 0 failed, 239 definer functions search-path pinned, 46 views safe from `anon`).
- `npm run test:external-holds-db-gate`: PASS (21/21 assertions green):
  1. External hold on serial asset blocks overlapping OS reservation (`GATE:booqable_serial_held`).
  2. Pre-existing OS reservation blocks overlapping external hold (`GATE:booqable_serial_held`).
  3. Distinct serials within capacity both succeed.
  4. Unassigned external hold of 2 units exhausts serialized product capacity; OS reservation fails with `GATE:booqable_capacity_held`.
  5. Combined Booqable + OS quantity hold exhausts total capacity (5); subsequent OS reservation fails with `GATE:booqable_capacity_held`.
  6. Reverse: New external hold exceeding capacity is refused with `GATE:booqable_capacity_held`.
  7. Contiguous touching windows [16-18) and [18-20) both succeed with full capacity (half-open boundaries).
  8a. Inside partner window (0253): combined capacity 7 accommodates 4 Booqable + 3 OS.
  8b. Outside partner window: partner stock is inactive; combined 4 Booqable + 2 OS fails capacity.
  9a. Cancelling external hold with short reason (<10 chars) violates check constraint.
  9b. Authoritative cancellation frees unit; OS reservation now succeeds.
  10a. Law 3: Hard delete on `external_holds` is refused by trigger.
  10b. Law 3: Hard delete on `booqable_hold_feed_state` is refused by trigger.
  11a. Enabled + Unhealthy Booqable feed blocks OS reservations with `GATE:booqable_feed_unhealthy`.
  11b. Enabled + Unconfigured maximum_healthy_age fails closed with `GATE:booqable_feed_unhealthy`.
  11c. Enabled + Stale sync past maximum_healthy_age fails closed with `GATE:booqable_feed_unhealthy`.
  11d. Enabled + Healthy and Fresh sync allows normal OS reservation.
  12a. Authenticated user (Coordinator) cannot INSERT into `external_holds`.
  12b. Authenticated user cannot UPDATE `booqable_hold_feed_state`.
  12c. Warehouse staff can SELECT projection from `external_holds`.
  12d. Anon is denied all access to `external_holds`.
- `npm run check:lifecycle`: PASS (99/99 steps green, including step L98).

## Repair: P1 turnaround normalization and idempotency (2026-11-22)

Review P1 on PR #323: external holds were compared as supplied, without the 0240 turnaround window that OS reservations use. A 18:00 Booqable return with 120 minutes of cleaning did not block a 19:00 OS pickup.

- **Normalization.** `normalize_external_hold_window()` derives `period` from `source_period` (the raw Booqable window) by calling `get_effective_rental_window()` with the product's prep and cleaning minutes. It re-implements no formula.
- **Idempotent.** The first version recomputed `period` from the stored value on every write that touched `status` or `product_id`, so a re-sync widened the hold again. Now `period` is derived only when its inputs change: a new line, a re-mapped product, or a re-activation. A released hold keeps its window.
- **Callers cannot set `period`.** Any direct write to it is overwritten by the trigger.
- **Verified in PGlite:** `npm run test:external-holds-db-gate` passes 48 of 48 (sections 1 to 26; the header of `scripts/test-external-holds-db-gate.mjs` lists them). Test 14a failed before the first fix and passes after it.
- **Verified on PostgreSQL 17.12:** `npm run test:external-holds-concurrency` passes 10 of 10. It runs real connections in both write orders on one serial, the two-waiter quantity race, two holds on one serial, rollback, disjoint windows, and a control with the guard disabled, which double-books. Each waiting case checks that the blocked session is waiting on a lock before the first transaction commits.
- **Lock order changed.** Reservations and holds now take the product row lock in a BEFORE trigger, before the foreign-key check. Without it, two concurrent claims on one quantity product deadlocked (`40P01`) instead of being refused. The same deadlock occurs on main's schema without 0261, checked on migrations through `0260`. The change touches every reservation write, so it needs the owner's review before merge.

Not verified here, and still required before T9-02 can be accepted:

- **End-to-end counterexamples** through `create_booking`, `confirm_booking_atomic`, stage transitions, `create_or_extend_hold`, changes, extensions and returns. The gate is a table trigger on `inventory_reservations`, so every writer is covered by construction. No test yet drives those paths.
- **Importer.** Idempotent upsert by source line, staged validation, failed or partial pulls that keep every active hold, and the daily 07:00 refresh are not in this change.
- **UI.** The "Held in Booqable #…" chip, availability and calendar are not wired. `src/lib/externalHolds.ts` is not used by the app and uses inclusive boundaries, which differ from the database. It must be replaced by the database-derived `period` before anything uses it.
- **Owner decision.** The maximum healthy sync age has no default. Enabling cutover protection without one fails closed (test 11b).

## Unresolved decisions / dependencies

- **Owner decision needed before activation (O-31 in `docs/OPEN_DECISIONS.md`):** acceptable maximum age of successful Booqable sync, scope of sync health (global vs branch), exact release timing after return, and incident fallback procedure. Conservative default is **disabled**, and activation without a configured freshness limit is rejected.
- T9-01 catalogue/client reconciliation is itself acceptance pending. No source import should be considered accepted until actual OS mapping and prices are verified.
- Staging data writes, migrations, service-role integration and trial activation require explicit separately scoped owner approval. This document authorizes none.

## Lane split

**Windows Antigravity:** implement, test, and review these gates and wire importer/query after verifying branch conflicts. **Mac:** exact-head CI only. **Owner/accountant:** any external approvals. No automatic merge/deployment/production schema or data changes.
