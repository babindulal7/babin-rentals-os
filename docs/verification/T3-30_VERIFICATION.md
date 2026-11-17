# Verification: T3-30 — Consumables: unit price, add at desk, restock, low stock

**Card:** T3-30  
**Lane:** `lane-c/T3-30-consumables-unit-price-add-at-the`  
**Migration:** `supabase/migrations/0239_consumables_pricing_restock_and_low_stock.sql`  
**Status:** Implemented & Verified

---

## 1. Requirement & User Intent

Consumable items (e.g. gaffer tape, lens cleaning wipes, batteries, fog fluid) differ fundamentally from rental assets:
1. **Unit Sale Price vs Day Rate:** Consumables are sold, not rented. A 3-day booking with 2 rolls of gaffer tape must charge for 2 units, NEVER $2 \times 3\text{ days} = 6\text{ units}$.
2. **Add at Desk:** Staff on the floor or front desk must be able to add consumables to an active booking quickly (`add_consumable_line` RPC).
3. **Restock Management:** Staff can record incoming stock batches with supplier and cost details (`restock_consumable` RPC and `RestockConsumableModal`).
4. **Low Stock Alerts:** Staff see proactive alerts when consumable inventory dips below reorder thresholds (`RoleTaskCockpit` and Inventory views).
5. **Money Blindness (Law 6):** Floor workers (Warehouse, Technician, Driver) and external Clients see quantity and stock levels, but unit prices, costs, and line totals are strictly masked (`NULL`).

## 2. Changes Implemented

### Database Layer (`supabase/migrations/0239_consumables_pricing_restock_and_low_stock.sql`)
1. **Products Table & View:**
   - Added `unit_sale_price numeric(14,2)` to `products`.
   - Updated `products_v` to mask `unit_sale_price` for non-money roles (`Warehouse`, `Technician`, `Driver`, `Client`).
2. **Pricing Logic in Postgres:**
   - `create_booking` and `confirm_booking_atomic` compute consumable lines as `qty * coalesce(unit_sale_price, 0)`, explicitly ignoring rental duration (`days`).
3. **Restock Tracking:**
   - Table `consumable_restock_movements` records batch size, supplier, cost, date, staff, `quantity_before`, and `quantity_after`.
   - RPC `restock_consumable`: atomic, audited, idempotent via `client_uuid`.
   - View `consumable_restock_movements_v`: masks `cost` for non-money roles under Law 6.
4. **Add Consumable Line:**
   - RPC `add_consumable_line`: allows adding consumable products directly to an existing booking on the desk/floor with idempotency.

### Frontend Application
1. **Actions (`src/actions/`):**
   - `restockConsumable.ts`: client action for `restock_consumable` RPC with role checks and offline fallback.
   - `addConsumableLine.ts`: client action for `add_consumable_line` RPC.
2. **Inventory UI:**
   - `src/modules/inventory/modals/RestockConsumableModal.tsx`: modal to record restock quantities and supplier notes with Law 6 cost gating.
   - `src/modules/inventory/AssetDetail.tsx` & `Inventory.tsx`: displays unit sale price for money roles, stock counts, and restock actions.
3. **Rentals Desk UI:**
   - `src/modules/rentals/booking/AddConsumableModal.tsx`: fast addition modal on booking detail and rental tree.
   - `src/modules/rentals/booking/RentalLineItemsTree.tsx` & `BookingDetail.tsx`: integrates consumable lines and triggers desk addition.
4. **Pricing Engine:**
   - `src/lib/pricingPipeline.ts` & `src/lib/rentalDraftPricing.ts`: ensures consumable lines are never multiplied by rental days.
5. **Today Dashboard Alerts:**
   - `src/modules/today/RoleTaskCockpit.tsx`: low consumable stock warning indicators.

## 3. Verification & Testing

1. **Unit Tests (`src/lib/__tests__/consumablesPricingAndRestock.test.ts`)**:
   - Tested 3-day rental with 2 tape rolls charges exactly 2 units, not 6.
   - Tested VAT application to consumable subtotals.
   - Tested permission checks and Law 6 role gating.
   - All 8 unit tests pass green.
2. **Lifecycle Integration Test (`scripts/e2e-lifecycle.mjs`)**:
   - Step `L73` executes end-to-end consumables workflow:
     - Creates consumable product.
     - Creates 3-day booking with 2 units: verifies total is `2 * price`, not `6 * price`.
     - Warehouse restocks: verifies quantity increments, cost returned is NULL (Law 6).
     - Manager restocks: verifies cost is visible.
     - Adds consumable line on the floor via `add_consumable_line`: verifies idempotency and role masking.
   - All 74 lifecycle steps green.
3. **Database Checks (`npm run check:pglite`)**:
   - 236/236 migrations applied cleanly from scratch, 202 security definers pinned.
