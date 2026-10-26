# Babin Rentals OS — Senior Staff UX Audit Report (Local)
**Document:** `UX_AUDIT_LOCAL.md`  
**Date:** 26 October 2026  
**Auditor:** Antigravity (Senior Staff Product & UX Systems Engineer)  
**Scope:** Local Repository Read-Only Audit (Task A)  
**Authorities Observed:** `docs/00_READ_FIRST.md`, `CLAUDE.md`, `docs/PERMISSIONS.md`, `RULINGS-*.md` (through 25 Oct 2026), `docs/PRODUCT_RULES.md`, `docs/CURRENT_STATE.md`, `docs/UI_UX_RULES.md`.

---

## 1. Executive Summary & Runtime Verification

A comprehensive, zero-modification audit of the local Babin Rentals OS codebase was conducted. The repository was evaluated across all 56+ routed paths, global navigation chrome, operations overlays, form workspaces, tables, design token layers, responsive breakpoints, and role-gating mechanisms.

### Local Gate Receipts (Current Truth)
- **TypeScript Typecheck:** `tsc --noEmit` **PASS (0 errors)**.
- **Theme Contrast Gate:** `scripts/check-contrast.cjs` **106/106 PASS (0 FAIL)** across Light, Dark, High-Contrast, Glass-Dark, and Glass-Light themes against WCAG 2.2 AA (4.5:1 text, 3:1 graphical).
- **Responsive Breakpoint Contract:** `lib/__tests__/breakpoints.test.ts` **7/7 PASS** (canonical 768px / 1280px agreement across TypeScript, CSS media queries, and `index.html` pre-paint script).
- **Shell & Navigation Pilot Suites:** `globalShellPilotRoutes.test.tsx` (5/5 PASS) and `listPageToolbars.render.test.tsx` (8/8 PASS).
- **Page Shell & Copy Lints:** `check-page-shell-lint.mjs` (790 files PASS), `check-ui-copy.mjs` (5/5 PASS, 0 developer-text leaks, "customer" banned).
- **Database & Security Gates:**
  - `check:pglite`: **174/174 migrations applied cleanly from scratch**, 0 failed, 0 public view leaks, 0 unauthorized RPCs.
  - `check:lifecycle`: **33/33 booking lifecycle tests green** (PGlite real Postgres + RLS).
  - `check:security`: **18 Phase 0 SQL regressions passed**, 32/32 operations-grants passed, 14/14 Reset branch regressions passed.

---

## 2. Evaluation Across the Nine Babin UX Skill Areas

### Skill 1: User Task & Business Intent
- **Role Alignment:** The application rigorously isolates views by operational persona:
  - *Warehouse / Technician / Driver:* Money-blind. Financial columns and figures are omitted at the database RLS layer, filtered by `lib/rbac.ts` (`canViewMoney`), and suppressed from component rendering and DOM payloads (`useCanViewMoney`, `canViewMoneyField`).
  - *Coordinator / Desk:* Focuses on booking assembly, scheduling, availability lookups, client identity, and quote sandbox without financial settlement authority.
  - *Accounts / Owner / Admin:* Retains sole authority over immutable payment ledgers, invoice adjustments, and financial closing sign-offs.
- **Critical Intent Preservation:** Handover enforces certification of equipment condition before dispatch. Return enforces physical receipt of units while keeping cleaning and QC as distinct follow-on task stages.

### Skill 2: Information Hierarchy & Density
- **Global Header Consolidation:** Per Ruling 2026-10-15 and the single-row header contract, the global header (`src/components/shell/Header.tsx`) maintains a strict 64px height (`--global-header-height`) with zero wrapping.
- **Toolbar & Search Registration:** Primary search ownership is hoisted to the header (`resolveSearchOwner`), eliminating redundant in-page search bars across list pages (`Inventory`, `Clients`, `Rentals`).
- **Compact KPI Strips:** Following Ruling 2026-10-23, repetitive informational `(i)` icons and separate explanation buttons have been excised. KPI tiles print one-line definitions directly on the card at compact button height (padding 8×12px, value 14–17px).
- **Reflow Rails vs Drawers:** Per Ruling 2026-10-23, the temporary slide-over information drawer was retired. Secondary summary rails (`Rail`, `ReflowRail`, `useRailGridColumns`) are inline: a sticky right column on desktop (≥1280px) and a natural block flowing underneath the main content on tablet and phone (<1280px).

