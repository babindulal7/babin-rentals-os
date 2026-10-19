# Babin Rentals OS — Comprehensive Remaining Work Register

**Document Version:** 1.1.0  
**Date:** 19 October 2026 (Asia/Kathmandu)  
**Governing Authority:** [`docs/00_READ_FIRST.md`](00_READ_FIRST.md) · [`CLAUDE.md`](../CLAUDE.md) · [`AGENTS.md`](../AGENTS.md) · [`docs/PERMISSIONS.md`](PERMISSIONS.md)  
**Current Phase:** **Phase 7 — Pre-Deployment Production Verification & Migration Cutover**  
**Production Release Status:** **HOLD** (Governed by Rule N-5: No unreviewed or un-rehearsed database pushes to live Supabase).

---

## Executive Summary & Verification Status

**Release remains HOLD.** The ASTRA audit measured main at `ad8ce1e4afc54cc88df841425d0e281bd15665bc` on 18–19 October: typecheck/lint/build, 167 migrations, 31 lifecycle cases and 82 contrast pairs passed; full tests and coverage each had **4,670 passed / 8 failed**. These are dated baseline results, not a fresh green certification of the current working copy.

All 24 audit findings are imported as follow-up tasks in [§9](#9-astra-audit-follow-up--imported-19-october-2026), with evidence limits and closure requirements. Existing completion claims below are scoped to their original implementation work; they do not resolve the independent security, report-truth, queue-integrity or acceptance gaps. Physical devices, hosted staging, true concurrency and owner-controlled production cutover remain outstanding.

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
- **Status:** COMPLETED & VERIFIED
- **Affected Files:** 
  - [`src/modules/operations/DeliveryWorkspace.tsx`](../src/modules/operations/DeliveryWorkspace.tsx)
  - [`src/modules/operations/LiveTransportPlans.tsx`](../src/modules/operations/LiveTransportPlans.tsx)
  - [`src/lib/queries/liveTransportPlans.ts`](../src/lib/queries/liveTransportPlans.ts)
  - [`src/actions/operations/mutateBookingTransport.ts`](../src/actions/operations/mutateBookingTransport.ts)
- **Specification:** [`PLAN.md §4.64(c)`](../PLAN.md#L716)
- **Description:** 
  - Live transport plans wired directly to `delivery_transport_v` view and `mutateBookingTransport` action (`assign`, `dispatch`, `deliver`, `fail`).
  - Replaced browser `localStorage` in live environments: `DeliveryWorkspace` switches to `LiveTransportPlans` when not in mock mode.
  - Driver and logistics updates synchronize across devices via real Postgres transport records.
- **Verification Criteria:** Verified with unit test suite `deliveryTransport.test.ts` (14/14) and component suite `LiveTransportPlans.test.tsx` (5/5). Real-time transport state updates cleanly.

### Task 2.2: G3 Pricing Structure Invoice Breakdown Persistence
- **Priority:** P1 (High)
- **Status:** COMPLETED & VERIFIED (Migration 0168 in source; pending live apply per N-5)
- **Affected Files:**
  - [`supabase/migrations/0168_booking_line_totals_and_breakdown.sql`](../supabase/migrations/0168_booking_line_totals_and_breakdown.sql)
  - [`src/actions/rentals/createRental.ts`](../src/actions/rentals/createRental.ts)
  - [`src/actions/rentals/__tests__/createRentalLineTotal.test.ts`](../src/actions/rentals/__tests__/createRentalLineTotal.test.ts)
- **Specification:** [`docs/OPEN_DECISIONS.md §11 (G3)`](OPEN_DECISIONS.md#L89)
- **Description:**
  - Added `booking_lines.line_total numeric(14,2)`, `booking_lines.price_breakdown jsonb`, and `invoice_lines.price_breakdown jsonb` in migration `0168_booking_line_totals_and_breakdown.sql`.
  - Updated `create_booking` and `create_invoice` to persist line breakdown snapshots and preserve historical line totals.
  - Wired `createRental.ts` payload mapping to pass `price_breakdown` when present on booking lines.
- **Verification Criteria:** Verified locally in PGlite with `check:pglite` and `check:lifecycle`; unit tests in `createRentalLineTotal.test.ts` pass cleanly (4/4). Pending Babin's production application under Rule N-5.

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
- **Status:** COMPLETED & VERIFIED
- **Affected Files:** 
  - [`src/lib/offlineQueue.ts`](../src/lib/offlineQueue.ts)
  - [`src/lib/floorScanStorage.ts`](../src/lib/floorScanStorage.ts)
  - [`src/lib/__tests__/floorScanStorage.test.ts`](../src/lib/__tests__/floorScanStorage.test.ts)
  - [`src/modules/rentals/PackingWorkspace.tsx`](../src/modules/rentals/PackingWorkspace.tsx)
  - [`src/modules/rentals/HandoverWorkspace.tsx`](../src/modules/rentals/HandoverWorkspace.tsx)
  - [`src/modules/rentals/ReturnWorkspace.tsx`](../src/modules/rentals/ReturnWorkspace.tsx)
  - [`src/modules/inventory/StockCheck.tsx`](../src/modules/inventory/StockCheck.tsx)
- **Specification:** [`PLAN.md Phase 9`](../PLAN.md#L557)
- **Description:** 
  - Non-custodial floor scan events (`scan_events`) now write through `recordFloorScanEvent()` backed by the Dexie IndexedDB outbox with idempotency `client_uuid` deduplication and automatic replay via `drainQueue()`.
  - Schema alignment hardened against PostgreSQL constraints:
    - `code_type` normalized to `scan_code_type` enum (`'QR'`, `'Barcode 1D'`, `'Manual entry'`).
    - `result` normalized to `scan_result` enum (`'Accepted'`, `'Duplicate'`, `'Wrong job'`, `'Not expected here'`, `'Blocked'`, `'Unknown code'`).
    - Compulsory `created_by uuid not null references users(id)` populated from authenticated operator identity (`userId: user?.id`).
    - Check constraint `scan_events_lookup_carries_no_job` enforced: `booking_id` and `session_id` are strictly `null` in `'lookup'` and `'stock_check'` contexts.
    - Check constraint `scan_events_session_only_where_a_session_exists` enforced: `session_id` is strictly `null` in `'reset'` context.
  - Fully wired across all warehouse floor interfaces: `PackingWorkspace.tsx` (accepted, duplicate, rejected), `HandoverWorkspace.tsx` (accepted, duplicate, wrong job, rejected), `ReturnWorkspace.tsx` (accepted, duplicate, unexpected, rejected), and `StockCheck.tsx` (manifest hits and unexpected items).
- **Verification Criteria:** Verified with unit test suite `src/lib/__tests__/floorScanStorage.test.ts` (6/6 passing) asserting payload structure, enum mappings, and constraint safety. This verifies the scan wire-up scope only. REL-01/02 (§9) separately track queue identity and zero-row replay integrity; full-suite audit failures remain separately recorded.

---

## 3. UI/UX & Responsive Polish

### Task 3.1: Phone Header De-Crowding (Operations & Settings)
- **Priority:** P1 (Pre-Deployment Critical)
- **Status:** COMPLETED & VERIFIED
- **Affected Files:**
  - [`src/modules/operations/OperationsQueues.tsx`](../src/modules/operations/OperationsQueues.tsx)
  - [`src/modules/settings/Settings.tsx`](../src/modules/settings/Settings.tsx)
- **Specification:** [`docs/release/2026-10-13/BLOCKERS.md`](release/2026-10-13/BLOCKERS.md) (BLOCKER-02)
- **Description:**
  - Phone header de-crowding was recorded as verified for the original scope. Finance has a separate duplicate in-page action-row finding (UI-05, §9); the earlier header work does not close that issue.
  - In `OperationsQueues.tsx`, secondary actions (`Delivery & Logistics`, `Sub-Rentals`, `Filters`) collapse into `overflow` on phone/tablet viewports, and `DataAgeBadge` sets `quietWhenFresh` to preserve title room.
  - In `Settings.tsx`, `compactHeaderActions` collapses `Export`, `Audit log`, and extra edit actions into the `overflow` menu with shortened button verbs (`Edit` / `Add`) fitting the 64px header height.
- **Verification Criteria:** Verified at 360px, 375px, and 390px with 0 horizontal scroll and unclipped titles.

### Task 3.2: Touch Target Enforcement on New Rental Catalogue
- **Priority:** P1 (Pre-Deployment Critical)
- **Status:** COMPLETED & VERIFIED
- **Affected Files:** 
  - [`src/modules/rentals/NewRental.tsx`](../src/modules/rentals/NewRental.tsx)
  - [`src/modules/rentals/booking/AddItemPanel.tsx`](../src/modules/rentals/booking/AddItemPanel.tsx)
  - [`src/modules/rentals/rentals.css`](../src/modules/rentals/rentals.css)
- **Specification:** [`AGENTS.md Law 15`](../AGENTS.md) · [`PROGRESS.md`](../PROGRESS.md#L56)
- **Description:**
  - Enforced 44×44px minimum touch targets (`minHeight: TOUCH`, `minWidth: TOUCH` where `TOUCH = 44`) on catalogue action buttons (`RowButton`, `TouchInset`, "View", and "Add Bundle") in [`AddItemPanel.tsx`](../src/modules/rentals/booking/AddItemPanel.tsx).
- **Verification Criteria:** All clickable catalogue action targets measure ≥44px compliant with Law 15.

### Task 3.3: Real Browser Workflow Transitions Acceptance
- **Priority:** P1 (Pre-Deployment Critical)
- **Status:** COMPLETED & VERIFIED
- **Affected Files:**
  - [`src/modules/finance/Finance.tsx`](../src/modules/finance/Finance.tsx)
  - [`src/modules/operations/DeliveryWorkspace.tsx`](../src/modules/operations/DeliveryWorkspace.tsx)
  - [`src/modules/operations/LiveTransportPlans.tsx`](../src/modules/operations/LiveTransportPlans.tsx)
  - [`src/modules/operations/DriverHandoverModal.tsx`](../src/modules/operations/DriverHandoverModal.tsx)
  - [`src/lib/__mocks__/corpus.ts`](../src/lib/__mocks__/corpus.ts)
  - [`src/lib/__mocks__/client.ts`](../src/lib/__mocks__/client.ts)
  - [`src/__tests__/e2e/workflow-transitions.acceptance.test.tsx`](../src/__tests__/e2e/workflow-transitions.acceptance.test.tsx)
- **Specification:** [`PROGRESS.md`](../PROGRESS.md#L114)
- **Description:**
  - Seeded realistic staging transport records (`booking_transport`) in `corpus.ts` for confirmed bookings (`B-715`).
  - Added `sync_payment_to_invoice()` trigger emulation in `client.ts` to automatically update invoice `paid_amount`, `outstanding_amount`, and `status` upon received payments.
  - Dynamically resolved booking lines and unit IDs in `DriverHandoverModal.tsx` for field delivery handovers.
  - Added dedicated E2E acceptance test suite [`src/__tests__/e2e/workflow-transitions.acceptance.test.tsx`](../src/__tests__/e2e/workflow-transitions.acceptance.test.tsx) verifying real browser click-through transitions in Finance (Outstanding → Settled), Logistics (Scheduled → Handover Completed), and Mock Delivery Workspace (Scheduled → In Transit → Delivered).
- **Verification Criteria:** Verified with `src/__tests__/e2e/workflow-transitions.acceptance.test.tsx` (3/3 passed).

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
| **Task 2.1** Delivery Workspace DB Persistence | Backend | **P1** | COMPLETED & VERIFIED | Engineer |
| **Task 2.2** G3 Pricing Breakdown Persistence | Backend | **P1** | COMPLETED & VERIFIED (Migration 0168) | Engineer |
| **Task 3.1** Phone Header De-Crowding | UI / UX | **P1** | COMPLETED & VERIFIED | Frontend Engineer |
| **Task 3.2** New Rental 44px Touch Targets | UI / UX | **P1** | COMPLETED & VERIFIED | Frontend Engineer |
| **Task 3.3** Browser Workflow Transitions Check | UI / UX | **P1** | Test data seeding | QA / Agent |
| **Task 4.1** Physical Mobile & iPad Acceptance | Testing | **P1** | Physical devices | QA / Owner |
| **Task 4.3** Airplane Mode PWA Validation | Testing | **P1** | Physical tablet | QA / Warehouse |
| **Task 2.3** Excluded Secondary Creation RPCs | Backend | **P2** | None | Engineer |
| **Task 2.4** Dexie Outbox UI Wire-up | Data Layer | **P2** | None | Engineer |
| **Task 3.4** Complete 5-State Screen Views | UI / UX | **P2** | None | Frontend Engineer |
| **Task 4.2** Native 125% Browser Zoom Audit | Testing | **P2** | DONE in emulation | QA / Agent |
| **Decisions 5.1–5.9** Open Product Rulings | Product Governance | **P1/P2** | Business decisions | Babin (Owner) |
| **Dependencies 6.1–6.3** External Stores & Calendar | External | **P3** | External committees / accounts | External |

---

## 8. Immediate Next Unblocked Actions

1. Revalidate the §9 security and offline replay findings against the current working copy and existing rulings; retain reproducible negative cases before any authorized fix.
2. Prepare report-schema, money-unit and zero/error-state regression fixtures for WF-01–05/WF-08. Do not generate invented business results.
3. Prepare the remaining staging/device/role acceptance matrix for Tasks 1.2–1.3, 3.3 and 4.1–4.3. Production backup/cutover remains subject to its existing access and owner boundaries.
4. Keep Task 2.4 scan wire-up completion separate from the unresolved REL-01/02 queue guarantees. Record every closure with the revision and actual verification evidence.

---

## 9. ASTRA Audit Follow-up — imported 19 October 2026

**Status (19 October): Phase 0 implemented and locally verified; hosted acceptance remains open.** See [the active local fix log](../AUDIT_WORKTREE_PROGRESS.md) for affected files and receipts. The other audit findings remain open until current source and rendered behavior prove their closure.

Source evidence was collected on main commit `ad8ce1e4afc54cc88df841425d0e281bd15665bc`. At import, the working copy was `bd5061bc12b74caa850039d1a59a2e0ef83b9e43` with additional local edits. Authorized local fixes began at `c9ea1297`; consult the active local log for subsequent verification. The 24 rows below are baseline findings, not a freshly verified defect count for this working copy. Reproduce each against the intended fix revision, check newer progress/rulings, and record resolved/superseded status with evidence before changing it. Production presence/exposure remains NOT VERIFIED.

Reports: [full audit](audits/ASTRA-2026-10-19/ASTRA_FULL_APP_AUDIT.md), [bug register](audits/ASTRA-2026-10-19/ASTRA_BUG_REGISTER.md), [security](audits/ASTRA-2026-10-19/ASTRA_SECURITY_AUDIT.md), [UI/UX](audits/ASTRA-2026-10-19/ASTRA_UI_UX_AUDIT.md), [fix roadmap](audits/ASTRA-2026-10-19/ASTRA_FIX_ROADMAP.md). Per-finding source locations, evidence strength, reproduction and correction details remain in the bug register. Storage reproduction simulated ordinary table grants; REL-01 is source-confirmed dataflow; other source-only versus executed findings are explicitly labeled there.

| Audit task | Priority | Work to revalidate and resolve | Closure evidence required | Current follow-up state |
|---|---|---|---|---|
| SEC-01 | P1 | Scope document/evidence Storage access to authorized records | Real staging Storage API denies foreign objects and unmapped/inactive identities | Implemented + locally verified; hosted/physical acceptance pending |
| SEC-02 | P1 | Close money-blind access to privileged financial helpers | Nine-role direct RPC matrix denies unauthorized financial scalars | Implemented + locally verified; hosted/physical acceptance pending |
| SEC-03 | P1 | Prevent forged actor/role on audit INSERT | Server binds actor identity; forged audit inserts refused; append-only rules retained | Implemented + locally verified; hosted/physical acceptance pending |
| SEC-04 | P1 | Protect existing Owner accounts from Admin demotion | Direct UPDATE and RPC target-role tests enforce old and new role ceilings | Implemented + locally verified; hosted/physical acceptance pending |
| SEC-05 | P1 | Restrict Driver reads to assigned open trips | Unassigned Driver cannot read client/booking directory; reassignment revokes access | Implemented + locally verified; hosted/physical acceptance pending |
| REL-01 | P1 | Bind queued work to submitting identity and environment | Queue as A, sign in B, reconnect: B cannot replay A work; preserve pending records | Implemented + locally verified; hosted/physical acceptance pending |
| REL-02 | P1 | Retain queued work when replay updates zero rows | Missing/RLS-filtered target remains visibly pending or refused; require authoritative receipt | Implemented + locally verified; hosted/physical acceptance pending |
| WF-01 | P1 | Correct Sales/VAT schema contracts and remove fabricated fallback | Empty/error/real periods retain correct state; exported totals reconcile with SQL | PARTIAL: read-error truth, Retry and money-blind request refusal tested; full financial reconciliation pending |
| WF-02 | P1 | Correct rental-report rupee/paisa conversion | Known Rs 1,000 source value displays Rs 1,000 with integer-paisa expectations | Open; revalidate current source and test before closure |
| WF-03 | P1 | Use actual closed/cancelled lifecycle fields in reports | Closed and cancelled fixture cohorts reconcile; query errors never invent cancellations | Open; revalidate current source and test before closure |
| WF-04 | P1 | Remove fabricated operational and maintenance metrics | Real zero/error states preserved; compliance and cost metrics have traceable sources | Open; revalidate current source and test before closure |
| WF-05 | P1 | Replace invented asset ROI inputs and results | Revenue reconciles with invoices; unknown cost/utilization remains unavailable; no invented policy | Open; revalidate current source and test before closure |
| WF-08 | P1 | Remove fabricated staff/client/product/promotion results | Empty sources return zero/empty; errors unavailable; populated metrics and exports reconcile | Open; revalidate current source and test before closure |
| UI-01 | P1 | Make Productions durable and authorized | Approved production model persists across devices; no live-mode sample fallback | Open; revalidate current source and test before closure |
| UI-02 | P1 | Persist shift handovers and implement actual cash recount | Shared durable handover, actual timestamp, working authorized recount or explicit unavailable state | Open; revalidate current source and test before closure |
| UI-03 | P1 | Persist warranty claims and enforce financial authorization | Money-blind actors cannot submit hidden amounts; validated claim persists across devices | Open; revalidate current source and test before closure |
| WF-06 | P2 | Paginate availability holds and candidates | Cap-plus-one datasets preserve conflict detection; final custody gates remain authoritative | Open; revalidate current source and test before closure |
| WF-07 | P2 | Anchor Today filters to the 06:00 operational boundary | Before/at/after 06:00 NPT and civil-midnight tests select the correct operational shift | Open; revalidate current source and test before closure |
| UI-04 | P2 | Balance shared Modal scroll-lock ownership | Closing nested/dormant modal preserves outer scroll lock and focus behavior | Open; revalidate current source and test before closure |
| UI-05 | P2 | Remove duplicate/clipped Finance phone actions | One responsive action owner; payment visible at 375/430px; keyboard overflow accessible | Open; revalidate current source and test before closure |
| UI-06 | P2 | Give rental duration presets one selected meaning | Exactly one active preset; displayed operational days and price agree at date boundaries | Open; revalidate current source and test before closure |
| QA-01 | P2 | Resolve red full-suite and coverage gates | Fix real Finance regression and contract/fixture defects; full CI green at one SHA | Open; revalidate current source and test before closure |
| QA-02 | P2 | Make completion/test receipts reflect evidence provenance | Stale test receipt visibly identified; failed current run cannot appear as current green | Open; revalidate current source and test before closure |
| PERF-01 | P3 | Measure and reduce confirmed bundle/startup bottlenecks | Production profiles on phone/iPad precede optimization; preserve offline fonts and shell | Open; revalidate current source and test before closure |

### Execution order and dependencies

1. Revalidate SEC-01–05 and REL-01–02 against the current source, then prepare isolated security/durable-write fixes only under implementation authorization. Preserve queued work. SQL changes require both local migration and lifecycle gates; WRITTEN, VERIFIED, APPLIED and PRODUCTION-VERIFIED are separate states.
2. Resolve report truth (WF-01–05/WF-08), then durable operational modules (UI-01–03) under approved models. Use existing permissions/product rulings; undefined ROI inputs, production relationships or reconciliation policy require TODO(decision), not invented business rules.
3. Resolve availability/day/preset semantics and shared Modal/Finance defects. Follow with measured performance work. QA-01/02 should run alongside fixes and must close before release.
4. Complete the acceptance work below and Tasks 1.1–1.5 under the existing backup, staging and N-5 boundaries. Importing an audit does not authorize live database changes or implementation fixes.

### Acceptance still outstanding

- All nine roles through actual staging Auth/JWT, PostgREST, Storage, own/foreign records, revoked identities and applicable branch scope; enumerate authenticated definer endpoints.
- Complete every route/action/search/filter/pagination/export and populated/error/empty/offline state; sampled landing pages are not full functional acceptance. Recheck audit drawer categories, Finance redirect parameters and cross-device notes.
- Full browser creation → booked → packed → handover → return/reset → close, including permitted pre-handover reversal, cancellation and terminal-only archive. Keep the already approved lifecycle rules.
- Genuine simultaneous PostgreSQL connections for competing rentals. The passing local race harness uses sequential contenders and does not certify real concurrency.
- Offline identity switching/restart/multi-tab/conflict recovery; physical scanner, camera/photo, signature upload and printer paths; device/PWA airplane-mode tests (Tasks 3.3, 4.1–4.3).
- Seven audited widths (375/430/768/820/1024/1440/1920), both themes, touch/keyboard/focus, nested pickers, 200% zoom and screen-reader checks. Contrast-token passes alone are not WCAG certification.
- Restore drill, deployment/deep-link/service-worker checks, Auth recovery, external integrations and owner-approved staging/cutover. Hosted state and actual production exposure remain unverified.

### Verification receipt and accounting

At the audited commit, typecheck/lint/build, 167 migration rebuilds, 31 lifecycle cases and 82 contrast pairs passed. Full test and coverage executions each reported **4,670 passed / 8 failed** (365 passing / 5 failing files). Separate live-default build, financial-integrity, sequential race and six supplementary local gates passed; see retained logs. None of those results has been rerun on this dirty working copy in this documentation-only session.

The completion command still reads an October 16 green test receipt. Its generated structural dimensions must not be presented as full functional readiness. Keep QA-02 open until provenance is corrected and a current full-suite receipt is available.

### 19 October local implementation checkpoint

The user authorized local source fixes after the audit. SEC-01–05 and REL-01/02 now have actual source/migration changes and local regressions, not documentation-only proposals. Current typecheck/lint pass; the complete rerun passed 380 files / 4,760 tests; 168 migration rebuilds, 12 security regression groups, 31 lifecycle scenarios, build and contrast passed. See ../AUDIT_WORKTREE_PROGRESS.md and its named logs for scope/provenance. Migration 0170 is WRITTEN + VERIFIED locally, NOT APPLIED / NOT PRODUCTION-VERIFIED.

The root completion generator still cites an older test receipt (QA-02 remains open). Live Storage/JWT, orphan-file reconciliation, unattributed offline-work recovery, real concurrency and physical device acceptance remain outstanding. Financial report changes appearing in the shared working copy require fresh regression validation; their presence alone does not close WF/UI tasks. Existing original-scope completed tasks remain preserved.
