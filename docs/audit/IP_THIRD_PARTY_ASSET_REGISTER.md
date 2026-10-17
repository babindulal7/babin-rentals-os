# Third-Party Asset & Dependency Register — Babin Rentals OS

**Prepared:** 2026-10-18  
**Repository:** `babindulal7/babin-rentals-os`  
**Branch:** `audit/ip-independence-2026-10-18`  
**Base Commit SHA:** `ad8ce1e4afc54cc88df841425d0e281bd15665bc`  
**Purpose:** Comprehensive inventory of all software dependencies, fonts, icons, media, and third-party intellectual property incorporated into or distributed alongside Babin Rentals OS.

---

## 1. Runtime Software Dependencies (`dependencies`)

| Package Name | Version | License | Upstream Origin | Usage in Application | License Obligations / Notes |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `react` | `^18.3.1` | MIT | Meta Platforms, Inc. | Core UI runtime | Standard MIT copyright notice |
| `react-dom` | `^18.3.1` | MIT | Meta Platforms, Inc. | DOM renderer | Standard MIT copyright notice |
| `react-router-dom` | `^7.1.1` | MIT | Remix Software / Shopify | Client-side routing | Standard MIT copyright notice |
| `@supabase/supabase-js` | `^2.47.10` | MIT | Supabase, Inc. | Database & Auth client | Standard MIT copyright notice |
| `@tabler/icons-react` | `^3.46.0` | MIT | Paweł Kuna / Tabler | UI iconography | Permissive MIT license; open source vector icons |
| `dexie` | `^4.4.4` | Apache-2.0 | David Fahlander | IndexedDB outbox queue | Permissive Apache-2.0 license |
| `@zxing/library` | `^0.23.0` | Apache-2.0 | ZXing Authors | Barcode scanner engine | Permissive Apache-2.0 license |
| `@zxing/browser` | `^0.2.1` | Apache-2.0 | ZXing Authors | Video camera stream capture | Permissive Apache-2.0 license |
| `gsap` | `^3.15.0` | GreenSock License | GreenSock Inc. | UI animation engine | Free for standard web use. **Flag:** Requires commercial Club GreenSock license if commercial end-user fees are charged. |
| `@gsap/react` | `^2.1.2` | Standard GreenSock | GreenSock Inc. | React animation hooks | Governed by GSAP license terms |
| `vite-plugin-pwa` | `^1.3.0` | MIT | Anthony Fu | Offline service worker | Standard MIT license |
| `@fontsource/outfit` | `^5.3.0` | OFL-1.1 | Rodrigo Fuenzalida / Google | Headings typography | SIL Open Font License 1.1 |
| `@fontsource/source-sans-3` | `^5.3.0` | OFL-1.1 | Adobe Systems Inc. | Body and table typography | SIL Open Font License 1.1 |
| `@fontsource-variable/jetbrains-mono` | `^5.3.0` | OFL-1.1 | JetBrains s.r.o. | Monospace identifiers / serials | SIL Open Font License 1.1 |
| `@fontsource/asar` | `^5.3.0` | OFL-1.1 | Sorkin Type Co | Nepali Devanagari headings | SIL Open Font License 1.1 |
| `@fontsource/hind` | `^5.3.0` | OFL-1.1 | Indian Type Foundry | Nepali Devanagari UI copy | SIL Open Font License 1.1 |

---

## 2. Development & Build Dependencies (`devDependencies`)

