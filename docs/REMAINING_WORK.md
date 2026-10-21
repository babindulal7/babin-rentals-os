# Babin Rentals OS — Comprehensive Remaining Work Register

> **ASTRA master repair continuation, 21 October 2026:** outbox, report completeness and modal/date/Today/Finance repairs are prepared with focused regressions. Full current-source gates are pending; earlier source receipts do not certify these newer edits. See root AUDIT_WORKTREE_PROGRESS.md and artifacts/astra-20261021-024418. Production launch remains HOLD; hosted and device acceptance remain open.

> **21 October continuation:** the prior 4,948-test run passed commands but changed during verification; the newer single-shell/L1 merge is not certified by it. Post-confirmation counts now load complete pages and report unavailable summaries as unknown while retaining confirmed success. Seven new regressions failed before the fix; fresh gates are underway. See the newest progress entry and `docs/verification/ASTRA_LOCAL_2026-10-21.json`. Pre-commit confirmation-line counts, shared backend workflows, legacy recovery, tax/document/evidence and physical device/hosted acceptance remain open.

> **Later booking-input batch:** booking-line and product metadata/fallback pagination is now corrected; 8 new regressions and 200 focused checks pass. Full current-source verification is running. The 4,931-test checkpoint below is historical for these edits, preserved in `docs/verification/ASTRA_AVAILABILITY_CHECKPOINT_2026-10-20.json`. Post-confirmation held-summary and confirmation-query completeness review remain open, alongside shared workflows/device/hosted acceptance.

> **Final local result, 20 October 2026:** **4,931 tests / 387 files PASS**, with lint, rebuild (168), financial/security (15 groups), lifecycle (31), contrast (82), final typecheck and production build all matching the same current-source fingerprint. Durable proof: `docs/verification/ASTRA_LOCAL_2026-10-20.json`. This supersedes “underway” statements in the earlier checkpoint note below. Migration 0170 is locally VERIFIED only. Shared workflows, legacy recovery, VAT/document/evidence acceptance, actual responsive devices and hosted JWT/Storage remain OPEN; no release approval or hosted application is implied.

> **Earlier checkpoint history:** the financial checkpoint passed 4,879 tests on unchanged source; the later 4,899-test run changed during lint/tests. Both are retained for comparison and superseded by the final checkpoint above. Recovery branches and existing local work are preserved. Follow [`AUDIT_WORKTREE_PROGRESS.md`](../AUDIT_WORKTREE_PROGRESS.md) and the source-bound receipts in `docs/verification/`. No hosted database changes are authorized. The older baseline below is historical, not current certification.

## ASTRA acceptance still required on current main

| Finding | Current local work | Remaining acceptance |
|---|---|---|
| SEC-01 | Scoped immutable Storage policies, private buckets, fail-closed uploads, session-linked evidence helper; current local migration/security/lifecycle checks pass | Hosted JWT/Storage, legacy object mapping and floor evidence integration |
| SEC-02–05 | Internal financial RPC restrictions, server-bound audit identity, Admin superior-target protection, assigned Driver trip access; 15 SQL groups and 31 lifecycle steps pass locally | Actual authenticated hosted API acceptance |
| REL-01/02 | Account/project-scoped outbox, captured submission/replay identity, matching durable receipts and preserved legacy payloads; regressions, full suite and build pass | Device/browser offline acceptance and explicit legacy ownership recovery |
| Driver custody | Offline queue fallback removed; failed confirmation retains form/retry key; focused/full regressions pass | Operational UI acceptance and actual photo/signature persistence workflow |
| WF-01–08 | Stored totals, complete Sales/VAT registers, discounts and validated amounts pass current full checks. Availability candidates/holds/reset pagination and unreadable-period refusals pass 134 related tests and the full suite | VAT classification provenance (§15 OPEN_DECISIONS); remaining date/report/export/document and authenticated availability acceptance; review other planning/held-summary pagination separately |
| UI-01–03 / Notes | Live prototype reads/writes now refuse before touching storage; unavailable states replace sample business records and actions. Existing local bytes preserved; 13 live-boundary regressions and 44 focused tests pass | Shared authoritative persistence, ownership recovery and role enforcement remain OPEN (§16 OPEN_DECISIONS); unavailable states are a mitigation, not completed shared features |
| UI-04–06 | Newer shared drawers/header changes preserved under the 20 October ruling | Nested modal, phone Finance and date-preset acceptance; desktop/iPad/mobile layout verification |
| QA-01/02 | Incomplete/historical receipts cannot certify source; Node receipt suite 6/6 and full suite 4,931/4,931 pass on the current fingerprint; coverage generated | Missing coverage areas and real browser/device acceptance; rerun after future source changes |
| PERF-01 | Current build measured main 704.47 kB (gzip 199.61 kB), New Rental 278.83 kB, scanner vendor 453.49 kB; large-chunk warning remains | Measure real startup/device performance and optimize measured bottlenecks |

