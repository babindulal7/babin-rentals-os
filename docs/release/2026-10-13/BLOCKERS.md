# Babin Rentals OS — Evidence-Based Blocker Register

**Date:** 2026-10-14 (Nepal time, Asia/Kathmandu)<br>
**Auditor / Integration Agent:** Antigravity / TestingRealityChecker<br>
**Methodology:** Direct inspection of runtime gates, responsive layout constraints, and permissions matrix.<br>
**Release Recommendation:** **HOLD** (Cannot promote to production until live staging checks and remaining P1 header flows are completed and authorized by the Owner).

---

## 1. Blocker Severity Classification

- **P0 (Release-Blocking / Hard Stop):** Security breach, data loss risk, unverified production schema, or violation of non-negotiable architectural laws (e.g. N-5).
- **P1 (Pre-Deployment Critical):** Usability failure, clipped navigation/headers, broken responsive flow on standard mobile viewports (360px–390px), or missing functional handlers.
- **P2 (Quality & Polish):** Secondary workflow refinements, unwired menu entries pending backend RPCs, or minor non-blocking UI discrepancies.

---

## 2. Active Blocker Register

### BLOCKER-01: Calendar Phone Header Overflow (P1)
- **Component:** `src/modules/calendar/Calendar.tsx`
- **Description:** On phone viewports (<768px, tested at 360px–390px), Calendar previously passed `leading={<FilterButton />} `, `primary={<Button>Check availability</Button>}`, and `extra={navButtons}` (Today button, prev/next month chevrons, BS/AD month pill) directly into the 64px fixed-height application header, requiring >700px width and crushing the title.
- **Resolution Implemented:**
  1. FilterButton removed from header leading position on phone (`!phone ? ... : undefined`) and accessible in More menu (`Filters` / `Filters (n)`).
  2. Primary CTA compacted on phone to "Availability" with ≥44px touch target.
  3. `navButtons` relocated out of 64px header into `.calendar-phone-nav` content bar directly above the month grid, preserving full BS/AD month labels and 44px tap targets.
  4. Contextual phone search preserved via `MobileHeaderSearch`.
  5. Interactive callbacks verified: Availability modal opens, More menu filters drawer opens, and navigation buttons meet ≥44px floor.
- **Verification Evidence:** `src/modules/calendar/__tests__/CalendarHeader.test.tsx` (4/4 tests PASS in 1,096ms).
- **Status:** **RESOLVED & LOCALLY VERIFIED**

---

### BLOCKER-02: Finance, Operations, and Settings Phone Header Crowding (P1)
- **Component:** `src/modules/finance/Finance.tsx`, `src/modules/operations/OperationsQueues.tsx`, `src/modules/settings/Settings.tsx`
- **Description:** Similar to Calendar, these modules pass multiple contextual buttons into the header which crowd or truncate on 375px phone screens.
- **Impact:** Header controls compete for width; titles truncate aggressively or push action buttons out of viewport.
- **Required Resolution:** Consolidate secondary buttons into More menus, ensure page-level single primary action ownership, and align with the 64px single-header specification.
- **Status:** **RESOLVED & LOCALLY VERIFIED (15 Oct 2026)**. Finance was done 13 Oct. Operations and Settings were done 15 Oct for phone **and tablet**: at 768px both titles also measured 0px wide. Below 1280px the secondary actions live in More; measured clean at 360/375/390/768/1024/1280 in the mock build (measurements in PROGRESS 2026-10-15; screenshots kept on the old line, commit `4224763`, `artifacts/header-decrowding-2026-10-15/`). Physical devices are still pending (Task 4.1).

---

### BLOCKER-03: Live Supabase JWT & PostgREST Staging Verification Unperformed (P0)
- **Component:** Supabase Cloud Infrastructure / RLS / RPCs
- **Description:** While local PGlite passes 160 migrations, 30 lifecycle steps, and anon exposure checks, verification against a live network-accessible Supabase project using real authenticated JWTs (Owner, Coordinator, Warehouse, Client) has not yet been executed for this release commit.
- **Impact:** Network-level RLS, PostgREST view serializations, real token expiry, and storage bucket policies cannot be certified on PGlite alone.
- **Hard Stop:** Under N-5, no automated or unreviewed database push may be performed. The Owner must review the release artifact, rehearse `BACKUP_PROTOCOL.md`, and authorize migration execution.
- **Status:** **HOLD (Pending Staging Provisioning & Owner Sign-off)**. 15 Oct: the live registry records everything through 0156, so the pending set is 0157–0162 (`docs/live/schema_migrations_2026-10-15.txt`, `npm run db:plan`). The read-only harness is not in this clean repository; it is on the old-line branches `fix/ci-mock-tests-and-baseline-2026-10-14` and `claude/remaining-task-49862e` (`artifacts/staging-verification-2026-10-14/`).

---

### BLOCKER-04: Secondary Creation Actions Excluded Pending Real RPCs (P2)
- **Component:** `src/components/ui/creation/CreationActionRegistry.ts`
- **Description:** In accordance with `RULINGS-2026-10-13.md`, creation flows that previously generated fake toasts (generic booking, equipment drawer, expense drawer) were stripped from the global Add menu. Secondary entities (`maintenance.new`, `task.new`, `agreement.new`) remain disabled until backed by verified database actions.
- **Impact:** Users cannot initiate these secondary entities from the global header.
- **Resolution:** Retain honest exclusion. Do not re-enable until dedicated, atomic RPCs and tables are implemented.
- **Status:** **ACCEPTED / CONTROLLED DEFERRED**
