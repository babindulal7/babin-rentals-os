> **Historical archive restored from closed unmerged PR #17 (15 Oct 2026).** Reference only: `PLAN.md`, `docs/00_READ_FIRST.md`, current `docs/PRODUCT_RULES.md`, `docs/PERMISSIONS.md`, and later rulings/code take precedence. Archiving does not implement or approve any proposal.

# Babin Rentals OS — Product, Technical, App Flow, UI/UX and Schema Redesign Blueprint

> **Document type:** Comparative PRD + TRD + App Flow + UI/UX Design Brief + Schema Map + Implementation Plan  
> **Prepared:** 15 October 2026 (Nepal)  
> **Repository:** babindulal7/babin-rentals-os — reviewed main at f1bce01fef73bdfadbd73097a56a924293aad288  
> **Status:** DESIGN PROPOSAL / DOCS ONLY. Not an implemented UI change or production certification.  
> **Scope:** Existing app only. No new app/repository; no deployment, merge, live Supabase change, production data rewrite, permission widening or business-rule rewrite.

## 0. Read This Before Implementing

The supplied screenshots show a generic six-artifact planning sequence: (1) PRD, (2) TRD, (3) App Flow, (4) UI/UX brief, (5) backend schema and (6) implementation plan. They are **documentation categories**, not a design system to copy pixel-for-pixel. In particular, the screenshot's example social-media tables (posts, followers, likes, chats) and its menu of alternative technology stacks are unrelated to an equipment-rental operations product.

Use the repository authority order in docs/00_READ_FIRST.md and AGENTS.md. When this proposal conflicts with CLAUDE.md, docs/PERMISSIONS.md, newer rulings, docs/PRODUCT_RULES.md or verified code, **higher authority wins**. Do not infer an implementation result from the existence of a plan. Changes require fresh, same-commit test evidence.

### 0.1 Evidence reviewed

- README.md, AGENTS.md, package.json, src/App.tsx and src/data/nav.ts.
- docs/00_READ_FIRST.md, docs/CURRENT_STATE.md (dated 4 October and therefore not a fresh live status), docs/ARCHITECTURE.md, docs/WORKFLOWS.md, docs/UI_UX_RULES.md, docs/ONE_HEADER_ACCEPTANCE.md, docs/UI_UX_IMPROVEMENT_PLAN.md, docs/RULINGS-2026-10-14.md and docs/OPEN_DECISIONS.md.
- src/components/shell/Header.tsx, src/styles/theme.css, src/modules/rentals/NewRental.tsx, src/modules/operations/OperationsQueues.tsx, src/modules/reports/Pulse.tsx and src/modules/reports/RevenueReport.tsx.
- GitHub PR state on 15 October Nepal time: PRs #2, #4 and #5 merged; PRs #1, #3, #6, #7, #10, #11, #12, #13, #14 and #16 open. Re-query before any implementation; branches are concurrently changing.
- Six screenshots supplied by the product owner, interpreted only as a framework for specifications.

### 0.2 Design goal

**A premium but calm cinema-equipment rental operating system.** An operator should know what needs attention, what can be done now, what must be verified and whether the database committed the action—without looking through redundant headers, decorative graphics, repeated cards or misleading figures.

**Not a rebuild.** Preserve: existing 11-sidebar destination order; one 64px application header; business engines; role/permission enforcement; custody workflow; integer-paisa pricing; AD/BS support; 06:00–06:00 operational day; 13% VAT; immutable payments; RLS; offline non-custodial outbox; current tokens and typography.

---

## 1. Screenshot-to-Repository Gap Analysis

| Reel artifact | Current verified repository evidence | Gap to close through design / engineering | Priority |
|---|---|---|---|
| **#1 PRD** | Product laws, 11 destinations, permissions, working action domains, open-decision register | One concise role-based task catalogue, success measures, error/empty states and page-level acceptance | P1 |
| **#2 TRD** | React 18, strict TypeScript, Vite 5, Tailwind 4, Supabase/Postgres/RLS, Dexie, PGlite; Electron/Capacitor wrappers | An explicit map from each visual control to an existing action/query, RLS contract and platform QA | P0/P1 |
| **#3 App Flow** | App route table, New Rental in-place form, six booking stages and four floor verbs; desktop dock | Operator-first route map, task entry paths, blocked/pending states, phone/tablet flows | P1 |
| **#4 UI/UX Brief** | Shared 64px header, semantic tokens, typography, tabular money, page shells; recent unified-action PR merged | Screen templates, consistent secondary-actions policy, density, filters, overlays, responsive evidence | P1 |
| **#5 Schema** | Existing Postgres migrations, domain tables, transactional RPCs and RLS | Reader-friendly ERD, mapping to pages, reporting provenance and live-schema-gap checklist; no social-app schema | P0/P2 |
| **#6 Plan** | Active app-wide UX plan, CI gates and GitHub PRs | A dependency-aware page-by-page implementation plan with explicit stop/go checks and test artefacts | P1 |

