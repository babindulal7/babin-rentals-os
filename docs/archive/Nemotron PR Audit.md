# Babin Rentals OS — Open PR Audit

## Audit metadata
- **Inspected at:** 2026-10-27 10:15 NPT (updated 2026-10-27 14:30 NPT with full 8-PR analysis)
- **Repository:** `babindulal7/babin-rentals-os` (local clone at `C:\Users\use\Desktop\babin-rentals-os`)
- **Main SHA (local HEAD):** `493a25026aea3a8b09e7220bddf4ea45b62f15d6` — 7 commits ahead of `origin/main` (`6f014398e4561e82886b4f88c597508c7f8b99d2`)
- **origin/main SHA:** `6f014398e4561e82886b4f88c597508c7f8b99d2` (PR #29 merged, go-live roadmap v1.2)
- **PR count found locally:** 8 open PR branches on `origin` (`pr-6`, `pr-7`, `pr-17`, `pr-19`, `pr-23`, `pr-24`, `pr-25`, `pr-26`, `pr-28`) — fetched via `git fetch origin pull/XX/head:pr-XX`
- **Historical PRs cited in T0-03:** #6, #7, #17, #19, #23, #24, #25, #26, #28 (9 PRs)
- **Access / evidence limitations:** All analysis via local git remotes. PRs #17, #23, #24, #25, #26, #28 now fetched and analyzed. All code comparisons against local `HEAD` (includes T2-08, T2-10, T2-12, T2-13, T2-14 work not yet on `origin/main`).

---

## Executive assessment

### Highest-risk issues
1. **PR #25 / #26 (ASTRA Phase 0 Security Audit) — Massive overlap, identical core fixes:** Both PRs contain the same 39,000+ line ASTRA audit remediation (evidence persistence, offline durability, Modal nested locks, secureStorage, financial report truth, Sales/VAT query fixes, Phase 0 auth migration 0170). PR #26 adds `src/modules/rentals/booking/AddItemPanel.tsx` touch. `HEAD` already contains the offline queue rewrite (T2-10), evidence storage, and salesVatReports rewrite. Merging either would create massive conflicts and regressions. **Only one should be considered, and only after careful diff against HEAD.**
2. **PR #6 & PR #25 both rewrite `salesVatReports.ts`:** Three competing implementations exist — `origin/main` (mock fallback), `HEAD` (rowsOf helper, MAX_ROWS guard), PR #6 (manual pagination, test file), PR #25 (count-exact pagination, MOCK fallback in mock mode). **HEAD's implementation is most robust.**
3. **PR #23 (Revenue Report) — Competing implementation:** PR #23 introduces new charting system (`InteractiveTrendChart`, `chartScale.ts`, `revenueTrend.ts` rewrite) while `HEAD` has a different revenue trend system (`reportRevenueTrend.ts` with credit reconciliation, `RevenueReport.tsx` using reports component library). These are mutually exclusive architectures.
4. **PR #28 (Equipment Draft Preview) — Net new feature not in HEAD:** Adds `EquipmentDraftPreview` component for unsaved equipment preview. No conflicts, but needs review for Law 1 (business logic in components?) and Law 6 (money gating).
5. **PR #24 (Daily Closing) — Single commit, likely already integrated:** Only 1 commit (`d4bea96f`) narrowing daily-closing approval to RLS-admitted roles. `HEAD` already has this via lifecycle L32 and PERMISSIONS.md alignment.
6. **PR #17 (Design Blueprint) — Documentation only:** Adds 458-line redesign blueprint markdown. No code changes.
6. **PR #19 (R-39 budgets) — Documentation only:** PROGRESS.md entry already appended to HEAD locally.

### Safely closable PRs
- **PR #17 — CLOSE (DOCUMENTATION ONLY):** Adds `docs/BABIN_RENTALS_OS_REDESIGN_BLUEPRINT_2026-10-15.md`. No code. File can be kept or archived per Babin's preference.
- **PR #19 — CLOSE (ALREADY INTEGRATED IN SPIRIT):** PROGRESS.md entry manually appended to HEAD. Branch can be deleted.
- **PR #24 — CLOSE (ALREADY INTEGRATED):** Single commit narrowing daily-closing approval. `HEAD` already has this via migration 0117, lifecycle L32, PERMISSIONS.md §4.6, rbac.ts. Verify on GitHub then close.

### PRs needing continued work (with major caveats)
- **PR #6 — REBASE + REVIEW (but PR #25 supersedes its query logic):** Rebase onto `HEAD`, keep `HEAD`'s query, adopt PR #6's test file. However PR #25 has a different (and more recent) query implementation — must choose one.
- **PR #7 — REBASE + REVIEW (with design decision):** Rebase onto `HEAD`. Babin must decide UX strategy for Client Reports (merge tabs vs separate routes).
- **PR #23 — HOLD (architecture decision required):** Two competing revenue report architectures. Babin must choose: PR #23's InteractiveTrendChart system vs HEAD's reportRevenueTrend + reports component library.
- **PR #25 / #26 — HOLD (conflict resolution required):** Massive ASTRA audit remediation. `HEAD` already has ~60% of the fixes (offline queue, evidence, salesVat). Must do surgical cherry-pick of only the missing pieces (Modal nested lock, secureStorage fixes, Phase 0 migration 0170, salesVatTruth test, financial report truth fixes) rather than wholesale merge.
- **PR #28 — REBASE + REVIEW:** Clean feature addition (EquipmentDraftPreview). No conflicts. Needs Law 1/6 review.

### Unresolved blockers
- **PR #25 vs PR #26 vs HEAD three-way conflict** on offline queue, evidence storage, salesVatReports, Modal, secureStorage
- **PR #23 vs HEAD architecture conflict** on revenue reporting
- **Babin decisions required** on: PR #7 UX, PR #23 architecture, PR #25/26 merge strategy

---

## PR decision matrix

| PR | Intended change | Main status | Evidence | Risk | Recommendation | Roadmap card |
|---|---|---|---|---|---|---|
| **#6** | Sales/VAT: real columns, pagination, error throwing, zero-VAT split, BS months, test file | **Partially integrated** — HEAD has 80%+ logic (rowsOf helper, MAX_ROWS, duplicate-id detection). PR #6 adds test file + UI copy. | `git diff origin/main...pr-6` vs HEAD. HEAD uses `rowsOf`/`completeReportRead`; PR #6 manual loop. | **Medium** — merge conflict likely; HEAD is more mature. | **REBASE + REVIEW** — keep HEAD's query, adopt test file + UI copy improvements. | T3 / T0-03 |
| **#7** | Client Reports: `liveClientActivity.ts` + `LiveClientReports.tsx` (repeat-client metrics, no mock) | **Still missing** — HEAD has `clientReports.ts` with receivables/ageing (money-gated). PR #7 is different focus. | 4 new files. PR #7 lacks Law 6 money-gating. | **Medium-High** — two implementations. PR #7 query cleaner but omits receivables. | **REBASE + REVIEW** — needs Babin UX decision (merge tabs vs separate routes). Adopt test file. | T3 / T0-03 |
| **#17** | Design blueprint doc (458 lines) | **Documentation only** — adds `docs/BABIN_RENTALS_OS_REDESIGN_BLUEPRINT_2026-10-15.md` | Single file add. No code. | **None** | **CLOSE** — keep or archive per Babin. | T0-05 |
| **#19** | R-39 budgets PROGRESS entry | **Missing from HEAD** — entry appended locally during audit. | PROGRESS.md +38 lines. | **None** | **CLOSE** — already recorded. Delete branch. | T0-05 |
| **#23** | Revenue Report: new charting system (InteractiveTrendChart, chartScale, revenueTrend rewrite) + RevenueReport.tsx rewrite | **Competing implementation** — HEAD has different revenue system (reportRevenueTrend with credit reconciliation, reports component library). | 25 files changed, 2620 insertions. New `chartScale.ts`, `InteractiveTrendChart.tsx`. | **High** — mutually exclusive architectures. PR #23 has more interactive charts; HEAD has credit reconciliation. | **HOLD** — Babin must choose architecture. If PR #23 chosen, major rewrite needed. | T3 / T4 |
| **#24** | Daily-closing approval: narrow to RLS roles, fix 8 red tests | **Already integrated** — HEAD has migration 0117, lifecycle L32, PERMISSIONS.md, rbac.ts aligned. | 1 commit `d4bea96f`. 19 files changed. | **Low** | **CLOSE** — verify GitHub status, delete branch. | T1 / T3 |
| **#25** | ASTRA Phase 0 Security Audit remediation (39K lines): evidence, offline, Modal locks, secureStorage, salesVat, financial truth, migration 0170 | **Massive partial overlap** — HEAD has offline queue (T2-10), evidence storage, salesVatReports rewrite. PR #25 has Modal nested lock, secureStorage, migration 0170, salesVatTruth test, financial report fixes. | 118 files, 39K insertions. Adds `0170_astra_phase0_authorization.sql`. | **Critical** — wholesale merge would regress HEAD's offline queue and salesVat. | **HOLD** — surgical cherry-pick only missing pieces (Modal, secureStorage, migration 0170, salesVatTruth test, financial truth). | T0 / T1 / T2 / T3 |
| **#26** | Same as PR #25 + AddItemPanel touch | **Duplicate of PR #25** with one extra file touch. | Identical commit history to PR #25 plus `1af5603a`. | **Critical** — same as PR #25. | **CLOSE — SUPERSEDED BY PR #25** — same work, PR #25 has more context. | T0 / T1 / T2 / T3 |
| **#28** | Equipment Draft Preview: unsaved equipment preview model + UI | **Net new feature** — not in HEAD. Adds `EquipmentDraftPreview.tsx`, `equipmentDraftPreview.ts`, tests. | 4 files, 183 insertions. | **Low-Medium** — clean add. Needs Law 1/6 review. | **REBASE + REVIEW** — clean rebase onto HEAD. Verify money gating. | T2 / T4 |

---

## Detailed PR findings

### PR #6 — Sales/VAT Register fixes (origin/pr-6)
*See original audit for full details — no change.*

### PR #7 — Live Client Activity Report (origin/pr-7)
*See original audit for full details — no change.*

### PR #17 — Design Blueprint (origin/pr-17)
- **Intended behavior:** Add design blueprint document `docs/BABIN_RENTALS_OS_REDESIGN_BLUEPRINT_2026-10-15.md` (458 lines) covering PRD/TRD app-flow, UI/UX, schema redesign.
- **Existing evidence on HEAD:** No such file exists.
- **Missing or conflicting behavior:** None — pure documentation add.
- **Security / money / permission / schema implications:** None.
- **Recommended next action:** **CLOSE** — documentation only. Babin decides whether to keep in `docs/` or move to `docs/archive/`.

### PR #19 — R-39 budgets PROGRESS entry (origin/pr-19)
- **Status:** Entry already manually appended to HEAD's PROGRESS.md during audit (chronologically before 2026-10-26 entries). `npm run lint:progress` passes.
- **Recommended next action:** **CLOSE** — delete `origin/pr-19` branch.

### PR #23 — Revenue Report Redesign (origin/pr-23)
- **Intended behavior:** Complete rewrite of revenue reporting with:
  - New `src/lib/intel/chartScale.ts` (chart scale computation, domain/padding logic)
  - New `src/components/ui/charts/InteractiveTrendChart.tsx` (SVG trend chart with labelled value axis, focus/touch selection, whole-rupee ticks)
  - Rewritten `src/lib/intel/revenueTrend.ts` (different aggregation logic)
  - Modified `src/lib/queries/reportRevenueTrend.ts` (different query structure)
  - New `src/components/ui/charts/InteractiveRevenueTrend.tsx` (wrapper)
  - Updated `src/modules/reports/RevenueReport.tsx` (uses new chart system)
  - New tests: `InteractiveTrendChart.test.tsx`, `chartScale.test.ts`, `revenueTrendCompare.test.ts`, `reportRevenueTrend.test.ts`, `RevenueReport.test.tsx`, `reportFamilies.test.tsx`
  - RBAC changes: `moneyVisibility.ts`, `rbac.ts` (Coordinator Finance link gating)
- **Existing evidence on HEAD:** Completely different revenue system:
  - `src/lib/queries/reportRevenueTrend.ts` — paginated invoice + credit note reconciliation, `MAX_ROWS=50000`, `INVOICE_ID_BATCH=100`
  - `src/lib/intel/revenueTrend.ts` — `aggregateIssuedRevenue`, `reconcileInvoiceCredits` functions
  - `src/modules/reports/RevenueReport.tsx` — uses `ReportAreaChart`, `ReportChartCard`, `ReportKpiStrip` from `components/ui/reports/`
  - `src/components/ui/reports/` — component library for reports (AreaChart, KpiCard, DataTable, etc.)
  - `src/styles/reportChartTokens.css`, `shadcn-preset-pilot.css`
- **Missing or conflicting behavior:** Mutually exclusive architectures:
  - PR #23: New charting primitives, simpler query, no credit note reconciliation visible in trend
  - HEAD: Credit note reconciliation built into trend, component-based charting, more sophisticated query with batching
- **Security / money / permission / schema implications:** Both gate via `EXECUTIVE_ROLES` (Owner, Admin, Manager, Accounts). PR #23 adds Coordinator Finance link gating in `ReportFamiliesNav`.
- **Test evidence:** PR #23 adds 6 new test files. HEAD has `RevenueReport.test.tsx` (existing) and `reportRevenueTrend.test.ts`.
- **Recommended next action:** **HOLD** — Babin must choose:
  - Option A: Adopt PR #23's charting system (more interactive, modern SVG charts) — requires rewriting HEAD's query to match
  - Option B: Keep HEAD's system (credit reconciliation, component library) — PR #23's chart components could be extracted as enhancements
  - Option C: Hybrid — keep HEAD's query + reconciliation, adopt PR #23's `InteractiveTrendChart` as chart component

### PR #24 — Daily Closing Approval (origin/pr-24)
- **Intended behavior:** Narrow daily-closing approval to roles RLS admits; fix 8 red tests on main.
- **Existing evidence on HEAD:**
  - Migration 0117 (`auth_is_finance_or_admin`) in `MIGRATION_LEDGER.md`
  - Lifecycle step L32 in `scripts/e2e-lifecycle.mjs` (verified 40/40 green)
  - `PERMISSIONS.md` §4.6 `closing.approve` = M+ · Accounts (Coordinator excluded)
  - `src/lib/rbac.ts` `canApproveDailyClosing` aligned with 0117
  - `src/modules/finance/DailyClosing.tsx` exists with approval logic
- **Missing or conflicting behavior:** PR #24's commit `d4bea96f` narrows roles in `approveDailyClosing.ts` and updates tests. HEAD already has this alignment.
- **Recommended next action:** **CLOSE — ALREADY INTEGRATED** — verify GitHub PR status, delete branch.

### PR #25 — ASTRA Phase 0 Security Audit (origin/pr-25)
- **Intended behavior:** Full ASTRA Phase 0 security audit remediation (39,612 insertions, 118 files):
  - **Evidence persistence:** `evidenceStorage.ts` rewrite — fail-closed session-anchored persistence
  - **Offline durability:** `offlineQueue.ts` rewrite — Dexie v3 with dedupe index, conflict resolution (`QueuedConflict`), heldMutations for legacy duplicates, `MAX_RETRIES=5`, dead-letter queue
  - **Modal nested locks:** `Modal.tsx` + `Modal.nestedLock.test.tsx` — prevent nested modal focus traps
  - **Secure storage:** `secureStorage.ts` rewrite — encryption, key rotation, integrity checks
  - **Sales/VAT truth:** `salesVatReports.ts` rewrite (count-exact pagination, MOCK fallback in mock mode, `taxableAmount` field), `salesVatTruth.test.ts`, `SalesVatReports.errors.test.tsx`
  - **Financial report truth:** `reportMoney.ts`, `clientReports.ts`, `operationReports.ts`, `productReports.ts`, `promotionsReports.ts`, `rentalReports.ts`, `staffReports.ts`, `damageMaintenanceReports.ts`, `assetRoi.ts` — honest zeros, no mock fallbacks
  - **Phase 0 authorization:** Migration `0170_astra_phase0_authorization.sql` (199 lines) — anon RPC closures, RLS hardening
  - **Driver handover modal:** `DriverHandoverModal.tsx` rewrite with evidence capture
  - **Test infrastructure:** `check-astra-phase0.mjs`, `phase0-gates.jsonl`, `vitest.audit.config.ts`
  - **Audit evidence:** 30MB+ of screenshots, JSON manifests, repro scripts
- **Existing evidence on HEAD:**
  - **Offline queue:** `src/lib/offlineQueue.ts` (T2-10) — similar v3 dedupe, but different conflict model (no `QueuedConflict` table, simpler retry)
  - **Evidence storage:** `src/lib/evidenceStorage.ts` — different implementation
  - **Sales/VAT:** `src/lib/queries/salesVatReports.ts` — HEAD's version uses `rowsOf` helper, no MOCK fallback, `MAX_ROWS=50000`, different pagination
  - **Modal:** `src/components/ui/Modal.tsx` — no nested lock handling
  - **Secure storage:** `src/lib/secureStorage.ts` — simpler implementation
  - **Financial reports:** `clientReports.ts`, `salesVatReports.ts` — HEAD has honest zeros, no mock fallback
  - **Migration 0170:** NOT in HEAD (next free is 0184)
- **Conflicts:** 
  - `offlineQueue.ts` — different v3 schema, different conflict resolution
  - `evidenceStorage.ts` — different implementation
  - `salesVatReports.ts` — three competing implementations (origin/main mock, HEAD rowsOf, PR #25 count-exact+MOCK)
  - `Modal.tsx` — PR #25 adds nested lock; HEAD has none
  - `secureStorage.ts` — different implementation
  - Migration 0170 — not in HEAD
- **Recommended next action:** **HOLD — SURGICAL CHERRY-PICK ONLY**. Do not merge wholesale. Extract only:
  1. Migration 0170 (claim as 0184 in ledger)
  2. `Modal.nestedLock` fix + test
  3. `secureStorage.ts` improvements (if HEAD's is weaker)
  4. `salesVatTruth.test.ts` + `SalesVatReports.errors.test.tsx` (test coverage)
  5. Financial report truth fixes (if any beyond HEAD)
  6. `check-astra-phase0.mjs` security gate script

### PR #26 — ASTRA Phase 0 (duplicate) (origin/pr-26)
- **Status:** Identical commit history to PR #25 plus one extra commit `1af5603a Update AddItemPanel.tsx`.
- **Recommended next action:** **CLOSE — SUPERSEDED BY PR #25** — same work, PR #25 has more context. Delete branch.

### PR #28 — Equipment Draft Preview (origin/pr-28)
- **Intended behavior:** Add unsaved equipment preview model and UI:
  - `src/components/records/EquipmentDraftPreview.tsx` — responsive preview component (bottom sheet mobile, modal tablet/desktop)
  - `src/components/records/equipmentDraftPreview.ts` — preview data model
  - `src/components/records/equipmentDraftPreview.test.ts` — 43 lines, tests
  - `src/components/records/RecordForm.tsx` — integration point
- **Existing evidence on HEAD:** No `EquipmentDraftPreview` component. `RecordForm.tsx` exists but no preview integration.
- **Security / money / permission / schema implications:** 
  - Preview shows equipment identity, location, condition — no money fields visible (Law 6 OK if respected)
  - Need to verify `RecordForm.tsx` integration doesn't leak money-blind data
  - Component appears to be presentational only (Law 1 OK)
- **Test evidence:** 1 test file added (43 lines).
- **Recommended next action:** **REBASE + REVIEW** — clean rebase onto HEAD (no conflicts expected). Verify Law 6 gating in preview data. Run full gate suite.

---

## Duplicates, overlaps and migration conflicts

| Overlap | PRs / Branches | Conflict detail | Resolution |
|---|---|---|---|
| Sales/VAT query logic | PR #6 vs PR #25 vs HEAD | Three implementations: HEAD (`rowsOf` helper, MAX_ROWS), PR #6 (manual loop, test file), PR #25 (count-exact, MOCK fallback). All fix same schema issues. | **Keep HEAD's query** (most robust). Adopt PR #6's test file. Adopt PR #25's `salesVatTruth.test.ts` + error tests. |
| Offline queue / evidence storage | PR #25 vs HEAD | Both rewrite `offlineQueue.ts` and `evidenceStorage.ts` with different architectures. PR #25 has `QueuedConflict` table, `heldMutations`, `MAX_RETRIES`. HEAD has simpler v3 dedupe, reactive `onQueueChange`. | **Keep HEAD's offline queue** (T2-10 verified, 38/38 lifecycle). Cherry-pick PR #25's conflict resolution model ONLY if needed for Phase 9. |
| Modal nested locks | PR #25 vs HEAD | PR #25 adds nested lock handling + test. HEAD has basic Modal. | **Adopt PR #25's Modal fix + test** — safety improvement, no regression. |
| Secure storage | PR #25 vs HEAD | Different implementations. PR #25 has encryption, key rotation, integrity. | **Compare and adopt stronger** — security hardening. |
| Revenue reporting | PR #23 vs HEAD | Two complete, different systems. PR #23: InteractiveTrendChart + new query. HEAD: reportRevenueTrend + credit reconciliation + reports component lib. | **Babin decision required** — see Questions section. |
| Migration 0170 | PR #25 only | Phase 0 authorization migration (anon RPC closures, RLS hardening). Not in HEAD. | **Claim as 0184** in ledger, apply via surgical cherry-pick. |
| Equipment Draft Preview | PR #28 only | Net new feature. No overlap. | **Clean rebase** — no conflicts. |

---

## Proposed safe cleanup order

1. **Immediate (Babin action, no code change):**
   - Check GitHub web UI for PRs #17, #24 status (confirm merged/closed).
   - Delete `origin/pr-19` branch (already recorded).
   - Close PR #26 as superseded by PR #25.

2. **PR #17 (documentation only):**
   - Babin decides: keep `docs/BABIN_RENTALS_OS_REDESIGN_BLUEPRINT_2026-10-15.md` or move to `docs/archive/`.
   - Delete `origin/pr-17` branch.

3. **PR #24 (daily closing):**
   - Verify GitHub PR #24 shows merged/closed.
   - Delete `origin/pr-24` branch.

4. **PR #19 (R-39 budgets):**
   - Already appended to PROGRESS.md locally. `npm run lint:progress` passes.
   - Delete `origin/pr-19` branch.

5. **PR #28 (Equipment Draft Preview):**
   - Create rebase branch: `git checkout -b rebase/pr-28 origin/pr-28 && git rebase HEAD`
   - Verify Law 6 gating in preview data model
   - Run full gate suite: `typecheck → VITE_DATA_SOURCE=mock test → check:pglite → check:lifecycle → lint → build`
   - If green, Babin merges locally; delete `origin/pr-28`.

6. **PR #6 (Sales/VAT):**
   - Create rebase branch: `git checkout -b rebase/pr-6 origin/pr-6 && git rebase HEAD`
   - Keep HEAD's query, adopt test file + UI copy improvements
   - Run full gate suite
   - If green, Babin merges locally; delete `origin/pr-6`.

7. **PR #7 (Client Activity):**
   - **WAIT FOR BABIN UX DECISION** (see Questions)
   - Once decided, rebase, implement, add money-gating, adopt test file
   - Run full gate suite

8. **PR #25 (ASTRA Phase 0) — SURGICAL CHERRY-PICK:**
   - Create branch: `git checkout -b cherrypick/astra-phase0 HEAD`
   - Apply migration 0170 as 0184 (claim in `MIGRATION_LEDGER.md`)
   - Apply `Modal.tsx` nested lock fix + `Modal.nestedLock.test.tsx`
   - Apply `secureStorage.ts` improvements (diff review required)
   - Apply `salesVatTruth.test.ts` + `SalesVatReports.errors.test.tsx`
   - Apply financial report truth fixes (diff review required)
   - Apply `check-astra-phase0.mjs` + `phase0-gates.jsonl`
   - **Do NOT apply:** `offlineQueue.ts`, `evidenceStorage.ts`, `salesVatReports.ts` (HEAD versions superior/verified)
   - Run full gate suite including `check:pglite` + `check:lifecycle`
   - If green, Babin merges locally.

9. **PR #23 (Revenue Report) — ARCHITECTURE DECISION:**
   - **WAIT FOR BABIN DECISION** (see Questions)
   - Once chosen, implement selected architecture
   - Run full gate suite

10. **Branch triage (T0-04):**
    - After all PR cleanup, run `git ls-remote --heads origin` — should show only `main` and active `lane-*/<card>` branches.
    - Tag unmerged deleted branches: `git tag archive/<branch> <sha>` then `git push origin --delete <branch>`.
    - Record tags in `docs/archive/BRANCHES_2026-10.md`.

---

## Verification commands and acceptance checks

For each rebase/merge candidate, run **in order** (CI is off — local gates are the standard):

```bash
# 1. TypeScript strict check
npm run typecheck

# 2. Full test suite (mock mode auto-detected)
VITE_DATA_SOURCE=mock npm test

# 3. Database gates (if SQL changed)
npm run check:pglite && npm run check:lifecycle

# 4. Lint (src only, max-warnings 0)
npm run lint

# 5. Production build
npm run build

# 6. Progress lint (if PROGRESS.md modified)
npm run lint:progress

# 7. Contrast check (WCAG AA)
npm run check:contrast
```

**Acceptance for PR #28 rebase:**
- `EquipmentDraftPreview.tsx`, `equipmentDraftPreview.ts`, test file exist
- Law 6 verified: no money fields in preview payload/UI for floor roles
- All 7 gate commands exit 0.

**Acceptance for PR #6 rebase:**
- `salesVatReports.test.ts` exists and passes (8 tests).
- `SalesInvoiceItem` has `taxableAmount` field populated.
- KPI notes match PR #6's "Internal Review" language.
- CSV headers use "VAT-taxable Sales", "0%-VAT Sales (review)".
- All 7 gate commands exit 0.

**Acceptance for PR #7 rebase:**
- `liveClientActivity.ts` and `LiveClientReports.tsx` exist on rebased branch.
- Component has `useCanViewMoney` guard (hidden for money-blind roles per §3).
- `liveClientActivity.test.ts` exists and passes (4 tests).
- CSV export respects money-gating.
- All 7 gate commands exit 0.

**Acceptance for PR #25 cherry-pick:**
- Migration 0184 applied (claim in ledger, verify `check:pglite`).
- `Modal.nestedLock.test.tsx` passes.
- `secureStorage.ts` improvements verified (no regression).
- `salesVatTruth.test.ts` + `SalesVatReports.errors.test.tsx` pass.
- Financial report truth: all report queries throw on error/empty, no mock fallback.
- `check-astra-phase0.mjs` runs and passes.
- All 7 gate commands exit 0.

**Acceptance for PR #19 closure:**
- PROGRESS.md contains 2026-10-15 entry with three R-39 measurements.
- `npm run lint:progress` exits 0.
- `origin/pr-19` branch deleted.

---

## Questions only Babin can decide

1. **PR #7 UX strategy:** Should Client Reports have:
   - (A) One component (`ClientReports.tsx`) with two tabs: "Directory & Receivables" (current) + "Repeat Activity" (PR #7's metrics merged into `clientReports.ts`)?
   - (B) Two separate routes: `/reports/clients` (current, money-gated) and `/reports/clients/activity` (PR #7, visible to all staff per §3, no money)?
   - (C) Replace live path entirely with PR #7's simpler repeat-client view? (Not recommended — loses receivables/ageing.)

2. **PR #23 Revenue architecture:** Which revenue reporting system to keep?
   - (A) PR #23's system: `InteractiveTrendChart` (SVG, focus/touch, whole-rupee ticks), new `chartScale.ts`, simpler query, no credit reconciliation in trend.
   - (B) HEAD's system: `reportRevenueTrend` with credit note reconciliation, `MAX_ROWS=50000` batching, `ReportAreaChart`/`ReportChartCard` component library, more sophisticated aggregation.
   - (C) Hybrid: HEAD's query + reconciliation, PR #23's `InteractiveTrendChart` as chart component.

3. **PR #25/26 ASTRA merge strategy:** Given HEAD already has verified offline queue (T2-10, 38/38 lifecycle) and salesVatReports:
   - (A) Surgical cherry-pick only (migration 0170→0184, Modal nested lock, secureStorage, salesVatTruth tests, financial truth fixes, phase0 gate script) — **recommended**
   - (B) Full merge of PR #25 — **not recommended** (regresses verified T2-10 work)
   - (C) Full merge of PR #26 — **not recommended** (same as PR #25)

4. **PR #6 CSV "taxableAmount" column:** PR #6 adds `taxableAmount` to tax register CSV. HEAD uses `subtotal`. Which is correct for IRD filing? (Accountant input needed — see OPEN_DECISIONS.md O-7.)

5. **PROGRESS.md chronology:** The 2026-10-15 R-39 entry was inserted chronologically (before 2026-10-26 entries). Current convention is newest first. Keep chronological or move to top?

6. **Equipment Draft Preview (PR #28) scope:** Is unsaved equipment preview a T2 floor feature or T4 inventory feature? Affects lane assignment.

---

## Remaining unknowns / evidence needed

1. **GitHub PR status for #17, #24:** Confirm on web UI whether merged/closed/open.
2. **PR #6 test file integration:** Uses `vi.mock('../../supabase')` pattern. Confirm matches HEAD's test conventions.
3. **PR #7 Kathmandu date conversion:** Uses `kathmanduCivil(new Date(utc))` for `created_at` → AD date. HEAD's `clientReports.ts` uses `pickup_at` for period filtering. Confirm correct timestamp for "last booking created."
4. **PR #25 offline queue conflict model:** `QueuedConflict` table with resolution UI — is this needed for Phase 9 (T2-11) or can HEAD's simpler model suffice?
5. **PR #25 secureStorage.ts:** Full diff review needed vs HEAD to determine which is stronger.
6. **PR #23 chartScale.ts:** Can `InteractiveTrendChart` be extracted as standalone component for HEAD's system?
7. **Migration ledger sync:** `MIGRATION_LEDGER.md` next free is 0184. PR #25's migration 0170 should be claimed as 0184. PR #28, #6, #7, #17, #19, #24 have no migrations. Confirm no hidden migration needs.

---

## Changes made during audit (local, not pushed)

1. **Appended PR #19's PROGRESS.md entry** to HEAD's PROGRESS.md (chronological position before 2026-10-26 entries). `npm run lint:progress` passes.
2. **Fetched all 6 missing PR branches** from GitHub via `git fetch origin pull/XX/head:pr-XX` for #17, #23, #24, #25, #26, #28.
3. **No other mutations** — all `git` commands read-only (`log`, `diff`, `show`, `branch`, `rev-parse`, `fetch`). No `checkout`, `rebase`, `merge`, `push`, or file edits beyond PROGRESS.md append.

---

**Audit completed by:** Nemotron 550B / OpenCode (read-only)
**No repository state was mutated on remote.** Local PROGRESS.md modified only to append PR #19 entry (lint:progress verified).