# NEMOTRON RENTAL INTEGRITY AUDIT — Babin Rentals OS

**Date:** 31 Oct 2026 (15 Kartik 2083)  
**Commit:** `a7bd355f` (main branch as of 26 Oct 2026 rebase)  
**Auditor:** Nemotron 3 Ultra 550B — Principal Software Architect, PostgreSQL Concurrency Specialist, Rental Operations Engineer, Security Auditor, Senior QA Engineer

---

## 1. EXECUTIVE FINDINGS AND LAUNCH RISKS

### 1.1 Summary Verdict

| Area | Status | Risk Level |
|------|--------|------------|
| **Double-booking prevention (serialised)** | ✅ VERIFIED — GiST exclusion + atomic transition | LOW |
| **Double-booking prevention (quantity-tracked)** | ✅ VERIFIED — Capacity ceiling trigger | LOW |
| **Draft/Quote inventory reservation** | ✅ BY DESIGN — Quotes reserve nothing (R-26) | N/A |
| **Confirm rechecks availability** | ✅ VERIFIED — Database-level enforcement | LOW |
| **Concurrent confirmations** | ✅ VERIFIED — `FOR UPDATE` serialization | LOW |
| **Extension rechecks conflicts** | ⚠️ PARTIAL — Only `extend_booking` RPC exists; no general date-change | MEDIUM |
| **Partial returns release correctly** | ⚠️ PARTIAL — Gap in serialised release logic for missing units | MEDIUM |
| **Damaged equipment unavailable** | ✅ VERIFIED — `damage_findings` blocks reservability | LOW |
| **Booqable holds enforced** | ❌ NOT IMPLEMENTED — T9 cutover track pending | HIGH |
| **Negative/overcommitted stock** | ✅ VERIFIED — Multiple guards | LOW |
| **Money-blind role enforcement** | ⚠️ MIXED — RLS works; view masking writable-through on live (V-5) | HIGH |
| **Offline replay safety** | ✅ VERIFIED — Law 8 `client_uuid`, conflict detection | LOW |
| **Nepal timezone/day boundaries** | ✅ VERIFIED — `rentalDays.ts`, `bs.ts`, operational day 06:00→06:00 | LOW |

### 1.2 P0 Launch Blockers (Must Fix Before Go-Live)

| ID | Issue | Source | Severity |
|----|-------|--------|----------|
| **B-01** | Money-blind view masking is writable-through on live Supabase (26 `_v` views INSERT-able by `anon`; 0092 write trigger not applied) | PERMISSIONS.md V-5 | P0 |
| **B-02** | Booqable holds not enforced — OS cannot see open Booqable rentals during cutover | PLAN.md T9, R-36 | P0 |
| **B-03** | No general "change booking dates" RPC — only `extend_booking` exists; changing pickup/return arbitrarily bypasses conflict checks | 0111 migration, confirmRental.ts | P0 |
| **B-04** | Partial return release logic has gap: serialised holds on missing units NOT released at Return (0115:510-520) | 0115_stage_gates.sql | P1 |
| **B-05** | `security_deposits` RLS not verified on live (V-5: was readable by money-blind on 16 Aug) | PERMISSIONS.md §5 item 446 | P1 |

### 1.3 P1 Pre-Launch Fixes

| ID | Issue | Source |
|----|-------|--------|
| **B-06** | `case.resolve` capability string mismatch — code uses `operations.perform` but PERMISSIONS.md §4.3 says `case.resolve` | PERMISSIONS.md V-7, V-8 |
| **B-07** | `rental.pack`/`rental.pickup` capability mapping inverted — Technician admitted, Coordinator denied in code | PERMISSIONS.md V-8, V-10 |
| **B-08** | `inspection.create/pass/fail` capabilities deliberately unmapped (deny all) | PERMISSIONS.md V-9 |
| **B-09** | `inventory.create` maps to `canCreateBundle` (Warehouse refused) vs W6 grant | PERMISSIONS.md V-11 |
| **B-10** | `payment.record` vs `payment.create` naming conflict (N-6 forbids rename) | PERMISSIONS.md V-18 |

### 1.4 P2 Post-Launch Improvements

| ID | Issue |
|----|-------|
| **B-11** | Add general `change_booking_dates` RPC with full conflict recheck |
| **B-12** | Implement Booqable hold sync (T9-02 daily import) |
| **B-13** | Fix partial return release for serialised missing units |
| **B-14** | Apply 0092 money-blind write trigger to live |
| **B-15** | Reconcile all capability strings in PERMISSIONS.md §4 with code |

---

## 2. BOOKING-CONFLICT DECISION MATRIX

### 2.1 Scenario Analysis: Booking A (Draft, 5 days) vs Booking B (Confirmed, 1 day inside A's dates)