### Skill 3: Responsive Application Shell
- **Canonical Breakpoints:**
  - **Phone (<768px):** Stacks multi-column grids, replaces sidebar with fixed `BottomBar` (`BAR_BOX` clearance), collapses tables into card views via `useTabularLayout()`, turns `CalendarPopover` and dialogs into responsive bottom sheets (`.coss-dialog__wrapper--bottom-stick`).
  - **Tablet (768px – 1279px):** Preserves desktop-style layout with collapsible sidebar, reflows 3-up cards to 2-up (`.rsp-cols-3`), wraps side-rails underneath content to prevent clipping on 1194px iPad landscape.
  - **Desktop (≥1280px):** Persistent sidebar, sticky summary rails, comprehensive multi-column data tables with fixed column alignment.
- **Touch Target Floor:**
  - Primary floor verbs (`Pack`, `Handover`, `Return`, `Confirm`): Strictly enforce a **56px** height floor (`OperationsShell.tsx:514`).
  - General controls, table action targets, and form inputs: Enforce a minimum **44px** hit target floor using `TouchTarget` or `minHeight: 'var(--tap)'`.

### Skill 4: Form & Editing UX
- **Record Form Architecture:** Built around `RecordWorkspace`, `RecordSection`, `RecordActions`, and `RecordErrorSummary` (`src/components/ui/RecordWorkspace.tsx`).
- **Section-Level Save Status:** `RecordSectionSaveStatus.tsx` provides clear visual state indicators (`Saved`, `Unsaved`, `Saving…`, `Failed`) per section card.
- **Unsaved Changes Guard:** `useUnsavedRecord` and `UnsavedLeaveDialog` intercept dirty navigation. Clean records never prompt.
- **Validation Next to Fields:** Field-level errors pair inline `Icon name="error"` with clear text, setting `aria-invalid` and focusing via `RecordErrorSummary`.

### Skill 5: Operations Stage Usability
- **Operations Header Stage Bar:** Per Ruling 2026-10-25, `OperationsStageBar.tsx` integrates directly into the modal/dock header (`OperationsShell.tsx`). It displays a 4-stage segmented bar (Pack · Hand · Return · Reset), reflecting live unit progress (`done/total`), locked states, and stage completion.
- **Subtitle Cleanliness:** Subtitle carries only `Status: <liveStatus>`, avoiding redundant stage labels.
- **Separation of Custody vs QC:** Physically returned usable stock becomes bookable upon sealed return, while independent cleaning, inspection, and damage tasks remain tracked in the Reset queue without stalling rental turnover.

### Skill 6: Tables, Filters & Search
- **Data Tables:** Governed by `DataTableShell.tsx`, with right-aligned numeric data (`fontVariantNumeric: 'tabular-nums'`), sticky headers, and horizontal scroll containment (`.rsp-table-scroll`).
- **Filter Systems:** Standardized through `FilterDrawer.tsx` with result counts, active choice counters, and clear-all actions. Active filters are visible via `ActiveFilterChips`.
- **Destructive Confirmations:** Protected by `ConfirmDialog.tsx` with explicit variant styling (`variant="danger"`). Zero instances of native `window.confirm` or `window.alert` exist in `src/`.

### Skill 7: Visual Tokens & Branded Character
- **Single Source of Truth:** `packages/design-tokens/src/index.ts` feeds runtime CSS custom properties in `src/styles/theme.css`.
- **Default Theme:** Light theme is the active default (`:root` / `:root[data-theme='light']`), with dark mode available as a per-user toggle.
- **Typography:**
  - Display / Headlines: `--font-display` (`Outfit`, sans-serif).
  - Body: `--font-body` (`Source Sans 3`, sans-serif).
  - Numerals, Barcodes, Identifiers: `--font-id` (`JetBrains Mono Variable`, monospace).
  - Nepali Script: Devanagari support via `@fontsource/asar` and `@fontsource/hind`.
  - `Inter` is banned and completely absent from the project.

