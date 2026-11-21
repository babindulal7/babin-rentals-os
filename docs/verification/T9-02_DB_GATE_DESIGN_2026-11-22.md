# T9-02 — Booqable external holds: database-first implementation design

**Date:** 2026-11-22. **Base:** main at `772c62614dbaf3adc1d38ef5e17740cd95e4e013`. **Status:** DRAFT / NOT VERIFIED / HOLD; no live or staging changes.

## Evidence behind this repair

- Merged PR #202 introduced `src/lib/externalHolds.ts` and five pure tests only. There is no database migration named `0206_external_holds.sql` — current 0206 is delivery route map pins.
- The booked inventory arbiter is `public.inventory_reservations`: serial GiST exclusion and quantity capacity triggers. `0188` adds active/confirmed reservation states, `0240` adds turnaround windows, `0252` adds shortage behavior, and `0253` modifies capacity for temporary partner stock. All these paths must remain enforced.
- Existing Booqable sync schema `0040_booqable_sync.sql` has `external_refs`, `sync_state`, `sync_inbox`, `sync_outbox`; it does not persist reservation holds or prove feeds are complete. **No integration of open Booqable rentals into the booking availability arbiter was found.**
- Original card: `docs/plans/T9_CUTOVER.md` §T9-02 and `docs/plans/prompts/T9-02.md`. Independent P1 finding: PR #316.

## Phase 1: additive SQL-only protection (migration 0261)

1. Add `external_holds`, a dedicated non-billing table, keyed by provider + external line identity, with mandatory mapped product, optional mapped serial, UTC half-open rental range, qty, source order display number, active/completed/cancelled state, last observed timestamp and append-preserving release reason. It may **never** be interpreted as an OS booking, packed, invoiced or billed.
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

## Unresolved decisions / dependencies

- **Owner decision needed before activation:** acceptable maximum age of successful Booqable sync, scope of sync health (global vs branch), exact release timing after return, and incident fallback procedure. Conservative default is **disabled**, and activation without a configured freshness limit is rejected.
- T9-01 catalogue/client reconciliation is itself acceptance pending. No source import should be considered accepted until actual OS mapping and prices are verified.
- Staging data writes, migrations, service-role integration and trial activation require explicit separately scoped owner approval. This document authorizes none.

## Lane split

**Windows Antigravity:** implement, test, and review these gates and wire importer/query after verifying branch conflicts. **Mac:** exact-head CI only. **Owner/accountant:** any external approvals. No automatic merge/deployment/production schema or data changes.
