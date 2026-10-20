# Babin Rentals OS — Precision Cinema Aesthetic Direction v1.0
Status: Proposed design direction; not an implemented code change
Date: 20 October 2026
Scope: Existing Babin Rentals OS app on desktop, iPad/tablet, and phone.
Primary objective: Make the entire internal rental-management app visually coherent, premium, fast to scan, and safe to operate.

## 1. One-sentence concept
Precision Cinema: a calm, clear, equipment-operations command center with the craftsmanship of professional cinema tools and the usability of a mature enterprise application.
Visual adjectives: exact, restrained, structured, confident, tactile, reliable.
Not: gaming RGB, endless gradients, inflated glass, giant pills, inconsistent colorful charts, faux camera dials, or bloated dashboard widgets.

### Guiding rules
1. **The job is primary.** Users should recognize what is due, where equipment is, and what action is next in under five seconds.
2. **Color carries meaning.** Blue = primary actions and reserved/booked; yellow = packing/work in progress; orange = out with client; green = received/available/settled; red = overdue/broken/blocked; gray = neutral/inactive. Every colored state also has a text label.
3. **Calm surfaces.** Use neutral backgrounds, whitespace, restrained border/shadow/elevation, and sparse accent use.
4. **One shell, many workflows.** Same header height, search, Add, Save/Confirm, overflow, menus, filters and action locations on all pages.
5. **Density without confusion.** Scannable tables on desktop/iPad; task cards and carefully staged actions on phone.
6. **Cinema flavor comes from craft.** Crisp numbers, technical metadata, asset imagery and clearly drawn timelines—not decorative clapperboards everywhere.
7. **Safety before style.** Contrast, role-based hiding, touch targets, and operational visibility override artistic preference.

## 2. Theme strategy

### A. Precision Light — default daily workspace
- Canvas `#EAEFF5`
- Cards/surfaces `#FFFFFF`
- Primary ink `#0F172A`
- Secondary ink `#334155`
- Muted ink `#526075`
- Primary action blue `#2456D6`
- Selected state neutral dark `#1E293B`
- Navigation active accents blue, not a rainbow of module colors
- Clean, cool white space; subtly defined table rows; minimal shadows

### B. Obsidian Studio — premium optional dark theme
- Canvas `#04080D`
- Navigation `#050B12`
- Main cards `#0F1B2A`
- Raised cards `#13233A`
- Primary ink `#F1F5F9`
- Primary action blue `#386AF7`
- Muted ink `#9EAABB`
- Same semantic status mapping as light, adjusted text/fill contrast
- No bright gradients across entire data surfaces; preserve separation of layers

### C. Frosted Optics — optional finish
- Existing light/dark glass toggle remains available.
- Apply subtle translucency only to floating navigation, dialogs, menus or presentation-oriented surfaces.
- Never blur: dense financial tables, packing checklists, forms, barcode identifiers, price values, low-signal warehouse displays, and critical safety warnings.
- Glass is not default. Always honor reduced motion and high-contrast preferences.

*Important:* Current source code already defines these themes and palettes. Treat the values above as existing baselines, not a demand to overwrite all colors. Audit visual consistency before changing tokens.

### Semantic state rules (existing contract)
| Concept | Color role | Intended examples |
|---|---|---|
| Primary | Blue | Add / Save / Confirm, Booked, Issued |
| In progress | Yellow | Packing, inspection, maintenance, due soon |
| Outside warehouse | Orange | On rent, picked up |
| Settled / home | Green | Returned, available, paid |
| Risk | Red | Overdue, damaged, blocked, unpaid |
| Neutral | Gray | Quote, draft, closed, inactive |
| External | Existing distinctive outline treatment | External / sub-rented equipment |

Never use a color as the only indicator. Preserve current CSS custom-property status mapping and `lib/status.ts` as semantic authorities.

## 3. Typography
Reuse existing self-hosted fonts (offline-safe):
- **Outfit 600/700** for page titles, KPI figures, and prominent metric headings, minimum 16px.
- **Source Sans 3** for control labels, tables, operational copy and forms.
- **JetBrains Mono** for item codes, serials, booking references and identifiers only.
- Existing Nepali font strategy (Asar/Hind on Nepali selection) must remain functional.

