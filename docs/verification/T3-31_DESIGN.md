# T3-31 Design Note: Counter Sale Architecture & Specifications

**Card:** T3-31 · Counter sale  
**Lane:** Windows T3 Lane (Lane C)  
**Date:** 19 November 2026 (NPT)  
**Status:** Design Reviewed & Proposed (Claiming Migration 0249)  
**Dependencies:** T3-30 (Consumables unit pricing/stock, acceptance-pending), T3-14 (Draft invoice numbering at full payment, in progress), O-14/O-17 (Accountant invoice rulings)  

---

## 1. Architectural Trade-Off Analysis

### Option A: `booking.kind = 'counter_sale'` (Recommended)
In this model, a counter sale is represented within the core `bookings` entity by extending `booking_kind` (`'rental' | 'quote' | 'subrental' | 'counter_sale'`) and setting custody stages to a bypass/completed status (no `Pack`, `Handover`, or `Return` lifecycle steps; `custody_stage = 'completed'`).

* **Pros:**
  - **Reuses Canonical Invoices:** Instantly shares `invoices_v`, `create_invoice`, `issue_invoice_number`, and `resync_draft_invoice` without duplicating invoice schemas.
  - **Reuses Payments & Daily Closing:** Payments link directly to `booking_id` and `invoice_id`. Automatically rolls up into `today_cash_summary` (W16), sales registers, and cash closing without secondary aggregation joins.
  - **Reuses Role Money Blindness (Law 6):** Automatic enforcement via existing `auth_can_view_money()` on bookings and invoices.
  - **Smallest Blast Radius:** Zero new tables required; extends `booking_kind` constraint and adds atomic RPC `create_counter_sale(jsonb)`.
* **Cons:** Requires explicit filtering in rental floor lists (today handover/return queues) to exclude `kind = 'counter_sale'` (which is already standard for quotes).

### Option B: Independent `sales` and `sale_items` Tables
In this model, a distinct table hierarchy (`sales`, `sale_lines`) is introduced completely decoupled from rentals.

* **Pros:** Complete domain decoupling from equipment rental lifecycle.
* **Cons:**
  - **Massive Schema Duplication:** Requires either genericizing `invoices.booking_id` to a polymorphic target, or creating a separate sales billing path that fragments `invoices_v`, `payments`, `sales_vat_register_v`, and accountant monthly exports (T3-23).
  - **Daily Closing Fragmentation:** Breaks `today_cash_summary` and financial audit trails unless all reporting queries are rewritten to `UNION ALL` across bookings and sales.
  - **High Risk of Migration Conflicts:** Violates minimal diff requirement and conflicts with ongoing T3-14/T3-30 lanes.

**Conclusion:** **Option A** is the smallest safe architecture consistent with existing canonical invoice, stock, payment, role, audit, and daily-close contracts.

---

## 2. Migration Ledger Claim & Schema Design

* **Claimed Migration:** `0249_counter_sale_atomic_engine.sql` (claimed in `docs/plans/MIGRATION_LEDGER.md` immediately following `0248`).
* **Entity Changes:**
  1. Add `'counter_sale'` to `bookings.kind` check constraint.
  2. Ensure rental custody triggers (`validate_booking_stage_transition`) skip custody requirements when `kind = 'counter_sale'`.
  3. Support non-serialized consumables lines in `booking_lines` linked with `line_type = 'Consumable'`.

### Atomic Server RPC: `create_counter_sale(payload jsonb)`
```sql
create or replace function public.create_counter_sale(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
-- 1. Validate caller is authenticated staff (Floor roles permitted to initiate).
-- 2. Check client_uuid idempotency against bookings.client_uuid. If existing, return existing record.
-- 3. Verify stock availability for requested consumable units atomically (FOR UPDATE lock).
--    If insufficient stock, RAISE EXCEPTION 'INSUFFICIENT_STOCK' (fail-closed, no partial deduct).
-- 4. Insert booking (kind='counter_sale', stage='confirmed', custody_stage='completed').
-- 5. Insert booking_lines for consumables (quantity x unit_price).
-- 6. Record inventory movements (movement_type='counter_sale_deduct', qty=-N).
-- 7. Decrement stock on product_units / consumables tracking table.
-- 8. Generate Draft Invoice via create_invoice_draft.
-- 9. Emit audit log entry.
-- Returns: { booking_id, invoice_id, client_uuid, total_paisa }
$$;
```

