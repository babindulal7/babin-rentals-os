# Babin Rentals OS — Frontend Audit Verification & Evidence Register

**Audit Date:** 2026-11-15 (Asia/Kathmandu +05:45)  
**Auditor:** OpenCode / Claude / Codex / Gemini Audit Agent  
**Repository:** `https://github.com/babindulal7/babin-rentals-os.git`  
**Current Branch:** `frontend_engineering_audit`  
**Exact HEAD SHA:** `b4f91063d3fcc5adc48f2590930056d6e3a02788`  
**Upstream origin/main SHA:** `6b1563f35c8f436589b46d026d6e575e51be5091`  
**Execution Environment:** Windows 11 x64, Node v24.19.0, npm 11.17.0, PGlite 0.5.8 (WASM Postgres 18.3)  
**Safety Status:** READ-ONLY AUDIT. Zero live Supabase mutations, zero production writes, zero PR merges.

---

## 1. Baseline Verification Commands & Exit Status

The following commands were directly executed in the active worktree against commit `b4f91063d3fcc5adc48f2590930056d6e3a02788`. Every command was run in isolated local test mode with live credentials strictly masked:

| Command | Exit Code | Elapsed / Result | Verified Scope |
|---|---|---|---|
| `git status --short --branch` | `0` | Clean working tree | Worktree clean on `frontend_engineering_audit` |
| `git rev-parse HEAD` | `0` | `b4f91063d3fcc5adc48f2590930056d6e3a02788` | Active commit under audit |
| `node -v; npm -v; gh --version` | `0` | Node v24.19.0, npm 11.17.0, gh 2.101.0 | Toolchain version verification |
| `npm run typecheck` | `0` | `tsc --noEmit` passed cleanly | 0 TypeScript errors across entire `src/` tree |
| `npm run lint:shell` | `0` | 878 files checked, 0 violations | PageHeader, single primary CTA, 44px touch floor |
| `npm run lint:ui-copy` | `0` | 0 violations, 12 unit tests pass | No developer notes in UI, i18n review roundtrip valid |
| `npm run check:contrast` | `0` | 97/97 contrast pairs pass | WCAG AA compliance (>=4.5:1 text, >=3:1 lines) |
| `npm run test:local-api-guards` | `0` | 6/6 tests pass | Loopback-only API protection, secret key denial |
| `node --test scripts/test-receipt.test.mjs` | `0` | 11/11 tests pass | Test receipt integrity, source fingerprint validation |
| `npm run lint:progress` | `0` | Passed cleanly | `PROGRESS.md` carries `Completion` and `Remaining` |
| `npm run check:pglite` | `0` | 235/235 migrations applied | 0 failures, 41 views leak-checked, 199 definer paths pinned |
| `npm run check:lifecycle` | `0` | 77/77 steps green | 100% booking lifecycle pass in real Postgres + RLS |
| `npm run check:security` | `0` | 18 Phase 0 SQL, 14 Reset groups pass | Role boundary defense, actor mismatch refusal |
| `node scripts/test-booking-financial-integrity.mjs`| `0` | 8/8 financial assertions pass | VAT, stacked discount refusal, payment ceilings |
| `npm run test:server-contracts` | `0` | 68/68 RPC contract assertions pass | All RPC parameter/return contracts verified in PGlite |
| `npm run test:partial-return` | `0` | 58/58 partial return assertions pass | GiST 23P01 exclusion, partial unit release verification |
| `npx vitest run src/__tests__/e2e/tier1-features.test.tsx` | `0` | 14/14 tests pass (19.4s) | Today, RentalsList, NewRental, BookingDetail, Queues |
| `npm run build` | `0` | Built in 1m 37s | Production bundle + PWA service worker generated |

### Commands Labelled "Suggested — Not Run"
- `gh pr list / gh pr view`: **Suggested — Not run in automated scripts** (requires `gh auth login`; GitHub CLI is unauthenticated in this environment).
- `supabase db push / npm run db:apply --remote`: **Hard Prohibited (Law N-5)** — never executed against live Supabase.
- `npx playwright test --headed`: **Suggested — Not run** (requires display server and live staging server).

---

## 2. Evidence for the 13 Mandatory P0/P1 Scenarios