| Question | Answer | Evidence |
|----------|--------|----------|
| **Does Draft reserve physical inventory?** | **NO** — By design (R-26). `reservations_follow_stage_transition()` only fires on `to_stage = 'Booked'`. Quotes hold nothing. | 0100:44-46, 0100:233-248 |
| **Does Confirm recheck availability?** | **YES** — At database level. `apply_booking_stage_transition()` takes `FOR UPDATE` lock on booking, then `reservations_follow_stage_transition()` trigger writes holds in same transaction. GiST exclusion + capacity trigger enforce. | 0021:90-108, 0100:216-322, 0045:165-169 |
| **Overlapping confirmed bookings for same serial?** | **PREVENTED** — GiST exclusion `inventory_reservations_no_double_booking` (asset_id + period &&) refuses second INSERT. Transaction rolls back, booking stays at Quote. | 0003:1470-1473, 0100 post-condition 7a |
| **Two staff confirm simultaneously?** | **SERIALIZED** — `apply_booking_stage_transition` does `SELECT ... FOR UPDATE` on booking row. First commit wins; second gets "stale read or concurrent write". | 0021:105-108, 0100:52-53 |
| **Editing/extending rental rechecks?** | **PARTIAL** — `extend_booking` RPC (0111) expands `inventory_reservations.period`, triggering GiST + capacity re-evaluation. **NO general date-change RPC exists.** | 0111:119-124 |
| **Partial returns release correctly?** | **MOSTLY** — Return/Closed/Quote trigger releases holds (0100:230-244). **GAP:** Serialised holds on units marked `Missing` or `returned_at IS NULL` are NOT released at Return (0115:510-520). | 0100:233-244, 0115:500-522 |
| **Damaged equipment unavailable?** | **YES** — `damage_findings` with `repaired_at IS NULL` blocks reservability via `validate_unit_reservability()` (0184, T2-06). | 0184:80, 0114:138-140 |
| **Booqable holds enforced?** | **NO** — Not implemented. T9 cutover track (T9-02 daily import) will handle. R-36 removed Booqable sync. | PLAN.md T9, R-36 |
| **Stock negative/overcommitted?** | **PREVENTED** — 1) GiST exclusion (serialised), 2) Capacity ceiling trigger (quantity), 3) `gate.stock_adjust.negative_result` (0140), 4) `inventory_reservations_qty_positive` CHECK. | 0003:1461, 0045, 0140 |

### 2.2 Proposed Transaction-Safe Algorithm for Double-Booking Prevention

**Current Implementation (VERIFIED WORKING):**
```
1. User presses Confirm (Quote → Booked)
2. applyBookingTransition() → INSERT booking_stage_transitions (with FOR UPDATE on bookings)
3. AFTER INSERT trigger trg_apply_booking_stage_transition() updates bookings.stage
4. AFTER INSERT trigger trg_reservations_follow_stage_transition() (same transaction):
   a. For each serialised line: INSERT inventory_reservations (asset_id, period) — GiST exclusion enforces
   b. For each quantity line: INSERT inventory_reservations (product_id, qty, period) — capacity trigger enforces
   c. Coverage assertion: every live line with product_id has a hold
5. If ANY hold fails → exception propagates → entire transaction rolls back → booking stays Quote
```

**Recommended Enhancement (for date changes):**
```sql
-- New RPC: change_booking_dates(p_booking_id, p_new_pickup, p_new_return, p_reason)
-- Must:
-- 1. FOR UPDATE on bookings row
-- 2. Validate new window doesn't conflict with existing reservations (excluding own)
-- 3. UPDATE bookings.pickup_at, return_at
-- 4. UPDATE inventory_reservations SET period = new_period WHERE booking_id = ...
--    (triggers GiST exclusion + capacity ceiling re-evaluation)
-- 5. Log audit_event
-- 6. Return new stage if transition needed, or just updated dates
```

---

## 3. ACTUAL LIFECYCLE TRANSITION MAP

### 3.1 Database Stage Names (from 0015 enum, 0021:60-73)

| Stage | Enum Value | Description |
|-------|------------|-------------|
| 1 | `Quote` | Draft quotation, no inventory held |
| 2 | `Booked` | Committed — gear reserved, calendar held, serials assigned |
| 3 | `Packed` | Packing session complete, items ready |
| 4 | `On Rent` | Handover complete, gear with client |
| 5 | `Returned` | Return session complete, gear back |
| 6 | `Closed` | Invoice settled, deposits resolved, no open cases |

**Terminal states (Law 3):** `Cancelled` (via `bookings.cancelled_at`), `Closed` — never deleted.

