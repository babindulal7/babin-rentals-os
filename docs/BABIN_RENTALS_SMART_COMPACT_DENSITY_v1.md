# Babin Rentals OS — Smart Compact Density System v1.0

**Status:** Proposed implementation specification (not implemented)
**Target repository:** `babindulal7/babin-rentals-os`, latest `main` only
**Design intent:** More visible actionable information; less dead space; same data, accessibility, permissions, and operational behavior.
**Working mode:** New feature branch + reviewable PR. No merge, deployment, live Supabase modification, or fake data creation.

## 1. Primary aesthetic rule

**Compact is not cramped.** Eliminate redundant margins, unused fixed heights, oversized cards, duplicate page furniture, oversized icon/title stacks, and permanently reserved whitespace. Do **not** shrink critical controls below 44 × 44 px, reduce body text to illegible sizes, clip financial figures, alter status semantics, or remove necessary information.

Prioritize usable space in this order:

1. Remove **empty and repeated structure**.
2. Replace **oversized minimum heights** with content-based sizing.
3. Pack **related facts horizontally** when space permits.
4. Collapse **optional explanations** into accessible tooltips and expandable detail regions.
5. Reduce padding/gap **only after** those changes.
6. Do not use empty space to invent filler widgets.

## 2. What was confirmed from the current repository

| Existing source | Confirmed observation | Conservative change |
|---|---|---|
| `src/styles/theme.css` | Expanded sidebar `--app-sidebar-width: 256px`; header `64px`; desktop page padding `clamp(14px,1.35vw,18px)`; section gap 16px | Trial 224px expanded navigation; preserve 64px header and generally retain 12–16px page padding. |
| `src/modules/today/dashboard.css` | `.rental-dashboard__panels` gap `1.25rem` (20px); `.movement-panel__header` minimum `5rem` (80px) and ~18px/20px padding; `.movement-panel__row` minimum `4rem` (64px) | Gap 12px; header 60–64px; movement rows 52–56px when all controls still fit. |
| `src/modules/today/Today.tsx` | Workbar has 16px bottom margin; situational grid has 24px top margin; situational cards have 16px/20px padding and some `minHeight: 140` | Combine contextual summary + date selector in a concise workbar; set situational top gap 12px; card padding 12–14px; prefer content-determined min-height ~96–108px. |
| `src/components/ui/Page.tsx` | KPI tile padding `13px 14px`; values have margin top 9px; delta block margin top 7px | Trial padding 10–12px and value/delta gap 5–6px **only** for compact density; never truncate the full money value without accessible full value. |
| `src/components/ui/DataTable.tsx` | `density` already accepts `compact` / `comfortable`, default comfortable | Reuse existing prop; don’t create a second table system. |
| `src/styles/ui-v2.css` | Compact data-table rules settle at 44px, comfortable at 48px; data-table action controls have 44px minimum | Enable compact tables where helpful, retain 44px interactive targets, ensure focus/hover and mobile alternatives. |
| `src/components/shell/shell.css` | Stable header slots, 44px click targets, and one-row position contract | Do not move Add / Filters / More / Save controls or create a second toolbar. |
| `src/styles/responsive.css` | Shared width bands: `<768` phone, `768–1279` tablet, `>=1280` desktop | Preserve bands. Keep the iPad operational workflow desktop-like with a collapsible rail and responsive columns. |

Do not treat uninspected pages as verified. Run a route-by-route visual audit before applying page-specific changes.

## 3. Proposed density profiles

Provide two **user-selectable** profiles, using one app-wide preference:

- `Compact` — **default desktop and tablet**, unless a stored user preference exists.
- `Comfortable` — default phone; available desktop and tablet as accessibility/preference alternative.

Use a new settings control **Appearance → Display Density** with Compact / Comfortable. Persist via existing safe-storage helper, not raw unguarded `localStorage`. Allow system logic to resolve initial density by viewport band, but do not override explicit user preference when resizing. Compact must never disable essential labels or controls.

Treat screen *width* and pointer *capability* independently. On touchscreen iPads, compact means reduced visual whitespace, not mouse-sized targets. Respect OS text zoom and reduced motion preferences.

### Initial target geometry (adjust based on screenshot + QA)

