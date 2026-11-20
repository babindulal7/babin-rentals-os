# T2 Floor Cards Acceptance Reconciliation (2026-11-20)

**Scope:** Reconcile completed Floor track cards (**T2-17** and **T2-24**) to `status: done` following PR merges, automated database gates, and owner rulings.

---

## 1. Summary of Reconciled Cards

| Card ID | Title | PR / Commit | Verification Gates | New Status |
|---|---|---|---|---|
| **T2-17** | Save a unit's details | PR #90 (`6ebbe677`) | Migration 0221, monotonic revision check, role gate (`product_units_update`), 148/148 inventory tests pass | `done` |
| **T2-24** | Temporary stock from partners | PR #257 (`62fb5d63`) | Migration 0253, bounded availability, floor return action & modal, Law 6 masking, lifecycle steps L90 & L91 pass (92/92) | `done` |

---

## 2. Detailed Card Evidence

### 2.1 T2-17: Save a Unit's Details
- **Implementation:** PR #90 (`6ebbe677`).
- **Database Gate:** Migration `0221_guard_unit_identity_edits.sql` enforces that `product_units.status` cannot be edited directly via identity edits (`gate.unit_status.direct_write`).
- **Persistence & Optimistic Locking:** Single atomic update guarded by unit ID and server-owned `updated_at` monotonic timestamp, preventing lost edits. Whitelist restricts edits to `asset_tag`, `serial_no`, `rack`, `shelf`, and `bin`.
- **Role Scoping:** Only authorized roles (`Owner`, `Admin`, `Manager`, `Warehouse`) may update identity. Status and condition remain read-only in this surface.
- **Label Reprint:** Tag modifications immediately prompt staff to reprint QR barcode labels.
- **Automated Verification:** 148/148 unit editor and inventory suite tests pass across `src/modules/inventory/__tests__/`.

### 2.2 T2-24: Temporary Stock from Partners
- **Implementation:** PR #257 (`62fb5d63`).
- **Database Schema:** Migration `0253_temporary_stock_from_partners.sql` adds the `temporary_stock` agreement ledger and tags partner units in `product_units` (`temporary_stock_id`, `is_partner_unit = true`).
- **Bounded Availability:** Bounded strictly between `available_from` and `available_until` (UTC). Outside this window, capacity contribution is 0, and the database trigger `validate_unit_reservability` rejects direct reservations.
- **Law 6 Money Masking:** View `temporary_stock_v` masks supplier rates and total agreement costs as `NULL` for floor roles (`Warehouse`, `Technician`, `Driver`, `Client`).
- **Floor Return & Immutability:** Return to partner task is exposed on floor queue; completing it safely retires units and marks status `'Returned to partner'` (Law 3). RPC refuses return while partner units are on rent or packed.
- **Lifecycle Verification:** Steps `L90` (window capacity enforcement) and `L91` (floor return & Law 6 masking) pass in PGlite.

---

## 3. Pre-Flight Verification Sign-Off
- `npm run check:pglite`: **251/251** migrations applied from scratch, 0 failed, 0 leaks, 224 definer search paths pinned.
- `npm run check:lifecycle`: **92/92** steps green (L1 through L92).
- `npm run check:security`: **18/18** Phase 0 SQL regressions, 14 Reset branch tests, operations grants, and glossary revisions pass.
- `npm run typecheck`: clean strict TypeScript AST check with **0 errors**.
- `npm run lint:ui-copy`: **0 developer-text violations**.