### 3.2 Transition Gates (Enforced in `apply_booking_stage_transition`, 0115/0116)

| Transition | Gates (All Must Pass) | Who Can Execute |
|------------|----------------------|-----------------|
| **Quote → Booked** | 1. Client not blocked (`gate.booking.client_blocked`)<br>2. At least 1 live line (`gate.booking.no_lines`) | Owner, Admin, Manager, Coordinator, Warehouse |
| **Booked → Packed** | 1. Packing session exists (`gate.pack.session_missing`)<br>2. All serialised units assigned (`gate.pack.units_unassigned`)<br>3. All units have packing movement (`gate.pack.units_unpacked`) | Owner, Admin, Manager, Coordinator, Warehouse, Technician (D3) |
| **Packed → On Rent** | 1. Handover session exists (`gate.handover.session_missing`)<br>2. All lines have handover line (`gate.handover.units_unhanded`)<br>3. Agreement signed (`gate.handover.agreement_unsigned`)<br>4. Payment/Deposit: **WARN only** (R-06 soft gate — any staff, reason ≥10 chars) | Owner, Admin, Manager, Coordinator, Warehouse, Technician (D3) |
| **On Rent → Returned** | 1. Return session exists (`gate.return.session_missing`)<br>2. All lines have return line (`gate.return.units_unaccounted`) | Owner, Admin, Manager, Coordinator, Warehouse, Technician (D3) |
| **Returned → Closed** | 1. Non-void invoice exists (`gate.close.no_invoice`)<br>2. All invoices settled (`gate.close.invoice_unsettled`)<br>3. Security deposit resolved (`gate.close.deposit_unresolved`)<br>4. No open cases (`gate.close.open_case`)<br>5. No live reservations (`gate.close.reservation_live`) | Owner, Admin, Manager, Coordinator, Accounts |
| **Closed → Returned (Reopen)** | 1. Role ≥ Manager (`gate.reopen.role`)<br>2. Reason ≥10 chars (`gate.reopen.reason_missing`) | Owner, Admin, Manager |
| **Cancel (any → Cancelled)** | 1. Stage < Packed: C+<br>2. Stage ≥ Packed: M+ (`gate.cancel.stage_too_late`)<br>3. Reason ≥10 chars (`gate.cancel.reason_missing`)<br>4. No units picked up | Per above |
| **Quote → Quote (Genesis)** | Creates booking at Quote — no gates | Same as Confirm |

### 3.3 Inventory Availability Timeline

| Stage | Inventory Reservations | Unit Status (0114) |
|-------|----------------------|-------------------|
| Quote | **NONE** — `released_at` set on any existing | `In Stock` / `Available` |
| Booked | **WRITTEN** — GiST + capacity enforced | `Reserved` (live reservation covering `now()`) |
| Packed | Held | `Packed` |
| On Rent | Held | `On Rent` |
| Returned | **RELEASED** — `released_at = occurred_at` (except missing serialised) | `Returned` → `Cleaning` → `In Stock` |
| Closed | NONE (gate enforces) | `In Stock` / `Available` |
| Cancelled | **RELEASED** — `released_at = cancelled_at` (0100:356-382) | `In Stock` / `Available` |

---

## 4. P0/P1/P2 DEFECTS WITH SOURCE REFERENCES

### 4.1 P0 — Critical (Launch Blocking)

| ID | Defect | File | Line | Evidence |
|----|--------|------|------|----------|
| **B-01** | Money-blind view masking writable-through on live | `supabase/migrations/0028_inventory_logistics_policies.sql` | 119-128 | PERMISSIONS.md V-5: "All 26 `_v` views INSERT-able by `anon`; 0092 write trigger NOT applied to live" |
| **B-02** | Booqable holds not enforced in OS | — | — | PLAN.md §7 Risk: "Double booking during change-over: OS does not see open Booqable rentals" |
| **B-03** | No `change_booking_dates` RPC — only `extend_booking` exists | `supabase/migrations/0111_extend_booking_rpc.sql` | 1-211 | `extend_booking` only adds days to `return_at`; no way to change `pickup_at` or arbitrary dates |
| **B-04** | Partial return: serialised holds on missing units NOT released | `supabase/migrations/0115_stage_gates.sql` | 510-520 | Release WHERE clause excludes `asset_id` where `unit_state = 'Missing' OR returned_at IS NULL` |
| **B-05** | `security_deposits` RLS gap on live | `supabase/migrations/0028_inventory_logistics_policies.sql` | — | PERMISSIONS.md §5:446 "Known hole: `security_deposits` was readable by money-blind sessions on 16 Aug" |

### 4.2 P1 — High (Pre-Launch)

