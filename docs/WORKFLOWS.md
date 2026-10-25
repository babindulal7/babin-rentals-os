# Babin Rentals OS — Business Workflows & Custody Lifecycle

**Status:** Authoritative Workflow Specification  
**Last Reconciled:** 23 September 2026

---

## 1. The Rental Custody Lifecycle

The core lifecycle consists of 6 sequential stages:

```
[ Quote ] ──> [ Booked ] ──> [ Packed ] ──> [ On Rent ] ──> [ Returned ] ──> [ Closed ]
```

```
+-----------+-------------------------+----------------------+-----------------------------------------------+
| STAGE     | ACTOR / ROLE            | ACTION VERB          | DATABASE / GATE REQUIREMENTS                  |
+-----------+-------------------------+----------------------+-----------------------------------------------+
| Quote     | Coordinator / Admin     | `createRental`       | Atomic creation of header + lines + crew +    |
|           |                         |                      | transport in one transaction (R-43).          |
+-----------+-------------------------+----------------------+-----------------------------------------------+
| Booked    | Coordinator / Admin     | `confirmRental`      | Writes `inventory_reservations` via trigger;  |
|           |                         |                      | checks GiST conflict & client credit limit.   |
+-----------+-------------------------+----------------------+-----------------------------------------------+
| Packed    | Warehouse / Technician  | `floorVerb('Pack')`  | All required booking lines scanned/verified;  |
|           |                         |                      | seals session as `Completed`.                 |
+-----------+-------------------------+----------------------+-----------------------------------------------+
| On Rent   | Warehouse / Coordinator | `floorVerb('Handover')| Single checkout path (R-42); client signature|
|           |                         |                      | + ID verification required; soft-gate override|
|           |                         |                      | if outstanding balance remains.               |
+-----------+-------------------------+----------------------+-----------------------------------------------+
| Returned  | Warehouse / Technician  | `floorVerb('Return')`| All equipment accounted for (returned, missing|
|           |                         |                      | or swapped); creates inspection findings.     |
+-----------+-------------------------+----------------------+-----------------------------------------------+
| Closed    | Admin / Owner           | `closeRental`        | Settled invoice required (L11); zero pending   |
|           |                         |                      | damage findings (R-41 / `0131` gate); zero open|
|           |                         |                      | operations cases.                             |
+-----------+-------------------------+----------------------+-----------------------------------------------+
```

---

## 2. Floor Verbs & Workspace Operations

### 2.1 Packing Workspace (`/rentals/:id/pack`)
- Scans serial numbers or bulk quantities against booking lines.
- Missing or cleaning-blocked lines require an explicit operator reason (≥4 chars) to bypass.
- Completing packing seals an `operation_sessions` record and triggers transition to `Packed`.

### 2.2 Handover Workspace (`/rentals/:id/handover`)
- **Canonical Checkout Path (R-42):** Replaces legacy auto-pickup stubs.
- Verifies client identity, records pickup operator, collects digital signature, and captures vehicle/transport details.
- Transitions booking to `On Rent`.

### 2.3 Return & Inspection Workspace (`/rentals/:id/return`)
- Unit-by-unit check-in.
- Damages flagged during return write directly to `damage_findings` table (`Pending Approval`).
- Units flagged for cleaning enter the `cleaning_queue_entries` workflow.
- Transitions booking to `Returned`.

### 2.4 Reset & Cleaning Workspace (`/rentals/:id/reset`)
- Technicians and warehouse staff complete maintenance or cleaning tasks.
- Clears entries in `cleaning_queue_entries`, making units available for subsequent reservations.

---

## 3. Financial & Billing Workflows

### 3.1 Invoicing
- Derived directly from confirmed booking lines, crew, transport, and applied discounts.
- Fixed 13% Nepal VAT calculated via staged whole-rupee half-up rounding.
- Invoices are immutable upon issuance; corrections require credit notes or voiding with audited reasons.

### 3.2 Payment & Deposit Settlement
- Payments are immutable append-only ledger rows (`payments` table).
- Deposits are held in trust as liabilities (`deposit_movements` table) and never reduce rental outstanding amounts.
- Deposit release or application to damage is performed via audited settlement actions.

### 3.3 Rental Closure Gate Invariants (R-41)
Closing a rental (Returned → Closed) requires meeting every database gate in `apply_booking_stage_transition()` (latest definition `0171`, close block unchanged since `0155`) simultaneously:
1. **Invoice exists:** at least one non-void invoice, or an Owner/Admin zero-value override with a reason of at least 10 characters (§4.51, audited).
2. **Invoice settled:** every non-void invoice has Outstanding = 0; voided invoices are excluded.
3. **Deposit resolved:** a required or held deposit is settled, or skipped by Manager-or-above with a reason of at least 10 characters (`0155`). The skip is audited and moves no money; the deposit stays a liability.
4. **Case Gate:** no unresolved operational cases linked to the booking.
5. **Reservation Gate:** no live (unreleased) `inventory_reservations` for the booking.
6. **Damage Gate (R-41):** no unvoided `damage_findings` row may stand at `Pending Approval`. All findings must be approved, dispositioned, or voided.

Every stage move also passes the forward-only, no-skip and `from_stage` checks (a stale read is refused), and pack / handover / return additionally pass their session and unit gates. The booking stage changes only through an insert into `booking_stage_transitions`; the trigger is the sole writer of `bookings.stage`.

### 3.4 Branch scoping of floor verbs (`0171`, `0172`)
Per-branch `operations_grants` narrow who may run Pack, Handover, Return and Reset at a given site. An actor with no grant rows keeps the role-based permission at every branch; any grant history (including revoked) scopes the actor to active grants only. Pack / Handover / Return are enforced in the stage trigger. Reset moves no stage, so it is enforced by restrictive RLS on `cleaning_queue_entries` and `cleaning_task_results` (`0172`), with `assert_operation_branch_grant` as the early action-layer check.
