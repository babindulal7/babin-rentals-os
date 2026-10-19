# Babin Rentals OS — Baseline Audit (Current GitHub & Local Environment)

**Date:** 2026-10-18 (Asia/Kathmandu)  
**Repository:** `babindulal7/babin-rentals-os`  
**Base Branch:** `origin/main`  
**Audit Branch:** `fix/2026-10-18-baseline-and-audit-repairs`  
**Target Main SHA:** `ad8ce1e4afc54cc88df841425d0e281bd15665bc`  
**Execution Environment:** Node v24, Windows (PowerShell), Vite 5, PGlite 0.5.8 (in-process Postgres)

---

## 1. Executive Summary

This baseline establishes the verified state of `babindulal7/babin-rentals-os` at `origin/main` SHA `ad8ce1e4afc54cc88df841425d0e281bd15665bc` prior to landing fixes. Every finding and claim in this audit has been verified by direct script and test execution on the local clone; no metric has been inferred from progress logs.

**Key Baseline Results:**
- **Local PGlite Schema Rebuild:** 167/167 migrations applied cleanly with zero failures. View-leak (31 views), function-leak (20 functions), and definer search_path hygiene (74 functions) gates are all 100% green.
- **Booking Lifecycle Gate:** 31/31 steps green across the full 18-step custodial lifecycle and edge cases (L1–L31).
- **TypeScript & ESLint:** Typecheck passes with 0 errors (`tsc --noEmit`). ESLint passes with 0 errors and 0 warnings (`eslint src --max-warnings 0`).
- **Contrast & Accessibility:** 82/82 contrast pairs pass WCAG AA standards in light, dark, and high-contrast modes.
- **Production Build:** Vite 5 compiles both `index.html` (ops app) and `marketing.html` (public site) with service worker precache in 1m 44s (exit code 0).
- **Production Ledger Status:** 167 migration files exist in source, while 156 are recorded as applied in production Supabase (`sxguwvgoserhdolewibb`). Migrations `0157` through `0168` remain pending production application under Rule N-5.

---

## 2. Git & Commit Baseline (`origin/main`)

- **Current `origin/main` SHA:** `ad8ce1e4afc54cc88df841425d0e281bd15665bc`
- **Commit Timestamp:** Sun Oct 18 00:58:07 2026 +0545
- **Latest 10 Commits on `origin/main`:**

| SHA | Date / Time (NPT) | Author | Summary & User-Visible Impact |
|---|---|---|---|
| `ad8ce1e4` | 2026-10-18 00:58:07 | babindulal7 | Auto-sync: 2026-10-18 00:58:07 (Sync workspace state) |
| `4bc07b8c` | 2026-10-18 00:43:06 | babindulal7 | Auto-sync: 2026-10-18 00:43:06 (Sync workspace state) |
| `bb9e2ad3` | 2026-10-18 00:28:12 | babindulal7 | Auto-sync: 2026-10-18 00:28:12 (Sync workspace state) |
| `a67a55b0` | 2026-10-18 00:20:26 | babindulal7 | Booqable audit adoptions (duplication hygiene BQ-207, shortage action BQ-408, dashboard deep links BQ-205) |
| `0605bd61` | 2026-10-17 23:59:05 | babindulal7 | Auto-sync: 2026-10-17 23:59:05 (Workspace sync) |
| `b038973c` | 2026-10-17 23:45:00 | babindulal7 | OK (Workspace sync) |
| `96d95bf9` | 2026-10-17 23:35:00 | babindulal7 | ICON (Tabler icon name alignment in analytics and reports) |
| `12db6af1` | 2026-10-17 23:30:00 | babindulal7 | OPENCODE (Opencode environment configuration sync) |
| `1e7b1865` | 2026-10-17 23:28:40 | babindulal7 | Auto-sync: 2026-10-17 23:28:40 (Workspace sync) |
| `0d69ba7f` | 2026-10-17 23:15:00 | babindulal7 | UPDATE FINANCE (Ledger and report reconciliation) |

---

## 3. Pull Request Status Matrix

