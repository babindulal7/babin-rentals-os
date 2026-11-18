# Verification: T3-18 — Change a confirmed booking

**Card:** T3-18  
**Size:** L · **Priority:** [go-live] · **Lane:** C (`lane-c/T3-18-change-confirmed-booking`)  
**Migration:** `supabase/migrations/0243_change_confirmed_booking.sql`  
**Status:** Implemented & Verified (All 17 Gates Green)

---

## 1. Requirement & User Intent

Desk staff must be able to change items, dates, and terms after a booking is confirmed (W88, W87):
1. **Role Authorization:** Any desk staff (`Owner`, `Admin`, `Manager`, `Coordinator` — `C+`) may edit confirmed bookings via `rental.change` capability (PERMISSIONS §4.1). Non-desk staff (`Warehouse`, `Technician`, `Driver`, `Client`) are refused with `42501`.
2. **Before Pack (`Booked`):** Add, remove, or swap equipment/crew/transport lines and shift dates. Reservations update atomically in the same transaction; double-booking is strictly prevented by the non-deferrable GiST exclusion constraint on `inventory_reservations` (`inventory_reservations_no_double_booking`).
3. **After Pack (`Packed` / `On Rent`):**
   - Silent removal or reduction of packed/assigned items is blocked by `GATE:gate.booking.packed_line_removed|Packed items cannot be silently removed. Unpack them on the floor first.`.
   - After Handover (`On Rent`), clicking "+ Add gear" prompts desk staff with modal W87:
     1. "Add to this booking" (`?action=edit`)
     2. "Start linked booking" (`/rentals/new?clientId=...&parentBookingId=...`).
4. **Linked Bookings:** Linked bookings persist `bookings.parent_booking_id uuid references public.bookings(id) on delete set null`, displayed clearly on `BookingDetail` with one-tap link to parent.
5. **Concurrency & Revision Lock:** Mutating RPC `change_booking(p_id, p_revision, p_key, p_payload)` enforces revision check with `GATE:gate.booking.concurrent_change|This booking changed since you opened it. Reload the latest record before saving.` (`40001`). Idempotent replay guarded by Law 8 `p_key` in `record_editor_private.receipts`.
6. **Financial Document Safety:**
   - Closed or returned bookings cannot be edited via `change_booking`.
   - Bookings with issued financial documents (e.g. non-Draft invoices) cannot edit the client and must use financial correction workflows.
   - Any existing `Draft` invoice automatically resyncs via `public.resync_draft_invoice(p_id)`.

---

## 2. Changes Implemented

### Database Layer (`supabase/migrations/0243_change_confirmed_booking.sql`)
1. **Schema & Column Grants:**
   - Added column `parent_booking_id uuid references public.bookings(id) on delete set null` on `public.bookings` with B-tree index `idx_bookings_parent_booking_id`.
   - Column-level grant: `grant select (parent_booking_id) on public.bookings to authenticated`.
2. **RPCs:**
   - `create_booking(jsonb)`: captures `parent_booking_id` from payload, persists to `bookings`, returns `parent_booking_id`, and safely logs `price.server_applied` for money-blind callers (Law 6).
   - `read_booking_for_change(p_id text)`: snapshots confirmed booking lines, crew, transport, discounts, and header values including `parent_booking_id` and `rental_day_start`, returning cryptographic MD5 `revision` hash.
   - `change_booking(uuid, text, uuid, jsonb)`: atomic, revision-locked, idempotent mutation applying header changes, line add/remove/swap, crew changes, transport edits, and discount updates; updates reservations; guards packed units; resyncs draft invoices.
   - `change_booking(jsonb)`: overloaded convenience wrapper accepting single jsonb envelope `{ bookingId, revision, key, ...payload }`.

### Application Layer & RBAC
1. **PERMISSIONS & RBAC:**
   - `docs/PERMISSIONS.md`: documented `rental.change` capability for `C+` roles and added `gate.booking.concurrent_change` and `gate.booking.packed_line_removed` to §6.1.
   - `src/lib/rbac.ts`: exported `canChangeBooking(role: SystemRole): boolean` admitting `Owner`, `Admin`, `Manager`, `Coordinator`.
   - `src/actions/core.ts`: registered `case 'rental.change': return rbac.canChangeBooking(ctx.role)`.
2. **Actions & Queries:**
   - `src/actions/rentals/changeBooking.ts`: authored `changeBookingAction` and schema validation using `prepareBookingChange`.
   - `src/actions/rentals/createRental.ts`: integrated `parentBookingId?: string | null` in input and database payload.
   - `src/lib/queries/quoteEditor.ts`: updated `QuoteSnapshot` and `readBookingForChange` query to include `stage`, `parent_booking_id`, and `rental_day_start`.
   - `src/lib/queries/bookings.ts`: integrated `parent_booking_id` in base and floor queries and types.
3. **UI / Components:**
   - `src/modules/rentals/BookingDetail.tsx`:
     - Displays "Linked to Parent booking" in summary rows with direct link when `parent_booking_id` exists.
     - Admits Edit button for `['Quote', 'Booked', 'Packed', 'On Rent']` when user has `canChangeBookingPermission`.
     - Adds "+ Add gear" button in Block 2 for `On Rent` bookings.
     - Adds `AddGearMidRentalModal` implementing W87 ("Add to this booking" vs "Start a new linked booking").
   - `src/modules/rentals/booking/useNewRentalDraft.ts`: loads `readBookingForChange` when editing confirmed bookings; directs saves to `changeBooking` instead of `updateRentalQuote`.
   - `src/modules/rentals/booking/useNewRentalSubmit.ts`: receives `parentBookingId` and forwards to `createRental`.
   - `src/modules/rentals/NewRental.tsx`: reads `parentBookingId` from `searchParams` and feeds into draft hook.

---

## 3. Verification & Testing

1. **Unit Tests:**
   - `src/actions/__tests__/core.test.ts`: 101/101 tests passed (includes `rental.change` matrix for all roles).
   - `src/actions/rentals/__tests__/changeBooking.test.ts`: 5/5 tests passed (permission checks, packed units guard, revision check, payload mapping).
2. **Lifecycle Tests (`scripts/e2e-lifecycle.mjs`):**
   - `L82`: a change can never double-book (`T3-18`, W88, GiST exclusion) — **GREEN**.
   - `L83`: a packed unit cannot be silently removed (`T3-18`, W88, `gate.booking.packed_line_removed`) — **GREEN**.
   - `L84`: linked booking carries the parent id (`T3-18`, W87) — **GREEN**.
   - Total lifecycle suite: **85/85 green**, 0 known-red, 0 failed.
3. **Full Gates Suite (`npm run gates`):**
   - 17/17 release gates verified green.
