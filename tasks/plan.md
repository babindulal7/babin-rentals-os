# Implementation Plan: Booqable ADOPTIONS 1–9 (REFERENCE_SPEC v2.5)

## Overview
Implement the nine build items from `docs/booqable/ADOPTIONS.md` (7 Sep 2026, corrected same day) against Oct 2026 HEAD. Items 1–2 are copy/plumbing (L1/L2), 3 is single next-verb (already substantially satisfied by `getRentalPrimaryAction`), 4/8 are facet counts, 5 is date-engine unification (L, riskiest), 6 is preview-card audit, 7 is late-pickup query + counted links (L3), 9 is Export-in-rail. Deferred cluster (tri-state calendar, six-component rail, second picker, downtime module, post-bridge) stays deferred per ADOPTIONS. No product decision invented; copy derived from measured queries; open calls logged to `docs/OPEN_DECISIONS.md`.

## Architecture Decisions
- `getRentalPrimaryAction` (`src/lib/rentalActions.ts`) is the single next-verb owner — do NOT add a parallel `workflow.nextVerb`. Item 3 = lock invariant with test + wire Operations row verb to it if not already.
- `KpiStrip` plumbing (`definition`, `zeroExplanation`, one `(i)` tooltip) already exists — items 1–2 = fill factual copy at call sites, never new props.
- `facetCounts.ts`/`useFacetCounts` is the counting mechanism — items 4/8 = wire, not new RPC. No `booking_facets()` RPC this pass (confirmed absent from migrations; wiring existing engine is smaller).
- `periodRange` + `PERIODS` unification (item 5) = new `src/lib/period.ts` façade with `operationalDayStart` + `weekStarts` inputs first; retire duplicates only after callers migrate. Fail fast on this riskiest item.
- Money-blindness = omission not CSS-hide (IntelCard contract). Item 6 = audit test first (TDD), fix builders only if test fails.

## Task List

### Phase 1: Safe engine + invariant locks (no copy invention)
- [ ] Task 1: Item 7 — `latePickups(nowAd)` in `src/lib/queries/bookings.ts` + unit test + surface as Operations chip + Dashboard counted footer links
- [ ] Task 2: Item 3 — lock single next-verb invariant (`getRentalPrimaryAction` test) + verify BookingDetail header + Operations row verb both read it
- [ ] Task 3: Item 6 — IntelCard money-blind payload audit test (`data/*Intel.ts` builders omit money lines for Warehouse/Tech/Driver/Client)

### Checkpoint: Phase 1
- [ ] `npm run typecheck` clean; focused vitest green; no UI copy invented

### Phase 2: Counts + export wiring
- [ ] Task 4: Item 4 — Cancelled count on `/rentals` Status group (visible scope, B5 mitigation) + test
- [ ] Task 5: Item 8 — counts on remaining `/rentals` date filter groups (scope first: bookings-column groups only)
- [ ] Task 6: Item 9 — Export pinned inside `FilterDrawer` (current-query scope, inside money gate)

### Checkpoint: Phase 2
- [ ] Focused suites + `check:pglite` + `check:lifecycle` together (R-35 Verified)

### Phase 3: Copy + date engine (highest review risk)
- [ ] Task 7: Items 1–2 — factual `definition` + `zeroExplanation` on money tiles lacking them (derive from query code; TODO(decision) where population unclear)
- [ ] Task 8: Item 5 — `src/lib/period.ts` unified façade (forward `periodRange` + backward `PERIODS`, `operationalDayStart` + `weekStarts` inputs) + migrate one caller + deprecation notes

### Checkpoint: Complete
- [ ] Full `npm test`, `npm run build`, `check:contrast`, `lint`, `completion` + `lint:progress`; PROGRESS.md Completion/Remaining

## Risks and Mitigations
| Risk | Impact | Mitigation |
| Item 5 touches every dated screen | High | Façade first, migrate one caller, retire nothing this pass |
| Money-tile copy invents population | Med | Derive from query code only; TODO(decision) otherwise |
| Facet counts N+1 PostgREST | Med | Reuse `useFacetCounts` pattern (counts only while open); no new RPC |
| Concurrent sessions editing same files | Med | Small diffs, run scoped tests, leave foreign uncommitted edits alone |

## Open Questions
- B3 Dashboard KPI strip keep/drop — needs Babin (one-word answer, blocks nothing).
- B5 Cancelled count worth it — implement visibly, Babin flips by reply.
- D1 purchase-cost/deposit backfill sizing — local SELECT, not Booqable script.
- `operationalDayStart` org setting vs device pref — settingsStore vs localStorage reconciliation.
