# IP Origin Audit & Engineering Baseline — Babin Rentals OS

**Prepared:** 2026-10-18  
**Repository:** `babindulal7/babin-rentals-os`  
**Branch:** `audit/ip-independence-2026-10-18`  
**Base Commit SHA:** `ad8ce1e4afc54cc88df841425d0e281bd15665bc`  
**Working Tree Status:** Clean  
**Auditor / Agent:** Google Antigravity (Phase 0 Read-Only Baseline)  

---

> [!IMPORTANT]
> **Legal Notice:** This document is an engineering provenance audit and remediation proposal. It does **not** constitute legal advice or a binding declaration of non-infringement. Contractual adherence (terms of service), trade dress, copyright expression, and trademark separation are distinct legal questions requiring qualified IP counsel review.

---

## 1. Executive Summary & Audit Scope

This audit evaluates the codebase of Babin Rentals OS to identify, segregate, and remediate intellectual-property, licensing, trademark, and visual-similarity risks arising from the historical use of Booqable as an observational reference and migration source.

### Key Baseline Findings:
1. **No Proprietary Vendor Code Imported:** All application logic in `src/` is independently authored TypeScript/React code complying with internal Babin Rentals business rules (paisa integer money math, Nepal BS calendar, 06:00 operational day, 4-stage rental lifecycle, strict RLS). No reverse-engineered, decompiled, or vendor-proprietary source code was found.
2. **Vendor-Branded Shipped Artifacts:** One active React component (`src/components/ui/BooqableRentalFilterDrawer.tsx`) and its test suite carry competitor-branded identifiers. The component already exports a neutral alias `RentalFilterDrawer`.
3. **Retired Integration Scaffolding:** Ruling R-36 (9 Sep 2026) formally retired the Booqable integration and deleted `src/lib/booqable/`. However, an orphaned script (`scripts/run-full-sync.ts`) remains in the repository attempting to import non-existent code.
4. **Internal Design Observation Documents:** Extensive historical observation documents exist under `docs/booqable/` and `docs/BOOQABLE_DESIGN_PRINCIPLES.md`. Under evidence preservation rules, these are retained as design history but must remain segregated from production bundles.
5. **Open Source & Assets:** All UI icons are open-source Tabler Icons (MIT). All UI fonts (Outfit, Source Sans 3, JetBrains Mono, Asar, Hind) are open-source (OFL-1.1). GSAP is used under GreenSock licensing and requires commercial entitlement confirmation if end-user fees are charged.
6. **Referenced External Local Folder:** `Desktop/scrape/BOOQABLE-AUDIT` is marked **NOT REVIEWED** in accordance with standing safety rules.

---

## 2. Package & Runtime Boundary Classification

The repository contains distinct classes of files with differing production bundle exposure:

| Classification | Paths | Shipped in Production Bundle? | Risk Profile |
| :--- | :--- | :--- | :--- |
| **Client Web Bundle** | `src/`, `index.html`, `packages/design-tokens/` | **YES** (Compiled into `dist/`) | High scrutiny: no third-party trademarks, proprietary code, or uninspected assets permitted. |
| **Marketing Web Bundle**| `src/marketing/`, `marketing.html` | **YES** (Compiled into `dist/marketing.html`) | Clean: 0 vendor mentions, pure brand copy and Tailwind styles. |
| **Static Assets** | `public/` (`favicon.ico`, `icons/*.png`, `robots.txt`) | **YES** (Directly copied to `dist/`) | Clean: Original Babin Rentals brand icons, no external vendor logos. |
| **Electron Harness** | `electron/main.cjs` | **YES** (Desktop package wrapper) | Clean: Minimal Chromium shell wrapper. |
| **Database Migrations** | `supabase/migrations/` | **NO** (Applied to Postgres DB) | Server-side SQL schema, tables, GiST exclusions, RLS policies. |
| **Local Verification Scripts**| `scripts/` | **NO** (CLI / Node tools only) | Contains inert orphaned sync script `run-full-sync.ts`. |
| **Documentation & Evidence**| `docs/`, `tasks/`, `PROGRESS.md`, `PLAN.md` | **NO** (Internal documentation only) | Contains historical observation logs (`docs/booqable/`). Preserved as evidence. |
| **Committed Archives** | `babin-rentals-os.7z` | **NO** (52 MB git repository snapshot) | Monolithic snapshot committed on 2026-10-17. |