---

## 3. Idempotency, Cancellation & Financial Safety

1. **Idempotency (Law 8):**
   - The RPC takes a mandatory client-generated `client_uuid`.
   - Repeated calls with the same `client_uuid` return the existing sale and draft invoice without deducting inventory or creating duplicate lines.

2. **Full Payment & Invoice Numbering (T3-14 / Law 7):**
   - At sale creation, the invoice is strictly in **Draft** state (`status = 'draft'`, no sequential `INV-YYYY-XXXXX` assigned).
   - Only when full payment is recorded by desk staff does the system invoke `issue_invoice_number()`, guaranteeing monotonic sequential tax numbers without gaps.
   - Respects O-14/O-17 compliance boundaries: no invoice alteration once issued.

3. **Cancellation Before Payment (Law 3 & Law 4):**
   - Unpaid counter sales can be cancelled via `cancel_counter_sale(p_sale_id uuid, p_reason text)`.
   - Marks booking stage as `'cancelled'`, voids draft invoice.
   - Atomically creates reversing inventory movement (`movement_type='counter_sale_cancel_restore'`, qty=+N) restoring shelf stock.
   - **Immutable History:** Paid sales can **NEVER** be deleted or cancelled. Reversals require standard credit notes and refunds.

---

## 4. Floor Role Ergonomics & Money Blindness (Law 6)

1. **Floor Walk-in Ergonomics (≤ 5 taps):**
   - Tap 1: "Counter Sale" button on Today / New Rental header.
   - Tap 2: Select consumable (e.g. Sony NP-FZ100 Battery).
   - Tap 3: Increment quantity to 3 (+ button).
   - Tap 4: Tap "Handover to Client".
   - Tap 5: Tap "Send to Desk for Payment".
2. **Law 6 Enforcement:**
   - Floor roles (**Warehouse, Technician, Driver**) do not see unit prices, line subtotals, VAT, or grand totals in the Counter Sale UI or payload.
   - Desk/Accounts role opens the pending sale, verifies total paisa with VAT, and executes payment.

---

## 5. Verification Test Matrix

1. **Atomic Creation & Stock Decrement:** Walk-in buys 3 batteries -> stock drops from 10 to 7; draft invoice created.
2. **Idempotent Retry:** Calling `create_counter_sale` twice with identical `client_uuid` returns existing sale; stock remains at 7 (no double decrement).
3. **Shortage Fail-Closed:** Attempting to buy 8 batteries when only 7 remain raises `INSUFFICIENT_STOCK`; stock remains at 7; zero bookings created.
4. **Cancellation Stock Restore:** Cancelling unpaid sale creates reversing movement (+3); stock restored to 10.
5. **Law 6 Money Blindness:** Warehouse role calling counter sale APIs or viewing UI receives zero rate/price fields.
6. **Daily Closing Verification:** Fully paid counter sale appears in `today_cash_summary` with correct cash/bank account attribution.

---

## 6. Upstream Blocking Dependencies

- **T3-30 (Consumables Pricing & Restock):** Acceptance pending; consumable unit pricing and stock decrements rely on 0239 baseline.
- **T3-14 (Draft Invoice at Confirm, Number on Full Payment):** In progress in Lane C; invoice numbering must align with T3-14's monotonic sequence.
- **O-14 / O-17 Legal Compliance:** Written confirmation from Babin/Accountant on retail over-the-counter VAT receipts vs full tax invoices.
