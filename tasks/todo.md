# TODO — Booqable ADOPTIONS 1–9

## Task 1: Item 7 — `latePickups(nowAd)` + counted View late links
**Status:** DONE (engine + Operations delegation; Dashboard counted links deferred — /rentals route contract for activity-scoped overdue links needs a check first, recorded below)
**Description:** Add the one missing Attention-required predicate (late pickup) alongside todaysOutgoing/todaysIncoming/overdue, surface as Operations chip + two counted Dashboard footer links. No new component.
**Acceptance criteria:**
- [x] `latePickups(nowAd)` in `src/lib/queries/bookings.ts` returns pickup_at < now, stage Booked/Packed, cancelled false
- [x] Unit test pins boundary + stage set + minute-floored instant
- [x] Operations exception facets `overdue_start`/`overdue_end` delegate to `latePickups()`/`overdue()` (minute-stable, one definition)
- [ ] Dashboard counted footer links — deferred, needs /rentals activity-param route check
**Verification:**
- [x] Tests pass: `npx vitest run src/lib/queries/__tests__/bookings.test.ts` (48/48)
- [x] `npx vitest run src/modules/operations/__tests__/operationsQueues.test.ts` (39/39)
- [x] Typecheck clean
**Dependencies:** None
**Files touched:**
- `src/lib/queries/bookings.ts` (+`latePickups`)
- `src/lib/queries/__tests__/bookings.test.ts` (+3 tests)
- `src/modules/operations/OperationsQueues.tsx` (delegation)
**Estimated scope:** M (3-5 files)

## Task 2: Item 3 — single next-verb invariant lock
**Status:** DONE (no new `workflow.nextVerb` — `getRentalPrimaryAction` is the single owner; ADOPTIONS-era duplicate lookups verified gone)
**Description:** Prove BookingDetail header + Operations row verb both read `getRentalPrimaryAction` (the single owner). No parallel `workflow.nextVerb`.
**Acceptance criteria:**
- [x] Test asserts one primary verb per stage incl. Cancelled/Closed/service-only/partial/reset-complete + Unknown falls through to non-operable View (never an invented transition)
- [x] BookingDetail header + LifecycleProgress banner read `getRentalPrimaryAction`; MovementList rows use movement-scoped `primaryFor`; RentalsList rows carry no verb (RAIL F3); `jobForStage` (backward) vs `jobThatSets` (forward) confirmed distinct predicates
- [x] No duplicate JOB_ORDER.find lookups added
**Verification:**
- [x] Tests pass: `npx vitest run src/lib/__tests__/rentalActions.test.ts` (11/11)
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
- [x] All focused tests pass (bookings 48, operations 39, rentalActions 11, rentalsList 91)
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
- [x] Focused suites green: rentalsList 91 + render + facetCounts (137 total across 3 files)
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
- [x] `npm run check:pglite` (166/166) + `npm run check:lifecycle` (31/31) green together
- [x] Focused suites green (all 8 slices)

## Task 7: Items 1–2 — money-tile definitions + zero explanations
**Status:** DONE (Finance slice — 3 tiles, code-derived copy; remaining ~20 call sites logged as follow-up, not invented)
**Description:** Fill factual `definition` + `zeroExplanation` on money KpiStrip tiles lacking them. Derive from query code; TODO(decision) where population unclear.
**Acceptance criteria:**
- [x] Finance Outstanding/Overdue/Received carry one-line definitions in `(i)` tooltip
- [x] Zero explanations ride only on known totals (conditional spread — `—` unknown never reads as zero)
- [x] No invented population (copy names the exact query sets)
**Verification:**
- [x] Typecheck clean; plumbing pinned by existing `KpiStrip.info.test.tsx`
**Dependencies:** Phase 2 checkpoint
**Files touched:**
- `src/modules/finance/Finance.tsx` (3-tile copy)
**Estimated scope:** M (sliced: Finance first)

## Task 8: Item 5 — unified date-engine façade
**Status:** DONE (weekStarts input + legacy split documented; full PERIODS retirement logged as follow-up — caller migration, not an edit here)
**Description:** New `src/lib/period.ts` merging forward `periodRange` + backward `PERIODS` with `operationalDayStart` + `weekStarts` inputs. Migrate one caller; retire nothing.
**Acceptance criteria:**
- [x] `periodRange` takes optional `weekStarts` (0 Sunday / 1 Monday, default 1 = every existing caller unchanged)
- [x] Header documents why `operationalDayStart` is NOT an input (day markers; bounds read the setting per call in `queries/bookings.ts`, D4) and marks PERIODS legacy with the retirement path
- [x] Sunday-start tests pin the new input; all existing Monday expectations untouched
**Verification:**
- [x] `src/modules/today/__tests__/todayQuery.test.ts` (68/68 incl. 1 new weekStarts test)
**Dependencies:** Task 7
**Files touched:**
- `src/data/today.ts` (`WeekStarts` + param + docs)
- `src/modules/today/__tests__/todayQuery.test.ts` (+Sunday-start test)
**Estimated scope:** L (sliced: input + docs + tests; no caller migration)

## Checkpoint: Complete
- [x] `npm test` full green (369 files / 4664 tests); `npm run build` EXIT=0; `check:contrast` 82/82; `lint` clean
- [x] `npm run completion` + `lint:progress` EXIT=0; PROGRESS.md Completion/Remaining written