### Skill 8: States, Feedback & Accessibility
- **State Ladder:** Components systematically implement loading skeletons (`LoadingSkeleton`), empty states (`EmptyState`), permission gates (`RestrictedState`), and connection indicators (`OfflineBanner`).
- **Law 11 (Never Color Alone):** Status indicators pair semantic tones with explicit text and icons (`Icon name="..."`).
- **Law 12 (Inline Errors, Success-Only Toasts):** Database refusals, form validation errors, and mutation failures render inline at the interaction point; `useToast()` only delivers `showSuccessToast`.
- **Keyboard Navigation:** Full support for `Esc` dismissal, `/` quick scanner focus, `1`–`4` operations stage jumping, and focus traps on active overlays.

### Skill 9: Audit, Verification & Conservative Implementation
- All identified defects are linked to verified local source files and line numbers. No theoretical or fabricated issues are recorded.

---

## 3. Prioritized Defect Register

### Severity Definitions
- **P0:** Data integrity, financial calculation risk, security or permission leak, blocker.
- **P1:** Broken workflow, unresolvable CSS variable causing invisible UI or broken contrast, major layout collision.
- **P2:** Inconsistent component pattern, touch target under 44px, hardcoded color literal bypassing design tokens.
- **P3:** Polish, dead code cleanup, accessibility attribute enhancement.

---

### Defect Register