| Package Name | Version | License | Origin / Role | Shipped in Production? |
| :--- | :--- | :--- | :--- | :--- |
| `typescript` | `^5.7.2` | Apache-2.0 | Microsoft Corporation (Type checker) | **NO** (Build-time only) |
| `vite` | `^5.4.11` | MIT | Yuxi (Evan) You / Vite Contributors | **NO** (Build-time only) |
| `@vitejs/plugin-react` | `^4.3.4` | MIT | Vite Contributors | **NO** (Build-time only) |
| `tailwindcss` | `^4.1.11` | MIT | Tailwind Labs Inc. | **NO** (Compiles marketing CSS) |
| `@tailwindcss/vite` | `^4.1.11` | MIT | Tailwind Labs Inc. | **NO** (Build-time plugin) |
| `eslint` | `^9.39.5` | MIT | OpenJS Foundation | **NO** (Linter) |
| `@eslint/js` | `^9.39.5` | MIT | OpenJS Foundation | **NO** (Linter config) |
| `typescript-eslint` | `^8.69.0` | MIT / BSD | typescript-eslint team | **NO** (Linter plugin) |
| `eslint-plugin-react-hooks` | `^5.2.0` | MIT | Meta Platforms, Inc. | **NO** (Linter plugin) |
| `vitest` | `^3.2.7` | MIT | Vitest Team | **NO** (Test runner) |
| `@vitest/coverage-v8` | `^3.2.7` | MIT | Vitest Team | **NO** (Coverage reporter) |
| `jsdom` | `^30.0.1` | MIT | jsdom Contributors | **NO** (Test DOM environment) |
| `@electric-sql/pglite` | `^0.5.8` | Apache-2.0 | ElectricSQL (In-process Postgres) | **NO** (Migration & lifecycle CI gate) |
| `pg` | `^8.23.1` | MIT | Brian Carlson (Node Postgres client) | **NO** (DB verification scripts) |
| `supabase` | `^2.114.0` | MIT | Supabase, Inc. (CLI) | **NO** (Local database harness) |
| `electron` | `^44.4.5` | MIT | OpenJS Foundation | Desktop package host runtime |
| `concurrently` | `^10.0.5` | MIT | Kimmo Brunfeldt | **NO** (Dev task runner) |
| `wait-on` | `^9.1.0` | MIT | Jeff Barczewski | **NO** (Dev task runner) |
| `globals` | `^15.15.0` | MIT | Sindre Sorhus | **NO** (Linting environment) |

---

## 3. Font Asset Register

All typography used across the Babin Rentals OS application and marketing surfaces is self-hosted via npm Fontsource packages:

1. **Outfit:** SIL Open Font License 1.1. Author: Rodrigo Fuenzalida. Used exclusively for figures, cards, and primary page headers (600/700 weight).
2. **Source Sans 3:** SIL Open Font License 1.1. Author: Paul D. Hunt / Adobe. Used for UI labels, tables, navigation, and body copy (400, 500, 600, 700, 800 weight).
3. **JetBrains Mono:** SIL Open Font License 1.1. Author: JetBrains. Used for barcode numbers, serials, document IDs (`BK-`, `INV-`, `PAY-`), and money figures.
4. **Asar:** SIL Open Font License 1.1. Author: Sorkin Type Co. Used for Nepali script typography.
5. **Hind:** SIL Open Font License 1.1. Author: Indian Type Foundry. Used for Nepali script body copy.

**Compliance Assessment:** 100% compliant with OFL-1.1 requirements. No proprietary or commercial desktop fonts are bundled.

---

## 4. Iconography Register

1. **System Icons:** The application imports vector icons from `@tabler/icons-react` (MIT). Icons are rendered via the centralized wrapper `src/components/ui/Icon.tsx`.
2. **Custom / Proprietary Icons:** No third-party proprietary icon packs (e.g. Booqable UI icons, FontAwesome Pro) are included.
3. **PWA Application Icons:**
   - `public/icons/192.png` (Babin Rentals brand mark)
   - `public/icons/512.png` (Babin Rentals brand mark)
   - `public/icons/maskable-512.png` (Babin Rentals brand mark)
   - `public/icons/scan-96.png` (Barcode scan icon)
   - `public/favicon.ico` (Babin Rentals brand monogram)

---

## 5. Media & Binary Assets

| Asset Path | Nature / Content | Source / Provenance | Shipped in Prod Bundle? | Risk Evaluation |
| :--- | :--- | :--- | :--- | :--- |
| `public/favicon.ico` | Babin Rentals Monogram ("BR") | In-house creation | **YES** | Original asset. Low risk. |
| `public/icons/*.png` | Babin Rentals App Icons | In-house creation | **YES** | Original assets. Low risk. |
| `babin-rentals-os.7z` | 52 MB monolithic git snapshot | Committed on 2026-10-17 (`ec198b47`) | **NO** (Root file) | Unnecessary large archive in repo. Should be removed from git tracking in clean maintenance pass. |
| `docs/design/smart-intel-v1/*.png` | 3 UI reference screenshots | Committed in initial baseline (`e0c7fc17`) | **NO** (Docs only) | Internal design references. Keep under evidence retention; do not distribute. |
| `docs/diagrams/*.png` | Architecture flow diagrams | Generated by Mermaid / Playwright | **NO** (Docs only) | Original technical diagrams illustrating Babin system architecture. |

---

## 6. Prohibited & Unlicensed Asset Verification

A scan was executed across all tracked files to verify the absence of:
- **Booqable corporate logos or trademarks:** Confirmed **0** instances.
- **Third-party CSS stylesheets or scraped HTML:** Confirmed **0** instances.
- **Proprietary competitor JS bundles or sourcemaps:** Confirmed **0** instances.
- **Unauthorized client PII or live credentials:** Confirmed **0** instances.