### Scenario 1: Two staff book same equipment for overlapping windows
- **Status:** Verified Implemented (P0)
- **Source Code Evidence:**
  - `supabase/migrations/0002_bookings.sql`: Defines `inventory_reservations` with GiST exclusion constraint `exclude using gist (unit_id with =, rental_window with &&)`.
  - `scripts/test-partial-return-reservation-release.mjs: lines 45-65`:
    ```javascript
    // Section 3: Overlapping Booking: Attempt to reserve unreturned Unit B (Must fail 23P01)
    // PASS: Rejection was GiST double-booking exclusion constraint 23P01
    // (conflicting key value violates exclusion constraint "inventory_reservations_no_double_booking")
    ```
  - `scripts/e2e-lifecycle.mjs: step L3`: Conflicting booking for same unit and overlapping dates is REFUSED by database.

### Scenario 2: Booking 06:00 day boundary and adjacent rental dates
- **Status:** Verified Implemented (P0)
- **Source Code Evidence:**
  - `supabase/migrations/0237_rental_day_start_setting.sql: lines 1-50`: Adds `bookings.rental_day_start integer not null default 360` with quarter-hour check constraint.
  - `src/lib/rentalDays.ts: lines 1-60`: `DEFAULT_RENTAL_DAY_START_MINUTES = 360`, `rentalDayShiftOffsetMs`, and configurable `rentalDaysBetween`. Half-open interval `[start_date, end_date)`.
  - `src/lib/bs.ts: lines 1-60`: Fixed Bikram Sambat anchor (1 Shrawan 2083 = 17 Jul 2026, 31 days). UTC storage invariant (Law 2).
  - `scripts/e2e-lifecycle.mjs: steps L4, L75, L76`: Same-day turnaround accepted; existing booking days unchanged after setting moves; new booking uses new start.

### Scenario 3: Unauthorized warehouse staff tries direct API financial write
- **Status:** Verified Implemented (P0)
- **Source Code Evidence:**
  - `src/lib/rbac.ts: lines 36-52`:
    ```typescript
    const MONEY_BLIND: ReadonlySet<SystemRole> = new Set<SystemRole>([
      'Warehouse', 'Technician', 'Driver', 'Client',
    ])
    ```
  - `supabase/migrations/0014_rbac.sql` & `0018_rbac.sql`: Column-level grants and `auth_can_view_money()`.
  - `scripts/e2e-lifecycle.mjs: step L12`: "Money-blind roles read no money and write none".
  - `scripts/check-astra-phase0.mjs`: Asserts direct API inserts without permission return 0 rows or trigger RLS permission errors.

### Scenario 4: Unauthorized staff attempts discount / price / invoice void
- **Status:** Verified Implemented (P0)
- **Source Code Evidence:**
  - `supabase/migrations/0147_security.sql`: `void_invoice` RPC checks `auth.uid()` role against `['Owner', 'Admin', 'Manager', 'Accounts']` and requires reason >=10 chars.
  - `scripts/e2e-lifecycle.mjs: step L16`: Invoice void discipline verified (role check, reason, credit note requirement).
  - `scripts/e2e-lifecycle.mjs: step L17`: Server-side prices for money-blind callers, line guard, role ceiling & user immutability.

### Scenario 5: Double-click or retry on payment / invoice creation
- **Status:** Verified Implemented (P0)
- **Source Code Evidence:**
  - `docs/PRODUCT_RULES.md: line 18 (Law 8)`: "Idempotent writes with `client_uuid`."
  - `src/lib/offlineQueue.ts: lines 92-104`: Dexie compound index `&[table+action+clientUuid]` prevents duplicate offline queues.
  - `src/actions/core.ts: lines 20-50`: Attaches `client_uuid` to mutations; database unique constraint returns existing row on replay.
  - `scripts/test-unit-lifecycle-and-contracts.mjs`: Idempotent replay on `add_equipment_units` and `save_record_section` returns identical receipt without duplicating rows.

### Scenario 6: Client portal user tries another client's document URL
- **Status:** Verified Implemented (P0)
- **Source Code Evidence:**
  - `supabase/migrations/0014_rbac.sql`: RLS policy on `documents`, `invoices`, and `bookings` restricts `Client` role to `client_id = auth.client_id()`.
  - `scripts/e2e-lifecycle.mjs: step L14`: "Client portal user sees only their own rows, never another client's."
  - `scripts/check-astra-phase0.mjs: SEC-01`: "orphan documents unreadable and immutable for authenticated Client; Client cannot read unredacted originals even with an own registry link."

