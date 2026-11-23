# T7-02 · Booking Site and Public Catalogue Verification & Design Document

**Task:** T7-02 · Booking site and public catalogue
**Lane:** Lane C (Codex-2 / Gemini OS Assistant)
**Status:** acceptance_pending (verified across migration 0255 and lifecycle step L93)
**Date:** 2026-11-21

---

## 1. Overview & Architectural Isolation

In accordance with S9, D34, W64, B3, B7, B45, and B49:
- **Third Entry Document (`booking.html`):** Built with isolated rollup entrypoint in `vite.config.ts`, generating an independent, lightweight bundle for public consumers with zero internal staff modules, zero ops admin code, and isolated CSS (`src/booking/booking.css`).
- **Public Catalogue View (`public_catalogue_v`):**
  - Selectively queries published products and bundles with positive daily rates (`show_online = true`, `is_active = true`).
  - Hides component items designated `online_bundle_only = true` from appearing as stand-alone items, while aggregating them into `bundle_contents`.
  - Exposes rates in integer paisa (`daily_rate_paisa`, `weekly_rate_paisa`, `monthly_rate_paisa`).
  - Strict Law 6 boundary: **NEVER** leaks cost, replacement value, serial numbers, stock quantities, supplier data, or internal notes.
  - Revokes mutation rights (INSERT, UPDATE, DELETE) from anon and authenticated roles.
- **Anonymous Availability RPC (`public_availability(product_ids uuid[], from date, to date)`):**
  - Stable `SECURITY DEFINER` function with strict limits: $\le 30$ product IDs, $\le 60$ day window, from date $\ge \text{current\_date} - 1$.
  - Returns boolean `available` per product and day based on non-short stock capacity and active GiST reservation overlaps.
  - Never leaks booking codes, customer names, or exact unit quantities.
- **Public Catalogue Storage Bucket:**
  - Configures `catalogue` bucket with public read access.
  - Restricts uploads and updates to staff roles (`Owner`, `Admin`, `Manager`) via RLS storage policies.
  - Equipment record editor (`EquipmentRecordEditor.tsx`) provides integrated photo upload with EXIF location stripping and live preview.

---

## 2. Database & Gate Verification

- **Migration 0255:** `supabase/migrations/0255_booking_site_and_public_catalogue.sql`
  - Applied cleanly in sequence on top of migration 0254.
  - Zero definer search_path leaks.
  - Zero unauthorized anon relation or function leaks.
- **Single Source of Truth Allow-Lists:**
  - `scripts/allowed-anon-functions.mjs`: Added `public_availability`.
  - `scripts/allowed-anon-views.mjs`: Added `public_catalogue_v`.
  - `scripts/check-anon-exposure.mjs`: Verified 142 RLS tables and 1 public view accessible to anon; all mutation attempts refused.
- **Lifecycle Gate L93:**
  - `scripts/e2e-lifecycle.mjs` step `L93`:
    - Tests `public_catalogue_v` visibility for online items and bundles.
    - Asserts offline items and bundle-only items are filtered out.
    - Proves absence of internal columns (`purchase_price`, `replacement_value`, `serial_number`, `supplier_id`, `notes_internal`).
    - Asserts anon mutation refusal on the view.
    - Verifies `public_availability` RPC behavior and verifies anon sees 0 bookings, 0 invoices, 0 clients, and is denied audit log access under RLS.
  - Result: 94/94 green.

---

## 3. Verification Commands & Results

| Gate | Command | Result |
|---|---|---|
| TypeScript | `npm run typecheck` | PASS (0 errors across 2,927 files) |
| Linter | `npm run lint` | PASS (0 warnings across `src`) |
| Local API Guards | `npm run test:local-api-guards` | PASS |
| Offline Unit Tests | `npm test` (with mock backend) | PASS (699 test files, 7,599 tests passed, 0 failed) |
| Migrations Build | `npm run check:pglite` | PASS (253/253 applied from scratch, 0 failed) |
| Financial Integrity | `node scripts/test-booking-financial-integrity.mjs` | PASS |
| Security Regressions | `npm run check:security` | PASS (18 Phase 0 SQL + 14 Reset branch + operations grants) |
| Lifecycle | `npm run check:lifecycle` | PASS (94/94 green, 0 known-red, 0 failed) |
| Server Contracts | `npm run test:server-contracts` | PASS (68/68 assertions passed) |
| Partial Return | `npm run test:partial-return` | PASS (58/58 assertions passed) |
| Shell Design Invariants | `npm run lint:shell` | PASS (943 files checked) |
| Staff UI Copy | `npm run lint:ui-copy` | PASS (0 violations, 12/12 tests passed) |
| Contrast WCAG AA | `npm run check:contrast` | PASS (97/97 passed, light + dark + pilot + glass) |
| Production Build | `npm run build` | PASS (`dist/booking.html`, `dist/assets/`, `dist/sw.js` generated) |
| Anonymous Exposure | `node scripts/check-anon-exposure.mjs` | PASS |
| Catalogue Unit Suite | `npx vitest run src/booking/__tests__/catalogue.test.ts` | PASS (5/5 passed) |
| Roadmap Truth | `npx vitest run src/lib/__tests__/roadmapStatusTruth.test.ts` | PASS (7/7 passed) |