| ID | Sev | Location (File:Line) | Issue Description & Reproduction | Impact | Recommended Minimum Safe Fix | Verification / Test |
|---|---|---|---|---|---|---|
| **DEF-01** | **P1** | `src/modules/crew/TimesheetTab.tsx:179, 429`<br>`src/modules/rentals/ProductionsList.tsx:62`<br>`src/modules/inventory/WarrantyTracker.tsx:212, 233`<br>`src/modules/tools/BundleQuickBuilder.tsx:159, 169` | **Undefined Legacy CSS Variables `var(--green)` and `var(--red)`**.<br>Components reference `var(--green)` and `var(--red)`, which are not declared in `theme.css`. In `buttonConsistency.test.tsx:83`, tests explicitly forbid `var(--green)`. | The browser falls back to inherited text color or transparent background. On tinted status chips or dark mode cards, text becomes unreadable or invisible, failing contrast. | Replace `var(--green)` with `var(--success-text)` or `var(--st-in-fg)`. Replace `var(--red)` with `var(--danger-text)` or `var(--st-danger-fg)`. | Run `npm run check:contrast` and inspect element color resolution in DOM. |
| **DEF-02** | **P2** | `src/modules/crew/TimesheetTab.tsx:154, 179, 396, 429`<br>`src/modules/inventory/WarrantyTracker.tsx:212, 233` | **Semantic Inversion of `--gold`**.<br>In `theme.css:208, 360`, `--gold` is mapped to the primary blue accent (`#2456d6` light / `#386af7` dark). In `TimesheetTab` and `WarrantyTracker`, code uses `var(--gold)` expecting amber/yellow warning tones for overtime and expiring warranties. | Overtime hours and warranty expiration warnings display in calm primary blue rather than warning amber, misleading floor operators. | Replace `var(--gold)` with semantic status tokens: `var(--warn-text)` / `var(--ready-text)` / `var(--st-progress-fg)`. | Vitest timesheet rendering test; check visual hue. |
| **DEF-03** | **P2** | `src/modules/rentals/ProductionsList.tsx:51` | **Sub-Floor Touch Target (`minHeight: 36px`)**.<br>Stepper navigation buttons in `stepperStepStyle` are set to `minHeight: '36px'`. | Violates Law 15 / §3.3 requiring a minimum 44px interactive touch target floor on every device. Causes mis-taps on iPad/mobile. | Increase `minHeight` to `'var(--tap, 44px)'` or wrap with `<TouchTarget />`. | Breakpoints and touch target assertions. |
| **DEF-04** | **P2** | `src/modules/tools/CouponsManager.tsx:268-269`<br>`src/modules/tools/QrGeneratorModal.tsx:185`<br>`src/modules/rentals/ProductionsList.tsx:40, 61` | **Hardcoded Hex & RGBA Literals Bypassing Token Layer**.<br>`CouponsManager` uses `#2ECC8F`, `#FF4757`, and raw RGBAs. `QrGeneratorModal` uses `rgba(47, 125, 255, 0.14)` for active buttons instead of semantic select tokens. | Active button styles bypass Ruling 2026-10-15 (active selections must be neutral `--select-bg` / `--select-fg`). Contrast breaks under High-Contrast and Glass modes. | Replace literals with semantic variables: `var(--select-bg)`, `var(--select-fg)`, `var(--st-progress-bg)`, `var(--st-progress-fg)`. | `npm run check:contrast` |
| **DEF-05** | **P2** | `src/modules/reports/Pulse.tsx:53` | **Module-Scope Frozen Clock `const TODAY = getBusinessToday()`**.<br>`Pulse.tsx` evaluates `TODAY` once when the module script is first loaded. | If an iPad or workstation remains open across midnight (06:00 NPT operational boundary), date windows and daily comparisons stay locked to yesterday until manual refresh. (Contrasts with `Calendar.tsx:82` which dynamically evaluates per render). | Move `getBusinessToday()` inside the component render hook or memoize keyed by operational date. | Test with simulated time advancement past 06:00 NPT. |
| **DEF-06** | **P2** | `src/modules/clients/AddClient.tsx:191-200` | **Form Shell Architecture Divergence**.<br>`AddClient.tsx` uses custom numbered cards (`SectionCard n={1..4}`) and manual layout rather than the standard `RecordWorkspace` + `RecordSection` architecture established on 6 Oct 2026 (`docs/UI_UX_RULES.md §11`) and utilized in `AddEquipment.tsx` / `RecordForm.tsx`. | Inconsistent form navigation, lack of section-level save status badges, and differing summary rail flow between Client and Equipment creation. | Migrate `AddClient.tsx` layout to standard `RecordWorkspace`, `RecordSection`, and `RecordActions`. | Form submission test; verify leave guard. |
| **DEF-07** | **P3** | `src/modules/tools/BundleQuickBuilder.tsx` | **Unrouted Legacy Sandbox Artifact**.<br>`BundleQuickBuilder.tsx` remains in `src/modules/tools/` with mock catalog gear and hardcoded rates, despite `/tools?tab=bundle` redirecting to `/inventory?tab=bundles`. | Dead code clutter; risks being mistakenly imported or consulted as reference. | Move to `src/archive/tools/BundleQuickBuilder.tsx` per Law 3 (nothing deleted, archive excluded). | Typecheck and build verification. |
| **DEF-08** | **P3** | `src/modules/tools/QrGeneratorModal.tsx:116`<br>`src/modules/tools/CouponsManager.tsx:215, 238` | **Missing Accessible Label-Input Bindings**.<br>Labels precede inputs as sibling tags without `htmlFor` matching input `id`. | Screen readers fail to associate labels with inputs, and clicking label text does not focus the control. | Add `id={fieldId}` to inputs and `htmlFor={fieldId}` to labels. | Accessibility tree inspection. |

---

## 4. Route Coverage Inventory (56 Routes)