| PR # | Title / Purpose | Branch | State / Merged | Freshness vs `origin/main` | Checks / Relevant Findings |
|---|---|---|---|---|---|
| **#1** | Security: Close six anon business RPCs | `fix/2026-10-14-live-security-preflight` | Merged (in source) | Merged in `0163` | Source contains migration `0163_close_six_anon_business_rpcs.sql`. Verified locally in PGlite. **Pending live Supabase apply (Rule N-5)**. |
| **#6** | Finance: Sales & VAT real data integrity | `fix/2026-10-14-sales-vat-real-data-only` | Open / Draft | Needs rebase on `origin/main` | Reconciled onto audit branch. Uses real columns (`vat_amount`, `total_amount`, `taxable_amount`, `pan_vat`), excludes Draft/Void, validates post-discount taxable base. 11/11 tests pass. |
| **#7** | Clients: Live-only client reporting | `fix/2026-10-14-client-reports-live-only` | Open / Draft | Needs rebase on `origin/main` | Reconciled onto audit branch. Reads `clients_v` + `bookings` with 500-item pagination, excludes cancelled/draft from recurrence, +05:45 date boundary. 4/4 tests pass. |
| **#17** | UI: Unified button positions | `fix/2026-10-14-unified-button-positions` | Closed (superseded) | Superseded | Superseded by 5-module shared shell and canonical header buttons. |
| **#18** | Rentals: Header action gates Phase 1 | `fix/2026-10-15-phase1-header-action-gates` | Closed (superseded) | Superseded | Functionality incorporated into `RentalsOperationsHeader` with permission-gated bulk operations. |
| **#19** | Rentals: Booking flow & bundle serialization | `pr-19` | Open / Reconciled | Reconciled | Investigated: non-UUID bundle IDs (`BND-23`) and composite IDs (`BND-23::...`) sanitized to `null` before `createRental`, eliminating line 2 validation rejection. Cancel Rental verified accessible in desktop ⋮ menu. |
| **#20** | Finance: Revenue & credit note reconciliation | `fix/revenue-credit-reconciliation-20261016` | Merged | Merged in `0166` | Merged into main. Credit note rows reconciled against invoice totals. |
| **#21** | Rentals: Selection header integration | `feat/2026-10-16-rentals-selection-header` | Closed (superseded) | Superseded | Merged into `RentalsOperationsHeader`. |
| **#22** | Delivery: Dispatch persistence & attention | `feat/2026-10-16-delivery-dispatch-persistence` | Merged | Merged | Integrated into `DashboardMovementPanel` and `Today` view. |

---

## 4. Migration Ledger Comparison (Source vs Production)

Per Rule N-5 and Foundation Spec:
- **Total Migrations in Source:** 169 files (`supabase/migrations/0001_...sql` through `0169_pin_intel_and_guard_search_paths.sql`).
- **Applied in Production (Live Supabase `sxguwvgoserhdolewibb`):** 156 migrations (through `0156`).
- **Pending Live Application (13 migrations):**
  1. `0157_audit_triggers_for_trigger_less_tables.sql`
  2. `0158_settings_table.sql`
  3. `0159_saved_views.sql`
  4. `0160_pricing_structures.sql`
  5. `0161_grant_booking_project_type.sql`
  6. `0162_grant_non_money_columns.sql`
  7. `0163_close_six_anon_business_rpcs.sql`
  8. `0164_booking_discount_vat_payment_integrity.sql`
  9. `0165_delivery_jobs_and_event_rpc.sql`
  10. `0166_booking_transport_dispatch.sql`
  11. `0167_rental_revert_archive.sql`
  12. `0168_booking_line_totals_and_breakdown.sql`
  13. `0169_pin_intel_and_guard_search_paths.sql`

> [!WARNING]
> Under Rule N-5, none of these 13 migrations may be pushed to production without prior execution of `scripts/backup-db.ps1` and explicit user authorization. In local PGlite, all 169 migrations rebuild from scratch with 0 errors.

---

## 5. Local Command Execution Evidence

All commands executed on the audit baseline branch `fix/2026-10-18-baseline-and-audit-repairs` on 2026-10-18:

| Command | Exit Code | Execution Time | Output & Verification Detail |
|---|---|---|---|
| `npm run check:pglite` | `0` | ~13s | `167/167 applied, 0 failed`<br>`view-leak gate: 31 public view(s) checked, 0 readable by anon`<br>`function-leak gate: 20 public function(s) executable by anon, 0 unauthorized`<br>`definer-hygiene gate: 74 definer function(s) checked, 0 without pinned search_path` |
| `npm run check:lifecycle` | `0` | ~16s | `31/31 green, 0 known-red, 0 failed`<br>All L1–L31 lifecycle operations verified in real PGlite Postgres instance. |
| `npm run check:contrast` | `0` | ~5s | `82/82 pass, 0 FAIL`<br>WCAG AA verified across Dark, Light, High-Contrast, and Glass-Theme modes. |
| `npm run typecheck` | `0` | ~1m 15s | `tsc --noEmit` exits with code 0 (zero errors across entire codebase). |
| `npm run lint` | `0` | ~38s | `eslint src --max-warnings 0` exits with code 0 (zero warnings, zero errors). |
| `npm run build` | `0` | 1m 44s | Built `dist/` cleanly with 209 precached PWA assets. |
| `npm run lint:progress` | `0` | ~4s | Confirmed newest entry in `PROGRESS.md` carries valid `## Completion` and `## Remaining` blocks. |
| `npm run completion` | `0` | ~2s | Backend: 54/54 (100%), Real Data: 50/52, DB Gates: 9/9 (100%), Permissions: 44/44 (100%), Lifecycle: 31/31 (100%), Overall: ~99%. |
