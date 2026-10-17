# IP Risk Register — Babin Rentals OS

**Prepared:** 2026-10-18  
**Repository:** `babindulal7/babin-rentals-os`  
**Branch:** `audit/ip-independence-2026-10-18`  
**Base Commit SHA:** `ad8ce1e4afc54cc88df841425d0e281bd15665bc`  
**Review Status:** Phase 0 Read-Only Baseline Complete  

---

## Risk Severity Definitions

- **HIGH:** Potential legal liability, direct trademark infringement in shipped binary, or unauthorized source code inclusion.
- **MEDIUM:** Competitor-named identifiers in public components, ambiguous commercial license terms, or pre-existing build blockers.
- **LOW:** Superfluous comments in internal source files, orphaned non-functional scripts, or unhygienic repository artifacts.
- **INFO / RETENTION:** Historical evidence and design notes preserved under legal hold guidelines.

---

## Itemized Risk Inventory

| Risk ID | Category | Item / Path | Status | Severity | Remediation Owner | Recommended Action |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **RISK-01** | Competitor Branding / Trademark | `src/components/ui/BooqableRentalFilterDrawer.tsx` | **Confirmed** | **MEDIUM** | Frontend Lead / Agent | Rename file to `RentalFilterDrawer.tsx`. Rename component, interface, and `BOOQABLE_PRESETS` constant to neutral terms (`RentalFilterDrawer`, `RentalFilterDrawerProps`, `RENTAL_PRESETS`). Keep existing functionality intact. |
| **RISK-02** | Competitor Branding | `src/components/ui/__tests__/BooqableRentalFilterDrawer.export.test.tsx` | **Confirmed** | **LOW** | QA Lead / Agent | Rename test file to `RentalFilterDrawer.export.test.tsx` and update imports/descriptions to match `RentalFilterDrawer`. |
| **RISK-03** | Competitor Import | `src/modules/rentals/RentalsList.tsx` | **Confirmed** | **LOW** | Frontend Lead / Agent | Update import statement from `BooqableRentalFilterDrawer` to `RentalFilterDrawer`. |
| **RISK-04** | Superfluous Comment | `src/components/ui/QuickActionPanel.tsx` | **Confirmed** | **LOW** | Frontend Lead / Agent | Remove comment stating *"inspired by Booqable's top operational bar"*. Replace with neutral functional description of operational speed verbs. |
| **RISK-05** | Superfluous Comments in Shipped Logic | `LineItemTree.tsx`, `AddBundle.tsx`, `pricingStructures.ts`, `authAudit.ts`, `exportAudit.ts`, `acousticFeedback.ts`, `rbac.ts` | **Confirmed** | **LOW** | Core Engine Lead / Agent | Clean comparative comments referencing competitor adoption specs. Retain Babin business and mathematical invariant descriptions directly. |
| **RISK-06** | Dead Legacy Integration Script | `scripts/run-full-sync.ts` | **Confirmed** | **LOW** | DevOps / Agent | Script imports non-existent `../src/lib/booqable/sync` (deleted under R-36). Script is completely inert. Deactivate or archive to `scripts/archive/` to prevent confusion. |
| **RISK-07** | Design Observation Notes (Evidence Retention) | `docs/booqable/` (21 files) and `docs/BOOQABLE_DESIGN_PRINCIPLES.md` | **Confirmed** | **INFO** | Project Lead / Legal Counsel | **Preserve evidence.** Do not delete, squash, or rewrite git history. Verify that documentation is completely excluded from production build outputs (`dist/`). |
| **RISK-08** | External Scrape Directory | `Desktop/scrape/BOOQABLE-AUDIT` | **NOT REVIEWED** | **INFO** | User / Legal Counsel | In accordance with Standing Safety Rule 3 & Scope Lead 8, external scrape folders were **not accessed or scraped**. Status is strictly marked **NOT REVIEWED**. Requires separately authorized legal review if counsel deems necessary. |
| **RISK-09** | Monolithic Archive in Git | `babin-rentals-os.7z` (52 MB root file) | **Confirmed** | **LOW** | Repository Admin | Monolithic snapshot committed on 2026-10-17 (`ec198b47`). Does not ship in production web bundle, but clutters repository history. Propose safe removal from working tree in post-audit hygiene pass. |
| **RISK-10** | Third-Party Commercial Licensing | `gsap` / `@gsap/react` | **Suspected** | **MEDIUM** | Commercial / Legal Lead | GSAP is free for standard web use, but GreenSock's "Commercial License" (Club GreenSock) is required if Babin Rentals OS is sold as a commercial SaaS product charging multiple clients. Confirm deployment and commercial licensing model. |
| **RISK-11** | Baseline Typecheck Blocker | `src/lib/queries/__tests__/salesVatReports.test.ts:136` | **Confirmed** | **MEDIUM** | Test / Financial Engine Lead | Pre-existing type error on `main` (`taxableAmount` vs `taxAmount` on `SalesInvoiceItem`). Must be logged and resolved to ensure full typecheck pass before Gate 1 PR merge. |

---

## Detailed Evidence & Remediation Notes

### RISK-01: `BooqableRentalFilterDrawer.tsx`
- **Current State:** The component resides in `src/components/ui/BooqableRentalFilterDrawer.tsx`. It already exports `export const RentalFilterDrawer = BooqableRentalFilterDrawer` at the bottom of the file as an alias.
- **Evidence:** The file contains original React state logic, filter drawer composition, and Babin domain facets (`statusFilter`, `projectTypeFilter`, `quickFilter`, `subOn`, `stageCounts`, `money`).
- **Remediation Plan:** Perform an in-place neutral rename to `RentalFilterDrawer.tsx`. Update the component name to `RentalFilterDrawer` and rename `BOOQABLE_PRESETS` to `RENTAL_PRESETS`.

### RISK-06: `scripts/run-full-sync.ts`
- **Current State:** The script has:
  ```typescript
  import { runFullPull } from '../src/lib/booqable/sync'
  ```
- **Evidence:** The directory `src/lib/booqable/` does not exist on disk. `Test-Path "src/lib/booqable"` returns `False`. The integration was deleted on 9 Sep 2026 (Ruling R-36).
- **Remediation Plan:** The script is completely dead code. In Phase 1, archive or remove this orphaned script.

### RISK-07 & RISK-08: Historical Observation Documents & External Folder
- **Guidance:** Per Standing Safety Rule 4: *"Preserve evidence: do not delete/squash/rewrite Git history, destroy screenshot/reference archives, or discard provenance records."*
- **Action:** Retain `docs/booqable/` internally. Vite and Electron configurations already exclude `docs/` from the production distribution bundle. External folder `Desktop/scrape/BOOQABLE-AUDIT` is left untouched and marked **NOT REVIEWED**.

### RISK-10: Commercial Licensing for GSAP
- **Guidance:** If Babin Rentals OS is utilized solely as an internal proprietary operating system for Babin's own rental business operations, the standard GreenSock license applies. If the OS is distributed to external rental businesses for a recurring subscription or license fee, a GreenSock Business Green license is required.
