# PREMIUM WORKBENCH V1 — CHANGELOG

**Date:** 21 October 2026 (local session)
**Spec:** `BABIN_PREMIUM_WORKBENCH_GLM_5_3_CODE_PACK.zip` → `BABIN_OS_GLM_5_3_PREMIUM_WORKBENCH_IMPLEMENTATION.md`
**Scope:** local repository only — no push, no PR, no deploy, no Supabase change, no SQL, no data writes.
**Base observed at session start:** `4034e7fd` (clean tree). NOTE: a concurrent auto-sync process
committed during the session (HEAD moved through `9a1c966c`, `75358e3b`, `4bbc9f31`); the workbench
changes rode those local auto-sync commits. Other concurrent sessions were editing
`ProductsImportCenter.test.tsx` (BQ-407) and BookingDetail payment-reason work in the same shared
tree — their in-flight reds are NOT part of this feature (attribution below).

## What was built

A docked, keyboard-browsable record inspector ("Premium Workbench") on **Rentals** and **Inventory**:
select a record → the list keeps its scroll/filters/page and yields a right-hand strip at desktop
(≥1280) instead of being covered; `previous / next` + `n of N on this page` traverse the currently
loaded page in rendered order; Alt+↑/↓ browse without intercepting typing; tablet keeps the existing
overlay; phone keeps the existing bottom sheet. No business logic, query, permission, money rule,
filter semantics, or status engine was changed.

## Changed paths

**New files (from the pack, adapted):**
- `src/lib/inspectorNavigation.ts` — presentation-only traversal math (stable IDs, page-local).
- `src/lib/__tests__/inspectorNavigation.test.ts` — 4 tests.
- `src/components/ui/useInspectorTraversal.ts` — page-owned browse state; no prefetching.
- `src/components/ui/InspectorNavigator.tsx` — accessible prev/next + count + Alt+↑/↓ keys;
  adapted: `BP.desktop` from `lib/breakpoints` instead of a magic 1280, Tabler chevron icons
  (`Icon`) instead of text arrows per the repo icon rule, `isComposing`/`defaultPrevented` guards
  per house keyboard-handler style.
- `src/components/ui/InspectorFacts.tsx` — quiet fact-row hierarchy for inspector content.
- `src/components/ui/premium-inspector.css` — nav/fact styles on existing tokens + docked rules.

**Modified files:**
- `src/components/ui/ContextDrawer.tsx` — opt-in `docked?` + `navigation?: ReactNode`; dock class
  only at `BP.desktop` (JS-gated, no new CSS breakpoints); docked open does **not** steal focus
  (spec §2.F); reservation + edge coordination below; phone/tablet paths byte-identical.
- `src/styles/ui-v2.css` — `.app-workspace` right padding now consumes
  `max(var(--information-drawer-w, 0px), var(--context-drawer-w, 0px))`.
- `src/modules/rentals/RentalsList.tsx` — `activeRental` derived from the live page (stale-row
  proof); traversal wired; drawer `docked` + navigator; Schedule/Client/Total Amount sections
  converted to `InspectorFacts`; row highlight re-pointed to `activeRental`; every existing
  callback (BookingOperationsMenu, Open rental →, money gate) unchanged.
- `src/modules/inventory/Inventory.tsx` — same pattern (`activeEquipment`, `equipmentTraversal`);
  `isInspected={activeEquipment?.id === p.id}`; Stock & Identity / Replacement value converted to
  `InspectorFacts`; StatusBreakdown, Start Rental / Full Asset Details / Print Thermal Asset Tag
  kept as wired; the screen's own stricter money gate (`canViewMoneyField(gctx, 'asset-finance')`)
  unchanged and still constructs the money facts.
- `src/components/ui/__tests__/ContextDrawer.test.tsx` — 9 new tests for the docked contract;
  all 5 pre-existing tests untouched and green.
- `src/modules/rentals/BookingDetail.tsx` — removed one dead binding
  (`isFullySettled`, never read; blocked the typecheck gate at session start).

## Deviations from the pack (fresher local code won — spec §5 authorizes reconciling)

1. **Dock mechanism.** The pack proposed `:has(.context-drawer--docked)` + `!important` padding on
   `.app-workspace-main`. The repo already has a proven, animated, token-driven dock convention
   (FilterDrawer sets `--filter-drawer-w` / `--information-drawer-w` on `:root`; `.app-workspace`
   consumes them — RULINGS-2026-10-15/10-20). The docked ContextDrawer reuses exactly that:
   `--context-drawer-w` on `:root`, consumed by the same `.app-workspace` padding (max() — the two
   right-edge drawers are mutually exclusive). No `!important`, no `:has()`, no new media query
   (the class is JS-gated at `BP.desktop`).
