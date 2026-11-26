# Cadra modified-file changelog

Snapshot: 28 October 2026, branch `codex/cadra-responsive-ui-20261026`, compared with baseline `34cce2dcd9b9197ad3b2384363df632d195e5f14`. This inventory comes from `git status --short --untracked-files=all`, the tracked diff and the new files' responsibilities. It includes this index itself: **65 modified files and 38 new files; 103 paths total**. Paths are repository-relative. `NEW` means untracked in this local worktree; it does not mean committed or published.

Ignored runtime artifacts, screenshots, test receipts and build outputs are outside this source-file inventory. `.env.mock` contains only public local preview configuration (mock selection/seeding and public client connection settings); its values are intentionally not reproduced. No privileged credential or hosted migration application is part of this changelog.

This is a change index, not a verification result. Use [interaction and gate results](CADRA_INTERACTION_RESULTS.md), the [visual matrix](CADRA_BEFORE_AFTER_VISUAL_MATRIX.md) and the [requirement evidence index](CADRA_REQUIREMENT_EVIDENCE.md) for actual accepted-source receipts and remaining limits.
## Shell and navigation

| State | File | Change |
|---|---|---|
| MODIFIED | `src/App.tsx` | Mount one navigation owner per viewport and reserve its shell space. |
| NEW | `src/components/shell/DesktopDock.tsx` | New desktop dock using the existing permitted destination registry. |
| MODIFIED | `src/components/shell/BottomBar.tsx` | Reuse the existing bottom bar for tablet and phone. |
| MODIFIED | `src/components/shell/Header.tsx` | Expose existing appearance modes and allow narrow breadcrumbs to shrink. |
| MODIFIED | `src/components/shell/MoreSheet.tsx` | Bound the secondary destination sheet and remove its duplicate Scan entry. |
| MODIFIED | `src/components/shell/ScannerFab.tsx` | Hide the floating trigger when the bottom bar owns Scan. |
| MODIFIED | `src/components/shell/shell.css` | Dock/bottom-bar presentation, active/focus states and shell dimensions. |
| MODIFIED | `src/components/shell/shellLayoutContract.ts` | Select desktop dock or bottom bar; retain development classic comparison. |
| NEW | `src/components/shell/__tests__/DesktopDock.test.tsx` | Check destination order and permission visibility. |
| MODIFIED | `src/components/shell/__tests__/ScannerFab.viewport.test.tsx` | Check desktop scanning and duplicate-trigger omission below desktop. |
| MODIFIED | `src/components/shell/__tests__/shell.test.tsx` | Cover the appearance controls in the shared header. |
| MODIFIED | `src/components/shell/__tests__/shellLayoutContract.test.ts` | Cover navigation ownership and development-only classic selection. |

## Tokens and shared presentation

| State | File | Change |
|---|---|---|
| MODIFIED | `packages/design-tokens/src/index.ts` | Align neutral palette, font roles and component tokens. |
| MODIFIED | `src/main.tsx` | Keep canonical style owners active and retain overlapping preset files for rollback. |
| MODIFIED | `src/styles/theme.css` | Apply the approved neutral theme/font roles while preserving semantic modes. |
| MODIFIED | `src/styles/ui-v2.css` | Refine shared cards, controls and action wrapping. |
| MODIFIED | `src/styles/responsive.css` | Bound responsive content and action groups. |
| MODIFIED | `src/components/ui/Charts.tsx` | Bound SVG tracks, labels and legends without changing business figures. |
| NEW | `src/components/ui/Charts.css` | New shared responsive chart/legend layout rules. |
| MODIFIED | `src/components/ui/ReportToolbar.tsx` | Allow narrow filter controls and action groups to wrap. |
| MODIFIED | `src/components/ui/SegmentedControl.tsx` | Keep the selected/focused tab visible in its scrolling strip. |
| MODIFIED | `src/components/ui/__tests__/SegmentedControl.test.tsx` | Cover selected-tab visibility behavior. |
| NEW | `src/components/shell/__tests__/cadraDesignTokens.test.ts` | Check token/font ownership, active imports and Windows line endings. |
| MODIFIED | `src/lib/__tests__/preset-black-light.test.ts` | Check retained preset contracts with its global import inactive. |
| MODIFIED | `src/lib/__tests__/shadcn-luma-ui.test.ts` | Check retained Luma contracts with its global import inactive. |