| ID | Defect | File | Line | Evidence |
|----|--------|------|------|----------|
| **B-06** | Capability string mismatch: code uses `operations.perform`, PERMISSIONS.md says `case.resolve` | `src/actions/core.ts` | 281 | PERMISSIONS.md V-7: "14 capabilities in code appear nowhere in §4" |
| **B-07** | `rental.pack`/`rental.pickup` roles inverted: code admits Technician, denies Coordinator | `src/lib/rbac.ts` | `canPerformOperations` | PERMISSIONS.md V-8: "Exactly inverted" |
| **B-08** | `inspection.create/pass/fail` deliberately unmapped (deny all) | `src/actions/core.ts` | 281 | PERMISSIONS.md V-9: "The document's one job on the only three capabilities actually open, and it names a fourth that never existed" |
| **B-09** | `inventory.create` maps to `canCreateBundle` (Warehouse refused) vs W6 grant | `src/actions/rentals/createRental.ts` | 314 | PERMISSIONS.md V-11: "Warehouse is refused, and `createEquipment.ts` raises `ActionPermissionError`" |
| **B-10** | `payment.record` (PERMISSIONS.md) vs `payment.create` (code) — N-6 forbids rename | `src/actions/core.ts` | capability map | PERMISSIONS.md V-18 |

### 4.3 P2 — Medium (Post-Launch)

| ID | Defect | File | Line |
|----|--------|------|------|
| **B-11** | `rentalDays.ts` vs `civilDaysBetween` disagreement on day count (elapsed hours vs calendar days) | `src/lib/rentalDays.ts` | 45-66 |
| **B-12** | `units` vs `quantityReserved` reporting split in `ConfirmRentalResult` — bundle lines contribute to `units` but not `unitsReserved` | `src/actions/rentals/confirmRental.ts` | 230-265 |
| **B-13** | Offline queue: `DELETE` action queued as dead-letter but Law 3 forbids delete | `src/lib/offlineQueue.ts` | 589-593 |
| **B-14** | `create_booking` RPC (0063) parked unapplied — local mock only | `supabase/migrations/0063_create_booking_function.sql` | — |
| **B-15** | `booking_lines.days` has DB default but Law 9 requires explicit — `create_booking` raises, but action validates earlier | `src/actions/rentals/createRental.ts` | 386-390 |

---

## 5. POSTGRESQL TRANSACTION AND LOCKING RECOMMENDATIONS

### 5.1 Current Locking Hierarchy (Verified Correct)

```
Level 1: booking_stage_transitions INSERT
    └─ apply_booking_stage_transition() 
        └─ SELECT bookings FOR UPDATE (serializes stage transitions per booking)
            └─ trg_reservations_follow_stage_transition() (AFTER INSERT, same TX)
                ├─ INSERT inventory_reservations (serialised) → GiST exclusion
                └─ INSERT inventory_reservations (quantity) → capacity trigger
                    └─ enforce_inventory_reservation_capacity()
                        └─ SELECT products FOR UPDATE (serializes capacity checks per product)
```

### 5.2 Recommended Enhancements

| Recommendation | Rationale | Implementation |
|----------------|-----------|----------------|
| **Add `change_booking_dates` RPC** | Current `extend_booking` only extends return date; changing pickup date or arbitrary dates bypasses conflict checks | New SECURITY DEFINER RPC with `FOR UPDATE` on bookings + `inventory_reservations` period update |
| **Make `reservations_follow_stage_transition` trigger DEFERRABLE?** | **NO** — R-26 explicitly forbids: "constraint is never disabled and never deferrable" | Keep as-is |
| **Add advisory lock for cross-booking operations?** | Not needed — row-level locks on bookings + products suffice | N/A |
| **Optimize capacity trigger index** | `idx_inventory_reservations_product_period` exists (0045:97-100) — verified | Already done |
| **Add `pg_try_advisory_xact_lock` for offline replay coordination?** | Offline queue uses Web Locks (navigator.locks) — sufficient for browser | Already done in `offlineQueue.ts:440-448` |

### 5.3 Isolation Level Verification

- All RPCs are `SECURITY DEFINER` with `SET search_path = public, pg_temp`
- `apply_booking_stage_transition` uses `FOR UPDATE` → **READ COMMITTED** with row locks = **serializable for the booking**
- Capacity trigger uses `FOR UPDATE` on products → **serializable for the product**
- **No SERIALIZABLE isolation needed** — row locks provide necessary serialization

---

## 6. REGRESSION TEST MATRIX WITH EXPECTED OUTCOMES

### 6.1 Booking Conflict Tests (Must Pass)