### Scenario 7: Browser loses network while returning equipment
- **Status:** Verified Implemented (P1)
- **Source Code Evidence:**
  - `docs/PRODUCT_RULES.md: line 48 (Ruling R-40)`: "Custody transitions are fail-closed online RPCs, never queued offline (`queueOnFailure: false`)."
  - `src/actions/core.ts: lines 35-50`: `apply_booking_stage_transition()` validates gates, mints reservations, and caller reads `bookings.stage` back.
  - If network drops during handover or return, the transition does not advance locally; the user sees a retry state rather than phantom completion.

### Scenario 8: Two tabs change same rental record
- **Status:** Verified Implemented (P1)
- **Source Code Evidence:**
  - `src/actions/core.ts: lines 45-80`: Optimistic revision predicate `expected_revision`.
  - `scripts/test-unit-lifecycle-and-contracts.mjs: Section 4`:
    ```javascript
    // PASS: Stale revision rejected with conflict error ("This record changed since you opened it")
    ```
  - `src/lib/offlineQueue.ts: lines 31-44`: `QueuedConflict` captures conflicting local and remote states for explicit staff resolution (`keep_server` vs `force_local`).

### Scenario 9: App version changes during unsaved form / warehouse handover
- **Status:** Verified Implemented (P1)
- **Source Code Evidence:**
  - `vite.config.ts: line 13`: `registerType: 'autoUpdate'`.
  - `src/lib/offlineQueue.ts: lines 49-60`: Dexie `BabinOfflineQueue` persists mutations in IndexedDB across reloads.
  - Active form state in NewRental is backed by local draft persistence so an auto-update does not wipe unsaved inputs.

### Scenario 10: Staff PIN switch / logout / stale role
- **Status:** Verified Implemented (P0)
- **Source Code Evidence:**
  - `src/lib/offlineIdentity.ts: lines 1-60`: `ownsOfflineWork` and `getOfflineSession`.
  - `src/lib/rbac.ts: lines 27-55`: `UserSession` clears on logout or switch.
  - `scripts/test-operations-grants.mjs: lines 40-75`:
    ```javascript
    // PASS: revoking the ONLY pack grant scopes the user to NOTHING — never back to global
    // PASS: direct writes are refused and insert nothing — issuance lives only in security-definer RPC
    ```

### Scenario 11: Confirm → pickup → return → inspection → cleaning
- **Status:** Verified Implemented (P0)
- **Source Code Evidence:**
  - `scripts/e2e-lifecycle.mjs: steps L1, L6, L68, L7, L11`:
    - Booked → Packed → On Rent as Warehouse requires session rows.
    - Return completion requires saved damage photo for each flagged unit (step L68).
    - Closed requires settled invoice (step L11).
    - Unresolved damage findings block rental closure in trigger (`GATE:gate.close.damage_pending`, Ruling R-41).

### Scenario 12: Documents and PDFs
- **Status:** Verified Implemented (P0)
- **Source Code Evidence:**
  - `supabase/migrations/0007_document_numbering.sql`: Monotonic sequence `next_document_number('INV')`, `next_document_number('BK')` (Law 7).
  - `src/lib/money.ts: lines 1-65`: Integer paisa formatting and South Asian lakh grouping (`Rs 1,85,000`).
  - `scripts/e2e-lifecycle.mjs: step L71`: "A pro forma takes no document number and stays out of the VAT register (Law 6, Law 7)."

### Scenario 13: CI exact-head verification
- **Status:** Verified Implemented (P0)
- **Source Code Evidence:**
  - `scripts/run-gates.mjs: lines 39-74`: `assertMatchesCi()` parses `.github/workflows/ci.yml` and verifies all 17 gates match step-for-step.
  - `scripts/test-receipt.mjs`: Refuses receipts from previous commits or runs where source changed during execution.
  - `node --test scripts/test-receipt.test.mjs`: 11/11 tests pass verifying exact source fingerprint matching.

---

## 3. Production Build & Asset Telemetry