## Responsive page repairs

| State | File | Change |
|---|---|---|
| MODIFIED | `src/modules/admin/BackupRestore.tsx` | Reflow dashboard grids and use the shared chart breakdown layout. |
| MODIFIED | `src/modules/clients/clients.css` | Bound client cards, tabs and narrow actions. |
| MODIFIED | `src/modules/inventory/inventory.css` | Bound asset-page grids/tabs and editor surfaces. |
| MODIFIED | `src/modules/notes/notes.css` | Reflow notes layout and narrow controls. |
| MODIFIED | `src/modules/operations/SubRental.tsx` | Wrap search/action groups within the viewport. |
| MODIFIED | `src/modules/rentals/EvidenceWorkspace.tsx` | Wrap evidence navigation and stack phone action grids. |
| MODIFIED | `src/modules/reports/ActivityReports.tsx` | Bound chart grids and reuse the shared breakdown layout. |
| MODIFIED | `src/modules/reports/Pulse.tsx` | Bound period controls and wrap long date labels. |
| MODIFIED | `src/modules/reports/ReportCatalog.tsx` | Mark the shared responsive period field. |
| MODIFIED | `src/modules/reports/ReportTemplate.tsx` | Reuse responsive period-field styling. |
| MODIFIED | `src/modules/reports/reports.css` | Reflow report tabs, toolbars, period fields and charts. |
| MODIFIED | `src/modules/settings/Settings.tsx` | Scope the compact Add Branch action. |
| MODIFIED | `src/modules/settings/sections/BranchesWarehouses.tsx` | Bound branch cards/statistics and wrap directory controls. |
| MODIFIED | `src/modules/settings/settings.css` | Reflow narrow settings sections, tabs and branch controls. |

## Persisted individual-unit editor

| State | File | Change |
|---|---|---|
| NEW | `src/actions/inventory/updateEquipmentUnit.ts` | New narrow action with idempotency, revision checks and confirmed money-free readback. |
| NEW | `src/actions/inventory/__tests__/updateEquipmentUnit.test.ts` | Cover RPC inputs/readback, offline/stale refusal and retry identity. |
| MODIFIED | `src/lib/queries/inventory.ts` | Read and retain each unit's observed database revision. |
| MODIFIED | `src/lib/queries/__tests__/inventory.test.ts` | Cover unit revision selection/mapping. |
| MODIFIED | `src/modules/inventory/AssetDetail.tsx` | Wire the inline unit editor to persisted saves, retained drafts and read-only custody status. |
| NEW | `src/modules/inventory/__tests__/UnitEditor.persistence.test.tsx` | Cover section baselines, siblings, retry/discard and stale reload. |
| MODIFIED | `src/modules/inventory/__tests__/inventoryList.test.ts` | Supply the revision field required by inventory unit fixtures. |
| NEW | `src/lib/__mocks__/equipmentUnitEditor.ts` | New local counterpart for authorized, idempotent narrow unit writes. |
| NEW | `src/lib/__mocks__/__tests__/equipmentUnitEditor.test.ts` | Cover local store permissions, revisions, retry and seeded save behavior. |
| NEW | `scripts/test-equipment-unit-edits.mjs` | New disposable-Postgres unit edit/permission/branch/audit contracts. |
| NEW | `supabase/migrations/0178_persist_equipment_unit_edits.sql` | New atomic unit-edit RPC, narrow authorization and audit/receipt enforcement. |

