# Floor & Consumables Operations Acceptance Verification Report — 22 November 2026

**Date:** 22 November 2026  
**Auditor / Lane:** Lane A  
**Main Base SHA:** `93a90f00189249566bcb4c9143e13cba8d3fd1eb` (`origin/main`)  
**Scope:** T2-06, T2-15, T2-19, T2-21, T2-23, T3-30  
**Status:** ACCEPTED & PROMOTED TO `done`

---

## 1. Executive Summary

Following successful merges into `origin/main` across PRs #30, #170, #184, #185, #209, and migration scripts `0184`, `0237`, `0239`, `0245`, and `0252`, six critical floor operations, maintenance, equipment downtime, overbooking management, and consumables cards are formally accepted and promoted to **`done`**.

Each card satisfies all canonical acceptance criteria grounded in PostgreSQL GiST exclusion constraints, deterministic lifecycle verification gates (L41, L72, L73, L78, L79, L87, L88, L89), and automated unit/integration test suites.

---

## 2. Card Acceptance Breakdown

### 2.1 T2-06 · Repair job closes the damage
- **Merged PR / Commit:** Commit `a9f760ae` (27 Oct 2026), migration `0184_repair_job_closes_damage.sql`
- **Status:** `done — commit a9f760ae merged; migration 0184, repair job lifecycle and GiST exclusion unblocking verified in lifecycle L41 [docs/verification/FLOOR_AND_CONSUMABLES_ACCEPTANCE_2026-11-22.md]`
- **Implementation:** `src/modules/maintenance/`, `src/actions/equipment/maintenance.ts`, migration `0184`.
- **Verification Evidence:**
  - Database Lifecycle: Step `L41` passed green (`Unit with open damage finding cannot be reserved; after repair job closes it can (D4, T2-06)`).
  - Safety Invariant: When an inspection or reset creates an open damage ticket, unit status flips to `in_repair` and is excluded from availability. Upon closing the repair job with resolution notes, unit status transitions to `available`, immediately lifting reservation blocks.

### 2.2 T2-15 · Damage found during reset
- **Merged PR:** #30 (merged 2 Nov 2026)
- **Status:** `done — PR #30 merged; post-turnaround damage findings, photo attachments, and repair ticket dispatch verified [docs/verification/FLOOR_AND_CONSUMABLES_ACCEPTANCE_2026-11-22.md]`
- **Implementation:** `src/modules/operations/DamageModal.tsx`, `src/modules/maintenance/`.
- **Verification Evidence:**
  - Automated tests: Reset stage damage capture preserves closed booking immutability (Law 4) while isolating maintenance findings in `equipment_damage_reports`.
  - Photo rules: Evidence photos respect size limits and secure bucket storage (`evidence` bucket).

### 2.3 T2-19 · Signature at Return when damage is found
- **Merged PR:** #209 (merged 18 Nov 2026)
- **Status:** `done — PR #209 merged; gate.return.damage_unsigned enforcement and clean return bypass verified in lifecycle L78/L79 [docs/verification/FLOOR_AND_CONSUMABLES_ACCEPTANCE_2026-11-22.md]`
- **Implementation:** `src/modules/operations/ReturnSessionModal.tsx`, `src/actions/operations/returnEquipment.ts`.
- **Verification Evidence:**
  - Database Lifecycle:
    - Step `L78` passed green (`a flagged return without signature or refusal is refused (gate.return.damage_unsigned, B19)`).
    - Step `L79` passed green (`a flagged return with returning person signature or refusal reason completes; clean return needs none (R-39)`).
  - Compliance: Unsigned flagged returns are strictly blocked at database RPC level; clean returns require no signatures, keeping counter turnaround rapid.

