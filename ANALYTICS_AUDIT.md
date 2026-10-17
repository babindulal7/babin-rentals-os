# Babin Rentals OS — Interactive KPI & Analytics Audit (Phase P0)

**Date:** 2026-10-18  
**Branch:** `feat/interactive-kpi-charts` (branched from latest `main`)  
**Target Repository:** `babindulal7/babin-rentals-os` ONLY  
**Status:** P0 Complete — Source, tokens, permissions, and baseline verified  

---

## 1. Executive Summary & Audit Scope

This audit establishes the baseline and gap analysis for upgrading Babin Rentals OS with a ChatGPT-inspired interactive KPI & analytics design system. The system delivers:
- **Interactive, responsive KPI cards** with large tabular numbers, comparisons, mini trend sparklines, definition tooltips, and data provenance.
- **Multi-series interactive trend charts** with mouse crosshairs, touch tap-to-lock, keyboard arrow navigation, roving focus, accessible tables, synchronized period summary rows, and series toggles.
- **Pure SVG chart primitives** leveraging existing `--cat-1..8` categorical colors with no external chart libraries (e.g. no Recharts, Chart.js, or Framer Motion).
- **Strict non-negotiable financial laws** (Law 1 integer `Paisa`, Law 6 money-blind roles, Law 7 Kathmandu operating day, Law 15 $\ge$44px targets, and Law 16 no fabricated metrics).

---

## 2. Token & Design System Inventory

The application already has a cohesive token system in `src/styles/theme.css` and `src/styles/ui-v2.css`:

### 2.1 Categorical Palette (`--cat-1` through `--cat-8`)
*Fixed order across legends, charts, tables, and exports. Never mapped to status colors.*

| Token | Light Theme | Dark Theme | Role / Slot |
|---|---|---|---|
| `--cat-1` | `#0072b2` (Blue) | `#3b82d6` (Sky Blue) | Primary series 1 |
| `--cat-2` | `#c87a00` (Amber) | `#b87a1e` (Warm Amber) | Series 2 |
| `--cat-3` | `#009e73` (Teal) | `#249e76` (Mint Teal) | Series 3 |
| `--cat-4` | `#d55e00` (Vermillion) | `#d9613c` (Coral) | Series 4 |
| `--cat-5` | `#3d5a9e` (Slate Blue) | `#5a76c2` (Indigo) | Series 5 |
| `--cat-6` | `#b23a6b` (Rose) | `#c25588` (Berry) | Series 6 |
| `--cat-7` | `#6b7a00` (Olive) | `#7a8c3e` (Sage) | Series 7 |
| `--cat-8` | `#8b3a0e` (Rust) | `#5d71b0` (Lavender/Muted) | Series 8 / Overflow |

### 2.2 Surface & Grid Tokens
- **Chart Grid Lines:** `--chart-grid` (`#dbe5f0` in light, `#263849` in dark).
- **Surfaces & Cards:** `--card`, `--card2`, `--surface`, `--border`, `--input-border`.
- **Text & Figures:** `--text`, `--text2`, `--muted`, with `font-variant-numeric: tabular-nums`.
- **Shadows:** `--shadow-card`, `--shadow-xs`, `--shadow-modal`.
- **Primary Buttons:** `--btn-primary-bg`, `--btn-primary-fg`, `--hover-button`.

---

## 3. Role & Permission Matrix (RBAC & Financial Privacy)

### 3.1 Money-Blind Roles (Law 6)
The following roles must **never** receive or view financial numbers, amounts, currencies, financial chart series, or export columns:
1. `Warehouse` (Inventory & preparation only)
2. `Technician` (Prep & maintenance triage; money-blind)
3. `Driver` (Dispatches and pickups; money-blind)
4. `Client` (External portal user; sees only authorized contract lines)

**Rule:** Financial components, cards, amounts, and queries must be **completely omitted** (not merely hidden with CSS or blurred) when `canViewMoney(role)` is false.

### 3.2 Report-Specific Access
- `RevenueReport.tsx`: Restricted to `EXECUTIVE_ROLES` = `Owner`, `Admin`, `Manager`, `Accounts`.
- `ForecastingReports.tsx`: Restricted to Executive / Management roles.
- `AssetRoiReport.tsx` / `EquipmentPerformance.tsx`: Financial figures gated behind `useCanViewMoney()`.

