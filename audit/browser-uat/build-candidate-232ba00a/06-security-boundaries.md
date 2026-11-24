# Babin Rentals OS — Security & Permission Boundaries (06-security-boundaries.md)
**Build:** `build-candidate-232ba00a`  
**Environment:** `MOCK-ONLY` (`http://localhost:3000`)  
**Auditor:** Agent A5 (Auth & Permission Tester)  

---

## 1. Runtime Permission Matrix (PERMISSIONS.md §3/§4/§6 Enforcement)

The Babin Rentals OS security model mandates strict role isolation, server-side fail-closed gates, and total financial invisibility for floor operations.

| Persona / Role | Can View Money? (`canViewMoney()`) | Direct Route `/finance` | Booking Desk Actions (`canWriteBookingDesk()`) | Operations Floor (`canPerformOperations()`) | Audit Log Access |
|---|---|---|---|---|---|
| **Owner** | YES | **ALLOWED** (Full View) | ALLOWED | ALLOWED | Full Access |
| **Manager** | YES | **ALLOWED** (Operational) | ALLOWED | ALLOWED | View Only |
| **Billing / Accountant** | YES | **ALLOWED** (Ledger / Invoices) | View Only | BLOCKED | Financial Only |
| **Warehouse / Caretaker** | NO (Law 6) | **BLOCKED** (`RestrictedState`) | BLOCKED | ALLOWED (Scan/Pack/Return) | BLOCKED |
| **Technician** | NO (Law 6) | **BLOCKED** (`RestrictedState`) | BLOCKED | ALLOWED (QC/Inspect/Reset) | BLOCKED |
| **Driver** | NO (Law 6) | **BLOCKED** (`RestrictedState`) | BLOCKED | ALLOWED (Delivery/Rider) | BLOCKED |
| **Client** | NO | **BLOCKED** (`RestrictedState`) | BLOCKED | BLOCKED | BLOCKED |

---

## 2. Money-Blindness Verification (Law 6)

- **Underlying Principle:**
  Floor roles (`Warehouse`, `Technician`, `Driver`) and external customers must never see financial figures, rates, invoice balances, or revenue projections. In a production environment, this is enforced by Supabase Postgres Row-Level Security (`auth_can_view_money()`); in the frontend UI, it is mirrored by `canViewMoney()`, `useRoleMoney()`, and `isMoneySurface()`.
- **Runtime Testing Results:**
  - When logged in as `Warehouse`:
    - Top header balance metrics and billing notifications are completely removed from the DOM.
    - `/today` movement cards render item quantities and booking IDs, but suppress all pricing and invoice amounts.
    - `/rentals` list cards hide rental total amounts and rate details.
    - Navigating directly to `/finance` or `/finance/*` triggers `RestrictedState` with HTTP 403 styling and halts rendering.
  - When logged in as `Technician` or `Driver`:
    - Same complete masking and route restrictions verified. Zero monetary leaks observed in inspected DOM nodes or network response payloads.

---

## 3. Custody & State Transition Guards (Fail-Closed Architecture)

- **Custody State Machine:**
  - `Draft` → `Booked` → `Packed` → `Out` → `Returned` → `Reset` → `Completed`.
- **Fail-Closed Rule (R-40):**
  - Custody handovers (`apply_booking_stage_transition()`) cannot be queued offline. They are fail-closed online RPC calls with GiST exclusion locks preventing double-booking.
  - Offline Dexie queues (`offlineQueue.ts`) are strictly restricted to non-custodial events (scans, inspection checklist notes, timestamp markers) with UUID idempotency keys.

---

## 4. Limitations of Browser-Only Security Verification

While browser UAT establishes that the client-side routing, conditional DOM rendering, and role state guards operate correctly without leaking figures, browser-only testing **does not substitute for backend database RLS verification**.
- Full assurance requires running the local Postgres lifecycle gates (`npm run check:pglite` and `npm run check:lifecycle`).
- Production migrations must always be verified through the 18-step booking lifecycle against true Postgres schemas before merge.
