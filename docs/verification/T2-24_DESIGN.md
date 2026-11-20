# T2-24 · Temporary stock from partners — Design Note

**Status: DRAFT — submitted for Babin & Claude check-in review**  
**Card:** [`docs/plans/T2_FLOOR.md`](../plans/T2_FLOOR.md) T2-24 (Lane A · [go-live] · slips first)  
**Rulings:** B13 (temporary partner stock), B36 (return to partner task), B47 (partner charges), B53, Law 1 (engines own logic), Law 3 (immutability / nothing deleted), Law 6 (money blindness), Law 8 (idempotent `client_uuid` writes).  
**Dependencies:** T2-21 (Planned downtime & availability), T2-08 (QR labels with "PARTNER"), T3-13 (suppliers/partner flow). All dependencies are merged and verified on `main`.

---

## 1. Business Concept & Invariants (B13, B36, B47)

Babin Rentals frequently borrows specialized lenses, lights, or cameras from partner production houses or rental houses for a limited period (e.g. 5 days) to meet project demand.

1. **Window Boundedness:** Partner units exist for booking and reservations **strictly between `available_from` and `available_until` (UTC)**. Outside this window, they do not exist for availability, and no booking may start before `available_from` or return after `available_until`.
2. **Asset Separation:** Partner units are stored in `product_units` with a non-null `temporary_stock_id` reference and `is_partner_unit = true`. They are excluded from:
   - Owned equipment asset counts
   - Balance sheet asset value
   - Fixed asset depreciation
   - Owned equipment ROI calculations
3. **Labels & Floor Identification (T2-08, B13):**
   - Printed QR asset labels for partner units display the **"PARTNER ⭐"** badge prominently above the barcode and asset code so floor technicians easily distinguish partner gear from Babin-owned inventory.
4. **Floor Return Task (B36):**
   - When the agreement end date arrives, an automatic **"Return to partner" task** surfaces in the floor queue listing the units.
   - Returning staff scan each unit (photo optional), marking the terminal action **"Returned to partner"** (Law 3).
   - Once returned, the units become permanently inactive and unavailable.
5. **Money Blindness (Law 6, B47):**
   - Supplier cost (whether fixed sum or per-day rate in paisa) is strictly visible only to money roles (`Owner`, `Admin`, `Manager`, `Accounts`).
   - Warehouse, Technician, and Driver see the units, asset tags, partner name, and return deadlines, but **never see the supplier cost or rate in the DOM, network payloads, or views**.

---

## 2. Database Schema & Migration (Claiming Migration `0247`)

### 2.1 Table: `temporary_stock`
```sql
create type partner_cost_kind as enum ('daily', 'fixed');
create type temporary_stock_status as enum ('Active', 'Returned to partner', 'Cancelled');

create table public.temporary_stock (
  id                  uuid primary key default gen_random_uuid(),
  client_uuid         uuid not null unique,
  supplier_id         uuid not null references public.suppliers(id),
  product_id          uuid not null references public.products(id),
  tracking_mode       tracking_mode not null default 'Serialised',
  quantity            integer not null check (quantity > 0),
  available_from      timestamptz not null,
  available_until     timestamptz not null,
  cost_kind           partner_cost_kind not null,
  cost_paisa          bigint not null check (cost_paisa >= 0),
  status              temporary_stock_status not null default 'Active',
  notes               text,
  returned_at         timestamptz,
  returned_by         uuid references auth.users(id),
  created_at          timestamptz not null default now(),
  created_by          uuid not null references auth.users(id),
  constraint chk_temp_stock_window check (available_until > available_from)
);

-- RLS: Read by staff; money columns masked for floor roles under Law 6
alter table public.temporary_stock enable row level security;
```

### 2.2 Product Units Linkage
```sql
alter table public.product_units
  add column if not exists temporary_stock_id uuid references public.temporary_stock(id),
  add column if not exists is_partner_unit boolean not null default false;

create index if not exists idx_product_units_temp_stock
  on public.product_units(temporary_stock_id)
  where temporary_stock_id is not null;
```

### 2.3 RPCs
1. **`record_temporary_stock(p_payload jsonb)`**:
   - Creates the agreement and mints `product_units` with partner asset codes (e.g. `P-LENS-01`).
   - Owner, Admin, Manager only.
2. **`return_temporary_stock(p_payload jsonb)`**:
   - Validates that no active booking holds a unit from this stock.
   - Sets status to `'Returned to partner'`, records actor and time.
   - Marks the linked `product_units` as `'Retired'` / `'Returned to partner'`.

---

## 3. Availability Integration (`src/lib/availability.ts` & SQL)

Availability calculations (in `get_available_product_capacity`, `availability.ts`, and `availabilityEvaluation.ts`) compose partner units dynamically:
- For a query window $[T_{\text{pickup}}, T_{\text{return}})$:
  - An owned unit contributes $+1$ to capacity unless booked or down for maintenance (T2-21).
  - A partner unit contributes $+1$ to capacity **if and only if** $[T_{\text{pickup}}, T_{\text{return}}) \subseteq [\text{available\_from}, \text{available\_until})$ AND status is `'Active'`.
  - If a booking's return exceeds `available_until`, the partner unit capacity is 0 for that booking.

---

## 4. Unresolved Product Decision (Open Decision O-33)

**TODO(decision):**
If a partner rental agreement has a fixed cost (e.g. Rs 10,000 for 5 days) and the equipment is used across two separate client bookings during that window:
- How should the partner cost be allocated to each booking's profitability calculation?
  - *Option 1:* Pro-rated by rental days of each booking.
  - *Option 2:* Attributed to the first booking that triggered the partner request.
  - *Option 3:* Kept at the inventory/sub-rent report level and not split across individual booking profit lines.

*Recommendation:* Option 3 until ruled. The sub-rent report displays the full partner agreement cost directly under the supplier's statement, and individual booking profit cards show partner cost only when a line is directly tied to a single booking.

---

## 5. Verification & Lifecycle Steps (Planned for Step L90 & L91)

1. **Step L90 (Partner Stock Window Enforcement):**
   - Create temporary stock for 2 lenses available from Day 10 to Day 15.
   - A booking inside Day 11–14 successfully reserves the partner lenses.
   - A booking from Day 14–16 (extending past Day 15) is REFUSED by the database capacity ceiling.
2. **Step L91 (Return to Partner & Law 6 Masking):**
   - Floor task appears at Day 15.
   - Warehouse inspects task: sees partner name, units, and dates, but zero cost figures.
   - Closing the task transitions stock to `'Returned to partner'` and removes availability.
