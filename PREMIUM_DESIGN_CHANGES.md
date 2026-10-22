# Precision Cinema Operations — local design recovery

## Follow-up verification

The 22 October source snapshot is fully documented in [docs/verification/premium-design/reverify-20261021-2327/REVERIFICATION.md](docs/verification/premium-design/reverify-20261021-2327/REVERIFICATION.md): 5,186 tests in a full coverage run, 53 browser checks and 156 captures. That snapshot corrected clipped phone KPI labels and an unloaded identifier font. Earlier failed/interrupted attempts remain retained.

The user subsequently approved **the newer all-Outfit theme** on 23 October; see RULINGS-2026-10-23.md. The older separate-font result is historical and must not trigger a rollback. Current-source verification is running separately in `docs/verification/premium-design/current-20261023-0225`; the current checkout contains substantial newer feature and primitive edits.

21 October 2026 (NPT). Local implementation and browser evidence; final verification receipts linked below.

## Baseline and boundaries

Started on `main` at `5d26cf8d8a420c07400b1124a0fafb1b6e7b3710`. The audited reference `5130515fbbdaf6c2f5f7f95638db4c334f5a0b71` exists in local Git; local source is newer. No network Git operation was needed. Initial modifications were App, Header, Icon, rental confirmation and availability code/tests (eight files). Subsequent unrelated edits and automatic sync commits appeared during the session; those are preserved. This agent does not create commits, branches, PRs, pushes, deployments or remote database changes.

Read the repository entrypoint, contributor laws, permissions, UI rules, current state, latest rulings, product rules, progress and open decisions. `PLAN.md` is absent from this checkout. The supplied brief and 20 October drawer ruling govern this visual pass. The referenced external screenshot and uploaded specification are not attached to this chat; the existing seven-section implementation and supplied behavioral constraints are retained.

## Evidence

`scripts/premium-visual-capture.mjs` runs installed Chromium against an isolated Vite process with `VITE_DATA_SOURCE=mock`. Browser requests outside that localhost origin are blocked. It records screenshots and computed dimensions at seven requested widths, dark variants at 820/1440, 125% scaling, high contrast and reduced motion. It waits for loading screens and fonts to settle, and discovers record routes from rendered mock tables.

Evidence: `docs/verification/premium-design/{before,after}/measurements.json`. See `BEFORE_AFTER_VISUAL_MATRIX.md` for measured changes and `REMAINING_UI_ISSUES.md` for limitations.

## Changes and rationale

| Files | Change / preserved behavior |
|---|---|
| `src/styles/theme.css`, `src/styles/ui-v2.css`, `packages/design-tokens/src/index.ts` | Semantic surface/inset/overlay/divider/elevation and section/table tokens within the existing palettes. One shared card treatment; retain explicit glass, high contrast, reduced-motion preferences and theme selection. Expanded/collapsed navigation uses requested 256/64px; header token remains 64px. |
| `src/components/ui/Card.tsx`, `Page.tsx`, `Button.tsx` | CSS owns Card appearance; legacy consumers share one `surfaceStyle` recipe. Standard header/body/footer spacing, status border and disabled treatment. Quieter primary hover shadow. Numeric KPI type uses JetBrains Mono. |
| `PageShell.tsx`, `module-shell/ModulePageShell.tsx`, `ModuleSubHeader.tsx`, `module-shell.css` | Empty toolbars/subheaders reserve no space; optional module zones remain optional. Shared sentence-case table headers, row spacing and KPI typography. No compulsory new KPI strip. |
| `RecordWorkspace.tsx`, `record-workspace.css`, `records/RecordForm.tsx` | Hosted Create/Save in the global primary slot; Cancel and alternate create in More. Same callbacks, dirty/busy guards, inline errors and leave dialog. Isolated previews retain the footer. Summary drawer is on demand, 320px. No equipment draft button. |
| `records/equipment-assist.css`, `EquipmentRecordEditor.tsx` | Seven anchors in one scrollable strip; full-width description/gallery groups at tablet widths; serial/select/icon targets at least 44px; active tracking text uses selected foreground. Status gets a read-only lock icon; its stored text and write ownership are unchanged. Add/Edit still share the same editor. |
| `shell/Header.tsx`, `shell.css`, `header/pageHeader.css` | Preserve canonical slots. Phone Add slot resets the inherited tablet minimum to 44px. Phone profile visibly says Mock and retains mock options; desktop/tablet keep the dedicated indicator. Standalone page-header tablet rule uses 768–1279. |
| `finance/Finance.tsx`, `calendar/Calendar.tsx` | Phone Search in existing More; Payment/Availability and information remain reachable. Calendar keeps the Availability word without its extra phone icon. Existing handlers, filter URLs, export and permissions remain. Finance's compact secondary action behavior was already present and was retained. |
| `inventory/Inventory.tsx`, `inventory.css`, `rentals/rentals.css`, `today/dashboard.css` | Inventory expand/quick-view targets at least 44px. Remove Rentals' independent heavy table shadow; quieter card hover. Today retains existing flat movement rows and every priority/status/action, with shared queue border/elevation and smaller header padding. |
| `lib/queries/rentalReports.ts` | Verification repair only: structural typing boundary around the concurrently added paginated report reads, avoiding TS2589 on embedded PostgREST selections. Query strings, filters, paging and runtime calculations are unchanged. |

