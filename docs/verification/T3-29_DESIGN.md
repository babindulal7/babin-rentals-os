# T3-29 Design & Verification Specification: Extension Clash & Manager Decision

**Feature:** T3-29 Extension clash: the Manager decides  
**Lane:** C · [go-live] · slips first  
**Status:** DESIGN FIRST  
**Branch:** `mac/T3-29-clashing-extensions`  
**Sources:** `docs/plans/T3_BOOKING_MONEY.md`, B39, B41, B42, W10, `docs/PERMISSIONS.md` §6.1, `docs/PRODUCT_RULES.md`

---

## 1. Problem & Context

When extending a rental booking via `extendRental` / `extend_booking` (T3-17), if the requested extension dates overlap with an existing reservation for the same physical unit or exceed the total product capacity ceiling on an upcoming booking:
1. PostgreSQL's GiST exclusion constraint (`no_double_booking`) or the capacity ceiling raises an error, blocking double-booking.
2. Under previous behavior (PR #172), `ExtendRentalModal` simply detected the clash and blocked the extension outright.
3. However, under business rule **B41**, desk staff must neither refuse nor override alone:
   - The clash must be escalated to a **Manager Decision** (`gate.extend.clash` in `docs/PERMISSIONS.md` §6.1; accessible only to Owner, Admin, Manager).
   - A Coordinator can request / escalate the clash ("Sent to Manager").
   - A Manager can choose between three distinct audited options:
     - **a) Extend and reassign/sub-rent:** Extend the current booking, and move the next booking to a similar owned unit or an external sub-rent (reusing T3-13 / PR #182).
     - **b) Extend and mark next booking "At risk":** Extend the current booking, and flag the next booking as **At risk** immediately in `at_risk_bookings` (B42).
     - **c) Refuse extension:** The client returns on time; extension is rejected with an audited reason.
