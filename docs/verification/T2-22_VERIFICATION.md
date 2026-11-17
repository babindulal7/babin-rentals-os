# Verification: T2-22 — Time between rentals: account-wide or per product

**Card:** T2-22  
**Lane:** `lane-a/T2-22-time-between-rentals-account-wide-or`  
**Migration:** `supabase/migrations/0240_time_between_rentals.sql`  
**Design Note:** `docs/verification/T2-22_DESIGN.md`  
**Status:** Implemented & Verified

---

## 1. Requirement & User Intent

Rental operations need flexibility in turnaround scheduling:
- **Account-wide mode (Default):** Every rental turnover respects the global account-wide setting (`rentalTurnaround`: Same-instant handover allowed vs Turnaround required).
- **Per product mode:** Turnaround buffer is derived per product based on `prep_time_minutes` (prep before pickup) and `cleaning_time_minutes` (cleaning/inspection after return). A reservation window expands to `[pickup - prep_time_minutes, return + cleaning_time_minutes)`.

## 2. Changes Implemented

### Database Layer (`supabase/migrations/0240_time_between_rentals.sql`)
1. **Helper Function `get_effective_rental_window(p_pickup, p_return, p_prep_minutes, p_cleaning_minutes)`**:
   - Reads `timeBetweenRentals` setting (`'Account-wide'` vs `'Per product'`).
   - In `'Per product'` mode:
     - Buffers pickup by `coalesce(p_prep_minutes, 0) * interval '1 minute'`.
     - Buffers return by `coalesce(p_cleaning_minutes, 0) * interval '1 minute'`.
     - Returns `tstzrange(buffered_pickup, buffered_return, '[)')`.
   - In `'Account-wide'` mode:
     - Follows `rentalTurnaround` setting (`'Turnaround required'` -> `'[]'`, else `'[)'`).
2. **Transition Function `reservations_follow_stage_transition()`**:
   - Joins `booking_lines` with `products` to fetch `prep_time_minutes` and `cleaning_time_minutes`.
   - Uses `get_effective_rental_window` to compute the reservation `period`.
   - Prevents overlapping reservations on serialized units when turnaround window overlaps.
3. **Draft Hold Function `create_or_extend_hold()`**:
   - Reads product's prep and cleaning time and applies `get_effective_rental_window`.

### Frontend & Availability Engine
1. **Settings Store (`src/lib/settingsStore.ts`)**:
   - Added `timeBetweenRentals` setting (`kind: 'select'`, options: `['Account-wide', 'Per product']`, default: `'Account-wide'`).
2. **Operations Rules UI (`src/modules/settings/sections/System.tsx`)**:
   - Added select input for "Time between rentals" under Operations rules with explanatory helper text.
3. **Equipment Record UI (`src/components/records/EquipmentRecordEditor.tsx`)**:
   - Added note under Prep & Cleaning minutes explaining they take effect only when Operations rules ▸ Time between rentals is set to "Per product".
4. **Availability Engine (`src/lib/availability.ts` & `src/lib/queries/availability.ts`)**:
   - Added pure helper `effectiveRentalWindow(window, prepMinutes, cleaningMinutes, mode)`.
   - Updated queries to pass `prep_time_minutes` and `cleaning_time_minutes` and adjust line windows when in `'Per product'` mode.

## 3. Verification & Testing

1. **Unit Tests (`src/lib/__tests__/availability.test.ts`)**:
   - Verified `effectiveRentalWindow` returns identical window in Account-wide mode.
   - Verified `effectiveRentalWindow` pads start by prep minutes and end by cleaning minutes in Per product mode.
   - Verified conflict detection 1 hour after return when cleaning time is 2 hours.
   - Verified unit is available once cleaning window has elapsed.
2. **Lifecycle Integration Tests (`scripts/e2e-lifecycle.mjs`)**:
   - `L74`: In Per product mode with 120 minutes cleaning, pickup 1 hour after return is refused by exclusion constraint (`conflicting_key`).
   - `L75`: In Account-wide mode, same-day turnover with zero buffer is accepted.
3. **Database Checks (`npm run check:pglite`)**:
   - 236/236 migrations applied cleanly.
   - Definitive security definers pinned.
4. **Gates**:
   - All 17 CI gates pass (`npm run gates`).