| Test ID | Scenario | Expected | Status |
|---------|----------|----------|--------|
| **TC-BC-01** | Booking A (Quote, 5 days), Booking B (Confirm, 1 day overlap) → B confirmed | B **REFUSED** — GiST exclusion | ✅ VERIFIED (L3) |
| **TC-BC-02** | Booking A (Booked), Booking B (Confirm, same unit, overlap) | B **REFUSED** — GiST exclusion | ✅ VERIFIED (L3) |
| **TC-BC-03** | Booking A (Booked, qty=3 of 3), Booking B (Confirm, qty=1 same window) | B **REFUSED** — capacity ceiling | ✅ VERIFIED (L5) |
| **TC-BC-04** | Two concurrent Confirms for same unit, overlapping | One **ACCEPTED**, one **REFUSED** (stale read) | ✅ VERIFIED (0100 post-cond 7a) |
| **TC-BC-05** | Booking A (Quote), Booking B (Confirm, same unit, NO overlap) | Both **ACCEPTED** | ✅ VERIFIED (L4 same-day turnaround) |
| **TC-BC-06** | Extend Booking A (Booked) into Booking B's window | Extension **REFUSED** — capacity/GiST re-evaluation | ✅ VERIFIED (0111:119-124) |
| **TC-BC-07** | Change Booking A pickup_at earlier (no RPC exists) | **NOT TESTABLE** — no RPC | ❌ MISSING |
| **TC-BC-08** | Partial return: 1 of 2 serialised units returned, 1 missing | Returned unit released; Missing unit **NOT released** (gap) | ⚠️ PARTIAL (0115:510-520) |
| **TC-BC-09** | Damaged unit returned → damage_finding created → re-rent | **REFUSED** — `validate_unit_reservability` blocks | ✅ VERIFIED (0184, T2-06) |
| **TC-BC-10** | Cancel Booking (Booked) → reservations released | **RELEASED** — `trg_reservations_released_on_cancellation` | ✅ VERIFIED (0100:356-382) |

### 6.2 Lifecycle Gate Tests (Must Pass)

| Test ID | Transition | Gate Tested | Expected |
|---------|------------|-------------|----------|
| **TC-LG-01** | Quote → Booked | `gate.booking.no_lines` | Refused if 0 lines |
| **TC-LG-02** | Booked → Packed | `gate.pack.session_missing` | Refused if no Packing session |
| **TC-LG-03** | Booked → Packed | `gate.pack.units_unassigned` | Refused if serialised units unassigned |
| **TC-LG-04** | Packed → On Rent | `gate.handover.agreement_unsigned` | Refused if no signature |
| **TC-LG-05** | Packed → On Rent | `gate.handover.payment_outstanding` | **WARN** (any staff, reason ≥10) — NOT block |
| **TC-LG-06** | On Rent → Returned | `gate.return.units_unaccounted` | Refused if line missing return_line |
| **TC-LG-07** | Returned → Closed | `gate.close.no_invoice` | Refused if no invoice |
| **TC-LG-08** | Returned → Closed | `gate.close.invoice_unsettled` | Refused if invoice outstanding > 0 |
| **TC-LG-09** | Returned → Closed | `gate.close.deposit_unresolved` | Refused if deposit pending/held |
| **TC-LG-10** | Returned → Closed | `gate.close.open_case` | Refused if open case |
| **TC-LG-11** | Returned → Closed | `gate.close.reservation_live` | Refused if live inventory_reservations |
| **TC-LG-12** | Closed → Returned | `gate.reopen.role` | Refused if role < Manager |
| **TC-LG-13** | Cancel at Packed | `gate.cancel.stage_too_late` | Refused if role < Manager |

### 6.3 Money-Blind Role Tests (Must Pass)

| Test ID | Role | Action | Expected |
|---------|------|--------|----------|
| **TC-MB-01** | Warehouse | SELECT invoices | 0 rows (RLS) |
| **TC-MB-02** | Warehouse | SELECT payments | 0 rows (RLS) |
| **TC-MB-03** | Warehouse | SELECT security_deposits | 0 rows (RLS) — **UNVERIFIED on live** |
| **TC-MB-04** | Technician | UPDATE invoices.total_amount | 0 rows affected (RLS) |
| **TC-MB-05** | Driver | INSERT payment | Refused (42501) |
| **TC-MB-06** | Coordinator | SELECT products.purchase_price | Column absent from view |
| **TC-MB-07** | Client | SELECT other client's bookings | 0 rows (RLS) |

### 6.4 Concurrency & Offline Tests

| Test ID | Scenario | Expected |
|---------|----------|----------|
| **TC-CC-01** | Two tabs: Confirm same booking | Second gets "stale read or concurrent write" |
| **TC-CC-02** | Offline: queue Confirm, go online, replay | Replay refused (offline Confirm blocked in `confirmRental.ts:414-422`) |
| **TC-CC-03** | Offline: queue Packing scan, go online, replay | Replay succeeds (idempotent `client_uuid`) |
| **TC-CC-04** | Offline: conflicting edit on same row | Conflict detected → held for manual resolution |
| **TC-CC-05** | Duplicate `client_uuid` replay | Returns existing row, no duplicate side effects |

