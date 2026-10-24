<USER_REQUEST>
BABIN RENTALS OS — shadcn/ui Reports & UX Adoption Blueprint v1.4
Prepared: 24 October 2026 (Nepal time)
Status: Local implementation and research brief — no repository edits, no live Supabase access, no deployment
Source reviewed: babindulal7/babin-rentals-os, default branch around commit [9dc9058](https://github.com/babindulal7/babin-rentals-os/commit/9dc9058837d1c163cd9332ad1ac16d5f71a20c4f), together with official [shadcn/ui](https://ui.shadcn.com/) documentation. Source inspection only, not a visual browser audit of a running OS.
Target: React 18 + Vite + TypeScript + Electron/PWA; desktop, iPad, phone.
Authority: Existing operational, financial, booking, availability, access-control, BS/AD calendar, and export engines remain authoritative.
0 — Decision
Adopt shadcn/ui as a reference system and carefully scoped code source for Reports, charts, data tables, and analytical UI. Keep Babin’s theme, routing, shell, role checks, COSS/Base UI overlays, existing PageShell and ReportToolbar. Do not paste the complete dashboard-01 block into the application. It has its own AppSidebar, SiteHeader, navigation and example data.json and would duplicate and conflict with Babin’s shell and real data.
The target is a consistent reporting product, not a gallery of unrelated graphs. Use one report header, one global report filter contract, a reusable KPI strip, an accessible chart card, and a tabular detail view. Keep the existing Today dashboard limited to pickups/returns as previously specified; richer business analytics belong under Reports.
Critical prerequisites:
1. Fix/reconcile live-data availability before styling a report as though it were working. Never show fixture-derived figures or hardcoded zeros as live.
2. Extend ReportToolbar and existing DataTableShell rather than replacing them wholesale.
3. Create a token-compatible chart wrapper with Recharts only after reviewing installation/bundle effects.
4. Maintain finance role-gating in data access, serialization, components and DOM, not just visual hiding.
5. Keep existing reports working during one-by-one migration.
1 — Verified existing implementation
|Area |Current code / status |Implication |
|-----------------------|--------------------------------------------------------------------------------------------------------------------------------------------------|--------------------------------------------------------------------------------------|
|Framework |`package.json`: React 18, Vite 5, React Router 7, `@base-ui/react`, Tailwind 4 dev tooling; **no `recharts`, no `@tanstack/react-table`** declared|Add only justified dependencies; don’t assume shadcn’s Next.js layout exists |
|Global theme |`src/styles/theme.css`: light/dark/high-contrast tokens, `--cat-1...--cat-8`, `--chart-grid`, `--card`, `--text`, etc. |Map shadcn charts into the existing tokens; don’t overwrite theme globally |
|Current charts |`src/components/ui/Charts.tsx`: bespoke `Donut`, `Legend`, `LineChart`, `GroupedBars`, `HBars` |Keep until parity tests pass; progressively migrate visualizations |
|Current revenue trend |`src/components/ui/charts/InteractiveRevenueTrend.tsx`: accessible custom SVG plus underlying HTML data table |Use as migration regression reference; preserve keyboard operation and table |
|Report toolbar |`src/components/ui/ReportToolbar.tsx`: date range, filters/chips, compare, CSV provenance, Nepal date normalization |Existing canonical engine; skin/refactor rather than reimplement |
|Live revenue report |`src/modules/reports/RevenueReport.tsx` uses `getIssuedRevenueTrend` and a custom chart |Best first live Recharts pilot, keeping issued-taxable basis and credit reconciliation|
|Live Pulse vs demo |`src/modules/reports/Pulse.tsx`: non-mock path renders **‘Not tracked yet’** KPI placeholders; richer `DemoPulse` only in `IS_MOCK` |**Do not** reuse the demo numbers for production; create real read models first |
|Catalog/template |`src/modules/reports/ReportCatalog.tsx`, `ReportTemplate.tsx` use `data/pulse.ts`’s `figuresFor` ledger |Audit provenance and gate to demo-only; no fixture-backed production report |
|Custom report |`src/modules/reports/CustomReport.tsx` imports `ROWS`, `CLIENTS_DATA`, `CASES` |Treat as demo/non-production until connected to real authorised queries |
|Rental report |`src/modules/reports/RentalReports.tsx`: KPI, `Donut`, legend, bar presentations, tables |Phase 2 graph upgrade |
|Inventory reports |`src/modules/reports/InventoryReports.tsx`: inventory-status table with some unmeasured values |Chart can visualize actual status counts; avoid invented valuations |
|Equipment report |`src/modules/reports/EquipmentPerformance.tsx`: top/bottom performing tables |Horizontal rankings chart from the **same filtered rows** |
|Responsive contract |`src/styles/responsive.css`: phone `<768px`, tablet `768–1279px`, desktop `>=1280px` |Respect these bands, plus container size for chart labels |
|Permissions |`useCanViewMoney`, PageBody/field gating, source-specific read rules |Financial series must not be fetched/rendered for unauthorized roles |
|Existing UI foundations|`PageShell`, `PageHeader`, `PageBody`, `KpiStrip`, `DataTableShell`, `ReportFamiliesNav`, `RecordWorkspace`, `cossDialog`, `cossDrawer` |No second shell, drawer system, or competing headers |
Known issue to handle before launch
Do not interpret ‘ReportCatalog has a template’ as proof it has a live source. A report is only Live when the actual permission-safe query and aggregation are wired; otherwise show Not tracked yet, with what source is missing. The sophisticated DemoPulse is a reference, not production evidence.
2 — Official shadcn/ui research & what to adopt
|Official source |Pattern/element |Babin destination |Decision / priority |
|-----------------------------------------------------------------------------------------------------------------|----------------------------------------------------------------|--------------------------------------------------------------|-----------------------------------------------------------------------|
|[dashboard-01](https://ui.shadcn.com/blocks?category=dashboard) |`section-cards`, `chart-area-interactive`, `data-table` |`/reports` overview and individual family pages |**Adapt composition, not sidebar/routes/sample data; P0** |
|[Charts — Area](https://ui.shadcn.com/charts/area) |interactive trend, gradient, multiple/stacked series |Revenue, booking/rental days, cash |**P0/P1** only for measured time series |
|[Charts — Bar](https://ui.shadcn.com/charts/bar) |horizontal, grouped, stacked, negative |Equipment ranks; bookings; cash and expenses |**P0/P1** |
|[Charts — Line](https://ui.shadcn.com/charts/line) |multi-series trends and comparison |Monthly usage, returns vs pickups, client activity |**P1** |
|[Charts — Pie](https://ui.shadcn.com/charts/pie) |donut for limited-category composition |Booking stages or fleet state |**P1**, max ~5–6 slices + table/legend; not for revenue trends |
|[Charts — Radial](https://ui.shadcn.com/charts/radial) |small KPI progress graphic |Single utilisation target, only if valid numerator/denominator|**P2**, optional, do not scatter donuts everywhere |
|[Chart docs](https://ui.shadcn.com/docs/components/base/chart) |Recharts v3, ChartContainer, tooltip, legend, accessibilityLayer|`components/ui/reports/ReportChart.tsx` |**P0** reusable wrapper |
|[Data Table](https://ui.shadcn.com/docs/components/base/data-table) |sorting, column visibility, pagination, filtering, row selection|Rental, inventory, finance report detail |**P1**; adapt TanStack only if current DataTableShell cannot meet needs|
|[Empty](https://ui.shadcn.com/docs/components/base/empty) |consistent states and recovery action |No records, no matches, unavailable metric |**P0**, reuse Babin EmptyState and copy patterns |
|[Skeleton](https://ui.shadcn.com/docs/components/base/skeleton) |chart/card/table loading placeholders |Reporting read latency |**P0**, adapt `LoadingSkeleton` |
|[Calendar](https://ui.shadcn.com/docs/components/base/calendar) |range picking & presets |ReportToolbar period picker; Calendar date controls |**P1**, use Nepal BS/AD converter instead of replacing it |
|[Command](https://ui.shadcn.com/docs/components/base/command) |searchable commands |Global command menu, searchable report catalog |**P2**, merge with existing search, no duplicate popup |
|[Input Group](https://ui.shadcn.com/docs/components/base/input-group) |search prefix, clear action, suffix, helper controls |Client, inventory, bundle, report search |**P1** adapt existing InputGroup |
|[Sidebar](https://ui.shadcn.com/docs/components/base/sidebar), [sidebar-07](https://ui.shadcn.com/blocks/sidebar)|grouped nav, icon-collapse affordance |Existing global nav |**P2 reference only**; do not install a second provider/navigation |
|[Resizable](https://ui.shadcn.com/docs/components/base/resizable) |accessible adjustable split panels |Desktop inventory/report detail inspector |**P2**; not a phone implementation |
|[Sheet](https://ui.shadcn.com/docs/components/base/sheet) |side panel for supplementary detail |Tables’ drill-down actions |**Reuse COSS Drawer**, not new overlay stack |
|[shadcn MCP](https://ui.shadcn.com/docs/mcp) |local AI registry discovery |Local coding agents |Optional, must inspect generated diff and dependency versions |
Do not copy full login/signup blocks, the shadcn sample datasets, its AppSidebar/Next.js page files, or any hardcoded #chart-1 theme. Do not install everything in one CLI call.
3 — Proposed Reports UI layout
Desktop ≥1280px
EXISTING BABIN SHELL & NAV (no duplicate sidebar)
┌─────────────────────────────────────────────────────────────────────────────────────┐
│ Reports / Revenue [period ▼] [Compare ▼] [Filters] [Export ▼] │
│ Issued taxable revenue · source + last updated + currency NPR │
├────────────────┬────────────────┬────────────────┬──────────────────────────────────┤
│ Taxable revenue│ Invoice count │ Average invoice│ Change vs preceding date range │
│ value + basis │ value + unit │ if measurable │ labelled comparison, not guess │
├─────────────────────────────────────────────────────┬───────────────────────────────┤
│ PRIMARY CHART: monthly revenue (full labels, tooltip,│ Insight/definition rail │
│ data table link, aria, interactive range) │ Exact basis / missing data │
├─────────────────────────────────────────────────────┴───────────────────────────────┤
│ DETAILS TABLE [Search] [Columns] [Sort] [pagination] [Open source transaction] │
└─────────────────────────────────────────────────────────────────────────────────────┘
iPad 768–1279px
● Existing collapsible nav; chart full width; KPI 2x2; metrics and insight rail stack.
● Larger touches (≥44px); chart tooltip works by tap; no hover-only data.
● Report filter as compact overflow; table horizontally scrolls with identifier/actions kept findable; no forced desktop-width chrome.
Phone <768px
● Single header row with report name + Filters and Export in a working menu.
● KPI 2-column where legible or 1-column when narrow, respecting text scaling.
● A single major chart with 6–8 x-labels max and exact accessible table below.
● Details switch to accessible labelled row cards for wide tables; maintain meaningful sort/filter controls.
● No sidebars, nested scroll traps or chart tooltips beyond viewport bounds.
Report detail card contract
Every chart card has title, exact measure/basis, time window, filter summary, data state, accessible figure, view-as-table, source and drill-through. Avoid a chart when all rows are absent or provenance is unverified. If comparing, label both periods explicitly.
4 — Chart selection by data, not aesthetics
|Report |Recommended chart |Authoritative source to verify |Data restrictions |
|----------------------------|------------------------------------------------------------------------------------|----------------------------------------------------------------------------------------------|-------------------------------------------------------------------------------------------------|
|Revenue (`/reports/revenue`)|Interactive area (single current series), optional prior-period line or grouped bars|`getIssuedRevenueTrend` and invoice issue date; existing taxable basis & credit reconciliation|Never include VAT as taxable sales; voids/credit notes separately labelled; reconcile sums |
|Rentals (`/reports/rentals`)|Booking status stacked bar + rental days line |Existing RentalReports query result / actual rental days |Booking-stage counts distinct from physical item availability |
|Equipment performance |Horizontal bar: top 10 by revenue, second view by rental days/utilisation |`getEquipmentPerformanceSummary` |Hide monetary ranking, amounts & tooltip from money-blind roles; never infer from displayed order|
|Inventory |Horizontal stacked status counts + underlying status table |`getInventoryReportSummary` |Respect serialised versus quantity stock, dated availability, condition rules |
|Operations |Grouped columns: pickups vs returns; completion fraction |Existing operation reports & real movement rows |Don’t infer completed work from a click, only recorded sessions/events |
|Clients |New vs returning count chart **only if** real historical identity query supports it |Client reports/query needs audit |Do not infer customer retention from current total |
|Finance |Revenue versus expense comparison, cash flows as distinct series |Finance queries, reconciled invoice/payment source |Cash ≠ accrual revenue, profit ≠ bank balance; display measure definitions |
|Maintenance |Monthly maintenance cases/downtime bars |Damage/maintenance records |Missing cost or durations = not measured, not zero |
|Bundles |Rankings by verified rental count / availability if query exists |Bundle and rental queries |Don’t fabricate bundle attribution |
|Today dashboard |**No business charts** |Today pickup & return boards |Preserve ‘pickups and returns only’ ruling |
Chart selection law: time → line/area; ranking → horizontal bar; part-of-whole → compact bar/donut; stages → stacked bars; precise detail → table. Don’t default everything to doughnuts and gauges.
5 — Technical architecture
5.1 Preferred component layering
src/components/ui/reports/
ReportChart.tsx // Recharts display wrapper, accessible table and chart states
ReportChartCard.tsx // header, metric basis, filter summary, source, table toggle
ReportKpi.tsx // existing KpiStrip styling adapted from shadcn section-cards
ReportDataTable.tsx // existing DataTableShell first; TanStack later if needed
ReportEmpty.tsx // reuse EmptyState with truthful reason and remedy
reportChartTokens.css // scoped token remapping, no global theme overwrite
src/modules/reports/
RevenueReport.tsx // first pilot using existing live query
RentalReports.tsx // second
EquipmentPerformance.tsx
...
Never duplicate ReportToolbar, PageShell, PageHeader, PageBody, ReportFamiliesNav, useCanViewMoney, BS/AD formatter, or money parser.
5.2 Dependency checks
● package.json presently does not contain recharts or @tanstack/react-table.
● Pilot: add Recharts compatible with the current React/Vite/TypeScript lockfile (official shadcn chart docs use Recharts v3). Review peer dependencies, SVG/a11y, performance, SSR assumptions, tree shaking and Electron renderer size.
● shadcn copied components may depend on Tailwind utility classes, cn(), components.json aliases and chart variables. Existing Babin CSS often uses inline styles and app tokens. Audit every copied class and import; if it compiles but paints nothing, it is not done.
● Do not overwrite existing src/components/ui/Charts.tsx until all usages are accounted for.
● If TanStack is adopted later, pin the tested major version; official Data Table guide currently describes v9. Don’t blindly paste a v9 snippet onto a v8 install.
● Feature-flag the new chart on one route, with fast fallback to the existing verified visualization.
5.3 Theme mapping
Use chart custom properties under a scoped .babin-report root:
.babin-report {
--chart-1: var(--cat-1);
--chart-2: var(--cat-2);
--chart-3: var(--cat-3);
--chart-4: var(--cat-4);
--chart-5: var(--cat-5);
--chart-6: var(--cat-6);
--report-chart-grid: var(--chart-grid);
color: var(--text);
}
Retain app data-theme='light'|'dark'|'high-contrast'; test all themes. Use fill="var(--chart-1)" not hsl(var(--chart-1)) (official Recharts v3 note). Limit accents; preserve semantic status colors. No colorful gradients as decoration or miniature unreadable legends.
5.4 Adaptation pattern (illustrative, no dummy data)
// Read existing authorised live result, transform for the chart without inventing rows.
const report = useIssuedRevenueTrend(filters) // pseudocode: reuse real getIssuedRevenueTrend read path
const chartRows = report?.months.map(month => ({
period: month.periodStartUtc, // validate actual RevenueMonth property names in code
amountPaisa: month.amountPaisa,
})) ?? []
return (
<ReportChartCard
title="Issued taxable revenue"
basis="Before VAT; issued invoice date"
source="Finance · issued invoices"
>
{/* Render chart ONLY if authorised, verified data is present. */}
<ChartContainer config={chartConfig} className="min-h-[240px] w-full">
<AreaChart accessibilityLayer data={chartRows}>
<CartesianGrid vertical={false} />
<XAxis dataKey="period" tickFormatter={formatPeriod} />
<ChartTooltip content={<ChartTooltipContent />} />
<Area dataKey="amountPaisa" stroke="var(--chart-1)" fill="var(--chart-1)" />
</AreaChart>
</ChartContainer>
<RevenueDataTable rows={chartRows} />
</ReportChartCard>
)
Important: This is architecture pseudocode, not drop-in compile-ready code; confirm actual query API, RevenueMonth fields, ChartConfig, numeric unit conversion, and shadcn chart imports in the current checked-out revision. Existing formatMoney() expects integer paisa; never pass rupees as paisa or vice versa. Ensure axes and tooltips use one consistent unit.
5.5 Data integrity and interaction contracts
● Fetch one filtered, authorised dataset per report scope; derive KPI, chart, table, and export from it, unless a separate backend aggregation has explicit reconciliation tests.
● Date filters come from ReportToolbar; persist route query state as appropriate. Dates are Nepal-local with BS+AD labels and explicit timezone. Rental day boundary remains 06:00 to 06:00, not midnight.
● Query output must disclose Last updated, currency, tax basis, data source and missing-field limits.
● Previous period comparison uses equal-duration contiguous windows and explicit labels; never combine two datasets as one unlabeled series.
● Chart hover/tap → exact values; click chart point → verified filtered detail, no fabricated drill-through.
● Empty = empty, unavailable = unavailable, loading = skeleton, restricted = restricted; not zero.
● CSV provenance, filters and figures must match the current report. Preserve buildReportCsv() path and no success toast before export completion.
● For money-blind roles, do not fetch finance endpoints, put money in chart props/hidden DOM, leak tooltip arrays or reveal sorting derived from revenue.
● Handle partial returns as recorded; return availability follows the user’s rule (returned usable units can be booked despite pending cleaning/QC), with damaged/lost/maintenance exceptions. Do not let a chart silently reintroduce ‘Reset required for availability’.
● Existing permissions and workflows must pass before visual changes are considered complete.
6 — Global app UX ideas from shadcn/ui (beyond Reports)
|Priority|Pattern |Where it improves Babin |Local action |
|--------|---------------------------------------------|-------------------------------------------------|-------------------------------------------------------------------------------------------------------------------------|
|P1 |Dashboard KPI `section-cards` |Owner’s Reports overview, Equipment Performance |Standardize card title, primary value, previous period, definition, navigation; no duplicate Today dashboard |
|P1 |Form Field / Input Group |Add Client, Add Equipment, Add Bundle, Membership|Cleaner labels/errors/helper text; **section saving requires real backend support**, not decoration |
|P1 |Data Table |Rentals, Inventory, Reports |Consistent column menus, stable row actions, faceted filters, better density; preserve sticky actions and phone row cards|
|P1 |Skeleton + Empty + Alert |All pages |One meaningful state for loading, no records, no matches, permission denied and server failure |
|P1 |Calendar range |Reports period picker and calendar overlays |Preserve Nepal BS/AD and Sunday-first / Saturday weekend; no imported US-date business logic |
|P1 |Compact chart tooltip & accessible legend |Reports, owner analytics |Tap/keyboard friendly exact values; underlying accessible table |
|P2 |Command palette |Global Search/Add (existing slots) |Search actions/clients/equipment/booking by role; avoid multiple search overlays |
|P2 |Context Drawer/Sheet pattern |Edit Equipment, Client Detail, Booking Detail |Use **existing** COSS Drawer; implement resizable inspector only if helpful |
|P2 |Sidebar-07 grouped navigation |Global shell |Take icon-collapse hierarchy patterns only; don’t duplicate Babin nav/sidebar |
|P2 |Collapsible/Accordion sections |Creation forms |Predictable Save section state; robust partial draft persistence after backend work |
|P3 |Resizable panels |Reports on desktop and Equipment Detail |Saved layout widths, keyboard accessible; collapse to one column on iPad/phone |
|Reject |Stock shadcn dashboard-01 layout copied whole|Everywhere |Conflicts with current shell, route architecture, tokens and permissions |
|Reject |Charts added to pickup/return Today dashboard|Today |Contradicts existing intended scope |
7 — Incremental implementation gates
Phase 0 — Data/auth/source validation (must precede visual rollout)
● Trace all report routes from src/App.tsx, ReportCatalog, dedicated reports and role gates.
● Create a ReportSourceStatus inventory: live, demo, not_tracked, permission_restricted, error.
● Ensure mock-only data in ReportCatalog, ReportTemplate, CustomReport, and DemoPulse never poses as production business data. Do not wipe existing data to fix display provenance.
● Compare RevenueReport financial basis with underlying invoice/credit-note queries, validate date filtering and aggregations.
● Acceptance: all production rendered monetary figures have an authorised query path; missing metrics explicitly say not tracked; no seeded ranking shown to users.
Phase 1 — Shared Report Chart primitives & live Revenue pilot
● Add and lock compatible Recharts; adapt official ChartContainer, ChartTooltip/Legend, accessible table and chart-1 tokens.
● Build 1 live RevenueReport chart with period range + prior-period comparison only when data supports it.
● Screenshot test light/dark/high-contrast, desktop/iPad/phone, reduced motion, 200% zoom; compare against existing chart.
● Acceptance: chart total matches existing report and CSV for the same date basis; tooltip and screen-reader table agree; no duplicate nav.
Phase 2 — Reporting family polish
● Roll out consistent KPI strip, chart card, table and source metadata to Rentals, Inventory, Equipment Performance, Operations, Finance where live data exists.
● Build charts only for supported queries; no KPIs inferred from undocumented source.
● Link chart selection and report filter to the same query state, not two independent states.
● Acceptance: row drill-through and exports reflect identical filters; row-level security and money-blind roles pass.
Phase 3 — Tables and empty-state system
● Reuse DataTableShell initially; add TanStack only after measuring unmet requirements.
● Centralize actionable states: loading, empty, no-match, restricted, stale, error.
● Acceptance: focus management, table row actions, sorting, data density and 44px touch targets all remain intact.
Phase 4 — Cross-app UX patterns
● Bring proven Input Group, Field, Command, Calendar range and drawer composition selectively into Add Client/Equipment/Bundle, membership, global search, calendars.
● Keep COSS/Base UI wrappers and scoped tokens; don’t convert all pages to shadcn at once.
● Acceptance: no duplicate layout, lost focus, missing footer, or cross-theme mismatch.
8 — Regression test checklist (do not skip)
Financial
● Taxable revenue excludes VAT; void/credit-note behavior retains current contract.
● Reconciliation: sum of chart rows == report total == exported rows after the same filter.
● Empty financial data is not an invented NPR 0 unless the authoritative query returned measured zero.
Roles
● Warehouse / Technician / Driver cannot read or see money, including chart datasets, tooltips, exported CSV, sorting, offscreen DOM and API calls.
● Owner / Admin finance read works only through existing grants; Coordinator limited per current rules.
Dates
● AD YYYY-MM-DD validation, BS date display, Nepal timezone, Sunday week start, Saturday weekend.
● Rental operational day remains 06:00–06:00 even if the calendar picker groups by civil day.
● Compare periods don’t leak into future/unknown buckets.
UX, themes and a11y
● Recharts wrapper has a height before first measurement; responsive under parent width and 150–200% zoom.
● Keyboard/tap chart values and a meaningful HTML data-table alternative.
● Existing high-contrast theme satisfies textual/chart distinction without relying on color alone.
● Chart and table show the same sorted/filtered data; tooltip matches table row.
● Phone: no clipped hover UI, no lateral page overflow, no overlapping filter footer.
● No source data becomes displayed by importing the shadcn data.json sample.
Commands to ask local agent to run
npm ci
npm run typecheck
npm run lint
npm test
npm run build
npm run check:contrast
npm run lint:shell
Plus existing Reports-specific tests and screenshot/a11y validation in available local test tooling. Do not state a command passed unless it actually ran.
9 — Ready-to-paste coding agent instruction
> Work **locally only** in `babindulal7/babin-rentals-os`; DO NOT push/merge/deploy, run production migrations, mutate live Supabase, or copy fixture data to production. First inspect latest main/working tree and compare it with this 24 Oct 2026 research brief; existing changed code wins over stale paths. Refactor the existing Reports UI by **adapting official shadcn/ui `dashboard-01` composition and shadcn Charts (Recharts)** while preserving Babin PageShell, theme tokens, ReportToolbar, date engine, money formatting, role gating, data query contract and existing COSS/Base UI dialogs. Start with `src/modules/reports/RevenueReport.tsx` and a scoped chart wrapper; do not add a second sidebar or Today analytics page. Make empty/restricted/not-tracked states explicit. Before displaying new live reports, trace and eliminate fixture-data presentation in production from ReportCatalog/ReportTemplate/CustomReport and distinguish it from verified sources. One verified, fully tested report migration at a time. Provide diffs, exact commands and results, before/after screenshots for desktop (1440px), iPad (1024/768px) and phone (390/360px), plus accessibility/permission report. Preserve booking operations, inventory, lifecycle, customer data and Return availability rules; never invent data or claim success until the DB write/read returns it. Stop and report if required schema or permission change would need production authorisation.
10 — Official reference links
1. Main: https://ui.shadcn.com/
2. Dashboard block: https://ui.shadcn.com/blocks?category=dashboard
3. Chart architecture (Base UI + Recharts v3): https://ui.shadcn.com/docs/components/base/chart
4. Area charts: https://ui.shadcn.com/charts/area
5. Bar charts: https://ui.shadcn.com/charts/bar
6. Line charts: https://ui.shadcn.com/charts/line
7. Donut/pie charts: https://ui.shadcn.com/charts/pie
8. Data tables: https://ui.shadcn.com/docs/components/base/data-table
9. Empty states: https://ui.shadcn.com/docs/components/base/empty
10. Skeletons: https://ui.shadcn.com/docs/components/base/skeleton
11. Calendar: https://ui.shadcn.com/docs/components/base/calendar
12. Input groups: https://ui.shadcn.com/docs/components/base/input-group
13. Command palette: https://ui.shadcn.com/docs/components/base/command
14. Sidebar: https://ui.shadcn.com/docs/components/base/sidebar
15. Resizable: https://ui.shadcn.com/docs/components/base/resizable
16. Local agent MCP: https://ui.shadcn.com/docs/mcp
Outcome: Source-grounded implementation brief. Not an assertion that any UI change, test, live financial query, or backend modification has been completed.
</USER_REQUEST>
<ADDITIONAL_METADATA>
The current local time is: 2026-10-24T13:03:14+05:45.
</ADDITIONAL_METADATA>