---

## 4. Source Definitions & Financial Distinctions

There is **no single generic "Revenue" figure**. The analytics system enforces distinct metric definitions:

| Metric | Source Definition | Caveats / Exclusions |
|---|---|---|
| **Issued Taxable Revenue** | Sum of nonvoid issued NPR invoices by `issue_date` (AD), before VAT. | Credit notes are recorded as settlement adjustments, NOT taxable deductions. Draft and Void invoices excluded. |
| **Cash Collected** | Net settled payments posted in period after reversals and refunds. | Dated by settlement/payment date, NOT invoice issue date. |
| **Open / Active Bookings** | Non-closed, non-cancelled bookings in pipeline. | Excludes cancelled quotes. |
| **Pickups / Returns Today** | Operational business day (06:00–06:00 NPT) movements. | Reuses Today query boundaries. |
| **Equipment Utilization** | Unit rented days / eligible available unit days $\times$ 100. | Explicit denominator accounting for maintenance exclusions. |
| **Illustrative Scenario** | User-adjusted hypothetical growth rates ($10\%, 20\%, 30\%$). | **Not a prediction**. Strictly separated from actual data. |

---

## 5. Existing Components vs Reusable Analytics Primitives

| Proposed Component | Existing Foundation to Extend | Decision / Action |
|---|---|---|
| `AnalyticsKpiCard` | `src/components/ui/Page.tsx` (`KpiStrip`) | Enhance with `AnalyticsContext`, data provenance, compact display formatting (`Rs 12.5 L`), and accessible full amounts. |
| `AnalyticsKpiGrid` | `src/components/ui/Page.tsx` | Responsive grid (4 desktop / 2 tablet / 1-2 phone) with zero clipping. |
| `InteractiveTrend` | `src/components/ui/charts/InteractiveRevenueTrend.tsx` | Extend to support multi-series crosshair, touch locking, and synchronized metric rows while preserving keyboard arrows and accessible table. |
| `MultiSeriesTrend` | `src/components/ui/Charts.tsx` (`LineChart`) | Multi-series SVG trend supporting 2–8 series with `--cat-1..8`, hover/touch crosshair, and keyboard navigation. |
| `TrendSparkline` | `src/components/ui/Page.tsx` (`Spark`) | Refined SVG sparkline with accessible label and aria-hidden visual. |
| `ScenarioExplorer` | `src/modules/reports/ForecastingReports.tsx` | Pure calculation engine in `src/lib/analytics/scenarioModel.ts` with prominent "Illustrative Scenario" labeling. |

---

## 6. Baseline Verification Results

Executed on branch `feat/interactive-kpi-charts`:
- `npm run check:contrast`: **82/82 PASS** (0 failures).
- `npm run typecheck`: **0 errors** (`tsc --noEmit` passed).
- `npm run lint`: **0 warnings** (`eslint src --max-warnings 0` passed).
- `npx vitest run src/lib/intel/revenueTrend.test.ts`: **5/5 PASS**.

---

## 7. Phased Implementation Roadmap

- **P0 Audit:** Completed (this document).
- **P1 UI Foundation:** `src/lib/analytics/` (contracts, formatters, comparison, scenarioModel) and `src/components/ui/analytics/` (AnalyticsKpiCard, AnalyticsKpiGrid, TrendSparkline, AnalyticsStates) with tests and mock showcase.
- **P2 Actual Revenue Vertical Slice:** Upgrade `RevenueReport.tsx` with high-contrast interactive KPI cards and enhanced `InteractiveRevenueTrend`.
- **P3 Multi-Series Reusable Charts:** `MultiSeriesTrend.tsx` with crosshair, keyboard navigation, synchronized metric header, and series toggles.
- **P4 Operational & Asset Reports:** Equipment Performance, Asset ROI, and Today summary.
- **P5 Scenario Explorer:** Forecasting & AI scenario studio with pure formulas and explicit assumptions.
- **P6 Regression & Documentation:** Full test suite, contrast test, build verification, and PR summary.
