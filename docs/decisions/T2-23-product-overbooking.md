# Decision Record: T2-23 — Product-Level Overbooking & Safe Shortage Handling

**Card:** T2-23 · Allow overbooking on chosen products (safe shortage handling)  
**Date:** 18 November 2026  
**Status:** Approved for Implementation  
**Rulings Reference:** B12, B53, K4; Law 1 (business logic in engine/database), Law 6 (money blindness), Law 8 (idempotency), Law 16 (no single-device settings)

---

## 1. Context & Architectural Problem

Previously, overbooking was controlled by a fragile, browser-local setting in `localStorage` (`br.bookingRules.allowOverbooking` via `src/lib/bookingRules.ts`), which modified only UI modal behavior without persisting to the database. In addition, an unconditional bypass `(allowOverbooking || true)` in `AddItemPanel.tsx` risked bypassing conflict safety.

In rental operations, **accepting a customer booking commitment is distinct from having physical equipment allocated**. When a high-demand item is in short supply, Babin Rentals OS must allow authorized staff (Owner, Admin, Manager) to confirm a booking past available stock *only* on products explicitly configured for overbooking. The excess demand must be durably recorded as a **shortage**, without ever reserving a physical unit twice or inventing phantom serial numbers. Pack and Handover operations must strictly refuse any rental with an unresolved shortage.

---

## 2. Data Model & Schema Changes

### 2.1 Products Table
Add product-level boolean flag:
```sql
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS allow_overbooking BOOLEAN NOT NULL DEFAULT FALSE;
```
- Default: `FALSE` (fail-closed, existing behavior preserved).
- Permissions: Modifiable only by `Owner`, `Admin`, and `Manager` through:
  - Product edit form (`RecordForm` / `EquipmentRecordEditor`)
  - Bulk edit modal (`BulkEditProductsModal` / `bulk_update_products`)
- Expose on `products_v` view for client queries.

### 2.2 Booking Lines Table
Add durable shortage tracking column:
```sql
ALTER TABLE public.booking_lines
  ADD COLUMN IF NOT EXISTS short_quantity INTEGER NOT NULL DEFAULT 0 CHECK (short_quantity >= 0);
```
- Default: `0`.
- Maintained authoritatively by Postgres during booking confirmation and shortage resolution.

### 2.3 Booking At-Risk Table
Extend `booking_at_risk.cause` check constraint to include `'overbooking_shortage'`:
```sql
ALTER TABLE public.booking_at_risk
  DROP CONSTRAINT IF EXISTS booking_at_risk_cause_check,
  ADD CONSTRAINT booking_at_risk_cause_check
    CHECK (cause IN ('extension_clash', 'late_return', 'marked_will_be_late', 'overbooking_shortage'));
```

---

## 3. Conflict Rules & Reservation Invariants

1. **GiST Exclusion Constraint Preserved:**
   The PostgreSQL GiST constraint `inventory_reservations_no_double_booking` on `(asset_id WITH =, period WITH &&)` is strictly preserved and never bypassed. No physical serial unit can ever be double-booked across overlapping periods.

2. **When `allow_overbooking = FALSE` (Default):**
   - Confirmation is fail-closed.
   - If requested quantity exceeds genuinely free stock in the rental window, confirmation is rejected with an actionable error.
   - No partial reservations or orphaned lines are created.

3. **When `allow_overbooking = TRUE`:**
   - Free stock is calculated atomically under row locks.
   - For a line requesting $Q$ units when $F$ units are free ($Q > F$):
     - Exactly $F$ units (if serialised) or quantity $F$ are reserved in `inventory_reservations`.
     - Exactly $S = Q - F$ is recorded in `booking_lines.short_quantity`.
     - Zero phantom serials or physical units are assigned for the $S$ short units.
     - An entry is logged in `booking_at_risk` with `cause = 'overbooking_shortage'` and notes indicating e.g. `1 short — sub-rent or swap`.
     - Confirmation succeeds with the booking moving from `Quote` to `Booked`.

---

## 4. Concurrency & Locking Discipline

- `confirm_booking_atomic` acquires row-level locks on affected `products` (`FOR UPDATE` ordered by `id`) and existing active holds before evaluating capacity.
- This ensures concurrent booking confirmations cannot race for the same free stock: the first transaction commits its reservations, and the second transaction either takes the remaining free stock or records the remainder as a shortage (if enabled) or fails closed (if disabled).

---

## 5. Role Checks & Money Blindness (Law 6)

- **Product Configuration:** Only `Owner`, `Admin`, and `Manager` can set `allow_overbooking` on products. Warehouse, Technician, Driver, and Client cannot modify this flag (enforced in `save_record_editor` and `bulk_update_products`).
- **Visibility:** Shortages (`1 short — sub-rent or swap`) are visible to desk staff (Owner, Admin, Manager, Coordinator) and to floor staff (Warehouse) on Booking Detail, Rentals List, and Today.
- **Law 6 (Money Blindness):** Warehouse views of shortages and at-risk queues NEVER render rental rates, supplier costs, or pricing breakdowns in the DOM or API payloads.

---

## 6. Downstream Floor Gates (Pack & Handover)

1. **Pack Gate:**
   - Database trigger `trg_enforce_pack_shortage_gate` on `booking_stage_transitions` ensures that transitioning to `Packed` fails closed if any active line has `short_quantity > 0` or unresolved `booking_at_risk`.
   - Error code: `GATE:gate.pack.shortage|Booking % has unresolved shortages and cannot reach Pack until covered.`

2. **Handover Gate:**
   - Transitioning directly to `On Rent` also checks `short_quantity = 0`, ensuring Handover cannot bypass an unresolved shortage stop.

---

## 7. Shortage Resolution Lifecycle (T3-13 Integration)

A shortage cannot be cleared by a mere UI click. It must be resolved via an audited business action:
1. **Partner Sub-Rent (`sub_rent`):** Staff enters partner sub-rental line (cross-hire) to fulfill the short demand.
2. **Similar Item Swap (`similar_item`):** Staff swaps an approved compatible substitute into the booking.
3. **Internal Unit Release:** If an owned unit becomes free (e.g., prior booking returns early or is cancelled), it can be assigned to the short line.
4. **Resolution RPC:** Calling `resolve_booking_at_risk` with authorized resolution clears `short_quantity` and sets `resolved_at = now()`, unlocking the Pack gate.

---

## 8. Removal of Legacy Device-Only Setting

- Remove `getAllowOverbooking()` usage from `AddItemPanel.tsx` in favor of reading the product's server-authoritative `allow_overbooking` attribute.
- Deprecate device-only toggle in `src/modules/settings/sections/shared.tsx` and `Financial.tsx`, rendering an informative read-only note pointing to the equipment form.
- Remove `(allowOverbooking || true)` no-op in `AddItemPanel.tsx`.

---

## 9. Verification & Lifecycle Steps

1. **Step L-OB1:** Booking past stock with `allow_overbooking = false` fails closed (zero reservations, Quote remains).
2. **Step L-OB2:** Booking past stock (e.g. 3 requested, 2 free) with `allow_overbooking = true` confirms with 2 reserved and 1 short; GiST constraint holds.
3. **Step L-OB3:** Pack gate rejects the booking with unresolved shortage.
4. **Step L-OB4:** Resolving shortage via sub-rent/swap clears shortage and enables Pack.