---

## 3. Repository Search Inventory (Keyword Analysis)

A repository-wide audit was conducted for keywords: `booqable`, `bookable`, `clone`, `copied`, `scrape`, `reverse engineer`, `verbatim`, and related competitor terms.

### 3.1. Shipped Code & Test Matches (`src/`)

| File Path | Nature of Match | Classification | Remediation Plan (Phase 1) |
| :--- | :--- | :--- | :--- |
| `src/components/ui/BooqableRentalFilterDrawer.tsx` | Component name, interface, and preset constant `BOOQABLE_PRESETS` | **Competitor Branding** | Rename file to `RentalFilterDrawer.tsx`, rename component to `RentalFilterDrawer`, rename constant to `RENTAL_PRESETS`. |
| `src/components/ui/__tests__/BooqableRentalFilterDrawer.export.test.tsx` | Test suite name and imports | **Competitor Branding** | Rename file to `RentalFilterDrawer.export.test.tsx`, update imports and describe block. |
| `src/modules/rentals/RentalsList.tsx` | Imports `BooqableRentalFilterDrawer` | **Competitor Branding Import** | Update import to `RentalFilterDrawer`. |
| `src/components/ui/QuickActionPanel.tsx` | Comment: *"inspired by Booqable's top operational bar"* | **Superfluous Comment** | Neutralize comment to describe operational speed verbs. |
| `src/modules/rentals/LineItemTree.tsx` | Comment: `{/* Booqable Stock Availability Badge */}` | **Superfluous Comment** | Replace with `{/* Stock Availability Badge */}`. |
| `src/lib/acousticFeedback.ts` | Comment: *"per Booqable audit §11"* | **Superfluous Comment** | Replace with standard barcode acoustic feedback rationale. |
| `src/lib/authAudit.ts`, `src/lib/exportAudit.ts` | Comments: *"Booqable logs neither"* | **Comparative Comment** | Clarify Babin enterprise audit logging standard without vendor reference. |
| `src/lib/bundleCapacityView.ts`, `src/lib/pricingStructures.ts` | Comments referencing Booqable adoption specs | **Comparative Comments** | Refactor comments to state Babin mathematical invariant and operational rules. |
| `src/lib/dataAccess.ts` | Architectural comment detailing R-36 retirement of Booqable bridge | **Historical Architecture Note** | Keep architectural ruling record or neutralize vendor name to `legacy-external-bridge`. |
| `src/lib/datePresets.ts` | Comment referencing Booqable preset logic | **Superfluous Comment** | Refactor comment to standard weekly calendar logic. |
| `src/lib/rbac.ts` | Comment comparing granular RBAC vs legacy model | **Superfluous Comment** | State Babin granular RBAC design directly. |
| `src/modules/inventory/AddBundle.tsx` | Comment: *"the real catalogue is Booqable-shaped"* | **Superfluous Comment** | Reword to *"standard rental equipment catalogue structure"*. |
| `src/data/bundleIntel.ts`, `src/lib/serviceDue.ts`, `src/modules/rentals/booking/itemCatalogue.ts` | Generic word "bookable" ("Bookable now", "Partially bookable", "unit stays bookable") | **Harmless Domain Language** | **Retain.** "Bookable" is standard English dictionary rental terminology (able to be booked). |

### 3.2. Script Matches (`scripts/`)

| File Path | Description | Status | Remediation Plan |
| :--- | :--- | :--- | :--- |
| `scripts/run-full-sync.ts` | Historical CLI script importing `../src/lib/booqable/sync` | **Orphaned / Inert** | The import target does not exist (deleted in R-36). Script cannot run. Archive or neutralize. |

### 3.3. Internal Documentation Matches (`docs/`)

