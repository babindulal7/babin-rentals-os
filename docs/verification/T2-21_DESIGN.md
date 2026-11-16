# T2-21 · Planned Equipment Downtime with a Reason — Design Note

**Status: BLOCKED — Awaiting Babin / Claude architectural review before database/code modifications.**
Branch: `lane-a/T2-21-planned-downtime-with-a-reason`
Card: `docs/plans/T2_FLOOR.md` T2-21 (Lane A · [go-live] · slips first)
Rulings & Rules: B10 (reasons list), B53, Law 3 (named terminal actions), Law 8 (idempotent writes via `client_uuid`), PERMISSIONS §4.3 (`maintenance.create`).

---

## 1. Architectural Choice: Single Table vs Separate Table

The card requires picking between:
- **Option 1**: A `Downtime` hold inside `inventory_reservations` (making `booking_id` nullable for downtime holds only, leveraging existing GiST exclusion constraint and capacity ceiling).
- **Option 2**: A dedicated `equipment_downtime` table with cross-table checks.

### Recommendation: Option 1 (`inventory_reservations` Extension)

**Why Option 1 is selected:**
1. **Zero-Race Concurrency**: PostgreSQL cannot enforce an exclusion constraint across two separate tables without table-level locking (`SHARE ROW EXCLUSIVE` or distributed advisory locks). Under Option 1, the kernel-level GiST exclusion constraint:
   ```sql
   exclude using gist (asset_id with =, period with &&)
   where (released_at is null and hold_state in ('confirmed', 'active_hold') and asset_id is not null)
   ```
   natively, atomically, and symmetrically prevents:
   - A booking from reserving a unit undergoing planned downtime.
   - A planned downtime from being scheduled over an active booking reservation.
2. **Quantity-Tracked Product Support**: Migration `0045` / `0188` already enforces `enforce_inventory_reservation_capacity()` on `inventory_reservations`. When downtime is planned for $k$ units of a non-serialized product, inserting a downtime reservation with `product_id = <uuid>, qty = k` automatically decrements available capacity during that window, without needing any secondary trigger logic.
3. **Availability Engine Uniformity**: `src/lib/availability.ts` and `src/lib/queries/availability.ts` already query `inventory_reservations`. Treating downtime as a first-class reservation avoids complex multi-table union queries in latency-sensitive booking search and public catalog availability checks (`public_availability`).

---

## 2. Database Schema Design (Claiming Migration `0237`)

### 2.1 Table Alterations on `inventory_reservations`

```sql
-- 1. Make booking references optional for downtime holds
alter table inventory_reservations
  alter column booking_id drop not null,
  alter column booking_line_id drop not null;

-- 2. Add reservation kind and downtime fields
create type reservation_kind as enum ('booking', 'downtime');

alter table inventory_reservations
  add column kind reservation_kind not null default 'booking',
  add column downtime_reason text,
  add column downtime_notes text,
  add column ended_by uuid references users(id);

-- 3. Invariants
alter table inventory_reservations
  add constraint inventory_reservations_kind_integrity check (
    (kind = 'booking' and booking_id is not null and booking_line_id is not null and downtime_reason is null) or
    (kind = 'downtime' and booking_id is null and booking_line_id is null and downtime_reason is not null)
  );

alter table inventory_reservations
  add constraint inventory_reservations_downtime_reason_check check (
    downtime_reason is null or downtime_reason in (
      'Repair',
      'Service or calibration',
      'Our own shoot',
      'Lent to a partner',
      'Marketing shoot',
      'Other'
    )
  );

alter table inventory_reservations
  add constraint inventory_reservations_downtime_other_requires_notes check (
    downtime_reason <> 'Other' or (downtime_notes is not null and length(trim(downtime_notes)) >= 3)
  );
```

### 2.2 Integration with 0188 Smart Holds

- When creating planned downtime, `hold_state` is set to `'confirmed'`.
- If an existing reservation (either `'confirmed'` or `'active_hold'`) overlaps the requested period, the GiST constraint blocks the insert.
- **Friendly Collision Diagnosis**: A database function `plan_equipment_downtime(p_params jsonb)` queries overlapping active reservations prior to insertion. If an overlap is detected, it raises an exception naming the conflicting booking number (`"BK-1234 has it on those dates"`).
- **"End now" Terminal Action (Law 3)**:
  `end_equipment_downtime(p_reservation_id uuid, p_client_uuid uuid)`:
  - Updates `released_at = now()`, `released_reason = 'Ended early by staff'`, `hold_state = 'released'`, `ended_by = auth.uid()`.
  - GiST filter `where (released_at is null ...)` immediately frees the asset for future bookings.
  - Logs structured entry to `audit_events` (action `'Maintenance'`, Law 8 `client_uuid`).

---

## 3. Permissions & Role Matrix

Per PERMISSIONS §4.3 (`maintenance.create` capability):
- **Allowed Roles**: `Coordinator`, `Manager`, `Admin`, `Owner`, `Technician`.
- **Restricted Floor/Office Roles**: `Warehouse`, `Driver`, `Accountant` cannot plan or end downtime.
- RLS policy on `inventory_reservations` for `kind = 'downtime'`:
  - `SELECT`: All authenticated staff roles can view downtime holds (needed for calendar, availability, and floor planning).
  - `INSERT / UPDATE`: Restricted to roles satisfying `auth_can_manage_maintenance()`.

---

## 4. Availability & Conflict Engine Integration

1. `src/lib/availability.ts`:
   - `inventory_reservations` rows with `kind = 'downtime'` count towards unavailable unit periods.
   - For serialized assets: `isAssetAvailable(assetId, start, end)` returns `false` if an active downtime overlaps.
   - For quantity-tracked products: available quantity is reduced by total downtime quantity in that interval.
2. `src/lib/queries/availability.ts` / `T3-22`:
   - Returns downtime details (`reason`, `notes`, `start`, `end`) when an asset is inspected, allowing desk staff to understand why an item is blocked.
3. `Calendar.tsx`:
   - Renders a distinctive neutral/grey event bar (`#64748b`) with tooltips showing: `[Wrench Icon] Downtime: Service or calibration (Oct 12 - Oct 15)`.
4. `AssetDetail.tsx`:
   - Displays a "Planned Downtime" card showing upcoming blocks, reason badges, and an "End now" button (≥44px touch target) for active blocks.

---

## 5. Verification Checklist & Acceptance Criteria

1. **Conflict Rejection**:
   - Booking over planned downtime is rejected atomically by PostgreSQL.
   - Planned downtime over active booking is rejected with `"BK-XXXX has it on those dates"`.
2. **Early Termination**:
   - Calling "End now" sets `released_at` and immediately restores calendar and booking availability.
3. **Audit Trail**:
   - Every downtime creation and early termination records `client_uuid`, `user_id`, and `reason` in `audit_events`.
4. **Offline Mock & Security Regression**:
   - Mock engine updated to support `kind = 'downtime'` in `inventory_reservations`.
   - Security tests verify unauthorized roles (`Driver`, `Warehouse`) are 403-rejected.

---

## 6. Review Gate

**This card is currently BLOCKED pending Babin / Claude architectural sign-off on Option 1.**
No code or database migrations will be written until this design note is formally approved.