Desktop, iPad and mobile browser verification remain pending. Local SQL verification does not mean a migration was APPLIED or PRODUCTION-VERIFIED.

**Document Version:** 1.0.0  
**Date:** 15 October 2026 (Asia/Kathmandu)  
**Governing Authority:** [`docs/00_READ_FIRST.md`](00_READ_FIRST.md) · [`CLAUDE.md`](../CLAUDE.md) · [`AGENTS.md`](../AGENTS.md) · [`docs/PERMISSIONS.md`](PERMISSIONS.md)  
**Current Phase:** **Phase 7 — Pre-Deployment Production Verification & Migration Cutover**  
**Production Release Status:** **HOLD** (Governed by Rule N-5: No unreviewed or un-rehearsed database pushes to live Supabase).

---

## Executive Summary & Verified Baseline

All core financial calculations, custodial workflow engines, database constraints, and local automated test suites are verified and passing locally:
- **TypeScript:** 0 errors (`npm run typecheck`).
- **ESLint:** 0 errors, 0 warnings (`npm run lint`).
- **Unit & Integration Suite:** 348 test files, 4,446 tests passing (`npm test`).
- **Postgres Migrations (PGlite):** 160/160 migrations applied cleanly with zero failures (`npm run check:pglite`).
- **Lifecycle Suite (Postgres + RLS):** 30/30 stages green (`npm run check:lifecycle`).
- **Accessibility Contrast:** 82/82 WCAG AA pairs verified in light, dark, and glass themes (`npm run check:contrast`).
- **Production Build:** Clean bundle output with 297 PWA precache assets (`npm run build`).

Despite the local test suite being 100% green, **production deployment remains on HOLD** pending live staging database verification, physical device validation, live database migration execution under backup protocol, and explicit Owner rulings on open business policies.

---

## 1. Production Cutover & Database Gates (Strict Rule N-5)

### Task 1.1: Docker-Free Production Database Backup
- **Priority:** P0 (Release Blocker)
- **Status:** READY TO RUN
- **Affected Subsystem:** Remote Supabase Database (`sxguwvgoserhdolewibb`)
- **Specification:** [`BACKUP_PROTOCOL.md`](../BACKUP_PROTOCOL.md)
- **Description:** Before any migration is applied to production, a non-destructive remote database dump must be generated using [`scripts/backup-db.ps1`](../scripts/backup-db.ps1). The backup script extracts schema, table rows, and authentication tables via Postgres SSL without requiring local Docker daemon installation.
- **Verification Criteria:** Complete SQL dump verified for size and table integrity; backup stored in secure off-site archive.

### Task 1.2: Staging Database Provisioning & Migration Rehearsal
- **Priority:** P0 (Release Blocker)
- **Status:** BLOCKED (Pending Staging Instance Provisioning by Owner)
- **Affected Subsystem:** Supabase Staging Environment
- **Specification:** [`docs/release/2026-10-13/BLOCKERS.md`](release/2026-10-13/BLOCKERS.md) (BLOCKER-03)
- **Description:** 
  - Production database is currently at migration state ~0124. Migrations `0125` through `0160` (36 migrations) are verified locally in PGlite but have never run against a real Supabase cloud project.
  - The Owner must provision an isolated, active Supabase staging project and provide its configuration via secure environment variables:
    - `BABIN_STAGING_SUPABASE_URL`
    - `BABIN_STAGING_PROJECT_REF`
    - `BABIN_STAGING_ANON_KEY`
  - Execute migrations `0125` through `0160` sequentially on staging, validating that all triggers, views, and RLS policies compile without syntax or role errors.
- **Verification Criteria:** Staging database successfully reaches version `0160` with zero schema errors.