| File Path | Description | Classification | Recommendation |
| :--- | :--- | :--- | :--- |
| `docs/booqable/*` (21 files, e.g. `REFERENCE_SPEC_v2.5.md`) | Historical feature specs and observational comparisons | **Preserved Evidence** | **Do NOT delete or rewrite history.** Retain in internal docs; ensure excluded from all builds. |
| `docs/BOOQABLE_DESIGN_PRINCIPLES.md` | Distilled operational principles (speed, density, live counts) | **Preserved Evidence** | Retain in internal documentation. |

---

## 4. Comprehensive Provenance Matrix

| Asset / Module | Author / Origin | Creation Evidence | License / Rights | Shipped? | Reviewer Assessment | Recommendation |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **Design Tokens** (`packages/design-tokens/src/index.ts`, `src/styles/theme.css`) | Babin Rentals Team | `DESIGN_DIRECTION_SPEC_v4.1.md`, WCAG AA contrast suite | Proprietary | YES | Original palette (`#d96518` gold, slate elevations), independently calibrated. | Retain as proprietary system. |
| **Fonts** (Outfit, Source Sans 3, JetBrains Mono, Asar, Hind) | Upstream Type Designers (via Fontsource) | `package.json`, `src/main.tsx` | SIL Open Font License 1.1 (OFL) | YES | Standard open source web fonts. Full license compliance. | Retain; catalog in Third-Party Register. |
| **Icons** (`@tabler/icons-react`) | Tabler Org | `package.json`, `src/components/ui/Icon.tsx` | MIT License | YES | Open source SVG icon library. | Retain; catalog in Third-Party Register. |
| **Barcode Library** (`@zxing/library`, `@zxing/browser`) | ZXing Authors | `package.json`, `src/components/ui/BarcodeScannerModal.tsx` | Apache 2.0 | YES | Standard open source barcode decoder. | Retain. |
| **Animation Library** (`gsap`, `@gsap/react`) | GreenSock | `package.json` | GreenSock Standard / Commercial License | YES | Free for standard web use; commercial fee license required if charging end-users. | Counsel to review commercial distribution model. |
| **Database Engines & RLS** (`supabase/migrations/`) | Babin Rentals Team | `docs/PERMISSIONS.md`, R-01 to R-44 rulings | Proprietary | Server SQL | Independently created schemas, GiST exclusion constraints, and RLS policies. | Retain. |
| **BooqableRentalFilterDrawer** (`src/components/ui/`) | Babin Rentals Team | Commit logs, Vitest suites | Proprietary | YES | Code is original React/TypeScript; name carries competitor trademark. | Rename to `RentalFilterDrawer` in Phase 1. |
| **Reference PNGs** (`docs/design/smart-intel-v1/*.png`) | Committed in initial baseline `e0c7fc17` | Git commit log `e0c7fc17` | Unclear / Internal Reference | NO (docs only) | Internal design reference images. Not shipped in application bundles. | Retain under evidence hold; do not distribute. |
| **Desktop Scrape Folder** (`Desktop/scrape/BOOQABLE-AUDIT`) | Local filesystem reference | N/A | Unknown / Not Inspected | NO | External directory. Not accessed or scraped. | Mark **NOT REVIEWED**; defer to counsel. |

---

## 5. Vendor Integrations & API Status

- **Booqable API Calls:** **NONE.** Search of all code and network configurations reveals 0 outbound HTTP calls, webhooks, or API requests to Booqable servers (`*.booqable.com`).
- **Bridge State:** Ruled out entirely on 9 September 2026 under Architectural Ruling **R-36**. The module directory `src/lib/booqable/` was excised from the codebase.
- **Orphan CLI Tool:** `scripts/run-full-sync.ts` attempts to import deleted file `../src/lib/booqable/sync`. It fails immediately if executed in Node and is completely isolated from the web/desktop application build.

---

## 6. Phase 0 Conclusions & Gate 0 Submission

The repository contains **no unauthorized source code or proprietary assets**. Identified risks are strictly limited to:
1. Competitor naming in component `BooqableRentalFilterDrawer.tsx`.
2. Historical comparative comments in internal implementation files.
3. An orphaned, non-functional CLI script.
4. Internal reference documentation and images that must remain excluded from production builds.

All core rental mechanics, financial calculations, and user flows are original, independent implementations designed specifically for Babin Rentals' operational model in Nepal.