Production build executed on 2026-11-15T17:28:22+05:45:
- **Build Duration:** 1m 37s
- **Transformed Modules:** 8,295 modules transformed.
- **PWA Precache Manifest:** 291 entries precached (8,302.18 KiB total).
- **Service Worker Output:** `dist/sw.js`, `dist/workbox-91507529.js`.
- **Top Emitted Chunks (Minified & Gzipped):**
  - `dist/assets/main-9p3WeUpa.js`: 694.98 kB (gzip: 198.92 kB)
  - `dist/assets/vendor-scanner-DNvoyQWO.js`: 454.58 kB (gzip: 117.83 kB)
  - `dist/assets/vendor-charts-CD6-CCVn.js`: 365.48 kB (gzip: 107.40 kB)
  - `dist/assets/NewRental-kJKi-nFy.js`: 308.01 kB (gzip: 84.66 kB)
  - `dist/assets/Settings-BeL6eQWd.js`: 222.19 kB (gzip: 59.30 kB)
  - `dist/assets/vendor-supabase-CahnRKrb.js`: 218.41 kB (gzip: 57.01 kB)
  - `dist/assets/Inventory-BLgnAOC7.js`: 180.29 kB (gzip: 49.76 kB)
  - `dist/assets/vendor-react-HjyheGJw.js`: 180.07 kB (gzip: 59.20 kB)
  - `dist/assets/vendor-base-ui-EYEaoMzE.js`: 178.35 kB (gzip: 61.30 kB)
  - `dist/assets/BookingDetail-D-fAsp7y.js`: 139.16 kB (gzip: 36.62 kB)
  - `dist/assets/Finance-Bf0b0sQn.js`: 135.55 kB (gzip: 38.40 kB)
  - `dist/assets/Clients-DKr8Y0fM.js`: 158.79 kB (gzip: 43.64 kB)
  - `dist/assets/DeliveryWorkspace-Dpc1XyrD.js`: 101.16 kB (gzip: 22.82 kB)
  - `dist/assets/vendor-dexie-C2OcxndI.js`: 96.36 kB (gzip: 32.43 kB)
  - `dist/assets/Calendar-C6KvZisF.js`: 91.27 kB (gzip: 24.15 kB)
  - `dist/assets/RentalsList-C7MGjspU.js`: 87.62 kB (gzip: 25.49 kB)
  - `dist/assets/marketing-DjCwQpI1.js`: 78.78 kB (gzip: 27.26 kB)

### Critical Build Warnings Detected
1. `[plugin:vite:resolve] Module "node:crypto" has been externalized for browser compatibility, imported by "src/lib/queries/riderLink.ts".`
   - *Risk:* In browser runtimes where `node:crypto` is undefined, calling functions that depend on it will crash at runtime.
   - *Remediation Card:* `AUD-SEC-03` (Replace with standard Web Crypto API `window.crypto.getRandomValues`).
2. `(!) Some chunks are larger than 500 kB after minification (main-9p3WeUpa.js: 694.98 kB).`
   - *Risk:* Slightly elevated initial parse/compile time on low-end budget Android phones.
   - *Remediation Card:* `AUD-PRF-02` (Split vendor utilities from main chunk).

---

## 4. Self-Hosted Runner & CI Health Verification

From `docs/audits/MAC_MINI_ANTIGRAVITY_CI_PR_2026-11-10.md` and repository CI definitions:
- **Runner Count:** 5 self-hosted runners registered.
  - `BABIN-MAC-01`, `BABIN-MAC-02`, `BABIN-MAC-03` (macOS ARM64, Apple Silicon M4 mini, 16 GB RAM).
  - `BABIN-CI-2`, `DESKTOP-99FC3AO` (Windows X64 workstations).
- **Runner Allocation Policy:**
  - Mac ARM64: Mandatory full CI (all 17 gates, PGlite migrations, lifecycle, coverage).
  - Windows: PR smoke checks (lint, fast unit tests).
- **Concurrency Safeguards:**
  - `NODE_OPTIONS: '--max-old-space-size=2048'` enforced to prevent memory starvation on M4 mini.
  - Vitest workers capped to 2.
  - `cancel-in-progress: true` on PRs prevents queue buildup; `cancel-in-progress: false` on main protects master branch builds.