## Calendar resources and guarded rescheduling

| State | File | Change |
|---|---|---|
| MODIFIED | `src/actions/core.ts` | Register the narrower online rescheduling capability. |
| MODIFIED | `src/actions/__tests__/core.test.ts` | Check C+ admission, offline refusal and excluded roles. |
| MODIFIED | `src/lib/rbac.ts` | Expose the approved C+ online rescheduling predicate. |
| NEW | `src/actions/rentals/rescheduleRental.ts` | New fixed-duration date-move action and confirmed receipt handling. |
| NEW | `src/actions/rentals/__tests__/rescheduleRental.test.ts` | Cover guarded date-move inputs, failures and readback. |
| MODIFIED | `src/data/calendar.ts` | Carry authoritative booking/resource identities, revisions and interval/capacity metadata. |
| MODIFIED | `src/events/eventBus.ts` | Add the rescheduled-rental domain event. |
| NEW | `src/lib/calendarIntervals.ts` | New exact half-open interval and peak-demand conflict calculations. |
| NEW | `src/lib/__tests__/calendarIntervals.test.ts` | Cover exact intervals and concurrent quantity demand. |
| MODIFIED | `src/lib/queries/calendar.ts` | Read booking revisions/exact times and build source-backed resource conflicts. |
| NEW | `src/lib/queries/calendarResources.ts` | New validated money-free resource-window query. |
| NEW | `src/lib/queries/__tests__/calendarResources.test.ts` | Cover source completeness, identity validation, exact bounds and failures. |
| MODIFIED | `src/modules/calendar/Calendar.tsx` | Use actual resource reads and guarded move/agreement controls; show honest unavailable states. |
| MODIFIED | `src/modules/calendar/calendar.css` | Style the real timeline/phone agenda and bounded controls. |
| MODIFIED | `src/modules/calendar/__tests__/CalendarDayView.test.tsx` | Keep Day-view tests aligned with authoritative interval data. |
| MODIFIED | `src/modules/calendar/__tests__/CalendarP0NegativeRegressions.test.tsx` | Cover fail-closed authoritative rescheduling instead of simulated approval. |
| NEW | `src/lib/__mocks__/calendarPlanning.ts` | New local resource reads and guarded date-move counterpart. |
| NEW | `scripts/test-calendar-planning.mjs` | New disposable-Postgres resource, interval, role, conflict and hold contracts. |
| NEW | `supabase/migrations/0179_calendar_resources_and_rescheduling.sql` | New real resource-window and atomic fixed-duration rescheduling RPCs. |
| MODIFIED | `src/modules/rentals/RentalsList.tsx` | Refresh existing rental rows after the rescheduled event. |
| MODIFIED | `src/modules/today/Today.tsx` | Refresh authoritative movement queries after the rescheduled event. |

## Retained agreement amendments

| State | File | Change |
|---|---|---|
| NEW | `src/actions/rentals/rescheduleAgreement.ts` | New prepare/read/upload-or-draw/ready/cancel agreement orchestration. |
| MODIFIED | `src/lib/queries/documents.ts` | Label superseded agreements from retained version history and expose unavailable history honestly. |
| NEW | `src/lib/scheduleAmendment.ts` | New bounded amendment PDF generation with drawn mark and self-hosted Nepali fonts. |
| NEW | `src/lib/__tests__/scheduleAmendment.test.ts` | Cover amendment generation and overflow refusal. |
| NEW | `src/lib/__mocks__/rescheduleAgreement.ts` | New local proposal/evidence/version-history counterpart. |
| NEW | `src/modules/rentals/components/ScheduleAgreement.tsx` | New scoped agreement replacement UI with original review and stale/busy guards. |
| NEW | `src/modules/rentals/__tests__/ScheduleAgreement.test.tsx` | Cover proposal/signing UI and authorization or stale-work boundaries. |
| MODIFIED | `src/modules/rentals/modals/SignOnGlassModal.tsx` | Add schedule-only drawn signing and explicit date acknowledgment. |
| NEW | `scripts/test-reschedule-agreements.mjs` | New disposable-Postgres evidence, immutable-original and atomic-version contracts. |
| NEW | `supabase/migrations/0180_reschedule_agreement_versions.sql` | New private immutable proposal-scoped artifacts, version links and finalization enforcement. |