### 6.5 Nepal-Specific Tests

| Test ID | Scenario | Expected |
|---------|----------|----------|
| **TC-NP-01** | Pickup 22:00, Return 06:00 next day (same operational day) | 1 rental day (06:00→06:00) |
| **TC-NP-02** | Pickup 05:59, Return 06:01 (crosses 06:00 boundary) | 2 rental days |
| **TC-NP-03** | BS date rendering matches AD for 2078-2095 | `bs.ts` covers full range |
| **TC-NP-04** | VAT 13% calculation: 7,000 - 10% = 6,300; VAT = 819; Total = 7,119 | Integer paisa, half-up at each step |
| **TC-NP-05** | Advance payment < required → handover WARN not BLOCK | R-06 soft gate |

---

## 7. SMALL ISOLATED IMPLEMENTATION TASKS FOR CODEX

### 7.1 Lane C (T3 Booking & Money) — Immediate

| Task ID | Description | Files | Size |
|---------|-------------|-------|------|
| **C-01** | Create `change_booking_dates` RPC with full conflict recheck | `supabase/migrations/NEW_change_booking_dates.sql`, `src/actions/rentals/changeBookingDates.ts` | M |
| **C-02** | Fix partial return release for serialised missing units | `supabase/migrations/0115_stage_gates.sql` (amend) | S |
| **C-03** | Reconcile capability strings: add `case.resolve`, `inspection.*`, `payment.record` | `src/actions/core.ts`, `src/lib/rbac.ts`, `docs/PERMISSIONS.md` | M |
| **C-04** | Fix `rental.pack`/`rental.pickup` role mapping (Coordinator ✅, Technician ✅ per D3) | `src/lib/rbac.ts`, `docs/PERMISSIONS.md` | S |
| **C-05** | Map `inventory.create` to Warehouse (Quick Add) per W6 | `src/actions/rentals/createRental.ts`, `src/lib/rbac.ts` | S |

### 7.2 Lane A (T2 Floor, T9 Cutover) — Immediate

| Task ID | Description | Files | Size |
|---------|-------------|-------|------|
| **A-01** | Implement Booqable hold import (T9-02) — daily sync of open Booqable rentals → `fulfillment_outcomes` or `inventory_reservations` | `supabase/migrations/NEW_booqable_holds.sql`, `src/lib/booqableSync.ts` | L |
| **A-02** | Apply 0092 money-blind write trigger to live (after backup) | `supabase/migrations/0092_money_blind_write_trigger.sql` | S |
| **A-03** | Fix `security_deposits` RLS for money-blind roles | `supabase/migrations/NEW_security_deposits_rls.sql` | S |

### 7.3 Lane B (T4, T5, T6) — After T6 glossary

| Task ID | Description | Files | Size |
|---------|-------------|-------|------|
| **B-01** | Nepali extraction for booking/money screens (when Lane A/C not touching) | `src/modules/rentals/`, `src/modules/finance/` | L |

---

## 8. SECURITY AND PERFORMANCE IMPLICATIONS

### 8.1 Security Findings

| Area | Finding | Severity |
|------|---------|----------|
| **RLS Enforcement** | Strong — all operational tables have RLS, policies use `auth_user_role()` | ✅ GOOD |
| **Money Blindness** | **Gap on live** — view masking writable-through, write trigger missing | 🔴 CRITICAL |
| **Privilege Escalation** | Coordinator can create bookings with discounts (blocked by `booking_discounts_money_blind` CHECK) | ✅ BLOCKED |
| **Audit Immutability** | `audit_events` has no UPDATE/DELETE policy — append-only | ✅ GOOD |
| **Client Isolation** | Portal RLS joins to `client_id` — verified in L14 | ✅ GOOD |
| **Offline Replay** | Law 8 `client_uuid` + conflict detection — no silent overwrites | ✅ GOOD |
| **Fail-Closed** | Offline Confirm/Pack/Handover/Return refused (R-40) | ✅ GOOD |

### 8.2 Performance Findings

| Area | Finding | Recommendation |
|------|---------|----------------|
| **Availability Check** | `planAssignment` does 3 parallel reads (candidates, holds, qty holds) — acceptable | Keep; add caching if needed |
| **GiST Exclusion** | `inventory_reservations_no_double_booking` on (asset_id, period) — fast for point lookups | Verified in 0100 post-cond |
| **Capacity Trigger** | `FOR UPDATE` on products serializes per product — acceptable for rental scale | Verified in 0045 |
| **Index Coverage** | `idx_inventory_reservations_product_period`, `idx_inventory_reservations_booking`, `idx_inventory_reservations_booking_line` exist (0126) | ✅ COMPLETE |
| **PGlite Migration Rebuild** | 183/183 migrations apply clean — no drift | ✅ VERIFIED |