### Task 1.3: Nine-Role Read-Only Staging Verification
- **Priority:** P0 (Release Blocker)
- **Status:** BLOCKED (Requires Staging Environment & Role JWTs)
- **Affected Subsystem:** Auth, PostgREST, RLS
- **Specification:** [`artifacts/staging-verification-2026-10-14/REPORT.md`](../artifacts/staging-verification-2026-10-14/REPORT.md)
- **Description:**
  - Execute the hardened read-only test harness [`artifacts/staging-verification-2026-10-14/verify-staging-readonly.mjs`](../artifacts/staging-verification-2026-10-14/verify-staging-readonly.mjs).
  - Supply fresh JWTs for all nine system roles (`Owner`, `Admin`, `Manager`, `Coordinator`, `Warehouse`, `Technician`, `Accounts`, `Driver`, `Client`).
  - Verify PostgREST column masking:
    - Money-blind roles (`Warehouse`, `Technician`, `Driver`, `Client`) must read `null` on `booking_lines_v.rate`, `products_v.daily_rate`, and must be blocked from direct reads of `payments`, `invoices`, and `deposit_ledger`.
    - Authenticated Client role must strictly only read their own bookings and client profile (cross-client access denied with 0 rows).
    - Public/anon requests must be denied execution on all mutating RPCs and denied reads on all internal views (`staff_directory_v`, `product_units_service_v`, `audit_logs`).
- **Verification Criteria:** `verify-staging-readonly.mjs` exits with code 0 against the staging project.

### Task 1.4: Production Migration Execution
- **Priority:** P0 (Release Blocker)
- **Status:** HOLD (Gated on Tasks 1.1, 1.2, and 1.3)
- **Affected Subsystem:** Remote Supabase Production Database
- **Specification:** [`BACKUP_PROTOCOL.md`](../BACKUP_PROTOCOL.md) · [`docs/live/APPLY_PLAN_2026-10-03.md`](live/APPLY_PLAN_2026-10-03.md)
- **Description:** Under Rule N-5, only after successful staging certification and owner sign-off, apply pending migrations `0125` through `0160` to the production database via Supabase SQL Editor or approved migration runner.
- **Verification Criteria:** PostgREST schema cache reloads cleanly (`NOTIFY pgrst, 'reload schema'`); all production tables and views report zero migration failure.

### Task 1.5: Production Smoke Test & Session Sign-Off
- **Priority:** P0 (Release Blocker)
- **Status:** HOLD (Gated on Task 1.4)
- **Affected Subsystem:** Live Application (`https://babinrentals.com` / production domain)
- **Description:** Perform live smoke tests with authentic user credentials for Owner, Coordinator, and Warehouse to confirm end-to-end functionality in production without bypassing authentication.
- **Verification Criteria:** Signed-in session verifies role banner, navigation items, real database queries, and zero console errors.

---

## 2. Backend Architecture & Server Actions (Persistence Gaps)

### Task 2.1: Delivery Workspace Database Persistence
- **Priority:** P1 (High)
- **Status:** UNIMPLEMENTED (Currently in LocalStorage)
- **Affected Files:** 
  - [`src/modules/operations/DeliveryWorkspace.tsx`](../src/modules/operations/DeliveryWorkspace.tsx)
  - [`src/lib/queries/delivery.ts`](../src/lib/queries/delivery.ts)
