# Closed-but-unmerged PR recovery — 1 November 2026

**Repository:** `babindulal7/babin-rentals-os` · **Method:** connected GitHub source inspection (branch/commit metadata, changed filenames, selected current and historical source files); no checkout, installed npm dependencies, application runtime, staging or production data.  
**Nature:** evidence and disposition, **not** a green CI receipt or go-live certification.  
**Authority:** current rules and later approved rulings override historical PR docs. No old PR should be merged wholesale without exact-current-head verification.

## Disposition matrix (11 PRs)

| PR | Historical changed files | Current source-level disposition | Concrete next action |
|---|---:|---|---|
| [#6 Sales/VAT](https://github.com/babindulal7/babin-rentals-os/pull/6) | 3 | **Core source behavior independently present**: `src/lib/queries/salesVatReports.ts` has correct `vat_amount`, `total_amount`, `pan_vat`, stable paginated reads and safeguards. Its historical standalone `src/lib/queries/__tests__/salesVatReports.test.ts` is **not** on current main. | Preserve present query engine. Compare old 501-row/draft/void/VAT-boundary tests with current `salesVatTruth.test.ts` and screen tests; port only nonduplicated regressions, with current mocks. Do not replace reader. Accountant must validate statutory VAT classification. |
| [#15 Booking Detail typecheck](https://github.com/babindulal7/babin-rentals-os/pull/15) | 1 | **Ancestor of main:** `main` is ahead of this exact PR head `79821b0` (0 behind). | No cherry-pick. Retain current header/phone action behavior; routine phone acceptance. |
| [#16 Revenue charts](https://github.com/babindulal7/babin-rentals-os/pull/16) | 23 | **Superseded architecture** by merged [#12](https://github.com/babindulal7/babin-rentals-os/pull/12) and [#20](https://github.com/babindulal7/babin-rentals-os/pull/20); richer UX tracked in open [#23](https://github.com/babindulal7/babin-rentals-os/pull/23). | Keep current `reportRevenueTrend.ts` count-checked, credit-note-aware reader. Reconcile #23's extra UX as incremental changes to the current shared chart; do not merge old engine. Details below. |
| [#17 Design blueprint](https://github.com/babindulal7/babin-rentals-os/pull/17) | 1 | Historical document was absent from current main. | **Recovered in this review branch** to `docs/archive/BABIN_RENTALS_OS_REDESIGN_BLUEPRINT_2026-10-15.md`; historical/non-authoritative label added. |
| [#18 Header action gates](https://github.com/babindulal7/babin-rentals-os/pull/18) | 3 | Equivalent `isActionVisible` / `isActionEnabled` logic exists in current `Header.tsx` and `PageHeader.tsx`. | No old diff; run Owner/Warehouse role and dynamic-disabled tests on current code. |
| [#19 R-39 tap-budget notes](https://github.com/babindulal7/babin-rentals-os/pull/19) | 1 | Historical audit says its notes were independently recorded locally. Current `PROGRESS.md` entry and counts were **not independently established** in this connector review. | Check local `PROGRESS.md` before calling it complete. Keep historical PR evidence; do not overwrite contemporary progress ledger. |
| [#21 Rentals selection header](https://github.com/babindulal7/babin-rentals-os/pull/21) | 2 | `RentalsList.tsx` currently registers `PageHeaderBulkSelection` with Export CSV / Fast Return; current shared header has role-aware filtering. | No stale cherry-pick; mobile/tablet selection and Warehouse role acceptance remain. |
| [#24 Daily-closing RBAC](https://github.com/babindulal7/babin-rentals-os/pull/24) | 19 | Independently integrated as described in its close disposition. Current `canApproveDailyClosing` admits Owner, Admin, Manager, Accounts only, and refuses offline. | Keep current code and DB lifecycle test. No old diff. Recheck as each JWT role on staging. |
| [#25 ASTRA offline/security](https://github.com/babindulal7/babin-rentals-os/pull/25) | **148** | **Partially integrated and heavily divergent.** Current main has offline queue conflict/held stores, session ownership, nested-modal stack/scroll locks, evidence storage, tests and an `0170_astra_phase0_authorization.sql` migration; these are not identical commits. **Electron token handling gap found** (below). | Never merge #25 wholesale. Diff by security invariant, not file timestamp. Preserve #26 as review source until T2-10/T2-18/T1 acceptance. Inspect and handle Electron issue [#46](https://github.com/babindulal7/babin-rentals-os/issues/46). |
| [#28 Equipment Preview](https://github.com/babindulal7/babin-rentals-os/pull/28) | 4 | Existing `EquipmentDraftPreview` component, pure model and tests are on main, but the active form no longer invoked them. | **Recovered in draft [#45](https://github.com/babindulal7/babin-rentals-os/pull/45)** as small changes to current `RecordForm.tsx`. Needs all gates and device/role acceptance before merge. |
| [#34 Copy/06:00 tests](https://github.com/babindulal7/babin-rentals-os/pull/34) | 7 | Its test blob in `#35` matches the same original `#34` test blob; #35 explicitly supersedes #34 and adds security work. | Leave closed; reconcile open [#35](https://github.com/babindulal7/babin-rentals-os/pull/35) with other security PRs, then verify entire combined head. |

## P0 — Electron auth storage (new evidence from #25)

**Current path checked:** `electron/preload.cjs` exposes `electronAPI.isElectron`, `platform`, `ping`; it does **not** expose `secureStorage`. `src/lib/secureStorage.ts` recognizes only `capacitor`, `tauri`, `web`, and its default `WebLocalStorageAdapter` uses browser localStorage. `src/lib/supabase.ts` calls `getSecureAuthStorage()` with `persistSession: true`. **In the Electron renderer, source currently selects browser token storage**, not an OS-protected native bridge.

**Old #25 caveat:** it defines `ElectronSafeStorageAdapter` and detects `electronAPI.isElectron`, but that adapter requires `electronAPI.secureStorage` not provided by current preload; copying this old class *alone* leaves a missing IPC provider and loss of durable login or unsafe fallback. Do not claim native safety from the class name.

**Required separate fix:** [P0 issue #46](https://github.com/babindulal7/babin-rentals-os/issues/46) — trusted-origin IPC, native `safeStorage` with secure backend, no plaintext fallback, legacy-key clearance, failure-mode tests, packaged desktop/device acceptance. **Electron distribution remains HOLD** until verified; this finding does not establish a bug in browser/PWA or production RLS.

## Security/offline #25/#26 source reconciliation

1. **Offline durability:** `main:src/lib/offlineQueue.ts` has `QueuedConflict`, `heldMutations`, retry/dead-letter semantics, `getOfflineSession` and `ownsOfflineWork`, plus client-UUID dedupe and queue-change notifications. **Do not replace** with #25's older file: it lacks some newer identity/replay hardening. Test crash between queue write and UI toast, loss of IndexedDB, wrong-operator replay, duplicate keys with different payload and airplane-mode return.
2. **Modal:** current `main:src/components/ui/Modal.tsx` has shared `modalStack` and `scrollLocks` and `Modal.nestedLock.test.tsx` exists. The old #25 nested-modal fix is already represented; still verify Escape closes only the top layer and last-close restores the previous body overflow.
3. **Evidence:** current `evidenceStorage.ts` includes authenticated session matching, idempotent photo keys, hash checks, storage-path validation and more stages than #25. T2-18's per-unit flagged Return photos, retry/session behavior, offline honesty and real-device upload still need staging acceptance; old evidence code is **not** a safe replacement.
4. **SQL:** current main already has a migration at `supabase/migrations/0170_astra_phase0_authorization.sql` (different blob than #25). **No migration renumber, replay, or production apply**. Compare migrations by database object/GRANT/policy fingerprint and reconcile against live migration ledger only with owner-approved staging/backup process.
5. **Reporting:** current main has `salesVatTruth.test.ts`, an updated Sales/VAT query and financial truth checks; older standalone query tests may still contain valuable pagination/zero-rate assertions. Recover missing *tests*, not stale accounting runtime.
6. **#26 final change:** commit `1af5603` adjusts the New Rental `AddItemPanel` touch targets and inserts a `TouchInset`. Current main already has `TouchInset` and many 44-pixel targets, but code shape differs. Compare actual affected controls and test touch hitboxes at 375/820/1440 before treating the 4-line change as reproduced. Keep #26 open until the same behavior is accepted.
7. **Other security drafts:** review pending #32/#33/#35/#36/#37/#39/#40/#43/#44 together before merging; grant, rider-token and invoice-resync changes have overlapping migrations/permissions. A green unit suite **never** proves hosted JWT/RLS or Edge acceptance.

## Revenue #16/#23 reconciliation against current main

**Keep the live accounting contract:** `src/lib/queries/reportRevenueTrend.ts` uses an exact-count, deduplicated, paginated invoice/credit-note reader. `src/lib/intel/revenueTrend.ts` separates *issued nonvoid taxable invoice value before VAT* from *cash-paid credit-note reconciliation*; a paid-amount credit note is not automatically a taxable sales reduction. `RevenueReport.tsx` limits financial figures to Owner/Admin/Manager/Accounts. No changes to those rules without independent accountant/role review.

**Already present in current UI:** current `src/components/ui/reports/ReportChart.tsx` has a numeric Y axis, tooltip, chart/table toggle, accessibility live region and keyboard Arrow/Home/End/Escape navigation. `RevenueReport.tsx` has previous-window comparisons in metrics/CSV/table, current-window chart, credit reconciliation and truthful empty/error states. Therefore copying #23's entire alternative SVG chart would duplicate features and regress the established report component library.

**Useful #23 gaps still to consider** (treat as candidates, not declared defects until UI/device verification):
- **Partial period labels:** #23 models `startDay/endDay/coverage/longLabel` for month-to-date and clipped windows; current month rows expose month labels but not this richer coverage annotation. Add a pure display-only formatter with AD date bounds and tests; do not change ledger math or invoice date range.
- **Compare visual overlay:** main comparison lives in metrics/CSV/table while the chart renders only current series. If needed, add an optional second series to the shared reporting chart, with distinguishable marker shapes/line styles and labels, without replacing its money reader. Missing values remain gaps, not fake zero.
- **Invoice register deep-link:** #23 proposes numbered, paginated invoice register with direct `/finance?tab=invoices&search=...` links. Current page opens Finance invoices generally; consider this separately only after confirming filter preservation and count accuracy.
- **Phone interactions:** compare tooltip on touch, 375px overflow, focus return and chart/table fallback with #23's interaction tests; keep current keyboard support rather than reimplementing it.

**Proposed acceptance steps:** write small chart/data-label PRs against current `main`, keep existing `ReportAreaChart` and `reportRevenueTrend`; validate current vs previous in both cash and invoice count, zero vs missing, month-to-date BS/AD labels, count-exact 500+ row page changes, voids and credit mismatch, and money-blind DOM/HTTP guards. Check 375/820/1440 in both themes with mouse/touch/keyboard. Do not merge #16/#23 full branch.

**Tracked incremental revenue follow-up:** [issue #48](https://github.com/babindulal7/babin-rentals-os/issues/48) — noninvasive partial-month labels and optional comparison overlay; current accounting engine remains authoritative.

## Required verification before closing recovery

```bash
npm run typecheck
npm run lint
VITE_DATA_SOURCE=mock npm test
npm run check:pglite
npm run check:security
npm run check:lifecycle
npm run test:server-contracts
npm run test:partial-return
npm run lint:progress
npm run lint:ui-copy
npm run build
```

Run the rest of the latest `docs/plans/README.md` gates and coverage as documented, on **the exact final combined commit**, plus hosted JWT/real-Edge/device checks for security and floor changes. GitHub connector source reads **cannot** certify these commands or physical device acceptance.

**Changed remotely by this recovery:** draft #45 (form-only Preview wiring), P0 issue #46 (Electron auth), and this **docs-only** review branch with archived PR #17. **Not done:** merging, deployment, live SQL, backup, staging or manual npm/browser execution.