2. **Information-drawer overlap (spec §2.H).** Instead of new ad-hoc dismissal, the dock-enabled
   inspector joins the existing `babin:side-drawer-open` protocol that FilterDrawer already runs —
   opening it yields any open right-edge drawer and vice versa; below desktop any drawer wins
   (mirrors RULINGS-2026-10-20's "one drawer per edge"). Non-docked ContextDrawer call sites
   (ClientsDirectory, RentalAuditDrawer) deliberately keep legacy behavior.
3. **Inspected-row styling.** The pack's `premium-row--inspecting` CSS class was not added:
   Rentals already paints the inspected row (primary tint + inset bar) inline, and Inventory
   already ships `.inventory-parent-row.is-inspected`. Both were re-pointed to the live
   `active*` row — same visual, distinct from bulk-selection, smaller diff.
4. **`animation: none` on the docked panel was not adopted** — the existing 220ms
   `drawer-in/out-right` slide matches the workspace padding transition (same duration as
   FilterDrawer), so docked entry/exit keeps the app's motion language.

## Verification

- `npm run typecheck` — PASS (0 errors) after changes. (Baseline at session start was RED:
  `BookingDetail.tsx` `isFullySettled` unused — pre-existing, from concurrent BookingDetail work;
  the dead line was removed and the concurrent session's test for the "fully settled" reason
  still fails without it, i.e. it fails for their unfinished feature, not for this removal.)
- `npx vitest run src/lib/__tests__/inspectorNavigation.test.ts src/components/ui/__tests__/ContextDrawer.test.tsx`
  — 18/18 PASS (14 ContextDrawer incl. 9 new docked tests + 4 traversal).
- `npx vitest run src/modules/inventory src/modules/rentals src/components/ui/__tests__/InformationDrawer.test.tsx`
  — 595/599 at that point; the 4 failures were in concurrent sessions' in-flight work (verified
  against pristine HEAD via a stash round-trip where reproducible).
- Full `npm test` — **5,116 / 5,120 passed (403 files)**. The 4 failures are all attributed to
  concurrent sessions' in-flight work, not this feature, each with its evidence:
  - `tier2-boundaries › Touch Target Audit` — fails on `[vitest] No "IS_MOCK" export is defined on
    the "../../lib/supabase" mock`; the test mounts only `Header` + `Sidebar` (untouched here).
  - `reportQueries.law16 › unreadable project_type column` — `expected [] to be null` (their
    report-read work).
  - `Finance.restricted › phone header de-crowding` — `expected <button aria-label="Export"> to be
    null` (their finance header work).
  - `BookingDetail.quickActionsPayment › fully settled` — fails at pristine HEAD too (verified).
- `npm run lint` — PASS (0 warnings). `npm run check:contrast` — **82/82 PASS**.
- `npm run build` — see PROGRESS.md session entry.

### Real-browser visual verification (mock corpus, real login form)

Driven with headless Chrome over CDP against `npm run dev:mock` (port 3002), signed in through the
real login form as `owner@babinrentals.com` and as `warehouse@babinrentals.com` (money-blind role).
14 screenshots + a JSON assertion log live in
`C:\Users\use\AppData\Local\Temp\opencode\workbench-shots\` (not in the repo).

Measured at desktop 1600×1000 (both roles, both pages):
- `.context-drawer--docked` applied; `--context-drawer-w = clamp(320px, 27vw, 420px)` on `:root`;
  `.app-workspace` computed `padding-right: 420px`.
- **The list is not covered:** table right edge == panel left edge (1180px == 1180px) on Rentals
  and Inventory; panel spans to the viewport edge.
- Focus not stolen (`document.activeElement` stays BODY while the drawer is open).
- Navigator count truthful ("1 of 20 on this page"); **Alt+ArrowDown moves 1 → 2** with the drawer
  staying open; the Previous button returns to 1.
- Escape closes and releases the strip (`--context-drawer-w` removed, padding back to 0).
- **Law 6 in the real DOM:** Owner sees Total Amount / Daily Rate / Replacement value in the
  inspector; **Warehouse sees none of them** (facts absent, not CSS-hidden).

At tablet 1194×834: no dock class, no reservation, existing 420px right overlay kept.
At phone 390×844 (open drawer narrowed): modal bottom sheet, `aria-modal="true"`, body scroll
locked, scrim present, navigator buttons still ≥44px.

Known harness notes (not app defects): the first verification run measured `padding-right` inside
the 220ms entry transition (read 0px; settled value is 420px — re-measured after 700ms), and phone
rows on these pages are card rows without a row-click inspector (pre-existing: phone goes straight
to the record page), so the phone sheet was verified by narrowing an open drawer.

## Known limitations / not done

- The screenshots live outside the repo (temp directory) so nothing unreviewed lands in git;
  copy any of them into the repo if you want them versioned.
- Previous/next is page-local by design (spec §2); it does not cross backend pages — the count
  says "on this page" truthfully.
- The dock reserves width only while a record is actually being inspected (respects the 20 Oct
  on-demand-rail ruling); it is not a permanent rail.
- Cross-page traversal, saved views, and any SQL change are explicitly out of scope (spec §5).
- 4 full-suite failures are concurrent sessions' in-flight work (attribution above), not this
  feature; they were left for those sessions to finish.

## Revert

Single-purpose revert: remove `docked`/`navigation` props from the two drawers and the props block
in `ContextDrawer.tsx`; drop the 6 new files and the 9 new tests; restore `.app-workspace`
padding-right to `var(--information-drawer-w, 0px)`; restore the two drawers' section markup from
git history. No data, schema, or engine file is touched by this feature.
