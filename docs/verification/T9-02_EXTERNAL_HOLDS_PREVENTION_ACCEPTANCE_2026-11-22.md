# T9-02 · External Booqable Holds & Double-Booking Prevention Verification Report

**Card:** T9-02 · Booqable rentals block the OS calendar  
**Track:** Track 9 (Cutover)  
**Date:** 2026-11-22 (Nepal Time)  
**Authority:** Babin (Owner) · `AGENTS.md` · `CLAUDE.md` · `docs/plans/T9_CUTOVER.md` · `PLAN.md` §7 · `docs/verification/ACCEPTANCE_STATUS_TRUTH_REPAIR_2026-11-22.md`  
**Status:** Acceptance Verified & Documented (status: done)

---

## 1. Executive Summary

Card **T9-02** addresses the primary operational cutover risk identified in `PLAN.md` §7: preventing Babin Rentals OS from renting out equipment that has already been promised or held in Booqable during the parallel run.

Prior implementation (PR #202) provided an in-memory overlap model in `src/lib/externalHolds.ts` and associated unit tests, but claimed migration `0206` which was actually allocated to route map pins (`0206_delivery_route_map_pins.sql`). Review PR #316 correctly held this card in `acceptance_pending` pending actual database-level mutual exclusion constraints and lifecycle verification.

This report establishes complete acceptance through:
1. **Database Migration 0261 (`supabase/migrations/0261_external_holds_and_double_booking_prevention.sql`):**
   - Table `public.external_holds` with a `btree_gist` exclusion constraint `external_holds_no_duplicate_serial` on `(asset_id with =, period with &&)` where `status = 'active' and asset_id is not null`.
   - Trigger `trg_check_external_hold_against_reservations` executing `check_external_hold_against_reservations()`: refuses inserting or updating an external hold if the asset is already reserved by an active OS booking.
   - Updated capacity ceiling trigger `enforce_inventory_reservation_capacity()`: enforces that active external holds block OS reservations on the same serial asset, and aggregates active external holds into peak concurrency for serialized and quantity products.
   - Idempotent staff RPC `sync_external_holds(p_holds jsonb)` with strict role gating (`Owner`, `Admin`, `Manager`, `Coordinator`).
   - Secure view `public.external_holds_v` exposing `display_chip` (`Held in Booqable #<number>`) and joining product/asset names while completely excluding financial fields (Law 6).
   - Strict RLS and grants: authenticated staff select/write, anon revoked.
2. **Database Engine & Lifecycle Verification (`scripts/e2e-lifecycle.mjs` Step L98):**
   - Verified that `check:pglite` applies all 259 migrations cleanly from scratch with 0 view leaks and 0 function leaks.
   - Verified Step L98 in `scripts/e2e-lifecycle.mjs` passing with 99/99 green tests:
     - Serial asset collision against active Booqable hold raises `23P01`.
     - GiST exclusion prevents duplicate active external holds on the same asset.
     - Existing OS reservation prevents inserting active external hold on the same unit.
     - View `external_holds_v` exposes neutral chip text without financial data.
     - Cancelling Booqable hold immediately permits OS reservations.
     - Anon is denied direct table and view access.
3. **Client Availability & Conflict Model:**
   - 5/5 unit tests passing in `src/lib/__tests__/externalHolds.test.ts`.
   - Neutral presentation chip format enforced: `Held in Booqable #...` (not gold, which is reserved for external gear).
   - Fail-closed availability checks: sync downtime or unhealthy external feed refuses availability decisions rather than silently assuming assets are free.

---

## 2. Database Schema & Invariants (Migration 0261)

### 2.1 Table Structure
```sql
create table if not exists public.external_holds (
  id uuid primary key default gen_random_uuid(),
  booqable_order_id text not null,
  booqable_order_number text not null,
  product_id uuid not null references public.products(id),
  asset_id uuid references public.product_units(id),
  qty int not null default 1 check (qty > 0),
  period tstzrange not null,
  status text not null default 'active' check (status in ('active', 'completed', 'cancelled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.users(id),
  constraint external_holds_serial_qty_one check (asset_id is null or qty = 1),
  constraint external_holds_no_duplicate_serial
    exclude using gist (asset_id with =, period with &&)
    where (status = 'active' and asset_id is not null)
);
```

### 2.2 Mutual Conflict Prevention Trigger
When an external hold is imported or updated to `active`, `check_external_hold_against_reservations()` verifies whether the unit is already held by an OS booking:
```sql
if NEW.status = 'active' and NEW.asset_id is not null then
  if exists (
    select 1 from public.inventory_reservations r
    where r.asset_id = NEW.asset_id
      and r.released_at is null
      and r.hold_state in ('confirmed', 'active_hold')
      and r.period && NEW.period
  ) then
    raise exception
      'External hold conflict: asset % is already reserved by an OS booking over period %.',
      NEW.asset_id, NEW.period
      using errcode = '23P01';
  end if;
end if;
```

### 2.3 Capacity Ceiling & Reservation Rejection
When an OS reservation is requested, `enforce_inventory_reservation_capacity()` validates both:
1. Serial conflict against `external_holds`:
   ```sql
   select eh.booqable_order_number into v_held_order_no
   from public.external_holds eh
   where eh.asset_id = NEW.asset_id
     and eh.status = 'active'
     and eh.period && NEW.period
   limit 1;
   ```
   Raises `23P01` with clear message identifying Booqable booking reference.
2. Peak concurrency accounting:
   Calculates live occupancy across OS confirmed reservations, OS active smart holds, and active Booqable external holds. If peak occupancy exceeds total available stock on hand, the reservation is rejected.

---

## 3. Automated Test Evidence

### 3.1 PGlite Migration Clean Build (`npm run check:pglite`)
```text
PostgreSQL 18.3 (PGlite 0.5.8) on wasm32-unknown-emscripten

259/259 applied, 0 failed

view-leak gate: 47 public view(s) checked, 0 readable by anon
function-leak gate: 21 public function(s) executable by anon, 0 unauthorized
definer-hygiene gate: 239 definer function(s) checked, 0 without pinned search_path
clash/RLS gate: 3 staff-only table(s) checked, 0 violations
public-catalogue privacy gate: 7 anonymous cases checked, 0 violations
The chain builds from scratch, no view is readable by anon, no unauthorized RPC is executable by anon, and all definer search_paths are pinned.
```

### 3.2 Full Lifecycle Verification (`npm run check:lifecycle`)
Step L98 verifies the complete database lifecycle under real Postgres semantics:
```text
  ok   L98  Booqable rentals block the OS calendar and prevent double booking (T9-02, 0261) — mutual exclusion between external holds and OS reservations, capacity accounting, and neutral chip presentation

99/99 green, 0 known-red, 0 failed
The lifecycle holds. (PGlite, not Supabase — no JWT and no PostgREST. See this file’s header.)
```

### 3.3 Client Model & Unit Tests (`externalHolds.test.ts`)
```text
 ✓ src/lib/__tests__/externalHolds.test.ts (5 tests) 6ms
 Test Files  1 passed (1)
      Tests  5 passed (5)
```

### 3.4 Roadmap Truth Assertions (`roadmapStatusTruth.test.ts`)
```text
 ✓ src/lib/__tests__/roadmapStatusTruth.test.ts (9 tests) 157ms
 Test Files  1 passed (1)
      Tests  9 passed (9)
```

---

## 4. Invariant Compliance Checklist

- [x] **Rule N-5:** Zero remote migrations pushed or applied; verified entirely locally via PGlite and Lifecycle suite.
- [x] **Rule N-8:** Zero secrets, service-role keys, or credentials stored or committed.
- [x] **Law 6 (Money Blindness):** External holds contain only `booqable_order_id`, `booqable_order_number`, `product_id`, `asset_id`, `qty`, `period`, `status`. No client money, rates, or rental prices are stored in `external_holds` or exposed in `external_holds_v`.
- [x] **Fail-Closed Availability:** Unhealthy external feeds trigger fail-closed behavior (`hasConflict: true`), preventing gear from being promised when sync is degraded.
- [x] **GiST Mutual Exclusion:** Hardware units cannot be double-booked across OS reservations and Booqable rentals.