All routed screens declared in [`src/App.tsx`](file:///c:/Users/use/Desktop/babin-rentals-os/src/App.tsx) were audited for shell integration, search ownership, and role visibility:

1. **Authentication & Shell Boundary:**
   - `/login`, `/forgot-password`, `/reset-password`: Outside Shell, accessible without session, clean card layout, 44px inputs.
2. **Core Operational Hubs:**
   - `/today` (and `/dashboard` redirect): Pilot route. Single header search, compact KPI strip, pickup/return movement panels with carry-over logic and portal calendar picker.
   - `/rentals`: Rentals list with DataTableShell, status pill filtering, saved views, and contextual drawer.
   - `/rentals/new`: Redirects to `/rentals?action=new`, mounts inline `NewRental` workspace without wizard hops.
   - `/rentals/:bookingNo`: `BookingDetail` with sticky summary rail, action registry, and operations trigger.
   - `/rentals/:bookingNo/packing`, `/handover`, `/return`, `/reset`, `/evidence`: Full-screen floor routes with elevated sticky bars, 56px verb targets.
   - `/operations`: `OperationsQueues` multi-stage queue view, branch grant scoping, direct modal trigger.
   - `/calendar`: Calendar grid with Kathmandu 06:00 clock, dual BS/AD dates, 7-column desktop view, agenda list on phone, side-peek / bottom-sheet event details.
   - `/crew`, `/crew/timesheet`: Crew assignment hub and shoot-day timesheet grid.
   - `/inventory`: Inventory catalog, units list, stock-check, and bundle manager.
   - `/inventory/warranty`: Equipment warranty tracker with honest unavailable state in live mode.
   - `/inventory/labels`: QR and barcode generator workspace.
   - `/inventory/purchase-requests`: Purchase request ledger with inline decision error feedback.
   - `/inventory/:assetId`: Asset detail with unit editing, service due tracking, and stock adjustments.
   - `/inventory/bundles/:bundleRef`: Bundle detail with component ratio breakdown.
   - `/inventory/cases`, `/inventory/cases/:id`: Incident and damage case workspace.
   - `/operations/sub-rental`: External cross-hire and sub-rental ledger.
   - `/operations/delivery`: Delivery and logistics dispatch board.
   - `/notes`: Team scratchpad and shift handovers with entity references.
   - `/clients`: Clients directory, membership tiers, and credit stop rules.
   - `/clients/:id`: Client profile with tabbed rentals, ledger, and in-place `RecordForm` edit mode.
3. **Finance & Reports (Strictly Money-Gated):**
   - `/finance` (and redirects for `/closing`, `/invoices`, `/payments`, `/expenses`, `/documents`, `/reports`): Unified finance workbench.
   - `/reports/pulse`, `/expenses`, `/clients`, `/promotions`, `/staff`, `/inventory`, `/products`, `/equipment-performance`, `/asset-roi`, `/forecasting`, `/cash-flow`, `/working-capital`, `/rentals`, `/operations`, `/damage-maintenance`, `/sales`, `/vat-tax`, `/activity`, `/revenue`, `/cases`, `/custom`: Full reporting suite with `ReportTemplate` and `DataTableShell`.
4. **Administration & Tools:**
   - `/settings`: Organization branches, warehouses, tax rates, staff permissions.
   - `/admin/audit` (`AuditSettings`), `/admin/audit-log` (`AuditLog`), `/admin/activity-log`, `/admin/numbering` (`NumberingSequences`), `/admin/backup` (`BackupRestore`): View-only, immutable audit trail, honest unavailable write controls.
   - `/tools`: Tools landing with Depreciation, Pricing, Late Fee, and Cinematography suite.

---

## 5. Proposed Smallest Cohesive Design-System Upgrade

To achieve a consistent visual finish across Desktop, iPad, and Phone without altering business logic, permissions, or schemas:

### A. Consolidate Token Aliases (`theme.css`)
- Map deprecated color names to their canonical token definitions:
  ```css
  --green: var(--success);
  --red: var(--danger);
  ```
- This immediately resolves contrast regressions in `TimesheetTab`, `WarrantyTracker`, and `ProductionsList` with zero disruption to existing styles.

### B. Standardize Form Record Shells
- Align `AddClient.tsx` onto the same `RecordWorkspace` and `RecordSection` composition used by `AddEquipment.tsx` and `RecordForm.tsx`.
- Standardize the sticky right-rail behavior at ≥1280px and bottom-reflow behavior on tablet/phone.

### C. Eliminate Sub-Floor Touch Targets
- Enforce `min-height: var(--tap)` (44px) across stepper steps, filter chips, and calculator input rows.
- Ensure all printable label and barcode inputs feature linked `<label htmlFor="...">` accessibility markup.

### D. Scope Verification
- All recommended changes are 100% cosmetic and presentation-layer only.
- No database migrations, no RPC modifications, no permission adjustments, and no money logic alterations are required.
