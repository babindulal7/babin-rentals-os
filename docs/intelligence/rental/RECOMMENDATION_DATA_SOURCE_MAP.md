# Babin Rentals OS — Recommendation Data Source Map
**Document ID:** RI-AUDIT-04  
**Date:** 2026-11-23  
**Auditor:** Windows Antigravity Engineering  
**Scope:** Data provenance, authority, freshness, and role permissions for all Rental Intelligence outputs  
**Target Repository:** `babindulal7/babin-rentals-os`  

---

## 1. Architectural Data Contract

In Babin Rentals OS, intelligence modules are strictly **consumers and advisers**, never originators of authoritative state. Every recommendation must cite its data source, declare its freshness, and fail closed when underlying data is absent, stale, or ambiguous.

```
┌────────────────────────────────────────────────────────┐
│                   CANONICAL OS LAYER                   │
│  - Supabase Tables (bookings, items, units, clients)   │
│  - Database RPCs (availability_range, calculate_totals) │
│  - Field Gating (src/lib/fieldGating.ts, rbac.ts)      │
└──────────────────────────┬─────────────────────────────┘
                           │
                           ▼ (Authorized, Role-Filtered Snapshot)
┌────────────────────────────────────────────────────────┐
│             RENTAL ADVICE ADAPTER LAYER                │
│  - Pure deterministic rules & constraints              │
│  - Provenance tagging (SourceKind, EvidenceState)      │
│  - Missing-data fallback -> 'needs_verification'       │
└──────────────────────────┬─────────────────────────────┘
                           │
                           ▼
┌────────────────────────────────────────────────────────┐
│                   STAFF WORKSPACE                      │
│  - Advisory Drawers & In-Context Cards                 │
│  - Explanations ("Why this price?", "Risk checklist")  │
│  - Explicit Staff Action -> Canonical Stage Action     │
└────────────────────────────────────────────────────────┘
```

---

## 2. Source-to-Module Authority Mapping

| Module | Consumed Data Attributes | Authoritative Source Table / RPC | Role Access Boundary | Freshness / Stale Threshold | Missing / Failure Fallback | Data Nature (Real vs Synthetic) |
|---|---|---|---|---|---|---|
| **RI-01: Kit Recommender** | Model ID, aliases, categories, relationships, included items | `products`, `product_relationships` | All authenticated staff (`Staff`, `Coordinator`, `Manager`, `Owner`) | Instantaneous (cached model definitions valid for session) | If model unknown or ambiguous -> reject recommendation, request manual selection | Real catalogue models (`BRPI-*`). No phantom models or invented accessories. |
| | Stock availability, confirmed reservations, maintenance holds | `units`, `rental_items`, RPC `check_unit_conflicts` | All authenticated staff | < 60 seconds (must re-evaluate before presenting to draft) | If availability query fails or times out -> mark items as `needs_verification`, never `available` | Real physical unit ledger. External holds respected. |
| **RI-02: Quote Explanation** | Daily rates, pricing structures, multi-day tiers | `products.pricing_structure`, `src/lib/pricingStructures.ts` | All authenticated staff | Session configuration | If pricing rule missing -> mark as unpriced line, fail closed | Real configured rate tables. Integer paisa standard. |
| | Line subtotals, VAT (13%), discount percentage, approver | `bookings`, `invoices`, RPC `get_booking_financials` | **Gated by `src/lib/fieldGating.ts`**: `Owner`, `Admin`, `Manager`, `Accounts`, `Coordinator` (booking-level only). **BLOCKED for Warehouse, Technician, Driver**. | Immediate database read | If financial read fails -> display "Financial calculation unavailable", never synthesize 0.00 | Real transactional records. Deposits isolated under Law 5. |
| **RI-03: Morning Report** | Due pickups, scheduled returns, overdue rentals, QC status | `bookings`, `rental_items`, `units.status` | Role-filtered: Warehouse sees logistics only; Office roles see financial summaries | Refresh on demand or < 5 minutes | If queue read fails -> render explicit error/unavailable card, never show zero queues | Real operational records. |
| **RI-04: Client Intelligence** | Rental count, order history, payment promptness, KYC tier | `clients`, `bookings`, `payments` | Gated: Office staff only. Driver sees only assigned delivery address. Warehouse/Tech blind. | Daily rollup or real-time lookup | If order history < 3 rentals -> classify as "Unestablished Profile (Insufficient Data)" | Real client transaction history. No fabricated loyalty scores. |
| **RI-05: Idle Stock Activation** | Days since last rental, cumulative revenue, utilization % | `units`, `rental_items`, `src/lib/intel/selectors.ts` | Gated: `Manager`, `Owner`, `Accounts`. Stripped from floor roles. | 24-hour daily rollup | If acquisition cost or rental history absent -> display `Unknown` rather than NPR 2.29M placeholder | Real asset financial entries where present; otherwise marked uncalculated. |
| **RI-06: Monsoon Mode** | Calendar date, outdoor shoot flag, returned equipment condition | System date (Asia/Kathmandu), `bookings.shoot_environment`, QC inspection logs | All operational roles (`Warehouse`, `Technician`, `Staff`) | Real-time date comparison | If shoot environment unspecified -> default to standard non-monsoon handling | Deterministic seasonal rule (Jun 1 - Sep 30). |
| **RI-07: Rental RAG** | Approved equipment manuals, manufacturer specs, store policies | Verified markdown docs in AV Brain / Training Center | All authenticated roles within scope | Document version hash and approval timestamp | If cited document expired or missing -> flag answer as unverified | Curated, human-approved documentation corpus. |
| **RI-08: Checklist Generator** | Booking lines, assigned unit serials, child accessories | `bookings`, `rental_items`, `units` | `Warehouse`, `Technician`, `Coordinator` | Immediate booking state | If unit unassigned -> checklist references model rather than specific serial | Real booking line items. |
| **RI-09: Decision Journal** | Recommendation ID, user decision (accept/reject), rationale | `audit_events` or dedicated advisory log | `Manager`, `Owner` | Immediate write | If logging fails -> log to client error telemetry, do not block rental operations | Real staff interactions. |
| **RI-10: Safety Validation** | Lens mounts, payload ratings, power draw, media speed classes | `product_specs.json`, `payload_matrix.json`, `power_matrix.json` | All operational staff | Versioned static specification tables | If specifications unknown -> mark as `needs_verification` with warning badge | Bench-tested and OEM-documented specifications. |
| **RI-11: Rules & Playbooks** | System laws, deposit guidelines, cancellation policies | `docs/WORKFLOWS.md`, `data/os_laws.json` | All roles | Versioned policy registry | If conflicting policies detected -> route to Owner decision queue | Approved store policies. |

---

## 3. Data Integrity & Freshness Invariants

1. **Law 1 Integrity:** Statistical outputs are pure deterministic computations over authorized historical records. They are never labeled "AI" and contain no hallucinated constants.
2. **Law 5 Deposit Isolation:** Security deposits held against rentals are stored and rendered strictly as balance sheet liabilities. They are never added to Rental Total or subtracted from Outstanding Rental Due.
3. **Law 10 Discount Verification:** Any discount $>10\%$ must show its approved reason ($\ge10$ characters) and the name of the authorizer. Discounts $>25\%$ are hard-blocked by policy.
4. **Timezone Authority:** All operational day boundaries evaluate in `Asia/Kathmandu` (UTC+05:45) using the canonical 06:00 AM operational day start with 2-hour grace period.
5. **No Synthetic Leakage:** Seed metrics, demonstration constants, and mock forecasts are strictly quarantined. In-product views must render an explicit empty state ("Not computed yet") rather than invented numbers.
