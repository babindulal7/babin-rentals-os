# T2-22 · Time between rentals: account-wide or per product — Design Note

**Status: READY FOR IMPLEMENTATION**
Branch: `lane-a/T2-22-time-between-rentals-account-wide-or`
Card: `docs/plans/T2_FLOOR.md` T2-22 (Lane A · [go-live] · slips first)
Rulings & Rules: B11 (prep time between rentals), B53, Law 1 (pure engines), Law 3 (immutability of history), Law 6 (money blindness), Law 8 (idempotent writes via `client_uuid`), PERMISSIONS §4.10 (`settings.manage`).

---

## 1. Context & Business Need (B11)

Today, equipment turnaround between rentals is governed purely by the account-wide `rentalTurnaround` setting (`'Same-instant handover allowed'` vs `'Turnaround required'`).
Furthermore, that setting is evaluated only in browser JavaScript (`src/lib/queries/availability.ts`), while the database triggers in PostgreSQL always reserve fixed half-open ranges `[pickup_at, return_at)` regardless of turnaround.

Products already possess `prep_time_minutes` (prep minutes before pickup) and `cleaning_time_minutes` (cleaning minutes after return) on `products` and the equipment form, but these fields are currently unread by availability and reservation logic.

Under B11:
- A new setting **"Time between rentals: Account-wide · Per product"** is added to Settings ▸ Operations rules.
- **Account-wide mode**: behaves as today (`rentalTurnaround` setting determines whether handover at the exact same instant is allowed or turnaround is required).
- **Per-product mode**: uses each product's `prep_time_minutes` before pickup and `cleaning_time_minutes` after return.
  - A unit returned at 18:00 with 120 cleaning minutes is occupied until 20:00.
  - A pickup at 09:00 with 60 prep minutes requires the unit to be ready from 08:00.
  - If a second booking attempts to pick up at 19:00 (1 hour after return), the database and the UI refuse the booking.
- Crucially, the rule is enforced at the database layer where reservations are created (`confirm_booking_atomic` / `reservations_follow_stage_transition` and `create_or_extend_hold`), so the database itself guarantees no double-booking or turnaround violation.
- Existing historical bookings and reservations remain unchanged.

---

## 2. Database Schema & Migration (Claiming Migration `0240`)

### 2.1 Function: `get_effective_rental_window`
We introduce an immutable/stable SQL helper function:
```sql
create or replace function public.get_effective_rental_window(
  p_pickup timestamptz,
  p_return timestamptz,
  p_prep_minutes integer default 0,
  p_cleaning_minutes integer default 0
) returns tstzrange
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_mode text;
  v_turnaround text;
  v_prep interval;
  v_cleaning interval;
begin
  -- Read organization settings (defaulting to safe values if unset)
  select value#>>'{}' into v_mode
    from settings
   where key = 'timeBetweenRentals' and scope = 'org';

  if v_mode is null then
    v_mode := 'Account-wide';
  end if;

  if v_mode = 'Per product' then
    v_prep := (coalesce(p_prep_minutes, 0) || ' minutes')::interval;
    v_cleaning := (coalesce(p_cleaning_minutes, 0) || ' minutes')::interval;
    return tstzrange(p_pickup - v_prep, p_return + v_cleaning, '[)');
  else
    select value#>>'{}' into v_turnaround
      from settings
     where key = 'rentalTurnaround' and scope = 'org';

    if v_turnaround = 'Turnaround required' then
      return tstzrange(p_pickup, p_return, '[]');
    else
      return tstzrange(p_pickup, p_return, '[)');
    end if;
  end if;
end;
$$;
```

### 2.2 Updating Reservation Writers in Postgres
1. **`reservations_follow_stage_transition()`**:
   When inserting serialized reservations:
   - Join `booking_lines` to `products` to retrieve `prep_time_minutes` and `cleaning_time_minutes`.
   - Compute `period := get_effective_rental_window(v_pickup, v_return, p.prep_time_minutes, p.cleaning_time_minutes)`.
   - When inserting quantity reservations:
     - Compute the same product-buffered window.
   - If an overlapping reservation exists for an assigned unit, the GiST exclusion constraint (`inventory_reservations_no_double_booking`) natively refuses the insert with error `23P01`.
   - If a quantity product exceeds available units during the buffered window, `enforce_inventory_reservation_capacity()` refuses the reservation.
2. **`create_or_extend_hold()`**:
   - Reads `prep_time_minutes` and `cleaning_time_minutes` for the product being held and sets `v_period := get_effective_rental_window(...)`.

### 2.3 Protection of Existing Bookings
- No migrations modify existing rows in `inventory_reservations`.
- Existing completed, on-rent, or confirmed reservations keep their existing ranges.
- Only newly placed holds or newly confirmed bookings compute buffered ranges.

---

## 3. Application & Frontend Design

### 3.1 Settings Store (`src/lib/settingsStore.ts`)
- Add setting definition `timeBetweenRentals`:
  - `default: 'Account-wide'`
  - `kind: 'select'`
  - `options: ['Account-wide', 'Per product']`
- Keep existing `rentalTurnaround` setting intact for Account-wide mode.

### 3.2 Settings View (`src/modules/settings/sections/System.tsx`)
- In Operations rules, display:
  - **Time between rentals**: Account-wide · Per product
  - Context note explaining that Account-wide uses Turnaround between rentals, while Per product uses each product's prep and cleaning minutes.

### 3.3 Equipment Record Editor (`src/components/records/EquipmentRecordEditor.tsx`)
- Below Preparation minutes and Cleaning minutes, render the explanation note:
  - *"Used only when Operations rules ▸ Time between rentals is set to 'Per product'."*

### 3.4 Pure Engine & Query Layer
- `src/lib/availability.ts`:
  - Add helper `effectiveRentalWindow(window: RentalWindow, prepMinutes: number, cleaningMinutes: number, mode: 'Account-wide' | 'Per product', bounds: BoundConvention): RentalWindow`.
- `src/lib/queries/availability.ts`:
  - Read `timeBetweenRentals` setting alongside `unitAvailabilityRule` and `rentalTurnaround`.
  - When evaluating unit and quantity availability, apply prep buffer before `pickup_at` and cleaning buffer after `return_at`.
- `src/lib/availabilityEvaluation.ts`:
  - Incorporate product prep and cleaning buffers when calculating line outcomes and candidate collisions.

---

## 4. Lifecycle & Verification Plan

### 4.1 Lifecycle Proving Steps
In `scripts/e2e-lifecycle.mjs`:
1. **Step L74 (Per product mode)**:
   - Configure `timeBetweenRentals = 'Per product'`.
   - Set product cleaning minutes to 120 minutes (2 hours).
   - Create and confirm Booking A returning at 18:00.
   - Attempt to confirm Booking B picking up at 19:00 (1 hour after return, inside cleaning window) for the same unit.
   - Assert: Database refuses Booking B with exclusion violation / turnaround conflict.
   - Reschedule Booking B pickup to 20:00 (at the end of the cleaning window) and confirm.
   - Assert: Booking B confirms successfully.
2. **Step L75 (Account-wide mode)**:
   - Configure `timeBetweenRentals = 'Account-wide'`.
   - Assert: Standard turnaround behavior is preserved without regression.

### 4.2 Automated Checks
- `npm run check:pglite`: verifies migration 0240 applies cleanly from scratch.
- `npm run check:lifecycle`: verifies all lifecycle steps including L74 and L75 pass.
- `npm test`: verifies unit tests for availability engine, settings, and equipment record editor.
- `npm run gates`: all 17 gates pass.
