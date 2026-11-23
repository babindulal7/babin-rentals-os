# Staging Counter Flow Trial Runbook (Week 1 Action 3)

**Target Environment:** Hosted Supabase Staging (`klhmsrunqrdxjudyhnkm.supabase.co`)  
**Scope:** Dual-entry counter verification: **Quote → Pack → Handover → Return**, with Law 6 role money blindness enforcement.  
**Governing Rules:** Law 1 (Engine invariants), Law 4 (Immutable ledger), Law 6 (Money blindness), Law 16 (Touch target floor), Law 17 (Stored delivery type masking).

---

## 1. Pre-Flight Setup: Staging Role Initialization

Before logging in as the counter roles, apply the synchronization script in the **Supabase SQL Editor** on `babin-staging` (`klhmsrunqrdxjudyhnkm`):

- **Script:** [`docs/verification/STAGING_SYNCHRONIZE_NINE_ROLES.sql`](STAGING_SYNCHRONIZE_NINE_ROLES.sql)
- **What it does:**
  1. Synchronizes `auth.users` and `auth.identities` for the 9 test roles.
  2. Sets uniform password: `StagingPass2026!` for all test seats.
  3. Maps system roles and grants Boudha branch floor permissions (`pack`, `handover`, `return`, `reset`).
  4. Seeds test gear: `Staging Sony FX6 Cinema Camera` (`EQ000999`, Unit `FX6-STAGING-001`).
  5. Seeds test client: `Staging Production Client Pvt Ltd` (`C-9901`).

---

## 2. Test Accounts Credential Table

| Role | Email | Password | Primary Purpose in Trial |
|:---|:---|:---|:---|
| **Coordinator** | `staging-coordinator@babinrentals.test` | `StagingPass2026!` | Intakes client request, builds quote, reviews capacity, confirms booking. |
| **Warehouse** | `staging-warehouse@babinrentals.test` | `StagingPass2026!` | Prepares gear, serial assignment, pack photo, client handover, return check-in. |
| **Technician** | `staging-technician@babinrentals.test` | `StagingPass2026!` | Performs return inspection, cleaning/maintenance reset, alone-on-shift self-QC. |
| **Accounts** | `staging-accounts@babinrentals.test` | `StagingPass2026!` | Issues VAT invoice, logs payment receipt, enforces financial ledger. |
| **Client** | `staging-client@babinrentals.test` | `StagingPass2026!` | Client portal view, request tracking, review agreements, sign receipts. |

---

## 3. Four-Step Counter Flow Trial Protocol

### Step 1: Quote → Booked (Coordinator)
1. Log in as **Coordinator** (`staging-coordinator@babinrentals.test`).
2. Navigate to **Rentals** ▸ **New Rental**.
3. Select Client `Staging Production Client Pvt Ltd` (`C-9901`).
4. Select Dates: Tomorrow 06:00 NPT to +2 Days 06:00 NPT.
5. Add Item: `Staging Sony FX6 Cinema Camera` (Qty: 1).
6. **Action:** Click **Create Booking**.
   - *Engine Verification:* `create_booking` RPC mints monotonic booking number.
   - *Capacity Verification:* GiST exclusion reservation mints in `inventory_reservations`. Status advances to `Booked`.

### Step 2: Booked → Packed (Warehouse) — Law 6 Check
1. Log in as **Warehouse** (`staging-warehouse@babinrentals.test`).
2. Open the newly booked rental in **Operations / Packing Workspace**.
3. **Law 6 Money-Blindness Check:**
   - Confirm **ZERO** rupee figures, daily rates, line totals, VAT, or security deposit amounts appear anywhere on the packing checklist.
   - Confirm only gear name, asset code, quantity, and barcode inputs are visible.
4. Scan or select unit `FX6-STAGING-001`.
5. Attach pack photo evidence.
6. **Action:** Click **Complete Packing**. Booking transitions to `Packed`.

### Step 3: Packed → On Rent (Counter Handover & Glass Signature)
1. Client arrives at the counter for pickup (Delivery method: `Client Pickup`).
2. Warehouse / Counter staff opens **Handover Workspace**.
3. Verify client representative identity and mobile number.
4. Collect receiver signature on glass (screen).
5. Collect warehouse staff signature.
6. **Action:** Click **Complete Handover**. Booking transitions to `On Rent`. Serial unit status updates to `On Rent`.

### Step 4: On Rent → Returned (Return Inspection & QC Reset)
1. Gear returns from production shoot.
2. Warehouse opens **Return Workspace**.
3. Scan returned unit `FX6-STAGING-001`.
4. Inspect physical condition (`Good`).
5. **Action:** Click **Complete Return**. Booking transitions to `Returned`. Unit transitions to `Needs Cleaning` / `In QC`.
6. Log in as **Technician** (`staging-technician@babinrentals.test`).
7. Open **Cleaning & Reset Queue**.
8. Inspect unit, clean camera body and sensor cap.
9. Mark QC passed. Unit status updates to `Available` ready for the next booking.

---

## 4. Automated Verification Scripts

Once the synchronization SQL is applied, run the hosted verification test suites directly against staging:

```bash
# 1. Verify Online Booking Request Confirmation flow
node scripts/verify-staging-booking-request-confirmation.mjs

# 2. Verify complete Floor Operations Loop & Receipt Generation
node scripts/verify-staging-t2-floor-loop-receipt.mjs

# 3. Verify Law 6 Field Gating & Money Blindness
npx vitest run src/lib/__tests__/floorRoleMoneyBlindnessAudit.test.ts
```