| Surface | Comfortable | Compact | Notes |
|---|---:|---:|---|
| Desktop expanded sidebar | 256px | **224px** | Navigation labels must remain intact; current 64px collapsed rail remains. |
| Global header | 64px | **64px** | Do not change without a separate contract review. |
| Desktop page padding | 14–18px | **12–16px** | Small saving only; do not eliminate framing. |
| Major section gap | 16–24px | **10–12px** | Scoped to compact page content; no global space-scale rewrite. |
| Card gap | 12–20px | **8–12px** | Clear grouping must remain. |
| KPI internal padding | ~13–14px | **10–12px** | Label, value and change in <=~92px where possible. |
| KPI height | Content-dependent | **88–104px typical** | Do not hard-code height if content wraps. |
| Today movement panel heading | 80px min | **60–64px** | Date filter and action controls still >=44px. |
| Today movement row | 64px min | **52–56px** | Leave 44px action controls; allow expansion for long names. |
| Situational cards | 140px minimum | **96–108px typical** | Only if visible content fits; otherwise natural height. |
| Data table interactive row | 48px comfortable | **44px compact** | Existing component supports compact; no 32px clickable rows. |
| Operational checklist / floor rows | Existing operational minimum | **Preserve safe touch minimums** | Don’t override `--row-min-h:56px` globally. |
| Popover/drawer controls | Existing | **Preserve 44px hit areas** | Shrink surrounding whitespace if needed. |

**Important:** Space savings percentages are **targets to measure**, not performance claims. Aim for ~15–25% more visible actionable rows at 1440×900, without truncation or loss of affordances. Capture baseline and after screenshots to establish real results.

## 4. Today Dashboard layout

Desktop (>=1280):

```text
┌────224px NAV────┬────────────── SINGLE 64px HEADER / SEARCH / ACTIONS ───────────────┐
│ Today           │  TODAY   [movement summary]      [day range] [calendar]            │
│ Rentals         │  [pickup queue]                      [return queue]                │
│ Calendar        │  ┌──────────────────────┐             ┌──────────────────────┐       │
│ Operations      │  │ 44–56px booking rows │             │ 44–56px booking rows │       │
│ Inventory       │  │ as many as naturally │             │ as many as naturally │       │
│ Clients         │  │ fit above the fold   │             │ fit above the fold   │       │
│ Finance         │  └──────────────────────┘             └──────────────────────┘       │
│                 │  [Shift handover: concise row / expandable content]                 │
│                 │  [currently out] [awaiting packing] [returns & maintenance]         │
└─────────────────┴─────────────────────────────────────────────────────────────────────┘
```

Rules:
- Keep the existing Today Dashboard; **do not create a second dashboard or new Smart Operations page**.
- Avoid extra headings if the global header has already established the title. Ensure `PageHeader` portal semantics before removing anything; never remove required search/actions.
- Keep Today summary (outgoing count + incoming count) and date controls on one clean contextual workbar **when width allows**; otherwise wrap without clipped controls.
- Set `.rental-dashboard__panels` gap to ~12px under compact density.
- Trial `.movement-panel__header` min-height 60–64px and paddings ~10–12px.
- Trial `.movement-panel__row` min-height 52–56px; ensure long client names ellipsize with accessible full value and secondary details remain reachable.
- Replace situational card `minHeight: 140` with content-driven layout; use `min-height: 96px` only where cards contain enough content and can grow.
- Remove situational row’s 24px top margin in Compact; prefer 12px.
- Preserve overdue alert **at the top**, full prominence; only reduce excess padding, never hide/collapse high-severity notices.
- For officers, show pickup/return operations only; financial figures remain permission-gated, not merely CSS-hidden.

## 5. Rentals / Inventory / Clients lists

- Table first: use existing shared DataTable compact density and existing column visibility controls.
- Header toolbar: search, filter count, bulk actions, and primary action each have one home; avoid two stacked toolbars if they carry equivalent functions.
- Use one compact KPI strip (3–4 measures maximum), not a tall analytics dashboard above a dense rental list. Hide or fold *optional insight copy*, never live operational alerts.
- Give the record table the remaining page width; filter drawer remains an **overlay**, consistent with current RentalsList.
- Prefer meaningful columns: booking number, client, rental date/time, items, stage, next action; avoid overly wide empty columns.
- Use content-aware width constraints (e.g., IDs compact, customer names flexible, actions fixed).
- On hover/focus, show the same details as before; do not depend on hover for iPad.
- Text 13–14px+ for operational tables; larger where accessibility requires. Preserve readable Nepali glyphs.

## 6. Forms and side panels

- Group logically related inputs on a single row on desktop/iPad when labels remain readable: e.g. pickup date + pickup time, return date + return time.
- Use two-column grids for moderate-width forms, single column on phone.
- Keep labels next to the fields they describe and validation feedback close by.
- Use progressive disclosure for rare advanced options; main workflow fields stay visible.
- Don’t enlarge drawers merely to fill width; keep content aligned to a readable max width.
- Preserve existing booking date, 06:00–06:00 rental-day, discount, deposit, invoice, money and stage-transition business logic.

