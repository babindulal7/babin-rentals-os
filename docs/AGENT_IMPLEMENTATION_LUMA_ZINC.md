# Local coding agent directive — Babin Rentals OS / Luma Full UI trial

**Goal:** On a NEW LOCAL branch, apply screenshot preset `b1aJD8RZg`'s Luma + Zinc + Emerald Black/Light visual design to Babin Rentals OS including the table style, cards, menus, forms and reports. First use the bundled installer and inspect its diff; then complete a native UI audit of each shared component and the routed screens. NEVER push GitHub, deploy, merge or touch live Supabase.

## Authority and guardrails

Read `AGENTS.md`, `docs/00_READ_FIRST.md`, `CLAUDE.md`, `docs/PERMISSIONS.md`, most recent `RULINGS-*.md`, current `PROGRESS.md`, local design tokens and responsive layer. Preserve all application logic, including: Return makes usable physically received units bookable after persisted Return independently of pending Cleaning/QC/Reset tasks (damage/hold exceptions continue), 06:00–06:00 Kathmandu rental day, paise integer financial arithmetic, VAT, stages, invoice/record revisions, branch grants, record audit/CRUD, latest money-blind role gating, unit retention/audit, stock delta/retirement constraints. UI does not grant unauthorized features. Do not inject fake records or figures in production reports. No changes to backend schemas, RLS or migrations.

## 0. Inspect BEFORE modification

- Check `git status --short`; preserve user work. Create branch `local/shadcn-b1aJD8RZg-luma-full-ui` only if it does not exist; no force/reset.
- Verify `src/main.tsx` import order: canonical theme → zinc palette → ui-v2 → responsive → Luma styling. Check only ONE preset black-light import and no earlier Olive override.
- Compare current `src/components/ui/{DataTable,Table,Card,Button,Input,Select,Modal,ReportToolbar}.tsx`, `src/styles/{theme,ui-v2,responsive}.css`, `src/modules/reports/reports.css`, `src/components/ui/charts/InteractiveRevenueTrend.tsx`.
- Official preset decodes to: `style=luma`, `baseColor=zinc`, `theme=emerald`, `chartColor=blue`, `font=inter`, `fontHeading=inherit`, `radius=medium`, `iconLibrary=lucide`, `menuColor=default`, `menuAccent=subtle`. Treat Inter/Lucide as reference rather than overriding Babin's authoritative offline self-hosted typography and Tabler icon contracts.

## 1. Full screen-level design acceptance

| Surface | Adopt Luma/Zinc UI | Preserve |
|---|---|---|
| Global shell | rounded control shapes, neutral nav, subdued separators | Header actions, collapsible nav, global search/add, touch layout |
| Tables | compact soft round shell, soft header, readable borders, hover, accessible selection | sorting, column semantics, server filter/pagination, mobile records |
| Forms | aligned labels and controls, restrained focus wash, error hierarchy | real per-section save rules, mandatory inputs, guarded submission |
| Dialogs/menus | soft elevation and zinc fills | focus trap, close, z-index, portal, Escape, touch sheets |
| Cards/KPIs | Luma soft elevation and balanced spacing | live/verified data only, scoped dates, role-based masking |
| Reports | same premium table/toolbar styling, blue-first chart tokens | source provenance, no mock data presented as real, nepali dates, exports |
| Today/Operations | improve visual consistency only | picker/return workflow, scan gates, custody audit, no fabricated success |
| iPad/phone | coherent reflow, swipe/tap and zero page horizontal overflow | 768/1280 breakpoint law, 44px and 56px verb sizes |

Use only the authorized React visual layer; do not swap the entire `DataTable` or Base UI Dialog implementation with generic shadcn code.

## 2. How to approach upstream 'Full preset'

Run `npx shadcn@latest apply --preset b1aJD8RZg` **only in a separate initialized disposable shadcn scratch project** to see the actual JSX/CSS differences; the Babin app does not use shadcn's conventional `components.json` baseline. Compare upstream Luma Button, Table, DataTable, Input, Card, Dialog, DropdownMenu, Chart, Select, Sidebar and Sheets individually. Port visual recipes, composition and ergonomics into existing Babin components under their current props/event/role guards. Do not silently turn on unavailable TanStack sorting/filters or Recharts; treat those as separate explicitly tested dependencies/features. The bundled patch is the safe first stage, NOT upstream byte-identical full import.

## 3. Verification and reporting

Run typecheck, targeted new Vitest test, full unit tests, lint, contrast, PGlite + lifecycle in local mode, and build; then open app on 390/800/1194/1280/1920 widths; test standard Light and Black, existing Glass and high contrast separately. Test keyboard, VoiceOver, mobile horizontal overflow and same action positions. Record a checklist with `PASS`, `FAIL`, or `NOT TESTED` and capture screenshots for Today, Rentals, Reports, Add Equipment, Record Editor and operations. Do not write a fake pass based on static tests.

Leave changes UNCOMMITTED until user approves review; afterward commit locally. Never push/merge/deploy.