### 1.1 Findings that change the design recommendation

1. **Do not create a second header.** PR #4 was merged and Header.tsx already registers unified search, add, primary and more actions. Design the *existing* header.
2. **Do not turn New Rental into a five-page wizard.** docs/UI_UX_RULES.md rejects Next/Previous navigation for complex rental creation. Keep the existing continuous sections, jump navigation and summary rail.
3. **Do not undo the Operations desktop dock.** PR #5 merged. At desktop width the queue stays visible beside the active job; at narrower widths use the current sheet/full-height floor treatment.
4. **Do not invent new statuses or database transitions.** Preserve the current backend stage machine and distinct Reset/Cleaning work.
5. **Do not redesign reporting around fabricated examples.** RevenueReport.tsx still contains fallback constants, so the next engineering review must trace *whether and when* those values can appear in live mode. PRs #6, #7, #12 and #16 overlap reporting/data concerns and must be reconciled before modifying report components.
6. **Treat security as a release dependency.** Open PR #1 concerns anonymous RPC grants. Do not treat proposed documentation, green local UI tests or screenshots as proof of live Supabase safety.

---

## 2. PRD — Product Requirements

### 2.1 Users, jobs and visibility

| Role/group | Top daily question | Optimized landing experience | Security rule |
|---|---|---|---|
| Owner / Admin | Is the business healthy, and what is blocked? | Today with legitimate priority alerts; permissioned Finance/Reports links | Can see money only where canonical capability allows |
| Manager / Coordinator | Which rentals must be prepared, confirmed, handed over or followed up? | Today / Rentals / Calendar with actionable dates and filters | Client balances and edits remain capability-scoped |
| Warehouse / Technician | What must I Pack, Handover, Return, Inspect or Reset? | Operations queue with first unmet gate and large action buttons | Money-blind in both payload and DOM |
| Driver / Crew | What assigned movement is next and what evidence is needed? | Relevant assignment/transport workspace | No leakage from bookings, tooltips or reports |
| Accounts | Which invoice, payment or deposit task remains? | Finance with correct invoice/client context | Immutable money operations; no speculative paid state |
| External client | Only explicitly permitted records and documents | Restricted views | Never infer access from visible navigation alone |

Use the exact role names and capabilities in docs/PERMISSIONS.md; this table describes experiences, not new authorization.

### 2.2 Core journeys and outcomes

- **Create Rental:** choose client and period → add equipment/bundles/services → optionally assign crew/delivery → review pricing and conditions → save quote/draft or confirm through existing server-validated guards.
- **Prepare Pickup:** Today/Operations queue → open rental → scan or verify required serialized units/accessories → resolve missing requirements → Pack online with persisted stage read-back.
- **Handover:** verify identity, agreement/signature and custody gates; document last-minute extra equipment/changes against the rental before releasing any unit.
- **Return / Inspect:** reconcile every physical unit/accessory and memory card; record missing/damaged/dirty equipment, late return and necessary charges through audited domain actions; never silently adjust the original financial ledger.
- **Reset:** complete cleaning/maintenance tasks and resolve unit availability accurately; do not mislabel Reset as Closed.
- **Finance & Reporting:** see only authorized, source-backed invoiced revenue, collections, receivables, utilization and margin with explicit time ranges, definitions and drilldowns.

### 2.3 Product success measures (instrument, do not invent current baselines)

- Median click/tap count per high-volume task, starting from natural entry point and ending at server-confirmed completion.
- Percentage of handovers with all required contract/payment/item-level gates satisfied.
- Percentage of returns with fully reconciled unit, accessory and damage/condition records.
- Time from opening the Operations queue to a verified Pack/Return transition.
- Search-to-record completion, escaped-menu focus recovery, mobile horizontal overflow count.
- Percentage of visible report metrics tied to named real database sources.
- Error frequency by page/action; count of permission-exposure failures should be zero.
- Test thresholds are TODO(decision) unless already ruled. Do not write fabricated KPI targets into code.