Recommended hierarchy (validate against existing typography tokens):
- Page name: 24–28px, weight 600–700.
- Section heading: 17–20px, weight 600.
- KPI value: 26–32px with tabular numerals and right-aligned numeric columns where applicable.
- Body/table: 14–16px, not smaller than readable operating conditions permit.
- Helper/meta: 12–13px where contrast and legibility are acceptable.

Numbers must not shift horizontally when values change. NPR values and BS/AD dates must use consistent formatting and explicit labels where ambiguity exists.

## 4. Physical composition and component feel
- **Spacing system**: 4px base, 8px common step, 16px card interior, 24px major content separation. Prefer named existing tokens.
- **Corners**: button 8px, input 8px, card 10px, modal 12px; not oversized rounded pills.
- **Height**: header 64px, action/touch targets at least 44×44px, table rows generally at least 56px when operational actions are present.
- **Borders**: subtle separators for grouping; distinguish inputs and selected states clearly.
- **Shadows**: one quiet level for a surface and stronger only for true overlays.
- **Iconography**: one consistent stroke family with restrained sizes; no emoji for operational states.
- **Motion**: brief 120–200ms fades and state transitions; do not move button locations, bounce KPI values, or animate checklists during scanning. Support reduced motion.
- **Images**: equipment thumbnails should be sharp, consistently cropped, opt-in where useful, and secondary to item name/status/serial.

## 5. The global shell
### Desktop ≥1280px
- Left navigation: existing 256px expanded or 64px icon rail.
- Global header: one fixed 64px row; title/breadcrumb left; global search center; Add + contextual primary action + overflow right.
- Main work area: responsive bounded columns, not giant cards stretching across ultrawide screens without purpose.
- Filters: existing left FilterDrawer pattern on list pages. Do not add a second, competing filter system.
- Optional right contextual detail/peek on asset, rental or client selection.

### Tablet 768–1279px (including iPad)
- Same conceptual desktop information architecture; nav starts as collapsible compact rail.
- Keep touch targets at least 44px and avoid hover-only controls.
- Let data panels reflow into two columns; keep operational side-panel content usable.
- Do not create a second separate iPad app or shrink desktop text indiscriminately.

### Phone <768px
- Existing bottom-navigation shell continues.
- Dashboard becomes a prioritized task feed and 2×2 metrics if space allows.
- Tables become purposeful row cards with one visible dominant action.
- Filters and operations become full-height or nearly full-height sheets with explicit Back/Next/Confirm.
- Never rely on horizontal page scroll to reach critical booking information.

Keep existing breakpoints: 768 / 1280; modify the shared responsive layer if needed, not isolated per-page queries.

## 6. Page-specific art direction
### Today — the operational command center
Hierarchy: 1) four role-safe KPI tiles 2) urgent task queue 3) pickups and returns 4) compact trend/usage visualizations only when role permits.
- One existing Today page only; do not create a duplicate Smart Operational Center.
- First screen tells staff what must be handled now, by whom, and in which order.
- Distinguish: Needs packing, Ready for handover, Expected return, Overdue/Issue.
- Color-coded status must still include a clear word label.
- Owner/Finance users may see revenue insights where already permitted; Warehouse/Technician/Driver must not receive finance values in DOM or tooltips.
- Owner metrics must not displace shift-critical operational tasks.
- Action buttons fixed: Continue packing, Start return, Inspect, Resolve issue.

### Rentals list
- One strong primary booking identifier/client column, date range, equipment summary, stage/status, and action.
- Filter drawer on left; selected filters shown as removable neutral chips.
- Row typography distinguishes client/project/booking ID without mixing too many weights.
- Status block at same column location across rows; row action consistently right-aligned.

### Rental detail
- Top summary: identity, current status, equipment and dates.
- Clear existing operational progression: Packing → Handover → Return → Inspection → Reset.
- Show one primary next action, consistent right-side header position.
- Quotes, invoices, audit history, duplicates and cancellation belong in secondary action groups.
- Prefer a clear activity/timeline with timestamps to decorative progress rings.

### Inventory
- Compact, recognizable thumbnail optional; product name and serial dominate.
- Tiny mono identifiers where appropriate, stable availability/status, location and condition.
- Distinguish grouped stock, individual serialized assets, bundles, and sub-rentals without relying on color alone.
- Equipment cards should present at most six glance lines; expanded detail in a side peek.

