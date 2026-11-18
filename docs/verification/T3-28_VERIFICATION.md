# Verification: T3-28 — Rental day start as a setting

**Card:** T3-28  
**Lane:** `lane-c/T3-28-rental-day-start-as-a-setting`  
**Status:** Implemented & Verified (All 17 Gates Green)

---

## 1. Requirement & User Intent

Rental day start as an operational setting (B24, B25, B26, K3):
1. **Configurable Rental Day Start Boundary (B24):**
   - The operational day boundary (06:00 → 06:00 default, 360 minutes after Kathmandu midnight +05:45) is exposed under `Settings ▸ Operations rules ▸ "Rental day starts at"` in quarter-hour increments (00:00, 00:15, ..., 23:45).
2. **Immutable Per Booking (B25, K3):**
   - Each booking permanently records its creation-time rental day start in `bookings.rental_day_start` (integer minutes after midnight, check constraint `rental_day_start >= 0 and rental_day_start < 1440 and (rental_day_start % 15) = 0`).
   - When the setting is modified later, existing bookings retain their stored `rental_day_start`; their billed days, rates, and line totals are never changed retrospectively.
   - Future bookings created after the setting change resolve the new rental day start from `settings.operationalDayStart`.
3. **Role Gating (B26):**
   - Changing the setting is strictly restricted to **Owner and Admin**; Manager and other roles are refused at the database level (`GATE:gate.settings.role`).
4. **Law 6 Column Grants:**
   - Column `rental_day_start` is granted SELECT to `authenticated` as non-monetary operational metadata.

---

## 2. Changes & Hardening Implemented

### Database Layer
- `supabase/migrations/0238_rental_day_start_setting.sql`:
  - Added `rental_day_start integer not null default 360` column to `public.bookings` with 15-minute increment check constraint.
  - Granted `select (rental_day_start) on public.bookings to authenticated`.
  - Updated `set_setting` RPC: permits Owner and Admin (B26); validates `operationalDayStart` format `^([01][0-9]|2[0-3]):(00|15|30|45)$`; refuses other roles with `GATE:gate.settings.role`.
  - Updated `create_booking` RPC: resolves `rental_day_start` from payload or setting `operationalDayStart`, defaults to 360, stamps it on booking insert, and includes it in return JSON.
  - Updated `read_booking_for_change` RPC: snapshots `rental_day_start`.
- `supabase/migrations/0239_consumables_pricing_restock_and_low_stock.sql`:
  - Preserved `rental_day_start` handling across subsequent `create_booking` updates.

### Application Layer
- `src/lib/rentalDays.ts`:
  - Exported `DEFAULT_RENTAL_DAY_START_MINUTES = 360` and `rentalDayShiftOffsetMs(rentalDayStartMinutes)`.
  - Extended `rentalDaysBetween(pickupIso, returnIso, rentalDayStartMinutes = DEFAULT_RENTAL_DAY_START_MINUTES)`.
- `src/lib/rbac.ts`:
  - Added `canManageOperationsRules(role)` allowing Owner and Admin (B26).
- `src/actions/core.ts`:
  - Added capability dispatch for `settings.operations_rules` and `settings.rental_day_start`.
- `src/lib/settingsStore.ts`:
  - Exported `OPERATIONAL_DAY_START_CHOICES` with 96 quarter-hour options.
  - Configured `operationalDayStart` setting specification.
- `src/modules/settings/sections/System.tsx`:
  - Exposed "Rental day starts at" setting control under Operations rules.
- `src/actions/rentals/createRental.ts`, `newRentalUtils.ts`, `useNewRentalPricing.ts`, `BookingDetail.tsx`:
  - Integrated `rentalDayStart` into rental creation, duration computation, and pricing hints.
- `src/lib/queries/bookings.ts`:
  - Added `rental_day_start` to list and floor booking queries with automatic fallback handling.

### Lifecycle Testing
- `scripts/e2e-lifecycle.mjs`:
  - Step `L80`: Verified existing booking's days and total are unchanged after setting moves (B24, B25, B26, K3).
  - Step `L81`: Verified new booking resolves and uses new 08:00 start (1 day billed for 24h window).

---

## 3. Verification & Testing

- `npm run typecheck`: clean (0 errors).
- `npm run lint`: clean (0 warnings).
- `npm run check:pglite`: 240/240 migrations applied from scratch, 0 failed, 0 unauthorized RPCs.
- `node scripts/test-booking-financial-integrity.mjs`: financial integrity verified in isolated PGlite.
- `npm run check:security`: 18/18 Phase 0 regressions + 14/14 Reset branch groups passed.
- `npm run check:lifecycle`: 82/82 steps green (L80 and L81 passed).
- `npm test`: 653/653 test files, 7374/7374 tests passed.
- `npm run gates`: Full 17 automated release gates PASS green.