- **Specification:** [`PLAN.md §4.64(c)`](../PLAN.md#L716)
- **Description:** 
  - Currently, [`src/lib/queries/delivery.ts`](../src/lib/queries/delivery.ts) reads and writes browser `localStorage` (`babin_rentals_deliveries_v1`) seeded with hardcoded mock records (`DEL-2601`). Actions such as "Assign Rider", "Start Delivery", and "Confirm Delivered" never touch Supabase.
  - Deliveries on two separate devices are completely desynchronized.
  - Implement a dedicated database table or wire directly to `booking_transport` with atomic server actions:
    1. `assignDeliveryDriver(tripId, driverId)`
    2. `startDeliveryTrip(tripId)`
    3. `confirmDeliveryDelivered(tripId, receiverName, notes)`
  - Replace `localStorage` operations with authenticated Supabase queries adhering to role-based access control.
- **Verification Criteria:** Dispatching a delivery on one device updates real-time state on a second device; changes persist across browser cache resets.

### Task 2.2: G3 Pricing Structure Invoice Breakdown Persistence
- **Priority:** P1 (High)
- **Status:** BLOCKED on Schema Migration 0161
- **Affected Files:**
  - [`supabase/migrations/`](../supabase/migrations/)
  - [`src/actions/rentals/createRental.ts`](../src/actions/rentals/createRental.ts)
  - [`src/lib/pricingPipeline.ts`](../src/lib/pricingPipeline.ts)
- **Specification:** [`docs/OPEN_DECISIONS.md §11 (G3)`](OPEN_DECISIONS.md#L89)
- **Description:**
  - Complex pricing structures (seasonal rates, weekend tiers, multi-day tiers) correctly price a **quote** in the frontend pricing engine, but the database `create_booking` RPC currently does not store line-item price breakdown snapshots.
  - Invoices generated later cannot reliably reproduce the exact pricing calculation without hardcoding flat rates.
  - Author migration `0161_pricing_structure_snapshot.sql` adding `price_breakdown jsonb` to `booking_lines` and updating `create_booking(jsonb)` to persist line-level breakdowns.
  - Verify migration passes `npm run check:pglite` and `npm run check:lifecycle`.
- **Verification Criteria:** Generating an invoice from a structure-priced booking renders the exact historical line breakdown without arithmetic drift.

### Task 2.3: Atomic Backend RPCs for Excluded Creation Actions
- **Priority:** P2 (Medium)
- **Status:** EXCLUDED / DEFERRED
- **Affected Files:** [`src/components/ui/creation/CreationActionRegistry.ts`](../src/components/ui/creation/CreationActionRegistry.ts)
- **Specification:** [`docs/release/2026-10-13/BLOCKERS.md`](release/2026-10-13/BLOCKERS.md) (BLOCKER-04)
- **Description:** Secondary entities (`maintenance.new`, `task.new`, `agreement.new`) were stripped from the global creation modal to prevent fake UI toasts. Build atomic backend RPCs and corresponding tables for:
  - Equipment Maintenance Work Orders (`create_maintenance_order`).
  - Warehouse Staff Tasks (`create_operational_task`).
  - Rental Agreements / Legal Documents (`create_rental_agreement`).
- **Verification Criteria:** Global creation triggers succeed against the database with valid audit events, or remain cleanly disabled.

### Task 2.4: Dexie Offline Outbox UI Wire-up
- **Priority:** P2 (Medium)
- **Status:** PARTIAL (Outbox engine exists; UI callers not wired)
- **Affected Files:** 
  - [`src/lib/offlineQueue.ts`](../src/lib/offlineQueue.ts)
  - [`src/lib/dataAccess.ts`](../src/lib/dataAccess.ts)
- **Specification:** [`PLAN.md Phase 9`](../PLAN.md#L557)
- **Description:** 
  - Dexie-backed outbox queue, retry backoff, dead-letter storage, and `client_uuid` deduplication exist in [`src/lib/offlineQueue.ts`](../src/lib/offlineQueue.ts).
  - However, non-custodial operational screens (equipment barcode scans, checklist ticks, notes) still write directly via Supabase client rather than routing through `idempotentInsert` / `safeUpdate`.
  - Wire non-custodial mutations through the Dexie outbox so that field workers can scan and check off items while network connection drops.
- **Verification Criteria:** Actions taken in airplane mode remain queued in IndexedDB and flush automatically upon network reconnect without duplicate rows.

---

## 3. UI/UX & Responsive Polish

### Task 3.1: Phone Header De-Crowding (Operations & Settings)
- **Priority:** P1 (Pre-Deployment Critical)
- **Status:** ACTIVE SPRINT
- **Affected Files:**
  - [`src/modules/operations/OperationsQueues.tsx`](../src/modules/operations/OperationsQueues.tsx)
  - [`src/modules/settings/Settings.tsx`](../src/modules/settings/Settings.tsx)
- **Specification:** [`docs/release/2026-10-13/BLOCKERS.md`](release/2026-10-13/BLOCKERS.md) (BLOCKER-02)
- **Description:**
  - Phone header de-crowding is completed and verified for `Calendar.tsx` (BLOCKER-01) and `Finance.tsx`.
  - `OperationsQueues.tsx` and `Settings.tsx` pass multiple sibling action buttons into `PageHeader`, causing title truncation or horizontal crowding on 360px–390px phone screens.
  - Consolidate secondary action buttons into `OverflowMenu` (More ⋯), hide redundant date pickers on mobile, and guarantee the title bar strictly fits the 64px header height.
- **Verification Criteria:** Verified at 360px, 375px, and 390px with 0 horizontal scroll and unclipped titles.

### Task 3.2: Touch Target Enforcement on New Rental Catalogue
- **Priority:** P1 (Pre-Deployment Critical)
- **Status:** OPEN
- **Affected Files:** 
  - [`src/modules/rentals/NewRental.tsx`](../src/modules/rentals/NewRental.tsx)
  - [`src/modules/rentals/rentals.css`](../src/modules/rentals/rentals.css)
- **Specification:** [`AGENTS.md Law 15`](../AGENTS.md) · [`PROGRESS.md`](../PROGRESS.md#L56)
- **Description:**
  - In the New Rental equipment catalogue, "View" and "Add Bundle" buttons measured 26px high during responsive checks.
  - Law 15 mandates a minimum touch target of 44×44px on all devices (with 56px for primary floor actions).
  - Enlarge button hit areas and container paddings using standard `--tap` classes.
- **Verification Criteria:** Chrome DevTools accessibility inspection confirms all clickable catalogue targets measure ≥44px.

### Task 3.3: Real Browser Workflow Transitions Acceptance
- **Priority:** P1 (Pre-Deployment Critical)
- **Status:** OPEN (Mock DB has no invoices/delivery history)
- **Affected Files:**
  - [`src/modules/finance/Finance.tsx`](../src/modules/finance/Finance.tsx)
  - [`src/modules/operations/DeliveryWorkspace.tsx`](../src/modules/operations/DeliveryWorkspace.tsx)
- **Specification:** [`PROGRESS.md`](../PROGRESS.md#L114)
- **Description:**
  - In a clean mock database, invoice records and delivery records are empty, meaning live row clicks on "Record Payment", "Dispatch Trip", and "Confirm Delivered" were verified at component level but not in an integrated multi-step browser session.
  - Seed realistic staging records and verify complete click-through flows without page reload crashes.
- **Verification Criteria:** End-to-end payment recording updates balance from Outstanding to Settled; delivery flow transitions from Scheduled → In Transit → Delivered.

### Task 3.4: Complete Secondary Module State-Drawing
- **Priority:** P2 (Medium)
- **Status:** PARTIAL (42/72 screens completed)
- **Affected Files:** Secondary reports and settings panes under [`src/modules/`](../src/modules/)
- **Specification:** [`PLAN.md Phase 6`](../PLAN.md#L413)
- **Description:**
  - Phase 6 requires every screen to draw all 5 states: Empty (nothing-yet vs no-results), Loading (skeleton), Error (with retry), Restricted (role-masked), and Offline.
  - Primary rental, inventory, and operations screens have complete states. Secondary report panes ([`src/modules/reports/Pulse.tsx`](../src/modules/reports/Pulse.tsx)) and settings tabs still need standardized `LoadingState` and `ErrorState` components.
- **Verification Criteria:** Every routed view displays custom skeletons during fetch and clear error messages on simulated 500 responses.

---

## 4. Cross-Device & Native Shell Verification

### Task 4.1: Physical Device & Multi-Viewport Acceptance
- **Priority:** P1 (Pre-Deployment Critical)
- **Status:** BLOCKED on Physical Hardware Access
- **Affected Subsystem:** Responsive CSS and Breakpoints
- **Specification:** [`docs/UI_UX_IMPROVEMENT_PLAN.md`](UI_UX_IMPROVEMENT_PLAN.md)
- **Description:**
  - All existing visual verifications were executed under headless Chromium or emulated Chrome DevTools viewports.
  - Complete verification requires testing on real physical hardware:
    1. Mobile: 360px (Android budget), 375px (iPhone SE), 390px (iPhone 13/14).
    2. Tablet: 768px (iPad Mini), 820px (iPad Air portrait), 1024px (iPad landscape).
    3. Desktop: 1280px (MacBook Air / Small Desktop), 1440px+ (Standard Desktop).
- **Verification Criteria:** Screenshots captured on actual mobile and iPad Safari browsers showing no horizontal document overflow and no touch-target overlap.

### Task 4.2: Native Browser Desktop Zoom Testing (100% vs 125%)
- **Priority:** P2 (Medium)
- **Status:** DONE in emulation [15–16 Oct]. Rentals, Inventory, Finance, Operations and Settings were measured at 1093, 911, 1536 and 1280px (1366 and 1920 laptops at 125% and 150%), and the defects were fixed. Evidence: `artifacts/zoom-audit-2026-10-15/`; rulings: `RULINGS-2026-10-15.md`. Physical-laptop confirmation belongs to Task 4.1.
- **Affected Files:** [`src/styles/theme.css`](../src/styles/theme.css), [`src/styles/responsive.css`](../src/styles/responsive.css)
- **Description:** Windows laptops often default to 125% or 150% display scaling. Test all primary tables (Rentals, Inventory, Finance) under native 125% browser zoom to verify that headers, sticky summaries, and action columns do not collide or trigger horizontal scrollbars.
- **Verification Criteria:** Complete usability maintained at 125% native browser zoom.

### Task 4.3: Physical Warehouse Airplane Mode PWA Validation
- **Priority:** P1 (Pre-Deployment Critical)
- **Status:** BLOCKED on Physical Device Testing
- **Specification:** [`PLAN.md Phase 9 Gate`](../PLAN.md#L574)
- **Description:** Test PWA installation and offline capabilities on an Android tablet in physical airplane mode:
  1. Open installed PWA in airplane mode.
  2. Verify offline banner mounts cleanly without blocking user interaction.
  3. Perform inventory barcode scan and checklist ticks.
  4. Turn off airplane mode and verify automatic queue flush to Supabase.
- **Verification Criteria:** Airplane mode workflow succeeds without UI crash or lost scans.

---

## 5. Open Product Decisions (Awaiting Owner Rulings)

*Per [`AGENTS.md`](../AGENTS.md), agents must not invent business decisions. Each item below requires an authoritative ruling from Babin.*

### Decision 5.1: Holding Physical ID as Security Deposit Collateral
- **Reference:** [`PLAN.md §4.65(c)`](../PLAN.md#L661) · [`docs/OPEN_DECISIONS.md §12`](OPEN_DECISIONS.md#L99)
- **Context:** In Kathmandu, rental houses commonly hold a client's physical citizenship card, passport, or driving license as deposit collateral instead of, or in addition to, cash. Because Law 5 strictly defines deposits as financial liabilities, a physical document cannot be recorded in `deposit_required` or the cash ledger.
- **Questions for Owner:**
  1. Should physical document deposits be tracked in the OS?
  2. If yes, should they live in a dedicated `collateral_documents` table (type, document number, photo, safe locker location)?
  3. Does a held document satisfy Handover Gate 4 on its own, or must cash still be collected?
  4. What is the terminal action ("Returned to client"), and does document return block booking Close?
  5. Who is permitted to view the document photo (PII security considerations)?

### Decision 5.2: Handover Gate 1 (Receiver Verified) Manager Override
- **Reference:** [`PLAN.md §4.65(b)`](../PLAN.md#L646) · [`docs/OPEN_DECISIONS.md §12`](OPEN_DECISIONS.md#L98)
- **Context:** Handover Gate 1 requires government ID verification for the equipment receiver. Today, gates 3 and 4 (payment and deposit) have manager overrides, but Gate 1 has no override mechanism (`OVERRIDE_UNAVAILABLE`).
- **Questions for Owner:**
  1. May an authorized staff member release equipment if the receiver's ID cannot be checked (e.g. well-known regular client)?
  2. If allowed, which roles have override authority (`Owner` only, or `Manager+`)?
  3. Is a mandatory minimum 10-character audit reason required?

### Decision 5.3: Reset Queue Next-Unit Operational Priority
- **Reference:** [`PLAN.md §4.65(a)`](../PLAN.md#L631) · [`docs/OPEN_DECISIONS.md §12`](OPEN_DECISIONS.md#L97)
- **Context:** Units in the Cleaning & Reset queue currently sit in FIFO order. If a specific returned camera or lens is booked on a new rental departing within 2 hours, warehouse staff have no indicator highlighting that unit.
- **Questions for Owner:**
  1. Should Reset display a "Needed Next" badge derived from upcoming booking pickup windows?
  2. Should urgent units automatically sort to the top of the Reset queue?
  3. What is the time threshold to classify a unit as urgent (e.g. pickup within 2 hours, 4 hours, or same day)?

### Decision 5.4: Duplicate / Re-Book Rental Workflow
- **Reference:** [`PLAN.md §4.64(a)`](../PLAN.md#L691) · [`docs/OPEN_DECISIONS.md §12`](OPEN_DECISIONS.md#L96)
- **Context:** Repeat production houses often re-book identical camera and lighting packages. Currently, staff must manually re-enter every item line.
- **Questions for Owner:**
  1. What is copied over: client and equipment lines only, or also crew, transport, discounts, and notes?
  2. Are specific serialized units copied, or only product model and quantity?
  3. Should rental rates use the original booking's rates or today's current rate card?
  4. Does duplicate create an unconfirmed Quote or a draft booking?

### Decision 5.5: VAT-Inclusive Rate Quotation
- **Reference:** [`PLAN.md §4.64(b)`](../PLAN.md#L705) · [`docs/OPEN_DECISIONS.md §12`](OPEN_DECISIONS.md#L96)
- **Context:** Nepal VAT is 13%. Currently, rates are strictly entered excluding VAT, and 13% is added on top (`taxable * 0.13`). Retail walk-in clients often negotiate round numbers inclusive of VAT (e.g. Rs 10,000 flat).
- **Questions for Owner:**
  1. Should staff have a toggle to quote rates inclusive of VAT?
  2. If back-calculated (`price / 1.13`), should rounding round to the nearest paisa or nearest rupee?

### Decision 5.6: Delivery Rescheduling Policy
- **Reference:** [`PLAN.md §4.64(c)`](../PLAN.md#L716) · [`docs/OPEN_DECISIONS.md §12`](OPEN_DECISIONS.md#L96)
- **Context:** If a client requests moving delivery by 3 hours, how is that handled?
- **Questions for Owner:**
  1. Does rescheduling a delivery shift the booking's official rental start time (`pickup_at`), or does it only update driver transport dispatch?
  2. Does rescheduling trigger an automatic WhatsApp notification to the client?

### Decision 5.7: Late / Night Handover Charges at Booking Time
- **Reference:** [`PLAN.md §4.64(d)`](../PLAN.md#L734) · [`docs/OPEN_DECISIONS.md §12`](OPEN_DECISIONS.md#L96)
- **Context:** Late return fees exist at Return. But there is no automated fee for late-night pickups (e.g. 11 PM or 4 AM dispatches).
- **Questions for Owner:**
  1. Should after-hours pickups apply an automatic surcharge, or should staff manually add an existing Service/Manual line?
  2. If automatic, what are the after-hours thresholds and fee structures?

### Decision 5.8: Depreciation Useful Lives per Category
- **Reference:** [`PLAN.md §4.64(e)`](../PLAN.md#L743) · [`docs/OPEN_DECISIONS.md §12`](OPEN_DECISIONS.md#L96)
- **Context:** Depreciation calculations require per-category asset useful life spans (cameras vs lenses vs lighting vs grip).
- **Questions for Owner:**
  1. Supply standard useful life in years/months for each equipment category (e.g., Cinema Bodies: 3 years; Cinema Lenses: 7 years; Lighting/Grip: 5 years).
  2. Confirm residual salvage value percentage (standard 10%).

### Decision 5.9: Booqable Legacy Seasonal Rulesets
- **Reference:** [`docs/OPEN_DECISIONS.md §11 (D-2)`](OPEN_DECISIONS.md#L87)
- **Context:** Historical data includes 4 legacy Booqable seasonal rulesets (`SUMMER25`, `New Year`, `Christmas ×2`).
- **Questions for Owner:**
  1. Should these legacy rulesets be imported into `pricing_rulesets` and allowed to expire on their end dates, or discarded entirely?

---

## 6. External & Store Release Prerequisites

### Dependency 6.1: Bikram Sambat 2084+ Official Calendar Table
- **Priority:** P2 (Long-term)
- **Status:** BLOCKED EXTERNALLY
- **Affected Files:** [`src/lib/bs.ts`](../src/lib/bs.ts)
- **Specification:** [`docs/OPEN_DECISIONS.md §5`](OPEN_DECISIONS.md#L41)
- **Description:** The BS calendar engine in [`src/lib/bs.ts`](../src/lib/bs.ts) currently anchors month lengths through BS 2083. Expanding beyond 2083 requires official month-length publications from the Nepal Calendar Determination Committee (*Nepal Panchanga Nirnayak Bikas Samiti*) to guarantee accurate dates on tax invoices.

### Dependency 6.2: Google Play Console Release (Android)
- **Priority:** P3 (Post-Launch)
- **Status:** BLOCKED on Account & Keystore
- **Affected Subsystem:** [`android/`](../android/) · Capacitor Android
- **Specification:** [`docs/CAPACITOR_ANDROID_FEASIBILITY.md`](CAPACITOR_ANDROID_FEASIBILITY.md)
- **Description:** Capacitor Android project is scaffolded and verified. Store submission requires:
  1. Production Android release keystore generation (`keytool`).
  2. Google Play Console developer account registration and app listing assets.
  3. Signed AAB generation via `./gradlew bundleRelease`.

### Dependency 6.3: Apple App Store Release (iOS)
- **Priority:** P3 (Post-Launch)
- **Status:** BLOCKED on Hardware & Account
- **Affected Subsystem:** iOS Build Pipeline
- **Specification:** [`docs/IOS_BUILD_GUIDE.md`](IOS_BUILD_GUIDE.md)
- **Description:** Building and distributing the native iOS app requires a macOS development host running Xcode 15+, CocoaPods, and an active Apple Developer Program membership.

---

## 7. Master Priority & Action Matrix

| Task / Item | Category | Priority | Blocker / Dependency | Assigned Actor |
|---|---|---|---|---|
| **Task 1.1** Remote Database Backup | Database | **P0** | Supabase remote access | Integration Agent |
| **Task 1.2** Staging Provisioning & Rehearsal | Database | **P0** | Staging project creation | Owner + Agent |
| **Task 1.3** Nine-Role Read-Only Staging Check | Security / Auth | **P0** | Staging JWTs provided | Agent + Owner |
| **Task 1.4** Apply Migrations to Production | Database | **P0** | Tasks 1.1–1.3 certified | Owner (Sign-off) |
| **Task 1.5** Production Smoke Verification | Deployment | **P0** | Task 1.4 applied | Owner + Agent |
| **Task 2.1** Delivery Workspace DB Persistence | Backend | **P1** | Schema design | Engineer |
| **Task 2.2** G3 Pricing Breakdown Persistence | Backend | **P1** | Migration 0161 authoring | Engineer |
| **Task 3.1** Phone Header De-Crowding | UI / UX | **P1** | None (Unblocked) | Frontend Engineer |
| **Task 3.2** New Rental 44px Touch Targets | UI / UX | **P1** | None (Unblocked) | Frontend Engineer |
| **Task 3.3** Browser Workflow Transitions Check | UI / UX | **P1** | Test data seeding | QA / Agent |
| **Task 4.1** Physical Mobile & iPad Acceptance | Testing | **P1** | Physical devices | QA / Owner |
| **Task 4.3** Airplane Mode PWA Validation | Testing | **P1** | Physical tablet | QA / Warehouse |
| **Task 2.3** Excluded Secondary Creation RPCs | Backend | **P2** | None | Engineer |
| **Task 2.4** Dexie Outbox UI Wire-up | Data Layer | **P2** | None | Engineer |
| **Task 3.4** Complete 5-State Screen Views | UI / UX | **P2** | None | Frontend Engineer |
| **Task 4.2** Native 125% Browser Zoom Audit | Testing | **P2** | None | QA / Agent |
| **Decisions 5.1–5.9** Open Product Rulings | Product Governance | **P1/P2** | Business decisions | Babin (Owner) |
| **Dependencies 6.1–6.3** External Stores & Calendar | External | **P3** | External committees / accounts | External |

---

## 8. Immediate Next Unblocked Actions

For developers or agents picking up work while awaiting Staging Provisioning and Owner Decisions:

1. **Execute Task 3.1 & 3.2 (UI/UX Finish):**
   - De-crowd the phone headers on [`src/modules/operations/OperationsQueues.tsx`](../src/modules/operations/OperationsQueues.tsx) and [`src/modules/settings/Settings.tsx`](../src/modules/settings/Settings.tsx).
   - Enlarge catalogue action buttons in [`src/modules/rentals/NewRental.tsx`](../src/modules/rentals/NewRental.tsx) from 26px to ≥44px.
2. **Execute Task 2.1 (Delivery Database Wiring):**
   - Author the database table and server actions to replace the mock `localStorage` in [`src/modules/operations/DeliveryWorkspace.tsx`](../src/modules/operations/DeliveryWorkspace.tsx).
3. **Execute Task 1.1 (Production Backup):**
   - Run [`scripts/backup-db.ps1`](../scripts/backup-db.ps1) to secure the current production snapshot before any staging or production cutover.