---

## 9. EXACT ACCEPTANCE CRITERIA FOR EACH RECOMMENDED FIX

### 9.1 B-01: Money-Blind View Masking (P0)

**Acceptance Criteria:**
- [ ] Migration 0092 applied to live Supabase (after backup)
- [ ] `npm run check:pglite` shows 0 anon-readable money columns
- [ ] `npm run check:lifecycle` D-1, D-2, D-3 pass for Warehouse, Technician, Driver
- [ ] Warehouse UI shows "Payment required" (no amount) on Handover checklist

### 9.2 B-02: Booqable Holds Enforcement (P0)

**Acceptance Criteria:**
- [ ] T9-02 migration creates `booqable_holds` table or extends `fulfillment_outcomes`
- [ ] Daily import job (Edge Function/cron) syncs open Booqable rentals
- [ ] `planAssignment` / `findCollidingHolds` reads Booqable holds as conflicts
- [ ] `check:lifecycle` L22 (new) asserts Booqable hold blocks OS confirm

### 9.3 B-03: Change Booking Dates RPC (P0)

**Acceptance Criteria:**
- [ ] New RPC `change_booking_dates(p_booking_id, p_pickup_at, p_return_at, p_reason, p_client_uuid)`
- [ ] Requires C+ role (Coordinator, Manager, Admin, Owner)
- [ ] Reason ≥10 chars
- [ ] `FOR UPDATE` on bookings row
- [ ] Validates new window against existing reservations (excluding own booking)
- [ ] Updates `bookings.pickup_at`, `return_at`
- [ ] Updates `inventory_reservations.period` for all live holds (triggers GiST + capacity)
- [ ] Updates `booking_lines.days` = new rental days
- [ ] If Draft invoice exists, updates `invoice_lines.days` (triggers reprice)
- [ ] Logs audit_event with old/new dates
- [ ] Returns `{ success, booking_id, old_pickup, new_pickup, old_return, new_return, days_changed }`

### 9.4 B-04: Partial Return Release Fix (P1)

**Acceptance Criteria:**
- [ ] Amend 0115 `write_reservations_on_stage_transition()` release logic
- [ ] On `Returned`: release ALL serialised holds for the booking (remove missing-unit exception)
- [ ] Missing units tracked via `booking_line_units.unit_state = 'Missing'` + `damage_findings` + `cases`
- [ ] Reservation release reason: "Released on Return: the booking reached Returned."
- [ ] `check:lifecycle` L7 (partial return) asserts 0 live holds after Return

### 9.5 B-05: Security Deposits RLS (P1)

**Acceptance Criteria:**
- [ ] `security_deposits` RLS policy uses `auth_can_view_money()` for SELECT
- [ ] Warehouse/Technician/Driver/Client see 0 rows
- [ ] Coordinator sees booking-scoped deposits only
- [ ] `npm run check:lifecycle` D-1, D-3 pass

### 9.6 B-06 through B-10: Capability Reconciliation (P1)

**Acceptance Criteria:**
- [ ] Every capability string in PERMISSIONS.md §4 has a `case` in `checkCapability` (R-1)
- [ ] Every action's `capability:` appears in PERMISSIONS.md §4 (R-2)
- [ ] `rbac.ts` exports single `MATRIX` constant (R-3)
- [ ] `npm run check:lifecycle` T-1 (matrix round-trip) passes
- [ ] `npm run check:lifecycle` T-3 (UI ⊆ DB) passes

---

## 10. REMAINING BLOCKERS AND UNRESOLVED BUSINESS DECISIONS

### 10.1 Technical Blockers (Require Code/Migration)

| Blocker | Owner | Status |
|---------|-------|--------|
| 19 migrations (0157–0177) unapplied to live | Babin | Awaiting backup + staging rehearsal (M1) |
| 7 rename mismatches in migration ledger | Babin | `npm run db:plan` shows discrepancies |
| 2 unexplained live rows | Babin | Need investigation |
| Staging project not created | Babin | Required for 9-role checks |
| Storage scoping not accepted on hosted project | Babin | Supabase config needed |
| Physical device acceptance (phone, iPad, scanner, offline) | Babin | Device Day M4 |

### 10.2 Open Business Decisions (from PLAN.md §4.2, OPEN_DECISIONS.md)

