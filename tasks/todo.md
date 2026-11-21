# TODO — Booqable ADOPTIONS 1–9

_Re-verified 21 Nov 2026 against the code and each task's listed tests. Found and fixed: Task 1 (counted Dashboard links were deferred), Task 7 (Finance definitions and zero explanations had been lost), Task 8 (description named a file that was never created). Test counts below are the current ones. Gate results are in the verification log at the end._

## Task 1: Item 7 — `latePickups(nowAd)` + counted View late links
**Status:** DONE. The counted Dashboard footer links were deferred in October, waiting on an activity param for /rentals. They now open the Operations exception facets (`?exception=overdue_start`, `?exception=overdue_end`), which already run the same named sets, so no /rentals param was needed.
**Description:** Add the one missing Attention-required predicate (late pickup) alongside todaysOutgoing/todaysIncoming/overdue, surface as Operations chip + two counted Dashboard footer links. No new component.
**Acceptance criteria:**
- [x] `latePickups(nowAd)` in `src/lib/queries/bookings.ts` returns pickup_at < now, stage Booked/Packed, cancelled false
- [x] Unit test pins boundary + stage set + minute-floored instant
- [x] Operations exception facets `overdue_start`/`overdue_end` delegate to `latePickups()`/`overdue()` (minute-stable, one definition)
- [x] Dashboard counted footer links: Pickups footer "N late pickups" → `/operations?exception=overdue_start`; Returns footer "N overdue returns" → `/operations?exception=overdue_end`. Both counts are head-only totals of the same named sets. An unknown count reads "View …", never "0".
**Verification:**
- [x] Tests pass: `npx vitest run src/lib/queries/__tests__/bookings.test.ts` (48/48)
- [x] `npx vitest run src/modules/operations/__tests__/operationsQueues.test.ts` (39/39)
- [x] `src/modules/today/__tests__/movementPanel.test.tsx` — 4 footer-link cases (known count, singular, unknown, zero with "View all" kept)
- [x] Browser (mock, 21 Nov): the Pickups footer reads "48 late pickups" and the Returns footer "24 overdue returns". Each opens an Operations list headed "Today & Overdue (48)" and "Today & Overdue (24)".
- [x] Typecheck clean
**Dependencies:** None
**Files touched:**
- `src/lib/queries/bookings.ts` (+`latePickups`)
- `src/lib/queries/__tests__/bookings.test.ts` (+3 tests)
- `src/modules/operations/OperationsQueues.tsx` (delegation)
- `src/modules/today/Today.tsx` (two head-only attention counts, passed to the two panels)
- `src/modules/today/DashboardMovementPanel.tsx` (counted footer link)
- `src/modules/today/dashboard.css` (footer wraps and spaces the two links)
- `src/modules/today/__tests__/movementPanel.test.tsx` (+4 footer-link tests)
- `src/modules/today/__tests__/dashboardLayout.test.tsx` (refresh now refetches the four lists: two queues, two counts)
**Estimated scope:** M (3-5 files)