## Local preview and mock integration

| State | File | Change |
|---|---|---|
| NEW | `.env.mock` | New public local preview configuration only; values intentionally omitted from this changelog. |
| MODIFIED | `src/lib/supabase.ts` | Recognize the explicit mock Vite mode. |
| MODIFIED | `src/lib/__mocks__/client.ts` | Route new RPCs through staged local transactions and retain unrelated concurrent writes. |
| MODIFIED | `src/lib/__mocks__/corpus.ts` | Initialize seeded unit revisions and expose the existing bundles view. |
| MODIFIED | `src/lib/__mocks__/engine.ts` | Resolve existing bundle-view category/item relationships. |

## Verification harnesses and configured gates

| State | File | Change |
|---|---|---|
| MODIFIED | `.github/workflows/ci.yml` | Require unit-edit, Calendar and agreement local contracts in CI. |
| MODIFIED | `package.json` | Add commands for the three new disposable-Postgres contract suites. |
| MODIFIED | `scripts/check-contrast.cjs` | Measure effective active imports while preserving high-contrast/glass/pilot coverage. |
| MODIFIED | `src/components/records/__tests__/RecordForm.test.tsx` | Replace the timing-sensitive fixed focus delay with `vi.waitFor`; application runtime inputs remain unchanged. |
| NEW | `scripts/cadra-visual-matrix.mjs` | New preserved-baseline/current route capture with record provenance, layout bounds and source fingerprints. |
| NEW | `docs/verification/cadra-20261026/browser-interactions.mjs` | New local Operations/navigation/unit/Calendar/PDF interaction evidence driver. |

## Rulings and handoff documentation

| State | File | Change |
|---|---|---|
| MODIFIED | `PROGRESS.md` | Record implementation, rulings, verification and generated completion/remaining state. |
| MODIFIED | `docs/CURRENT_STATE.md` | Add the current local Cadra branch/preview/verification banner. |
| MODIFIED | `docs/PERMISSIONS.md` | Record the narrow unit editor and C+ online rescheduling boundaries. |
| MODIFIED | `docs/pages/INDEX.md` | Reconcile the route inventory with current mounted routes, aliases and query states. |
| NEW | `RULINGS-2026-10-26.md` | Record the user-approved local scope, guarded behaviors and rollback boundary. |
| NEW | `docs/verification/cadra-20261026/CADRA_BASELINE_VISUAL_MATRIX.md` | Record source/cascade findings and completed baseline evidence. |
| NEW | `docs/verification/cadra-20261026/CADRA_BEFORE_AFTER_VISUAL_MATRIX.md` | Record route comparisons, reviewed screenshots, shell ownership and rollback. |
| NEW | `docs/verification/cadra-20261026/CADRA_INTERACTION_RESULTS.md` | Record current browser/gate receipts and their acceptance limits. |
| NEW | `docs/verification/cadra-20261026/CADRA_REMAINING_GAPS.md` | Keep unsupported data sources and hosted/device boundaries explicit. |
| NEW | `docs/verification/cadra-20261026/CADRA_REQUIREMENT_EVIDENCE.md` | Map R-01–R-20 to precise test/contract evidence and remaining acceptance. |
| NEW | `docs/verification/cadra-20261026/CADRA_MODIFIED_FILES.md` | This complete modified/new-file changelog. |

Local rollback restores the prior shell/style imports or disables the new entry points while preserving unit audits, agreement originals, proposals and version history. The migration files are local source changes; verification, application and production verification are separate states recorded in the gate report.

