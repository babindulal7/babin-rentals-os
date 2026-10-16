# TODO — Booqable ADOPTIONS 1–9

## Task 1: Item 7 — `latePickups(nowAd)` + counted View late links
**Description:** Add the one missing Attention-required predicate (late pickup) alongside todaysOutgoing/todaysIncoming/overdue, surface as Operations chip + two counted Dashboard footer links. No new component.
**Acceptance criteria:**
- [ ] `latePickups(nowAd)` in `src/lib/queries/bookings.ts` returns pickup_at < now, stage Booked/Packed, cancelled false
- [ ] Unit test pins boundary + stage set + minute-floored instant
- [ ] Operations chip + Dashboard footer links show counts
**Verification:**
- [ ] Tests pass: `npx vitest run src/lib/queries/__tests__/bookings.test.ts`
- [ ] Typecheck clean
**Dependencies:** None
**Files likely touched:**
- `src/lib/queries/bookings.ts`
- `src/lib/queries/__tests__/bookings.test.ts`
- `src/modules/operations/OperationsQueues.tsx`
- `src/modules/today/Today.tsx`
**Estimated scope:** M (3-5 files)

## Task 2: Item 3 — single next-verb invariant lock
**Description:** Prove BookingDetail header + Operations row verb both read `getRentalPrimaryAction` (the single owner). No parallel `workflow.nextVerb`.
**Acceptance criteria:**
- [ ] Test asserts one primary verb per stage incl. Cancelled/Closed/service-only/partial/reset-complete
- [ ] BookingDetail + OperationsQueues both call `getRentalPrimaryAction`
- [ ] No duplicate JOB_ORDER.find lookups added
**Verification:**
- [ ] Tests pass: `npx vitest run src/lib/__tests__/rentalActions.test.ts`
**Dependencies:** None
**Files likely touched:**
- `src/lib/__tests__/rentalActions.test.ts`
- `src/modules/rentals/BookingDetail.tsx`
- `src/modules/operations/OperationsQueues.tsx`
**Estimated scope:** S (1-2 files)

## Task 3: Item 6 — IntelCard money-blind payload audit
**Description:** TDD audit: money-blind roles get glance payload with money lines omitted (not CSS-hidden). Fix builders only if audit fails.
**Acceptance criteria:**
- [ ] Test builds glance for Owner vs Warehouse/Technician/Driver/Client on rental/client/equipment builders
- [ ] Warehouse payload contains no Rs/money figure lines
- [ ] Keyboard path (tabIndex/role/Escape) asserted where applicable
**Verification:**
- [ ] Tests pass: focused Intel suite
**Dependencies:** None
**Files likely touched:**
- `src/data/*Intel.ts`
- `src/components/ui/IntelCard.tsx`
- new/existing Intel test
**Estimated scope:** S

## Checkpoint: Phase 1
- [ ] All focused tests pass
- [ ] Typecheck clean
- [ ] No product copy invented

## Task 4: Item 4 — Cancelled count on /rentals Status group
**Description:** Show excluded Cancelled count beside chip (Booqable §9.2 mitigation: filter + census). Visible scope, reversible.
**Acceptance criteria:**
- [ ] Cancelled option shows live count
- [ ] Count respects base scope, updates with other filters per `facetCountsOf` contract
- [ ] Money-blind unaffected
**Verification:**
- [ ] Tests pass: `npx vitest run src/lib/queries/__tests__/facetCounts.test.ts src/modules/rentals`
**Dependencies:** Phase 1 checkpoint
**Files likely touched:**
- `src/modules/rentals/RentalsList.tsx`
- `src/lib/queries/facetCounts.ts`
**Estimated scope:** S

## Task 5: Item 8 — counts on remaining /rentals date groups
**Description:** Extend counts to date-shaped filter groups (bookings-column groups only). Non-column groups get scoping note, not implementation.
**Acceptance criteria:**
- [ ] Date groups show counts via existing counter
- [ ] Non-column groups documented as blocked/unsized
**Verification:**
- [ ] Focused facet suites green
**Dependencies:** Task 4
**Files likely touched:**
- `src/modules/rentals/RentalsList.tsx`
- `src/lib/queries/facetCounts.ts`
**Estimated scope:** M

## Task 6: Item 9 — Export pinned in FilterDrawer
**Description:** Pin current-query Export inside FilterDrawer, inside money gate where surface is gated. Unify quoting via `lib/csv.ts`.
**Acceptance criteria:**
- [ ] FilterDrawer exposes export of current query
- [ ] Money-gated surfaces keep export inside gate
- [ ] No hand-rolled CSV path added
**Verification:**
- [ ] Filter/export suites green
**Dependencies:** Task 4
**Files likely touched:**
- `src/components/ui/FilterDrawer.tsx`
- `src/lib/csv.ts`
**Estimated scope:** S

## Checkpoint: Phase 2
- [ ] `npm run check:pglite` + `npm run check:lifecycle` green together
- [ ] Focused suites green

## Task 7: Items 1–2 — money-tile definitions + zero explanations
**Description:** Fill factual `definition` + `zeroExplanation` on money KpiStrip tiles lacking them. Derive from query code; TODO(decision) where population unclear.
**Acceptance criteria:**
- [ ] Every money tile has one-line definition in `(i)` tooltip
- [ ] Zero/missing figures explain rule + named inputs
- [ ] No invented population; unclear ones get TODO(decision) + OPEN_DECISIONS entry
**Verification:**
- [ ] `npx vitest run src/components/ui/__tests__/KpiStrip.info.test.tsx`
**Dependencies:** Phase 2 checkpoint
**Files likely touched:**
- `src/components/ui/Page.tsx`
- money Kpi call sites (Finance/Reports/Rentals/Today)
**Estimated scope:** M

## Task 8: Item 5 — unified date-engine façade
**Description:** New `src/lib/period.ts` merging forward `periodRange` + backward `PERIODS` with `operationalDayStart` + `weekStarts` inputs. Migrate one caller; retire nothing.
**Acceptance criteria:**
- [ ] Façade covers forward + backward + fiscal (Shrawan) presets
- [ ] One caller migrated, others untouched with deprecation note
- [ ] Tests pin 05:30-belongs-to-yesterday at 06:00 setting + week-start handling
**Verification:**
- [ ] Focused period suites + full gates
**Dependencies:** Task 7
**Files likely touched:**
- `src/lib/period.ts` (new)
- `src/lib/__tests__/period.test.ts` (new)
- `src/data/today.ts`
- `src/data/pulse.ts`
**Estimated scope:** L (sliced: façade + one caller only)

## Checkpoint: Complete
- [ ] `npm test` full green; `npm run build` clean; `check:contrast` pass; `lint` clean
- [ ] `npm run completion` + `lint:progress`; PROGRESS.md Completion/Remaining