## 7. Charts and analytics

- Use compact KPI strip followed by a single high-value graph, with secondary metrics in tabs or expandable sections.
- Avoid graphs with forced `height: 400px` when one concise chart communicates the same thing; start in 220–280px range and permit expand/fullscreen.
- Label units, axes and date ranges; do not trade comprehension for compactness.
- Financial plots and totals must continue to respect existing `finance.view` and role permissions, including DOM omission for money-blind roles.

## 8. Implementation architecture

1. Audit existing DOM and page CSS before introducing new values; locate whitespace caused by `min-height`, stacked `margin-top/margin-bottom`, wide centered `max-width`, `space-between`, empty placeholders and duplicated headers.
2. Add optional shared density context/helper (e.g. `src/lib/displayDensity.tsx`), using `safeStorage` and the existing viewport helper. Avoid creating a second theme provider.
3. Expose a stable data attribute **scoped to the app shell or PageShell**, such as `data-density="compact"`; do not reuse `data-theme` or alter color semantics.
4. Add a small density token layer in **`src/styles/theme.css`**, the canonical token authority. Example scoped custom properties only:

```css
.app-workspace[data-density='compact'] {
  --density-card-pad: 12px;
  --density-panel-gap: 12px;
  --density-section-gap: 12px;
  --density-table-row: 44px;
}
.app-workspace[data-density='comfortable'] {
  --density-card-pad: 16px;
  --density-panel-gap: 20px;
  --density-section-gap: 16px;
  --density-table-row: 48px;
}
```

5. Bind the existing `DataTable` density prop to the chosen profile only on appropriate list pages. Don’t invent another generic table or force every operational list to 44px.
6. Update `src/modules/today/dashboard.css` and `Today.tsx` first, scoped by density attribute; test the movement panel and situational cards individually.
7. Move any *new* responsive breakpoint rules to **`src/styles/responsive.css`**; preserve 768px and 1280px thresholds. Do not append redundant page-specific breakpoint rules to other stylesheets.
8. Audit Rentals, Inventory, Clients, Operations and Reports for real gains, then adapt using shared primitives rather than route-specific magic numbers.
9. Ensure theme variants (light/dark/glass/high-contrast) still meet contrast standards and do not obscure borders/focus indicators.

## 9. Responsive and zoom matrix

Before / after screenshots with **same non-sensitive representative fixture data** and each staff role:
- Desktop 1920×1080, 1440×900, 1280×800.
- iPad 1194×834 landscape and 834×1194 portrait, where available; no hover-only behavior.
- Phone 390×844 and 430×932.
- Browser zoom at 100%, 125%, and 150% for desktop.
- Light, dark, high contrast; compact and comfortable on desktop and iPad.
- Test Nepali and English content lengths, long company names, high-value currency figures, and empty/loading/error states.

Prevent horizontal **page** scroll; localized table scrolling is okay when intentional. Verify action controls remain visible, keyboard focus is not clipped, tap targets >=44px, and the bottom bar does not obscure content on phones.

## 10. Acceptance criteria

- [ ] Compact / Comfortable setting persists per user/device, with sensible defaults and safe fallback.
- [ ] On 1440×900, show **more rows and/or useful detail than baseline** with measurable screenshot comparison (target 15–25% better information density).
- [ ] No duplicate screen or second global header; action positions remain identical across pages.
- [ ] Today Pickups and Returns remain prominently visible and independently usable.
- [ ] Header still 64px; action and input targets >=44px; operational controls never shrink below specified safe size.
- [ ] No truncated monetary amounts without access to the full value; no unexpected horizontal page scroll.
- [ ] No role-permission data leakage from compact or collapsed cards.
- [ ] No changes to finance/rental computations, Supabase schema, external bookings or operational transitions.
- [ ] Phone remains task-first with readable record cards and comfortable spacing.
- [ ] The app works on iPad touch with the same core desktop capabilities.
- [ ] All themes retain accessible contrast; reduced motion and focus-visible still work.
- [ ] Unit/component regression coverage for density persistence, breakpoint resolution, and card/table rendering.

## 11. Verification, delivery and restrictions

Use a new branch such as `design/smart-compact-density-v1`, make incremental commits, and open a PR with before/after screenshots and measured above-fold improvements. Do not merge unless the user separately authorizes it.

Run existing checks:
```bash
npm run typecheck
npm run lint
npm test
npm run build
npm run check:contrast
```