4. When a booking is marked **At risk** (either via decision (b) or when a return is late / marked "will be late" within 24 hours of the next booking's start):
   - It appears immediately on the booking detail, Today dashboard, and Approvals inbox (T5-10) with the O-2 resolution steps (B39):
     1. Sub-rent from an external partner;
     2. Offer the nearest similar item we own;
     3. Issue a full refund or client account credit (client's choice), plus draft client communication.
   - **Crucial Invariant:** An at-risk booking **cannot reach Pack** until covered or reconciled.

---

## 2. Database Schema & Server Gates

### Migration: `0241_extension_clashes_and_at_risk_bookings.sql`
Claimed in `docs/plans/MIGRATION_LEDGER.md` (Next free number: `0241`).

### Tables

#### `extension_clashes`
Stores pending and resolved extension escalation requests:
- `id uuid primary key default gen_random_uuid()`
- `booking_id uuid not null references bookings(id) on delete cascade`
- `requested_days integer not null check (requested_days >= 1)`
- `requested_return_at timestamptz not null`
- `pricing_option text not null check (pricing_option in ('same_rate', 'standard_rate'))`
- `reason text not null check (char_length(reason) >= 10)`
- `requested_by uuid not null references auth.users(id)`
- `conflicting_booking_id uuid references bookings(id)`
- `conflicting_asset_id uuid references assets(id)`
- `conflicting_product_id uuid references products(id)`
- `status text not null default 'Pending' check (status in ('Pending', 'Resolved_Alternative', 'Resolved_AtRisk', 'Refused'))`
- `decision text check (decision in ('extend_alternative', 'extend_at_risk', 'refuse'))`
- `decision_reason text`
- `decided_by uuid references auth.users(id)`
- `decided_at timestamptz`
- `created_at timestamptz not null default now()`
- `client_uuid uuid not null unique`

#### `at_risk_bookings`
Stores bookings flagged as at risk due to equipment conflicts, delayed returns, or damage:
- `id uuid primary key default gen_random_uuid()`
- `booking_id uuid not null references bookings(id) on delete cascade`
- `cause text not null check (cause in ('extension_clash', 'late_return', 'marked_late', 'damaged_equipment'))`
- `source_booking_id uuid references bookings(id)`
- `clashing_asset_id uuid references assets(id)`
- `clashing_product_id uuid references products(id)`
- `status text not null default 'Active' check (status in ('Active', 'Covered_Subrent', 'Covered_Similar', 'Refunded', 'Credit_Applied', 'Cancelled'))`
- `resolution_details jsonb`
- `raised_at timestamptz not null default now()`
- `resolved_at timestamptz`
- `resolved_by uuid references auth.users(id)`
- `created_at timestamptz not null default now()`
- `client_uuid uuid not null unique`

### Server Gates & Invariants

1. **Pack Gate Invariant (`gate.pack.at_risk`):**
   In `check_stage_transition_guards()` or trigger on `bookings.stage`:
   ```sql
   if NEW.stage = 'Packed' and exists (
     select 1 from at_risk_bookings
      where booking_id = NEW.id
        and status = 'Active'
   ) then
     raise exception 'Booking % is At Risk and cannot reach Pack until equipment coverage is resolved.',
       NEW.booking_no
       using errcode = 'P0001';
   end if;
   ```
2. **Manager Decision Gate (`gate.extend.clash`):**
   Enforced in `decide_clashing_extension()` RPC:
   Strictly Owner, Admin, Manager. Coordinator calls are rejected with `42501`.
3. **No Double-Booking Invariant (GiST exclusion):**
   When decision (b) is selected ("Extend and mark next booking At risk"):
   - The extending booking extends its return date.
   - To satisfy the database exclusion constraint without double-booking the physical unit, the conflicting unit reservation on the *next* booking is either detached/unassigned or moved to an at-risk pending state, and `at_risk_bookings` is inserted.

---

## 3. RPC Specifications

### `request_clashing_extension(p_payload jsonb) -> jsonb`
- **Permissions:** Coordinator, Manager, Admin, Owner.
- **Contract:**
  - Validates `booking_id`, `requested_days`, `reason` (>= 10 chars), and `client_uuid`.
  - Creates pending row in `extension_clashes`.
  - Emits in-app notification to Manager/Owner roster (T5-10 integration).

### `decide_clashing_extension(p_payload jsonb) -> jsonb`
- **Permissions:** Owner, Admin, Manager only (`gate.extend.clash`).
- **Contract:**
  - Validates `clash_id`, `decision` (`'extend_alternative'`, `'extend_at_risk'`, `'refuse'`), and `reason`.
  - If `'extend_alternative'`: extends current booking; swaps/sub-rents next booking's line.
  - If `'extend_at_risk'`: extends current booking; creates active record in `at_risk_bookings` for `conflicting_booking_id`.
  - If `'refuse'`: marks clash `Refused`; logs audit event; current booking return date remains unchanged.
  - Atomically records audit event in `audit_events`.

---

## 4. UI Specifications

1. **`ExtendRentalModal.tsx`:**
   - Detects clash via `checkExtensionClash()`.
   - When clash detected:
     - For `Coordinator`: Renders "Send to Manager for Decision" button.
     - For `Manager | Admin | Owner`: Renders the 3 decision action buttons:
       - [A] "Extend & Reassign Next Booking"
       - [B] "Extend & Flag Next Booking At Risk"
       - [C] "Refuse Extension"
2. **`ApprovalsInbox.tsx` (T5-10):**
   - Adds `'extension_clash'` to `ApprovalType`.
   - Lists pending extension clashes with booking context, conflicting booking number, and the 3 decision verbs.
3. **`Today.tsx` / `AlertsPanel.tsx`:**
   - Displays high-priority alert for any active `at_risk_bookings`.
4. **`BookingDetail.tsx`:**
   - When booking is in active at-risk state: renders amber warning badge and blocks Pack button with informative tooltip.

---

## 5. Test & Lifecycle Plan

1. **Unit Tests:**
   - `src/lib/__tests__/extensionClashDecision.test.ts`:
     - Coordinator can submit clash request.
     - Coordinator cannot execute decision (42501).
     - Manager can execute decisions a, b, c with audit logging.
     - Decision b creates active `at_risk_bookings` row.
2. **E2E Lifecycle Steps (`scripts/e2e-lifecycle.mjs`):**
   - Step `L76`: A clashing extension without a Manager decision is refused.
   - Step `L77`: Decision (b) extends the booking, creates an at-risk record, and blocks Pack until resolved.