### Operations
- Follow existing modal/overlay workflow, callable from anywhere, not a second system of pages.
- One operation per step, large status label, clear checklist, counts, scan feedback and Back/Next/Confirm.
- Make serial and missing/damaged evidence impossible to overlook.
- Confirmation should summarize consequences before committing.

### Finance & Reports
- Less decorative dashboarding and more comparison-ready values.
- Four metric tiles maximum per KPI row; graphs aligned to table data and permissions.
- Use consistent date controls, chart legends, currency ticks, and textual change summaries.
- Empty states should explain why a chart has no data, not invent points or show misleading zeros.

## 7. Component consistency laws
- Exactly one primary action per page context, in the same header slot.
- Add globally available only where permissions permit; no competing bright CTA per card.
- Semantic variants: primary, secondary, ghost, danger; consistent hover/focus/disabled states.
- Consistent search dimensions, menus, filters, empty states, toasts, confirmations and skeletons.
- All forms: predictable label placement, required markers, inline validation, Save/Cancel location.
- All tables: repeated sort/filter/control placement; action column fixed.
- The color system cannot change per module. A status means the same thing everywhere.
- External rental visual treatment must remain distinctive and tested.

## 8. Design and engineering guardrails
Do not change rental billing logic, 06:00-to-06:00 rental-day boundaries, invoice math, VAT logic, invoice statuses, permission rules, RLS, RPCs, Supabase migrations, or live data as part of an aesthetic release.
Keep architectural sources authoritative:
- `src/styles/theme.css`: color, radii, shadows, sizing tokens
- `src/styles/ui-v2.css`: component appearance reading the tokens
- `src/styles/responsive.css`: shared responsive layout law
- `src/components/shell/Header.tsx`: single-row action architecture
- `src/components/shell/Sidebar.tsx`: navigation rail and side structure
- `src/lib/theme.tsx`: light/dark/glass selection
- `src/data/nav`: navigation configuration and role filtering
- `src/lib/status.ts`: semantic status meaning

Currently, app and marketing theme approaches are partially divergent. Treat token unification as a separate reviewed work item to prevent accidental repaints.

## 9. Proposed implementation sequence
### Phase 0 — Screenshot and inventory audit (no modifications):
- Capture current Today, Rentals, Rental Detail, Inventory, Calendar, Operations, Finance in light and dark on desktop, tablet, phone.
- List all button inconsistencies, duplicate status treatments, misaligned headers, cramped tables, excessive UI treatments, contrast failures.
- Output an inventory matrix of reusable components and violations. Record baseline screenshots.

### Phase 1 — Foundation polish:
- Normalize only the existing shell components and shared primitives, not one-off CSS in each page.
- Standardize typography, spacing, field density, shadows, action locations and mobile touch interactions.
- Do not rewrite working navigation or semantic status logic.

### Phase 2 — Today and Rentals:
- Apply the same visual hierarchy to KPI cards, urgent task list, pickups/returns and stage timeline.
- Reuse existing operations overlay and role gates.

### Phase 3 — Inventory, clients, operations, finance:
- Normalize cards, details, filters, row heights, interaction feedback, charts and empty states.
- Audit phone and iPad usability at real widths.

### Phase 4 — Verification:
- Perform keyboard and touch navigation checks.
- Inspect contrast, dark mode, reduced-motion and permission restricted views.
- Capture and review before/after screenshots with representative live-looking but non-sensitive test data.
- Validate baseline scripts, investigate preexisting failures instead of attributing them to aesthetic changes.

## 10. Acceptance checklist
- In five seconds, any staff user can identify the next urgent rental action on Today.
- One header/action placement across routes.
- Same button, field, chip, status, table, dialog and filter visual language across modules.
- Default Precision Light, optional Obsidian Dark and subtle Glass.
- No critical text placed over translucent busy backgrounds.
- Same status words/colors on all pages, accessible without color vision.
- Desktop ≥1280, tablet 768–1279, phone <768 tested.
- Financial data does not appear in the rendered DOM for money-blind roles.
- Current app logic, external rental flags, operations flow and time policy preserved.
- Tests, CI and before/after screenshot review pass.
