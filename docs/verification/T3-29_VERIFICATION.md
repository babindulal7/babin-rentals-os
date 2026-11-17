# T3-29 Verification Report: Extension Clash — The Manager Decides

**Date:** 2026-11-18  
**Author:** Mac Antigravity  
**Branch:** `mac/T3-29-clashing-extensions`  
**Rules & Contracts:** B41, B42, W10, PERMISSIONS §6.1 (`gate.extend.clash`)

---

## 1. Executive Summary

Implemented task **T3-29: Extension clash: the Manager decides** in Babin Rentals OS.
When extending an active rental creates a reservation conflict on a physical unit or capacity ceiling with an upcoming booking:
1. **Desk Coordinator Escalation (B41):** The Coordinator cannot unilaterally override or double-book. In the UI, the standard "Confirm Extension" button is disabled/replaced by "Send to Manager for Decision", creating an audited row in `public.extension_clashes` via RPC `request_clashing_extension`.
2. **Manager Decision (`gate.extend.clash`):** Privileged roles (Owner, Admin, Manager) are presented with three audited decision options:
   - **`extend_alternative`:** Extend current booking; next booking's conflicting line is reassigned or marked for sub-rent (T3-13).
   - **`extend_at_risk`:** Extend current booking; release next booking's conflicting hold to prevent GiST exclusion constraint collisions; create an active entry in `public.at_risk_bookings` (B42).
   - **`refuse`:** Refuse extension with audited reason; return date remains unchanged.
3. **Database Enforcement (`gate.pack.at_risk`):** In `apply_booking_stage_transition()`, bookings flagged as active in `at_risk_bookings` are blocked from advancing to `Packed` stage until reconciled or covered via `resolve_at_risk_booking`.
4. **Law 6 Money Blindness:** All operations and at-risk queues preserve money blindness for floor roles (Warehouse, Technician, Driver).

---

## 2. Changes Implemented

### Database Layer
- **`supabase/migrations/0241_extension_clashes_and_at_risk_bookings.sql`**:
  - Tables: `public.extension_clashes`, `public.at_risk_bookings`.
  - Views: `public.extension_clashes_v`, `public.at_risk_bookings_v` (anon access revoked, authenticated granted).
  - RPCs:
    - `public.request_clashing_extension(p_payload jsonb)` (SECURITY DEFINER, pinned search_path).
    - `public.decide_clashing_extension(p_payload jsonb)` (SECURITY DEFINER, pinned search_path, enforces `gate.extend.clash`).
    - `public.resolve_at_risk_booking(p_payload jsonb)` (SECURITY DEFINER, pinned search_path, enforces `rental.at_risk_resolve`).
  - Stage advance gate: updated `apply_booking_stage_transition()` to reject transition to `Packed` if an active `at_risk_bookings` record exists for the booking (`gate.pack.at_risk`).
- **`docs/plans/MIGRATION_LEDGER.md`**:
  - Registered migration `0241` for Extension clashes and at-risk bookings.

### Permissions & Actions Layer
- **`src/lib/rbac.ts`**:
  - Added `canDecideClashingExtension(role: SystemRole | null | undefined): boolean` strictly admitting `Owner`, `Admin`, and `Manager`.
- **`src/actions/core.ts`**:
  - Mapped capabilities `gate.extend.clash`, `rental.extend_clash_request`, and `rental.at_risk_resolve`.
- **Actions Created**:
  - `src/actions/rentals/requestClashingExtension.ts`
  - `src/actions/rentals/decideClashingExtension.ts`
  - `src/actions/rentals/resolveAtRiskBooking.ts`
- **Queries Created & Updated**:
  - `src/lib/queries/atRiskBookings.ts`: `fetchActiveAtRiskBookings()`, `checkBookingAtRisk()`.
  - `src/lib/queries/approvals.ts`: Added `'extension_clash'` approval type querying `extension_clashes_v`.

### UI Components
- **`src/modules/rentals/modals/ExtendRentalModal.tsx`**:
  - When clash is detected:
    - Non-manager roles (Coordinator) see "Send to Manager for Decision" with requirement for at least 10-character reason.
    - Managers see the 3 audited decision actions (`extend_at_risk`, `extend_alternative`, `refuse`).
    - Standard direct extension confirmation is completely prevented on clash.
- **`src/modules/approvals/ApprovalsInbox.tsx`**:
  - Added `'extension_clash'` tab filter to display clashing extension requests awaiting manager review.
- **`src/modules/rentals/BookingDetail.tsx`**:
  - Displays At-Risk status alert banner when a booking is flagged at risk.
  - Disables floor operation stage advancement (`gate.pack.at_risk`) until resolved.

---

## 3. Verification Evidence

### 1. Database Schema & Definer Security (`npm run check:pglite`)
```
PostgreSQL 18.3 (PGlite 0.5.8) on wasm32-unknown-emscripten
238/238 applied, 0 failed
view-leak gate: 44 public view(s) checked, 0 readable by anon
function-leak gate: 19 public function(s) executable by anon, 0 unauthorized
definer-hygiene gate: 206 definer function(s) checked, 0 without pinned search_path
```

### 2. TypeScript Compilation (`npm run typecheck`)
```
> tsc --noEmit
Exit code: 0 (0 errors)
```

### 3. ESLint Verification (`npm run lint`)
```
> eslint src --max-warnings 0
Exit code: 0 (0 warnings, 0 errors)
```

### 4. Unit Tests
- `src/lib/__tests__/extensionClashes.test.ts` (14/14 tests pass):
  - RBAC checks for `gate.extend.clash`.
  - Action validation and execution for `requestClashingExtension`.
  - Action validation and execution for `decideClashingExtension`.
  - Action validation and execution for `resolveAtRiskBooking`.
  - Role rejection on unauthorized caller (Coordinator attempting Manager decision).
  - View mapping tests for `fetchActiveAtRiskBookings` and `checkBookingAtRisk`.
- `src/modules/rentals/modals/__tests__/ExtendRentalModal.test.tsx` (7/7 tests pass):
  - Standard extension chips and pricing tiers.
  - Clash detection blocking direct coordinator confirmation.
  - Coordinator escalation via `requestClashingExtension`.
  - Manager presented with 3 audited clash decision actions.
  - Law 6 money blindness preservation for floor roles.

### 5. Production Build (`npm run build`)
```
vite v6.4.6 building for production...
✓ built in 5.57s
PWA v1.3.0 precache 299 entries
Exit code: 0
```
