# Technician New Rental (Card 6 · G-10 / G-18) — Design Note

> **Status:** Step 0 complete — awaiting Babin's confirmation before writing migration `0236` and code.
> **Branch:** `lane-b/card-6-technician-new-rental`
> **Authorities:** `RULINGS-2026-11-10-design.md` (G-10, G-18), `AGENT_PROMPTS-2026-11-10-design.md` (Card 6), `docs/PERMISSIONS.md` (§3, §3.1 W1).

---

## 1. How Warehouse's W1 limit is enforced today

### UI (`src/lib/rbac.ts`, `src/lib/fieldGating.ts`, `src/modules/rentals/NewRental.tsx`, `src/modules/rentals/RentalsList.tsx`)
- **Action gating (`src/actions/core.ts:241-272`):** `rental.create` (and 11 other booking-desk verbs) checks `rbac.canWriteBookingDesk(ctx.role)`, which tests `BOOKING_DESK = Set(['Owner', 'Admin', 'Manager', 'Coordinator', 'Warehouse'])` (`src/lib/rbac.ts:110-116, 350-352`).
- **List CTA (`src/modules/rentals/RentalsList.tsx:875`):** `canWriteDesk = canWriteBookingDesk(role)` controls the New Rental button and empty-state CTA.
- **Money blindness (`src/modules/rentals/NewRental.tsx:136-138`):** `canBookingMoney = canViewMoneyField(gctx, 'booking')` evaluates to `false` for `Warehouse` (and `Technician`, `Driver`, `Client`), omitting the pricing rail, line rates, totals, discount controls, and deposit amounts from the DOM.

### Postgres (`supabase/migrations/`)
- **`create_booking(p_payload jsonb)` (`0230_project_name_and_shoot_location.sql:120`)** is `SECURITY INVOKER` (no `security definer`), so every `INSERT` it executes is enforced directly by RLS against `auth_user_role()`:
  - `bookings_insert` (`0018_manager_role_policies.sql:101-105`): `Owner, Admin, Manager, Coordinator, Warehouse`.
  - `booking_lines_all` (`0018_manager_role_policies.sql:115-119`): `Owner, Admin, Manager, Coordinator, Warehouse`.
  - `booking_line_units_all` (`0024_booking_subtable_policies.sql:40-43`): `Owner, Admin, Manager, Coordinator, Warehouse`.
  - `booking_crew_lines_all` (`0036:100-103`): `auth_is_staff()` (already admits `Technician`).
  - `booking_stage_transitions_insert` (`0180_technician_floor_verbs.sql:143-148`): already admits `Technician` alongside `Warehouse`.
- **Discount rejection (`0230:243-245`):**
  ```sql
  if jsonb_array_length(coalesce(p_payload -> 'discounts', '[]'::jsonb)) > 0 and not auth_can_view_money() then
    raise exception 'GATE:gate.discount.money_blind|Money-blind callers may not apply discounts (Law 6)'
  ```
  Line-level `discount_amount` is also zeroed when `not auth_can_view_money()` (`0230:392, 436`). Because `auth_can_view_money()` returns `false` for both `Warehouse` and `Technician`, any discount attempt is rejected by the RPC.

---

## 2. Every other capability adding Technician to `BOOKING_DESK` would grant

Adding `'Technician'` directly to `BOOKING_DESK` (`src/lib/rbac.ts:110-116`) would grant all of the following unintended capabilities:
1. `rental.cancel` — cancelling bookings
2. `rental.extend` — extending booking end dates
3. `rental.draft` — saving/modifying quotes
4. `rental.update_project` — editing project name/type/shoot location
5. `client.create` (`canCreateClient`) and `client.update` — creating/editing client records
6. `inventory.reserve` — manual reservation writes
7. `document.create` — generating booking documents
8. `subrental.create` — adding sub-rental lines with supplier cost/markup
9. `note.create` — writing booking notes
10. `unit.release` — releasing serialised units from booking lines
11. `inventory.edit_product_aliases` — editing paste-list aliases
12. `canViewClientUnmaskedId` / `canCaptureClientId` (`rbac.ts:612, 620`, which OR with `canWriteBookingDesk`)

---

## 3. Smallest change that gives Technician W1 and nothing more

1. **Keep `BOOKING_DESK` unchanged.** Do **not** add `'Technician'` to `BOOKING_DESK`.
2. **New narrow RBAC predicate (`src/lib/rbac.ts`):** Add `canCreateBooking(role)` returning `BOOKING_DESK.has(role) || role === 'Technician'`.
   - `src/actions/core.ts`: route `case 'rental.create':` to `rbac.canCreateBooking(ctx.role)`. Leave `rental.cancel`, `rental.extend`, `rental.draft`, `client.update`, `subrental.create`, `note.create`, `unit.release`, `document.create`, `inventory.reserve`, and `inventory.edit_product_aliases` on `canWriteBookingDesk(ctx.role)`.
3. **UI (`Sidebar.tsx` / `nav.ts`, `RentalsList.tsx`, `NewRental.tsx`):**
   - Expose **New Rental** in the Technician sidebar (Card 6 Do #5) and `RentalsList` CTA via `canCreateBooking(role)`.
   - `NewRental.tsx` already hides all money, totals, discounts, and deposits for `Technician` via `canViewMoneyField(gctx, 'booking') === false` (Law 6 / N-1).
4. **Postgres RLS (narrow INSERT-only widening):**
   - Allow `'Technician'` to `INSERT` into `bookings`, `booking_lines`, and `booking_line_units` via `create_booking`, while keeping `UPDATE` / `DELETE` on those tables restricted to `BOOKING_DESK` (`Owner, Admin, Manager, Coordinator, Warehouse`).
   - Keep `auth_can_view_money()` discount rejection in `create_booking` unchanged.

---

## 4. Policies and functions the migration (`0236`) would touch

Next free migration number in `docs/plans/MIGRATION_LEDGER.md`: **0236** (`0235_delivery_route_branch_hardening.sql` is the latest on `origin/main`).

| Object | Change |
|---|---|
| `public.bookings` — `bookings_insert` (`FOR INSERT`) | Add `'Technician'` to `with check (auth_user_role() in (...))`. **`bookings_update` stays unchanged** (Technician cannot cancel, extend, or edit existing bookings). |
| `public.booking_lines` — `booking_lines_all` | Split into `booking_lines_insert` (`FOR INSERT`, includes `'Technician'`) and `booking_lines_update` / `booking_lines_delete` (`Owner, Admin, Manager, Coordinator, Warehouse` only). |
| `public.booking_line_units` — `booking_line_units_all` | Split into `booking_line_units_insert` (`FOR INSERT`, includes `'Technician'`) and `booking_line_units_update` / `booking_line_units_delete` (`Owner, Admin, Manager, Coordinator, Warehouse` only). |

*(Note: `booking_stage_transitions_insert` in `0180` already includes `'Technician'`, and `create_booking` already rejects discounts for `!auth_can_view_money()`.)*

---

## Confirmation needed before code

Please confirm:
1. Proceed with migration **`0236_technician_new_rental.sql`** splitting `INSERT` vs `UPDATE`/`DELETE` as above (`rental.create` only; no `cancel`, `extend`, `draft`, `client.create`, or `discount`).
2. Should Technician from New Rental only **create** a booking (or also **confirm** at creation like Warehouse's W1)? (`G-18` says: *"create a booking, no discount line, no money shown, no cancel, no extend"*).