## Task 2: Item 3 — single next-verb invariant lock
**Status:** DONE (no new `workflow.nextVerb` — `getRentalPrimaryAction` is the single owner; ADOPTIONS-era duplicate lookups verified gone)
**Description:** Prove BookingDetail header + Operations row verb both read `getRentalPrimaryAction` (the single owner). No parallel `workflow.nextVerb`.
**Acceptance criteria:**
- [x] Test asserts one primary verb per stage incl. Cancelled/Closed/service-only/partial/reset-complete + Unknown falls through to non-operable View (never an invented transition)
- [x] BookingDetail header + LifecycleProgress banner read `getRentalPrimaryAction`; MovementList rows use movement-scoped `primaryFor`; RentalsList rows carry no verb (RAIL F3); `jobForStage` (backward) vs `jobThatSets` (forward) confirmed distinct predicates
- [x] No duplicate JOB_ORDER.find lookups added
**Verification:**
- [x] Tests pass: `npx vitest run src/lib/__tests__/rentalActions.test.ts` (14/14 on 21 Nov; the file has grown since October's 11)
**Dependencies:** None
**Files touched:**
- `src/lib/__tests__/rentalActions.test.ts` (+Unknown fall-through test)
**Estimated scope:** S (1-2 files)

## Task 3: Item 6 - IntelCard money-blind payload audit
**Status:** DONE (audit extended; builders already omit — no behavior change)
**Description:** TDD audit: money-blind roles get glance payload with money lines omitted (not CSS-hidden). Fix builders only if audit fails.
**Acceptance criteria:**
- [x] Test builds glance for Owner vs all four blind roles + floor-surface Owner
- [x] Blind payloads contain no Rs figure lines and no Money group
- [x] Existing keyboard-path coverage unchanged
**Verification:**
- [x] Tests pass: `src/modules/rentals/__tests__/rentalsList.test.ts` (91/91 incl. new audit)
**Dependencies:** None
**Files touched:**
- `src/modules/rentals/__tests__/rentalsList.test.ts` (+all-roles + floor-surface audit)
**Estimated scope:** S

## Checkpoint: Phase 1
- [x] All focused tests pass (bookings 48, operations 39, rentalActions 14, rentalsList 91 — counts as of 21 Nov)
- [x] Typecheck clean
- [x] No product copy invented

## Task 4: Item 4 — Cancelled count on /rentals Status group
**Status:** DONE (B5 answered by building it visibly — Babin flips by reply)
**Description:** Show excluded Cancelled count beside chip (Booqable §9.2 mitigation: filter + census). Visible scope, reversible.
**Acceptance criteria:**
- [x] Cancelled view shows live count (RENTAL_VIEWS + presence-flipped HEAD count)
- [x] Count respects other narrowings (stage stripped, search/date/project-type/sub kept); never added to All
- [x] Money-blind unaffected (HEAD counts select no money)
**Verification:**
- [x] Tests pass: `src/lib/queries/__tests__/rentalViews.test.ts` (5/5 incl. new census test)
**Dependencies:** Phase 1 checkpoint
**Files touched:**
- `src/lib/queries/rentalViews.ts` (+Cancelled view + census branch)
- `src/lib/queries/__tests__/rentalViews.test.ts` (+census test)
- `src/modules/rentals/RentalsList.tsx` (Cancelled view click = quick chip, not stage group)
**Estimated scope:** S

## Task 5: Item 8 — counts on remaining /rentals date groups
**Status:** DONE (Status group wired true-faceted; date presets intentionally count-less — see note)
**Description:** Extend counts to date-shaped filter groups (bookings-column groups only). Non-column groups get scoping note, not implementation.
**Acceptance criteria:**
- [x] Status checkboxes show live counts via `useFacetCounts` (drawer `stageCounts`), true-faceted, drawer-open only
- [x] Date presets documented: `DateRangePresets` are single range pickers, not option groups — per-option counts are meaningless there; the range's result count already shows in the drawer footer (`resultCount`)
- [x] Non-column groups: none on this screen (project_type is a real column; sub-rental is id-set based and correctly count-less)
**Verification:**
- [x] Focused suites green on 21 Nov: rentalsList 91 + rentalsList.render 42 + facetCounts 5 (138 across 3 files; was 137 in October)
- Known noise, not a failure (present before 21 Nov): `rentalsList.render.test.tsx` logs `[AuditEngine] Failed to write audit event` because its `lib/supabase` mock omits `IS_MOCK`. Follow-up: add the export to the mock factory and confirm the 42 cases still pass.
**Dependencies:** Task 4
**Files touched:**
- `src/modules/rentals/RentalsList.tsx` (hook wiring + prop + §10 comment correction)
- `src/components/ui/BooqableRentalFilterDrawer.tsx` (`stageCounts` prop consumed — already accepted)
**Estimated scope:** M

## Task 6: Item 9 — Export pinned in FilterDrawer
**Status:** DONE (placement only — page's audited handler, money gate + audit travel with it)
**Description:** Pin current-query Export inside FilterDrawer, inside money gate where surface is gated. Unify quoting via `lib/csv.ts`.
**Acceptance criteria:**
- [x] Drawer exposes optional `onExport` pin at rail bottom (absent = no affordance, other drawer users unaffected)
- [x] RentalsList passes its audited `handleBulkExport` (G5 columns, money-gated Total Amount, `recordExport`, `csvCell` quoter)
- [x] No hand-rolled CSV path added
**Verification:**
- [x] New suite `BooqableRentalFilterDrawer.export.test.tsx` (2/2)
**Dependencies:** Task 4
**Files touched:**
- `src/components/ui/BooqableRentalFilterDrawer.tsx` (`onExport` prop + pinned block)
- `src/modules/rentals/RentalsList.tsx` (`onExport={handleBulkExport}`)
- `src/components/ui/__tests__/BooqableRentalFilterDrawer.export.test.tsx` (new)
**Estimated scope:** S

## Checkpoint: Phase 2
- [x] `npm run check:pglite` + `npm run check:lifecycle` green together — current counts in the verification log (October's 166/166 and 31/31 were the migration and lifecycle counts of that date)
- [x] Focused suites green (all 8 slices)

## Task 7: Items 1–2 — money-tile definitions + zero explanations
**Status:** DONE — restored 21 Nov 2026. The three Finance tiles lost their definitions and zero explanations in commit `b038973c` (17 Oct 2026), when Finance moved to `ModuleKpiStrip`, which had no field for them. `ModuleKpiStrip` now takes `definition` and `zeroExplanation`, and the approved copy is back, word for word. Remaining ~20 call sites stay a logged follow-up, not invented.
**Description:** Fill factual `definition` + `zeroExplanation` on money tiles lacking them. Derive from query code; TODO(decision) where population unclear. Printed as one ellipsised caption on the tile, never as an (i) tooltip (RULING 2026-10-23).
**Acceptance criteria:**
- [x] Finance Outstanding/Overdue/Received carry one-line definitions printed on the tile
- [x] Zero explanations ride only on known totals (conditional spread — `—` unknown never reads as zero; a known zero replaces the definition, as on KpiStrip)
- [x] No invented population (copy names the exact query sets: unsettled = Sent + Partially Paid; overdue = unsettled with the due date passed; received = payment rows in the period)
**Verification:**
- [x] `src/modules/finance/__tests__/Finance.restricted.test.tsx` — "the KPI tiles say what they count" (3 cases)
- [x] `src/components/ui/__tests__/ModuleKpiStrip.caption.test.tsx` (5/5)
- [x] Browser (mock, 21 Nov, Owner): Outstanding and Overdue show their definitions; Received, a known "Rs 0", shows "No payments recorded …" in place of its definition. Checked at desktop and 375px.
- [x] Typecheck clean
**Dependencies:** Phase 2 checkpoint
**Files touched:**
- `src/components/ui/module-shell/ModuleKpiStrip.tsx` (+`definition`, `zeroExplanation`, `isZeroFigure`)
- `src/components/ui/module-shell/module-shell.css` (`.module-kpi-card__caption`)
- `src/modules/finance/Finance.tsx` (three tiles)
- `src/modules/finance/__tests__/Finance.restricted.test.tsx` (+3 cases)
- `src/components/ui/__tests__/ModuleKpiStrip.caption.test.tsx` (new)
**Estimated scope:** M (sliced: Finance first)

## Task 8: Item 5 — unified date-engine façade
**Status:** DONE (weekStarts input + legacy split documented; full PERIODS retirement logged as follow-up — caller migration, not an edit here)
**Description:** `weekStarts` input on `periodRange` in `src/data/today.ts` (0 Sunday / 1 Monday, default 1, so every existing caller is unchanged), with the file header documenting why `operationalDayStart` is not an input and marking PERIODS legacy with its retirement path. Corrected 21 Nov 2026: the card first also planned a new `src/lib/period.ts` merging PERIODS. That file was never created, and the merge is the caller migration logged as follow-up. The card's scope is the input and the documentation.
**Acceptance criteria:**
- [x] `periodRange` takes optional `weekStarts` (0 Sunday / 1 Monday, default 1 = every existing caller unchanged)
- [x] Header documents why `operationalDayStart` is NOT an input (day markers; bounds read the setting per call in `queries/bookings.ts`, D4) and marks PERIODS legacy with the retirement path
- [x] Sunday-start tests pin the new input; all existing Monday expectations untouched
**Verification:**
- [x] `src/modules/today/__tests__/todayQuery.test.ts` (69/69 on 21 Nov, incl. the weekStarts test; was 68 in October)
**Dependencies:** Task 7
**Files touched:**
- `src/data/today.ts` (`WeekStarts` + param + docs)
- `src/modules/today/__tests__/todayQuery.test.ts` (+Sunday-start test)
**Estimated scope:** L (sliced: input + docs + tests; no caller migration)

## Checkpoint: Complete
- [x] Full test suite and gates re-run on 21 Nov 2026 — numbers in the verification log below
- [x] `npm run completion` + `lint:progress`; PROGRESS.md entry written for 21 Nov

## Verification log
_Pending: the numbers for the full-suite run, the database gates, the build and the lint pass are added here once they finish._