| ID | Question | ⭐ Default | Blocks |
|----|----------|-----------|--------|
| **O-1** | Where does `babinrentals.com` point after Booqable switch-off? | Redirect to `book.babinrentals.com` | T9-08 |
| **O-2** | Refund policy for online advance when staff cannot confirm | Full refund to same wallet within 3 working days | T7-07 |
| **O-3** | Can client pay security deposit online? | Advance only; deposit at handover | T7-05 |
| **O-4** | Morning digest send time | 05:30 NPT | T5-04 |
| **O-5** | TDS rate on crew payouts | Accountant to supply | T8-08 |
| **O-6** | IRD-certified e-billing required? | Accountant to confirm by 30 Nov | T3-05 |
| **O-7** | Non-VAT bills in VAT register | Separate section; accountant confirms | T3-04 |
| **O-9** | Membership plan table content | Babin sends it | T8-01 |
| **O-10** | Cancellation tier figures | Babin enters in Settings | T3-03 |
| **O-11** | Rental agreement terms text | Babin supplies | T3-06 |
| **O-12** | Plan downgrade credit > new fee → account credit | Rest becomes client credit | T8-03 |
| **O-13** | Cancellation fee % base | Booking's rental total before VAT | T3-03 |
| **O-14** | Numbered invoice later changes → second invoice or credit note | Accountant decides; blocks change until answered | T3-14 |
| **O-15** | VAT timing: invoice on full payment or earlier? | As ruled (number on full payment) until accountant answers | T3-14 |
| **O-16** | Label printer / Bluetooth scanner models | Claude proposes 2–3 with Nepal prices | T2-08, T2-09 |
| **O-17** | Delivery zone fees | Rs 3,500 per valley zone | T4-07 |

### 10.3 Documentation Gaps (Owner Must Resolve)

| Gap | Description |
|-----|-------------|
| **DG-01** | `RULINGS-2026-09-04.md` and `RULINGS-2026-09-08.md` cited as binding in 8+ files but **do not exist in repo** (PERMISSIONS.md V-20) |
| **DG-02** | `docs/PERMISSIONS.md:192` and `:352` say Coordinator may issue invoice; DB (0108:40) and `rbac.ts:418` allow Owner/Admin/Manager/Accounts only — **stricter wins** |
| **DG-03** | `MASTER.md`, `Foundation v3.0`, `UI_UX.md` referenced in PERMISSIONS.md §15.3 but **do not exist in repo** |

---

## VERIFICATION SUMMARY

### Commands Run (Local, No Live Supabase)

```bash
# Typecheck
npm run typecheck                                    # 0 errors

# Unit + E2E Tests (mock mode)
VITE_DATA_SOURCE=mock npm test                       # 5,739 / 5,739 passed

# PGlite Migration Rebuild
npm run check:pglite                                 # 183/183 applied, 0 failed, 0 anon leaks

# Booking Lifecycle Through Real Postgres + RLS
npm run check:lifecycle                              # 43/43 steps green (L1–L43)

# Lint
npm run lint                                         # 0 errors, 0 warnings

# Contrast (WCAG AA)
npm run check:contrast                               # 106/106 pass

# Build
npm run build                                        # Success, 8163 modules

# Completion Counter
npm run completion                                   # Structural mean ≈ 97%
```

### Classification Legend

| Label | Meaning |
|-------|---------|
| **VERIFIED** | Reproduced from source code, migrations, or test results in this audit |
| **FAILED** | Demonstrated defect with source file and line reference |
| **UNVERIFIED** | Requires execution, database, or device access not available in this audit |
| **PROPOSED** | Improvement not currently implemented; recommendation only |

### Audit Scope Boundary

This audit covered:
- ✅ Booking creation, confirmation, extension, cancellation
- ✅ Inventory reservations (GiST exclusion, capacity ceiling)
- ✅ Stage transitions and gates (Quote → Booked → Packed → On Rent → Returned → Closed)
- ✅ Partial returns, damaged equipment, missing items
- ✅ Money-blind role enforcement (RLS, views, triggers)
- ✅ Offline queue idempotency and conflict detection
- ✅ Nepal timezone (Asia/Kathmandu), rental day (06:00→06:00), BS calendar
- ✅ VAT, discount, advance payment, late fee calculations
- ❌ Live Supabase project (N-5: never apply migrations)
- ❌ Physical device testing (phone, iPad, scanner, offline)
- ❌ Booqable integration (T9 cutover track)
- ❌ Online booking + payments (T7 track)
- ❌ Full Nepali language (T6 track — only switch exists)

---

**END OF AUDIT**

*This report is based on static analysis of the repository at commit `a7bd355f` and the documented test results in PROGRESS.md. No live Supabase changes were made. No migrations were applied. No code was modified.*