### 2.4 Always-required states

Every high-use page must explicitly design **loading, populated, empty, no-filter-match, error/retry, restricted, offline/stale, pending write, refused write and persisted success**. A field cannot show success before server confirmation. Failures appear inline; success-only toast. Never allow mock records to masquerade as real client/rental financial data.

---

## 3. TRD — Technical Requirements

### 3.1 Keep the existing stack

| Layer | Current contract | UI redesign instruction |
|---|---|---|
| Shell | src/App.tsx, src/components/shell/*, workspace context | Refactor shared surfaces, not per-page copies |
| Frontend | React 18 + strict TypeScript + React Router 7 + Vite 5 | Lazy route bundles and typed component props |
| Styling | Tailwind v4 + src/styles/theme.css + packages/design-tokens | Consume semantic variables; no scattered hardcoded colors |
| Icons / fonts | Tabler 2px outline; Outfit display, Source Sans 3 UI, JetBrains Mono numbers; Asar/Hind Nepali | Keep typography and accessibility |
| Data/read | src/lib/queries/*, data-access contracts | One source of truth per booking; server-sourced reporting |
| Writes | src/actions/* → protected PostgreSQL RPCs | No business logic in page JSX |
| DB/security | Supabase PostgreSQL + RLS; PGlite local verification | Enforce security at DB boundary; no client service key |
| Offline | Dexie non-custodial outbox | Custody transitions cannot silently queue offline |
| Distribution | Web/PWA plus existing Electron/Capacitor code | Test responsive web and physical devices separately |

### 3.2 Non-negotiable invariants

- 06:00 to 06:00 Kathmandu operational day; AD UTC for persistence and BS only for display.
- NPR amounts use integer paisa and existing money helpers; 13% VAT and rounding remain engine-owned.
- Deposit balances are liabilities, not revenue; financial revisions preserve immutable entries.
- No unauthorized money surface for Warehouse, Technician, Driver or Client; RLS must protect raw responses.
- No state transition on UI optimism: apply_booking_stage_transition must succeed online and stage is read back.
- create_booking(jsonb) remains atomic for header, lines, crew and transport.
- Idempotent writes, availability conflict enforcement and appropriate audit records.
- No destructive deletion for records that must be voided, reversed, retired or archived.
- Status always uses label + icon + semantic color, not color alone.

### 3.3 Dependency and rollout rule

Complete or explicitly reconcile in-flight safety/financial PRs before touching the same files. In particular:
- **PR #1:** security, anonymous RPC preflight. Not optional before live release.
- **PR #3 / #11:** New Rental pricing, VAT and discount correctness.
- **PR #6 / #7 / #12 / #16:** reports and real data; #12/#16 may overlap chart work.
- **PR #10:** delivery persistence semantics.
- **PR #13:** damaged UI copy.
- **PR #14:** payment invoice/client selection.

Never assume open means merged; verify on main. Do not cherry-pick conflicting UI implementations blindly.

---

## 4. App Flow — Existing Navigation, Improved Task Paths

### 4.1 Main navigation

Keep the ruled exact order (src/data/nav.ts):
1. New Rental
2. Today
3. Operation
4. Rentals
5. Calendar
6. Crew Assist
7. Inventory
8. Clients
9. Finance
10. Tools
11. Settings

Do not add Reports/Documents as duplicate root links: their existing homes and deep links are governed by current routes. Preserve URLs, URL query filters, deep links and back navigation.

### 4.2 Operational path

~~~mermaid
flowchart TD
 A["Today / Rentals / Calendar"] --> B{"Task?"}
 B -->|New booking| C["New Rental: continuous sections"]
 C --> D["Existing create_booking / confirm guards"]
 B -->|Floor work| E["Operations queue"]
 E --> F["Pack"]
 F --> G["Handover"]
 G --> H["On Rent"]
 H --> I["Return & Inspect"]
 I --> J["Cleaning / Reset, if needed"]
 J --> K["Resolve outstanding gates"]
 K --> L["Authorized Close"]
 D --> E
 B -->|Finance| M["Finance / invoices / payments"]
 M --> K
~~~

This visual is a navigation and operator model. The actual database stages are Quote → Booked → Packed → On Rent → Returned → Closed. Reset is operational work, **not** a substitute database lifecycle stage. Always use the actual engine to determine when an action is available.

### 4.3 Entry-point policy

- Today = **what is urgent now**, scoped to selected operational day.
- Rentals = **find/manage a specific rental**; list and detail are not competing dashboards.
- Operations = **do a floor job now**; desktop dock retains the next queue row.
- Calendar = **plan conflicts and upcoming reservations**; use the same booking and availability truth.
- Header search = page-scoped, preserves role and filter rules; no second fake global search box.
- Empty state calls-to-action route to the existing permitted action; unauthorized actions are absent rather than misleadingly tappable.

---

## 5. UI/UX Design Brief — "Quiet Cinema Operations"

### 5.1 Visual identity

- **Personality:** premium cinematic, confident, information-dense where appropriate, calm under pressure.
- **Colors:** existing blue primary and existing semantic status mapping; do **not** copy the reel's neon-yellow headers. Color conveys status only where ruled; blue conveys action/navigation.
- **Themes:** preserve existing light default and dark option; do not force a new dark theme.
- **Surface:** clean contrast, solid data tables, modest card elevation, no decorative background grid behind data, no oversized marketing/hero panels inside the ops app.
- **Typography:** existing self-hosted fonts and number style; readable Nepali labels and translated agreements.
- **Rhythm:** existing spacing tokens; consistent vertical alignment of the same control classes throughout all pages.

### 5.2 Single-row app header: all screens

~~~text
DESKTOP (>=1280)
┌───────────────────────────────────────────────────────────────────────────┐
│ [Current page / breadcrumb]  [Context Search]  [Add ▼] [Primary] [⋯] [Me]│ 64px
└───────────────────────────────────────────────────────────────────────────┘
[Optional page filters / tabs INSIDE CONTENT, not another global header]
[Page body / table / cards, with one contextual action owner]

PHONE (<768)
┌──────────────────────────────────────────────┐
│ [Back] [Current page]     [Search] [Action/⋯]│ 64px
└──────────────────────────────────────────────┘
[Context filters as drawer or content chips]
[Card/list rows: 44px minimum targets]
~~~

Contracts:
- One app header exactly; no duplicate title or second fixed bar masquerading as another app header.
- Page action registry owns primary action position. One primary action per current context.
- Search, Add, More and Save retain consistent relative order and click geometry.
- Contextual filters may sit within content; their state survives search, navigation and back.
- Primary controls = at least 44px; floor confirmation = at least 56px.
- Search Clear retains focus; Escape closes and restores focus; disabled actions explain the first real blocker.
- Mobile may collapse secondary actions into More but must not hide essential floor Confirm.
- Honor existing Owner/Coordinator/Warehouse role differences; do not introduce generic global Add for restricted roles.

### 5.3 Page templates

**A. Operations / Today**  
A restrained summary (small counts, real statuses, no decorative hero) → task queues ordered by existing rules → action in one step. Urgent exceptions have explicit labels, not alarming color everywhere. Never introduce fabricated KPI cards.

**B. Rentals List**  
In-content status chips and filters → searchable table on desktop, compact rows/cards on phone → selected-row menu wired to registry → pagination at a settled location → no duplicated action rows. Preserve quote, booked, packed, on-rent, overdue, returned, cancelled states as supported.

**C. New Rental**  
Keep continuous in-place sections (not wizard): (1) Client, (2) Rental period, (3) Equipment/Bundles/Services, (4) Crew, (5) Delivery, (6) Pricing & Terms. Essential sections stay accessible; optional Crew/Delivery can collapse with clear summaries. At >=1280 show sticky booking summary rail; under 1280 flow summary after fields and provide an unobtrusive review shortcut. The primary header action invokes existing server guards; Save Draft is secondary, never an extra header.

**D. Booking Detail**  
A compact booking identity/status and timeline; role-aware primary next action in shared header; child tabs/content for equipment, financial facts (authorized), documents/evidence, activity. Show first unmet gate near the action. Do not mix financial operations into floor cards.

**E. Pack/Handover/Return/Reset**  
Desktop >=1280: queue + docked job; narrower layouts: current full-height sheet/workspace. Show one compact stage overview, searchable item-level checklist, sticky Confirm or the existing shell footer. Unit-level accessory reconciliation and exceptions visible without scrolling past repeated stats. Preserve reasons/signatures and read-back behavior; keep all gates fail-closed.

**F. Inventory, Clients, Finance, Reports**  
Use a shared record workspace with fields in canonical order; one summary rail; predictable Add/Edit/Save; real empty and error states. Reports use explicit metric definition, date range, no-data state, drill-through and evidence of source.

### 5.4 Information density and responsive matrix

| Width | Navigation | Main view | Actions | Testing concern |
|---|---|---|---|---|
| 320–390px | Current mobile nav | One column, readable card rows | Header + safe bottom action | No clipped labels/keyboard overlays |
| 768px | Current tablet nav | Reflowed content, not desktop squeezed | One header, no duplicate toolbar | Long title and filters fit |
| 1024px | Tablet | Queue/list full usable width | Sheet where dock would clip | iPad touch and landscape |
| 1280–1440px+ | Desktop rail | Table + summary/dock side by side | Stable right-hand header slot | Focus, table density, zoom |

Apply container bounds for floor workspaces rather than only viewport width. Existing 900px floor layout threshold and desktop dock ruling remain intact.

### 5.5 Report chart standard

- Use real authorized datasets only. Every report names source, period, definition, freshness and units.
- Revenue trend = issued/invoiced amount; collections = settled payments; outstanding = exact invoice balance; neither deposits nor quotes count as collected revenue.
- Legend and tooltip must differentiate billed revenue, cash collected, discounts, VAT and rental utilization when shown.
- Empty results display **No data for this period**, not sample values. Errors display retry, not hardcoded fallback financial totals.
- Interactive range, compare-period, chart/table alternate view and drill-through must preserve selected filters.
- No rainbow accent palette, 3D bars, unsupported future projections or fabricated "AI insights".
- Review RevenueReport fallback constants and coordinate with PR #12/#16 rather than independently adding competing chart components.

---

## 6. Backend Schema Brief (Actual Rental Domain, Not Screenshot's Social Schema)

### 6.1 Conceptual relationship view

~~~mermaid
erDiagram
 CLIENTS ||--o{ BOOKINGS : rents
 BOOKINGS ||--|{ BOOKING_LINES : contains
 PRODUCTS ||--o{ BOOKING_LINES : selected_as
 PRODUCTS ||--o{ PRODUCT_UNITS : consists_of
 BOOKINGS ||--o{ INVENTORY_RESERVATIONS : reserves
 BOOKINGS ||--o{ BOOKING_CREW_LINES : assigns
 BOOKINGS ||--o| BOOKING_TRANSPORT : plans
 BOOKINGS ||--o{ OPERATION_SESSIONS : custody_work
 BOOKINGS ||--o{ INVOICES : billed_by
 INVOICES ||--o{ PAYMENTS : settled_by
 BOOKINGS ||--o{ DAMAGE_FINDINGS : return_findings
 PRODUCT_UNITS ||--o{ CLEANING_QUEUE_ENTRIES : reset_tasks
 BOOKINGS ||--o{ AUDIT_EVENTS : records_changes
~~~

**Important:** This is a **conceptual display**, not an authoritative SQL DDL diagram. Confirm each actual table, key, join and cardinality against current migrations and query definitions before implementing joins. Some service, bundle, reversal and invoice-link models may differ. Do not generate migrations directly from this illustration.

### 6.2 Write/read contracts to document for each screen

- Exact query/view providing fields; status and role scope; RLS/column restriction.
- Action handler and RPC; expected receipt and server-confirmed read-back.
- Error, validation and conflict states, including availability exclusion constraints.
- ID type, audit source and monotonic document numbering.
- Cancellable/voidable lifecycle instead of destructive deletion.
- Real vs mock mode separation; report aggregations must not leak seeded examples.
- Whether changed data invalidates Today, Calendar, Rentals, Inventory and Reports caches.

**No automatic schema redesign is proposed.** Only add a migration after a specific validated requirement, with locally green PGlite and lifecycle tests; remote Supabase changes require separate owner authorization and backup protocol.

---

## 7. Page-by-Page Change Matrix

| Existing page / location | Main design improvement | Starting code / document |
|---|---|---|
| Shared shell | Single header action ownership; consistent search/menus/focus | src/components/shell/Header.tsx; workspaceContext; pageActionRegistry |
| Today | Scan-first priorities; no repetitive KPI furniture; responsive movement rows | src/modules/today/* |
| Rentals | Search/filters/selection/pagination placement; no second toolbar | src/modules/rentals/RentalsList.tsx |
| New Rental | Six continuous sections; review summary, clear booking blockers, no tiny View/Add Bundle controls | src/modules/rentals/NewRental.tsx; src/modules/rentals/booking/* |
| Booking Detail | Current-stage action, concise progression and next blocker | src/modules/rentals/BookingDetail.tsx |
| Operations | Keep merged desktop dock, tablet sheet, one-column floor layout and 56px confirm | src/modules/operations/OperationsQueues.tsx; OperationsShell.tsx |
| Packing | Unit/accessory scan and reason state; prevent visual fake Save Draft | src/modules/rentals/PackingWorkspace.tsx |
| Handover | Contract, ID, signature and actual extra-unit documentation | src/modules/rentals/HandoverWorkspace.tsx |
| Return / Reset | Reconciliation, damage evidence, missing cards, reset availability | src/modules/rentals/ReturnWorkspace.tsx; ResetWorkspace.tsx |
| Calendar | Same reservations truth, navigable detail, conflict indicators | src/modules/calendar/* |
| Inventory / Bundles | Consistent edit template, availability and maintenance without status drift | src/modules/inventory/* |
| Clients / Membership | Clear identity, rental history, restrictions and gated balances | src/modules/clients/* |
| Finance / Documents | Correct linked client/invoice, reconciled VAT and immutable payments | src/modules/finance/*; src/modules/documents/* |
| Crew / Delivery | Explicit assignments, dispatch evidence and real persisted transport | src/modules/crew/*; src/modules/operations/DeliveryWorkspace.tsx |
| Reports | Only real source-backed metrics; dated comparisons and chart/table drill-through | src/modules/reports/* |
| Tools / Settings | Shared action positioning, small forms, permissioned controls | src/modules/tools/*; src/modules/settings/* |

---

## 8. Implementation Plan — Safest Order

### Phase 0 — Baseline, dependency and security hold

1. Pull latest main and list *all* open PRs, conflicts and touching files. The SHA at this document's top is a dated review snapshot.
2. Reconcile security PR #1 and money/reporting PRs before any overlapping feature work. **Do not merge or apply automatically.**
3. Run and save: typecheck, test, check:pglite, check:lifecycle, check:contrast, lint:shell, lint:progress, build, and any new scoped tests.
4. Inventory page/action bugs with screenshots at 320/390/768/1024/1280/1440, both themes and relevant roles.
5. Compare the live migration state safely via approved non-mutating checks; live writes/deploy remain forbidden in this design initiative.

**Gate:** no redesign PR uses false "everything is live ready" claims or reintroduces unauthenticated endpoints.

### Phase 1 — Shared UI contract (low-risk, greatest reuse)

- Align existing Header, PageShell/RecordWorkspace and PageActions contracts.
- Introduce shared spacing/layout/empty/error components only where not already present.
- Standardize search, filters, Add, primary, More and back-button behavior by context.
- Add action-registry assertions and keyboard/focus regression tests.

**Gate:** exactly one app header, zero duplicate primary actions and no broken deep links.

### Phase 2 — Booking creation and rental detail

- One page at a time: Rentals List → New Rental → Booking Detail.
- Clear in-place section summaries; first blocked requirement; protect unsaved edits; meaningful loading and retry.
- Verify item/bundle tap targets and duplicate-submit protection.
- Preserve pricing/invoice algorithm and coordinator capability boundary.

**Gate:** one real test booking/quote safely created in isolated environment, persisted and reopened, no mock-only "success".

### Phase 3 — Floor operations

- Preserve desktop dock already merged; tune checklist density and touch affordance.
- Unit/accessory verification, late additions, return damage and memory-card handling through existing auditable actions.
- Test interrupted network, rapid double-tap, unsaved switch, partial return, refusal and final server read-back.

**Gate:** custody only advances on successful online RPC; money-blind payloads stay blank.

### Phase 4 — Planning, inventory and clients

- Today → Calendar → Inventory/Bundles → Clients.
- Shared filters/search terminology, unit statuses, membership/credit restrictions and canonical availability truth.
- Verify empty/error/restricted states and navigation across modules.

**Gate:** record updates agree across list, detail and scheduling surfaces without a reload trap.

### Phase 5 — Money, delivery and analytics

- Finance/Documents, Crew/Delivery, Reports, Settings/Tools in that order, after related PR reconciliation.
- Replace or isolate any remaining hardcoded fallback figures from real report views. Define metric provenance and reconciliation tests.
- Add responsive line/bar/donut views only when supported by actual data, scoped rights and accessible table alternatives.

**Gate:** compare displayed aggregates to a controlled fixture database and independently validated ledger queries.

### Phase 6 — Cross-app acceptance and release preparation

- Fresh tests for every changed route and common UI interaction.
- Visual evidence across six widths, light/dark, native Safari iPad/phone, desktop 100% and 125% zoom.
- Role matrix: Owner, Admin, Manager, Coordinator, Warehouse, Technician, Driver, Accounts and external Client as applicable.
- Verify RLS using staging JWT/PostgREST, not UI-only conditional rendering.
- Performance/accessibility, offline/online/queued state, data persistence after refresh and no production credentials exposed.
- Request separate approval for **merge**, **deployment** and **live migration**. No automatic release.

### Suggested PR slicing

PR-A: shared shell design contracts and tests (no new visual routes)  
PR-B: Rentals/List/New Rental/Detail UX, after pricing PR reconciliation  
PR-C: Operations accessibility/return evidence, after current dock changes  
PR-D: Calendar/Inventory/Clients responsive patterns  
PR-E: Finance + Reports source-backed visual redesign, after report/data/security PR reconciliation  
PR-F: cross-app QA evidence and accessibility fixes

Keep each PR small, independently reversible and tied to one screen family. Do not stack unreviewed branches into main.

---

## 9. Acceptance Matrix — Definition of Done Per Page

For each page attach an evidence record:

| Check | Required evidence |
|---|---|
| Visual hierarchy and action position | Screenshot at required widths + header measurement (64px) |
| Tap sizes | Automated DOM bounds and manual touch review (>=44px, floor >=56px) |
| Role restrictions | UI + query payload + staging RLS JWT test |
| Search/filter | Typed search, empty result, Clear, Escape, focus restored, query params maintained |
| Real data | DB-backed fixture provenance, mock/live segregation; no invented rupee totals |
| Save/transition | Pending, success, refused, double-submit, reload persistence, conflict retry |
| Offline | Custody fails closed; only eligible events queue; visible sync state |
| Date/money | Kathmandu day, BS display, VAT/discount/deposit invariants |
| Navigation | Direct link, browser refresh, back/forward, no header/navigation drift |
| Accessibility | Semantic headings, tab order, dialog focus, screen-reader status, contrast |
| Release safety | Build/test outputs on the exact branch SHA; no live data changes |

### Acceptance commands

~~~bash
npm ci
npm run typecheck
npm run lint
npm test
npm run check:pglite
npm run check:lifecycle
npm run check:contrast
npm run lint:shell
npm run lint:progress
npm run build
~~~

Run additional specialized scripts when relevant. **Do not report these gates passed for this document-only PR unless they actually execute on its commit.**

---

## 10. Decisions Still Needed (Do Not Guess)

- Confirm which of the in-flight reporting PRs (#12 and #16) becomes the canonical shared chart component and whether their metrics match invoice/payment accounting rules.
- Confirm which cases of last-minute equipment additions, memory-card returns and accessory discrepancies need a new dedicated UI versus exposing an already recorded action. A visual change cannot bypass contract/payment audit requirements.
- Confirm final pagination location and selected-row menu conventions where docs/ONE_HEADER_ACCEPTANCE.md lists work outstanding.
- Confirm any product choices still pending in docs/OPEN_DECISIONS.md before schema or pricing work.
- Confirm live Supabase migration/security posture with separate controlled preflight before a deployment decision.

## 11. Deliverables from This Blueprint

1. This signed-off comparative document (PRD + TRD + App Flow + Design Brief + conceptual ERD + plan).
2. Later: high-fidelity desktop, tablet and phone **screen mockups** using actual existing semantic tokens.
3. Later: one implementation PR per screen family with a before/after screenshot set and named acceptance tests.
4. Later: production-readiness review **separate from** the UI redesign approval.

**Bottom line:** turn the six generic planning screenshots into six precise artifacts for the real rental OS, without abandoning the strong architecture already built. **Usability first; correctness and security are release gates, not tradeoffs.**