### 2.4 T2-21 · Planned downtime with a reason
- **Merged PR:** #170 (merged 15 Nov 2026), migration `0237_planned_equipment_downtime.sql`
- **Status:** `done — PR #170 merged; migration 0237, calendar blackouts, and early termination verified in downtime.test.ts and lifecycle L72 [docs/verification/FLOOR_AND_CONSUMABLES_ACCEPTANCE_2026-11-22.md]`
- **Implementation:** `src/lib/queries/downtime.ts`, `src/modules/equipment/DowntimeModal.tsx`, migration `0237`.
- **Verification Evidence:**
  - Automated tests: `src/lib/queries/__tests__/downtime.test.ts` (2/2 passed).
  - Database Lifecycle: Step `L72` passed green (`Planned equipment downtime with a reason and early termination (T2-21, B10, Law 3, Law 8)`).
  - Invariants: Overlapping reservations are blocked during scheduled downtime windows; early termination frees the remaining period immediately.

### 2.5 T2-23 · Allow overbooking on chosen products
- **Merged Migration:** `0245` / `0252_allow_overbooking_on_chosen_products.sql`
- **Status:** `done — migration 0245/0252 verified; safe short line confirmation without reservations, and Pack stage hard-blocking verified in lifecycle L87-L89 and AddItemPanel tests [docs/verification/FLOOR_AND_CONSUMABLES_ACCEPTANCE_2026-11-22.md]`
- **Implementation:** `src/modules/rentals/booking/AddItemPanel.tsx`, `src/lib/overbooking.ts`.
- **Verification Evidence:**
  - Automated tests: `src/modules/rentals/booking/__tests__/AddItemPanel.overbooking.test.tsx` (3/3 passed).
  - Database Lifecycle:
    - Step `L87` passed green (`past stock without the switch is refused (T2-23, B12, K4)`).
    - Step `L88` passed green (`with the switch: confirmed with a short line and no reservation (T2-23, B12, K4)`).
    - Step `L89` passed green (`Pack refuses an unresolved short line; resolution requires durable coverage (T2-23, B12, K4)`).
  - Invariants: Zero phantom stock; items without the switch cannot exceed capacity; overbooked items confirm as short lines but cannot be dispatched at Pack until covered.

### 2.6 T3-30 · Consumables: unit price, add at the desk, restock, low stock
- **Merged PR:** #185 (merged 17 Nov 2026), migration `0239_consumables_pricing_restock_and_low_stock.sql`
- **Status:** `done — PR #185 merged; migration 0239, unit pricing, single-charge rental lines, handover stock deduction, and Law 6 masking verified in consumablesPricingAndRestock.test.ts and lifecycle L73 [docs/verification/FLOOR_AND_CONSUMABLES_ACCEPTANCE_2026-11-22.md]`
- **Implementation:** `src/lib/consumables.ts`, `src/modules/rentals/booking/ConsumablesSection.tsx`, migration `0239`.
- **Verification Evidence:**
  - Automated tests: `src/lib/__tests__/consumablesPricingAndRestock.test.ts` (8/8 passed).
  - Database Lifecycle: Step `L73` passed green (`Consumables management: 3-day rental with 2 tape rolls charges 2 units, restocking appends movements, and money is masked (T3-30)`).
  - Invariants: Consumables are charged per unit count (never multiplied across multi-day rental durations); inventory deducts at Handover without return receipts; cost prices and profit margins are masked from floor roles under Law 6.

---

## 3. Automated Verification Summary

| Gate | Target / Suite | Result |
|---|---|---|
| Lifecycle L41 | Repair job close & reservation unblocking | **PASS** |
| Lifecycle L72 | Planned downtime & early return | **PASS** |
| Lifecycle L73 | Consumables pricing, stock deduction & Law 6 masking | **PASS** |
| Lifecycle L78-L79 | Flagged return damage signature & refusal | **PASS** |
| Lifecycle L87-L89 | Overbooking confirmation & Pack stage gate | **PASS** |
| Unit Tests | `consumablesPricingAndRestock.test.ts` (8 tests) | **PASS** |
| Unit Tests | `downtime.test.ts` (2 tests) | **PASS** |
| Component Tests | `AddItemPanel.overbooking.test.tsx` (3 tests) | **PASS** |
| PGlite Engine | `check:pglite` (258 migrations) | **PASS (0 failed)** |
| Lifecycle Suite | `check:lifecycle` (98 steps) | **PASS (98/98 green)** |
| TypeScript | `npm run typecheck` | **PASS (0 errors)** |