Behavioral invariants: no migration, money calculation, capability, custody transition, payload or write engine changes. No font, icon library or theme-default replacement. No external image or fabricated preview data.

## Regression protection

- `RecordActions.header.test.tsx`: canonical hosted action placement, phone Search, busy/clean guards, alternate action menu and visible mock status.
- `PageShell.optional.test.tsx`: empty zones, zero counters and shared surface ownership/status override.
- `CalendarHeader.test.tsx`: reachable phone Availability and Search in More.
- Existing form, header, Finance, roles and lifecycle suites remain active.
- `scripts/premium-visual-capture.mjs`: repeatable screenshots and computed measurements on the isolated local mock server.
- `scripts/premium-browser-interactions.mjs`: real Chromium mouse/keyboard checks of drawers, validation, action menus, payment modal, focus, selector contrast and actual Card variants. The Warehouse route is restricted in current source; verification preserves that stricter gate. It does not widen roles to make a screenshot.
- `scripts/audit-premium-tokens.mjs`: reports added presentation literals without replacing them automatically. Four findings at the final audit: retained noninteractive badge padding (`2px 8px`); two existing/concurrent compact-header gap expressions (4/8px and 0/8px, preserving 44px controls); and one false positive from a test assertion string containing `box-shadow:`. These are documented exceptions, not automatic replacements.
- `scripts/verify-premium-design.mjs`: ordered local commands with per-command logs, exit codes and source fingerprints.

## Evidence and practical limits

Use `docs/verification/premium-design/verification.json` for the final run and `verification-first-pass.json` for the earlier pass. Raw output is retained alongside each command. Full browser detail is in the visual matrix and `checks/interactions.json`.

The viewport scaling matrix simulates 125% browser layout/DPR; actual browser-chrome zoom and physical iPad/scanner behavior remain unverified. The initial high-contrast baseline used an invalid theme name and is excluded as a valid before comparison; the final after capture uses the real `high-contrast` theme. Browser money checks use the built-in Warehouse sign-in; Technician/Driver coverage comes from automated permission tests, not an invented mock identity. No release or production certification is implied.

Observed row geometry is retained in the raw matrix: Inventory sample rows are 56px; Edit Equipment unit rows increased from 51px to 57px to accommodate actual 44px fields. Multi-line Rentals sample rows remain 74.6px (client/project plus BS/AD dates); no text or date is hidden to force the proposed 48–56px band. This pass makes no blanket claim that every row is 52px.

## Final local verification

All nine command checks passed on one unchanged source fingerprint (`f25235ddda98a55ef6b10a2cf9f03963200685b06d0b35f40e5b6b68b1cebd1b`). The final test rerun replaced the earlier changing-source typecheck/test receipts.

| Command | Result |
|---|---|
| `npm run typecheck` | PASS (exit 0) |
| `npm test -- --maxWorkers=2` | PASS (exit 0) |
| `npm run check:pglite` | PASS (exit 0) |
| `npm run check:lifecycle` | PASS (exit 0) |
| `npm run check:contrast` | PASS (exit 0) |
| `npm run lint` | PASS (exit 0) |
| `npm run lint:shell` | PASS (exit 0) |
| `npm run lint:ui-copy` | PASS (exit 0) |
| `npm run build` | PASS (exit 0) |

Full suite: **5,162 tests across 410 files**, no skipped tests reported. Local PGlite: **168 migrations, zero failed**. Lifecycle: **31/31**. Contrast: **82/82**. Browser: **48/48 interactions**, **156 final captures**, zero measured page/header geometry failures. All **329** gallery/matrix links resolve.

`npm run completion` regenerated the repository structural counter; its raw output is `docs/verification/premium-design/completion.log`. It is not a visual or device-completion percentage. Final command provenance is `verification.json`, assembled from the integration-pass and final-test-pass receipts; per-command raw logs are in that directory. Historical typecheck/test log filenames were superseded by the final rerun; historical test JSON remains under `artifacts/`.
