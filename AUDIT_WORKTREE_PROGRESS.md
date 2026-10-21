# Current continuation — 21 October 2026, integrated local fixes

## UI fixes — checkpoint before final gate results

- The previous complete run passed 5,130/5,131 tests; database, financial integrity, security, lifecycle, contrast and build commands passed. Source changed during verification, so it did not certify the checkout. Preserved at `docs/verification/ASTRA_UI_INTEGRATION_CHECKPOINT_2026-10-21.json`.
- Repaired stale environment/payment/profile test contracts. Scoped checks: 107 integration cases and 15 header-ownership cases passed, with disabled-payment, notes-access and Escape focus behavior retained.
- Fixed the calendar footer Today action to restore the operational Today preset. Three regressions failed before the fix; 38 dashboard/calendar/overflow/New Rental tests pass afterward. Ordinary date selection keeps its existing behavior.
- Increased the shared overflow trigger from 36px to 44px; 18 related cases pass. Reduced phone header gaps to fit the supported 360px viewport without shrinking the 110px title floor or any 44px action.
- Real browser assertions pass: desktop Today keeps identical panel geometry and overdue context after footer Today; all five booking-header buttons fit at 360px (profile right edge 348px); catalogue bottom 729.79px stays above bottom navigation at 742px. These are mock-preview samples, not complete device/offline/hosted acceptance. Evidence: `docs/verification/astra-responsive-2026-10-21/fixed-regressions.json`.
- A new complete local gate run is underway in `docs/verification/ASTRA_LOCAL_2026-10-21.json`; no result is assumed. All existing local changes, recovery points, data and offline work are preserved. No hosted mutation, push, PR or reset.

## 21 October continuation — confirmed-booking readback

- Resumed clean at `5d26cf8d`, recovery branch `codex/recovery-before-confirmation-readback-20261021`. New shell/L1 and other sessions' changes are preserved.
- The completed 20 October checker passed 4,948 tests and every command, but recorded changes during tests/security/lifecycle/build. It is historical for the newer merge; no current-source pass is carried forward.
- Actual source fix in `availability.ts` and `confirmRental.ts`: complete reservation pages; unavailable summaries become `null` in successful confirmed results/events, preserving the non-throwing post-commit contract. Missing, failed, repeated or invalid data can no longer become fabricated zero counts or partial totals.
- Seven new regressions failed before the fix; 207 focused checks passed afterward. Tests/affected files and remaining work are in `PROGRESS.md`; later integration evidence is `docs/verification/ASTRA_LOCAL_2026-10-21.json`.
- No hosted mutation or real business-data writes; no source/config/data replacement, reset, push, PR or offline-work deletion. Pre-commit confirmation-line counts, shared workflows, tax/document/evidence decisions and device/hosted acceptance remain open.

## Next batch — booking-planning inputs

- Started from clean `ba2f80cb`, recovery `codex/recovery-before-planning-reads-20261020`.
- Confirmed and corrected truncated booking-line and tracking/stock metadata reads in `src/lib/queries/availability.ts`, including the existing explicitly granted nonfinancial base fallback. Missing datasets and later-page failures now stop the plan instead of returning incomplete inputs.
- Eight new regressions failed before the source fix; after it, 200/200 across five suites pass, including all 19 completeness and 58 confirmation-action tests. Full gates are running; `docs/verification/ASTRA_LOCAL_2026-10-20.json` records actual results, not an assumed carry-forward pass.
- The earlier 4,931-test source-matched result is preserved as `docs/verification/ASTRA_AVAILABILITY_CHECKPOINT_2026-10-20.json`. It does not certify these later edits. Post-confirmation summary semantics and the other remaining acceptance items below stay open. No business-data or hosted changes were made.
- Another session changed Finance/PDF and handover/return files during the first full-suite attempt. That run was interrupted and preserved as `ASTRA_PLANNING_INTERRUPTED_2026-10-20.json`, without a full pass claim. After a stable-source check, the complete checker was restarted against the combined source; all external edits remain intact.

## Earlier availability checkpoint

- Recovery: `codex/recovery-before-availability-20261020` at `790ddc7a`, plus a local temporary copy of existing uncommitted work. Other sessions' changes are preserved. No clone, remote write, reset, push or PR.
- **WF-06 confirmed and source corrected:** equipment candidates, serial/quantity holds and open-reset work now read stable ordered pages until an empty page; incomplete/error/repeated results stop the preview. Unreadable hold periods also stop the preview. Files: `src/lib/queries/availability.ts`, existing availability query test fixture, new `availabilityCompleteness.test.ts`. Before: 11 regressions failed; after: 134 related tests, targeted lint/typecheck and full current-source gates pass; see the final verification below. GiST/capacity and custody rules are unchanged.
- **WF-01 financial checkpoint verified locally:** complete Sales/VAT registers and exports, recorded invoice discounts, validated integer amounts and aggregate bounds; 8 new cases passed. The unchanged-source checkpoint passed 4,879 tests plus coverage, lint, rebuild, financial/security/lifecycle, contrast and build. Durable receipt: `docs/verification/ASTRA_FINANCE_CHECKPOINT_2026-10-20.json`.
- **REL-01 follow-up corrected:** a delayed network failure formerly queued the submitting account's payload under a later login/project. Identity is now captured before the request and retained through durable enqueue/duplicate receipt validation. Before: 3 failed reproductions. After: 4 identity cases and 36 focused tests passed. Files: `dataAccess.ts`, `offlineQueue.ts`, identity/durability tests. Actual device acceptance remains open.
- **UI-01–03 / Team Notes live mitigation:** live Productions, Staff Shift Handover, Warranty and Notes refuse prototype reads/writes and show unavailable states. Existing local entries are preserved, and mock prototypes remain confined to mock mode. Files: four query modules, ProductionsList, WarrantyTracker, ShiftHandoverPanel, InternalNotesPage/Drawer, `localOnlyTools.live.test.tsx`. Before: 9 original and 4 notes cases failed; after: all 13 live cases and 44 focused tests passed. Shared backends are still OPEN.
- **QA-02:** incomplete-count receipts are refused; Node regression suite 6/6. The subsequent full run passed 4,899 tests and all commands, but source changed during lint/tests. Preserved at `docs/verification/ASTRA_PRE_AVAILABILITY_CHECKPOINT_2026-10-20.json`; it does not certify this newer source. The fresh run records per-gate hashes in `docs/verification/ASTRA_LOCAL_2026-10-20.json`.
- **Release remains HOLD:** hosted JWT/Storage, legacy ownership/recovery, shared workflows, VAT classification, document/evidence acceptance, responsive/device checks and performance remain outstanding. The previous browser attempt did not render a usable page; no layout pass is claimed. Migration 0170 is locally tested, NOT APPLIED and NOT PRODUCTION-VERIFIED.

### Final local verification for this checkpoint

- **Current source verified locally:** fingerprint `ae78994762597f7fd9df832378ef184b77eed5f5a2cbf7402882c1bbc4adb0f8`, 387 files / **4,931 tests passed**, zero failed/skipped, with coverage. Full lint, receipt tests, 168 migrations, financial integrity, 15 SQL security groups, 31 lifecycle steps, 82 contrast checks, shell/UI-copy checks, final complete typecheck and production build passed against that same fingerprint. Durable source assessment: `docs/verification/ASTRA_LOCAL_2026-10-20.json`.
- The first typecheck overlapped edits, so the conservative batch runner exits 1 and retains `sourceUnchangedSinceStart: false`. The final complete typecheck is stable and supersedes it. The separate computed current-source assessment requires every necessary check, including full tests and build, to match the current fingerprint; it is true. No raw failure/change flag was erased.
- Coverage: statements 64.48%, branches 73.61%, functions 50.05%, lines 64.41% for configured coverage scope. Build: main 704.47 kB / gzip 199.61 kB; New Rental 278.83 kB; scanner vendor 453.49 kB. Large-chunk warning remains; startup/device performance is unmeasured.
- Migration 0170 is **locally VERIFIED**, **NOT APPLIED**, **NOT PRODUCTION-VERIFIED**. Browser retry failed attaching to the existing preview (`Emulation.setFocusEmulationEnabled` timeout); the temporary mock preview server was stopped, without touching user data or other servers. Desktop/iPad/mobile acceptance remains OPEN.
- Completion was generated with `npm run completion`; its static import classification is not a release score. Remaining acceptance above and `docs/REMAINING_WORK.md` still apply.

## Earlier continuation notes — historical

- Started from clean `main` at `b00b60e2`; created local recovery branch `codex/recovery-before-astra-continue-20261020-b00b60e2` before editing. Later automatic commits and other sessions' changes are preserved.
- Retrieved the completed prior checker: 168 migrations rebuilt, 15 Phase 0 security groups passed, lifecycle 31/31, contrast and live-mode build passed. Its full suite had 4,827 / 4,837 passing tests and 10 failures. Several gates recorded source changes during execution; these results are historical evidence, not certification of today's newer source.
- Revalidated the reported interface failures against current code and its newer 20 October information-drawer ruling. Header slots, notes and rental summary tests have already changed in this shared checkout; no old UI was restored.
- Confirmed a current financial defect: Sales/VAT registers and exports kept only ten invoices while totals included more, and Net Sales ignored recorded discounts. Added `salesVatCompleteness.test.ts`; all 8 regressions failed before the source change (`artifacts/astra-sales-register-before-20261020.log`).
- Updated `salesVatReports.ts` to read stable ordered pages through an empty confirmed page, retain every register row, refuse a failed/repeated/incomplete page, use validated integer paisa and refuse unsafe aggregate totals. Net Sales deducts recorded invoice discounts; register subtotal remains the recorded gross subtotal. Updated the CSV metric label in `SalesVatReports.tsx`; report test client now honors range boundaries.
- Also reproduced and corrected QA-02's incomplete-count hole: a nominally green test receipt with missing test outcomes is refused. The Node regression failed before the fix (5 passed / 1 failed) and now passes 6/6 (`artifacts/astra-receipts-before-20261020.log`, `astra-receipts-after-20261020.log`).
- Current typecheck and focused report/interface tests are running; their results will be recorded below. The completion generator and progress-format lint passed; the generator labels the historical full-suite receipt as current source NOT VERIFIED. No full verification claim is made yet. No live Supabase change, destructive reset, push, pull request or real business-data write was performed.

## Previous integration checkpoint — 20 October 2026

**Current candidate status:** the original 13-group SQL checkpoint below predates the latest bearer-link protection. Migration 0170 now also denies unredacted originals to Client, protects `document_registry.file_url` / `signature_url` with column ACLs, and exposes a guarded original-location RPC for money-visible staff. Document lists retain safe metadata. Both PDF exporters now use authenticated immutable paths, persist stable locations, and require attachment receipts. These latest changes are WRITTEN and awaiting the final unit / rebuild / lifecycle / live-mode build results; do not carry forward the earlier VERIFIED label to this extension. No migration has been applied remotely.

- Current folder is on main at dc6ccc00, initially clean. Earlier Phase 0 work was saved on fix/session-evidence-fail-closed at b9339b37 and was absent from main.
- Created local recovery branch codex/recovery-before-astra-main-20261020 before editing. Ported only Phase 0 authorization, document storage, outbox, sync and regression files. Preserved main's newer report/UI implementation; no blanket branch merge or replacement.
- Added durable-write confirmation to dataAccess, including regressions: an unavailable IndexedDB queue must refuse a save instead of returning queued success.
- Extended Storage boundary to deny anonymous legacy policy access and make business buckets private when the hosted public column exists. Added a local SQL regression for both.
- Current gates are running in session 16978. Logs: astra-main-*.log; machine-readable outcomes: astra-main-gates.jsonl. Previous branch results below do NOT certify this main checkout.
- Migration 0170 is WRITTEN, pending current local verification. NOT APPLIED and NOT PRODUCTION-VERIFIED. No remote access, push, PR, database reset or business-data creation.
- Remaining: finish current gates; fix regressions; then revalidate financial, operations and responsive findings against current main. Hosted JWT/Storage, legacy object reconciliation and real-device acceptance remain pending.

---

## Earlier branch checkpoint (historical; includes obsolete process handles)

# ASTRA Local Fix Progress

This is the active implementation log for the local fixes requested on 19 October 2026. The original audit and AUDIT_WORKTREE_PROGRESS.md under docs/audits/ASTRA-2026-10-19 remain immutable evidence for their audited revision; they do not certify this working copy.

## 2026-10-19 — Phase 0 local fixes verified; financial follow-up next

### Recovery and scope

- Working directly in the existing project on branch `fix/session-evidence-fail-closed`.
- Initial Git status was clean at `c9ea1297`. Local recovery branch: `codex/recovery-before-astra-phase0-20261019`.
- No clone, remote push, pull request, live Supabase access, database reset or business-data seeding performed.
- Other edits appearing concurrently in the shared folder are preserved. The small Driver Handover type corrections below accommodate those edits.

### Phase 0 fixes implemented and locally verified

| Finding | Actual source changes | Regression evidence |
|---|---|---|
| SEC-01 | Migration 0170 replaces authenticated bucket-wide access with scoped document ownership/registry links and assigned session evidence. Documents/evidence cannot be overwritten or deleted by app users. Legacy unregistered paths remain stored but fail closed. `documentStorage.ts` uses authenticated immutable upload paths, removes browser bucket creation and refuses invented viewing URLs. | `scripts/check-astra-phase0.mjs`: own/foreign/orphan documents, insert/update/delete denials, assigned/unassigned and completed-session evidence. `documentStorage.test.ts`: authenticated uploads, immutable versions and signing/upload failure paths. Hosted Storage API still NOT VERIFIED. |
| SEC-02 | Migration 0170 revokes API-role execute on internal estimate helper. Daily-rate helper refuses direct money-blind scalar reads while preserving Warehouse server pricing inside the existing creation transaction. | SQL regression loops all nine roles for estimate access and allowed/refused rate reads; lifecycle gate must also pass. |
| SEC-03 | Migration 0170 binds authenticated direct audit actor/role/time server-side and refuses direct external Client audit submission. Trusted definer event actors remain intact. | SQL Client forgery refusal and persisted staff actor readback. |
| SEC-04 | Migration 0170 protects OLD Owner/Admin targets as well as NEW elevated roles, preserves Admin ordinary self-profile edits and existing last-Owner rules, and prevents user-ID replacement. | SQL Admin demotion/Owner edit/self-role/identity replacement refusals; positive Owner staff administration and Admin self-profile checks. |
| SEC-05 | Migration 0170 limits Driver booking/line reads to assigned open jobs on active bookings. Direct client-directory and definer-view bypasses are closed; a narrow `driver_trip_context` response exposes only the assigned trip header, client contact and item fields. Staff roster exception remains as ruled in PERMISSIONS P9. | SQL unassigned/assigned/terminal-trip checks, foreign-trip refusal, masked-view checks and narrow response assertions. |
| REL-01 | `offlineIdentity.ts` captures the submitting account/project and pins replay credentials in memory. `offlineQueue.ts` stores identity identifiers only, filters work/conflicts by identity and never adopts unattributed legacy work. Dexie v5 preserves old duplicate-key payloads in a held-work store before adding the uniqueness index. `syncEngine.ts` surfaces held work without exposing another user's payload or claiming everything synced. | `offlineIdentity.test.ts`, `offlineQueue.phase0.test.ts`, `syncEngine.phase0.test.ts`: account/project switching, token capture, unknown legacy identity, blocked cross-user conflict resolution and held-work status. |
| REL-02 | Queued inserts/updates and force-local conflict resolution require a matching server receipt. Zero-row updates and unconfirmed duplicate inserts retain pending work; duplicates resolve only after matching readback. | Actual Dexie using test-only fake IndexedDB: zero-row/confirmed update, empty insert receipt, duplicate readback and force-local zero-row cases. |

### Affected files and verification tooling

- `supabase/migrations/0170_astra_phase0_authorization.sql` — WRITTEN + VERIFIED locally: migration rebuild and lifecycle passed together. NOT APPLIED / NOT PRODUCTION-VERIFIED.
- `src/lib/offlineIdentity.ts`, `src/lib/offlineQueue.ts`, `src/lib/syncEngine.ts`, `src/lib/documentStorage.ts`, `src/actions/documents/createDocument.ts` (upload refusal no longer fabricates a document registry entry).
- `src/lib/__tests__/offlineIdentity.test.ts`, `offlineQueue.phase0.test.ts`, `syncEngine.phase0.test.ts`, updated `documentStorage.test.ts` and `src/actions/documents/__tests__/createDocument.test.ts`.
- `scripts/check-astra-phase0.mjs`, `package.json`, `package-lock.json`, `.github/workflows/ci.yml`: new `check:security` local SQL regression gate, included in CI; exact test-only fake-indexeddb dependency.
- `src/modules/operations/DriverHandoverModal.tsx`: optional MIME fallback and direct FloorVerbResult field references corrected; other concurrent handover edits preserved.

### Verification ledger

- Latest typecheck PASS: phase0-current-typecheck.log. A prior rerun caught an unused import while shared financial files were being edited; the current source uses the import and rechecks cleanly.
- Lint PASS: phase0-lint-final.log.
- Full suite PASS: **380 files / 4,760 tests**, phase0-test-final.log (includes the v1-to-v5 queue preservation case). The earlier one-failure run is retained; the Pulse fixture now initializes its mock client exactly as app bootstrap does.
- Focused storage/outbox/action regressions: **33/33**, phase0-focused-final.log.
- Migrations: **168/168**, phase0-check-pglite.log; **12 authenticated security regression groups**, phase0-check-security.log; lifecycle **31/31**, phase0-check-lifecycle.log. Same-run local migration/lifecycle proof satisfies the local VERIFIED state; no hosted verification is implied.
- Production build PASS, phase0-build.log; shipped chunks include the v5 held-work store and fail-closed document action. Contrast PASS, phase0-check-contrast.log.
- phase0-gates.jsonl retains both initial failures and successful reruns rather than rewriting history. phase0-source-manifest.json records source hashes for the verification checkpoint. Financial report files changed subsequently in this shared folder; their remediation needs separate tests and a fresh complete verification pass after Phase 1.
- Recovery branch remains codex/recovery-before-astra-phase0-20261019 at c9ea1297. Nothing was pushed or applied remotely.

### Remaining

- Continue financial/report correctness and its regression coverage. Phase 0 local checks pass; repeat complete gates after subsequent changes.
- Hosted JWT/Storage behavior, deployment state and physical devices remain unverified. No live migration will be applied by this task.
- Legacy orphan Storage paths and unattributed pending offline work require explicit, evidence-backed reconciliation; they are retained, not exposed, deleted or silently reassigned.
- Remaining audit tasks: WF-01–08, UI-01–06, QA-01/02, PERF-01, plus the full acceptance ledger in docs/REMAINING_WORK.md. UI/QA entries overlapping Phase 0 remain scoped to their actual checks.

## 2026-10-19 — Phase 1 started: Sales/VAT read failures

- Confirmed a denied live read was converted to a successful zero-activity report; a new regression failed before the change.
- Changed src/lib/queries/salesVatReports.ts to distinguish true empty results from unavailable/denied/missing responses. Live errors now reject instead of becoming zero financial statements.
- Changed src/modules/reports/SalesVatReports.tsx to show loading/error/Retry states, clear stale figures while changing filters, and skip financial requests entirely for money-blind roles.
- Added src/lib/queries/__tests__/salesVatTruth.test.ts and src/modules/reports/__tests__/SalesVatReports.errors.test.tsx. All four focused tests pass (phase1-sales-vat-ui.log), including retry and money-blind request refusal.
- Full Phase 1 verification is running in local command session 47654; results append to phase1-gates.jsonl. Do not claim those gates have finished until their process/result is inspected.
- WF-01 remains PARTIAL: review all actual invoice schema/amount fields, integer-paisa aggregation, taxable/exempt/effective-rate semantics, month grouping, full pagination and export reconciliation before closure. Other shared report edits also require direct regression evidence.
- Desktop/iPad/mobile browser acceptance is still pending; phone component tests are not a substitute for rendered device checks.

### Phase 1 live verification handles

- Session 47654 is the existing sequential gate run; last confirmed live while the full test suite was executing. Do not restart solely because its output pauses.
- Session 18441 is the typecheck rerun after correcting the shared promotions-report literals (counts remain in their existing top-level fields; unsupported duplicate metrics fields were removed). Last confirmed live.
- Initial Phase 1 typecheck failed on those three unsupported properties; the initial failure remains in phase1-typecheck.log. Lint passed. Focused Sales/VAT query/UI tests passed 4/4. Remaining global results are pending.

## 20 October follow-up — current main evidence

- SQL: 168 migrations, 13 authenticated security groups and 31 lifecycle steps pass in this session's run; contrast 82/82. 0170 VERIFIED locally, not applied remotely.
- Focused source regressions: 49 storage/outbox/durability tests; 5 Driver Handover tests; 5 completion-receipt tests pass.
- Additional files: evidenceStorage.ts + evidenceStorage.test.ts; DriverHandoverModal.tsx + its tests; scripts/test-receipt.mjs, test-receipt.test.mjs and completion.mjs, CI receipt step. Pulse fixture now explicitly initializes its mock backend, avoiding accidental live reads.
- QA-02: default completion output actually labels the 16 October receipt historical/current-source NOT VERIFIED. New --tests runs require structured output, capture source fingerprints and preserve failed/incomplete outcomes instead of falling back to old green counts.
- First full-suite exit was zero without a saved final summary. Rechecking with structured JSON in session 56549; build session 16978 still active. Do not claim full-suite/build completion from those intermediate states.
- Current mock browser connection failed twice; no responsive acceptance claimed. Temporary server stopped.
- Financial follow-up confirmed from actual main source: reportSupport recomputes flat-rate line totals instead of using the immutable stored total; fix and regressions are next after Phase 0 checks finish.

## Final sequential pass — 20 October

- Initial mock-mode build completed: 213 precache entries; main chunk 713.04 kB. This is not a live-mode production acceptance result.
- Low physical memory (below 0.5 GB free) was confirmed while other checks ran. Stopped only this task's structured recheck (56549); retained its logs. No app data or other tasks were stopped.
- Financial source fix: src/lib/queries/reportSupport.ts now reads stored line_total from booking_lines_v, decodes exact paisa, preserves zero and refuses malformed/unsafe amounts; legacy rows alone use the previous fallback. Tests in reportStoredTotals.test.ts reproduced 6 failures before the fix; 8 pass after. Existing report/Pulse tests pass too: 41/41, astra-reports-after.log. Original WF-02 hundredfold conversion is already corrected on current main; this is the additional persisted-price discrepancy confirmed here.
- Offline mock session compatibility is retained without weakening live token requirements; two new offlineIdentity regressions are included in the final suite.
- QA-02 Node regressions pass 5/5. Completion output now calls old receipts historical.
- Final ordered run: session 23374; astra-final-gates.jsonl and astra-final-*.log. One test worker, structured test receipt with source hashes, then SQL gates and a live-mode production build in a unique temporary folder. Do not claim final completion before inspecting these outcomes.

## 2026-10-21 09:41 NPT — Fix REL-01
- Workspace/branch/SHA: C:\Users\use\Desktop\babin-rentals-os; main; initial 5d26cf8d8a420c07400b1124a0fafb1b6e7b3710, continuation 43dec886bb98d82138f7f87b4fe3fd532f8933f4.
- Previous local changes preserved: Icon recovery copy/patch and progress snapshot in artifacts/astra-20261021-024418; subsequent shared edits retained.
- Evidence/reproduction on actual local tree: Replay had only a per-tab mutex and recovered every syncing row before acquiring shared ownership. Replay and conflict resolution now share an origin-wide Web Lock; missing coordination refuses replay. Original actor/project token capture remains intact.
- Files changed: src/lib/offlineQueue.ts; src/lib/__tests__/offlineQueue.phase0.test.ts.
- Migration files added (local only): none; existing 0170 retained.
- Summary of code correction: Replay had only a per-tab mutex and recovered every syncing row before acquiring shared ownership. Replay and conflict resolution now share an origin-wide Web Lock; missing coordination refuses replay. Original actor/project token capture remains intact.
- Data preservation/recovery path: browser data untouched; no migration or queue entries deleted. Fake IndexedDB fixtures alone are reset by tests.
- Tests added or modified: Two new coordination tests failed before the change; the combined Phase 0 suite passes 29 checks. Branch-context/revocation and real multi-tab/browser recovery acceptance remain open.
- Commands executed with actual pass/fail counts: see artifacts/astra-20261021-024418/*.log and machine-readable gate receipts; no interrupted run claimed passing.
- Manual browser/device results: browser attachment unavailable; physical devices NOT VERIFIED.
- Current state: PARTIAL.
- Remaining risk or missing business decision: final full verification; hosted/device acceptance and documented OPEN_DECISIONS remain open.
- Safe rollback guidance: revert only this fix's source changes after preserving subsequent work; do not delete queue/storage bytes or undo applied migrations.

## 2026-10-21 09:41 NPT — Fix REL-02
- Workspace/branch/SHA: C:\Users\use\Desktop\babin-rentals-os; main; initial 5d26cf8d8a420c07400b1124a0fafb1b6e7b3710, continuation 43dec886bb98d82138f7f87b4fe3fd532f8933f4.
- Previous local changes preserved: Icon recovery copy/patch and progress snapshot in artifacts/astra-20261021-024418; subsequent shared edits retained.
- Evidence/reproduction on actual local tree: A uniqueness violation followed by a permission-denied readback used to delete pending work. It now preserves payload/idempotency key as unresolved until a matching receipt exists.
- Files changed: src/lib/offlineQueue.ts; src/lib/__tests__/offlineQueue.phase0.test.ts.
- Migration files added (local only): none; existing 0170 retained.
- Summary of code correction: A uniqueness violation followed by a permission-denied readback used to delete pending work. It now preserves payload/idempotency key as unresolved until a matching receipt exists.
- Data preservation/recovery path: browser data untouched; no migration or queue entries deleted. Fake IndexedDB fixtures alone are reset by tests.
- Tests added or modified: Regression failed before (13 pass / 1 fail), passes in the 29-check Phase 0 suite. Zero-row update and force-local tests remain enforced.
- Commands executed with actual pass/fail counts: see artifacts/astra-20261021-024418/*.log and machine-readable gate receipts; no interrupted run claimed passing.
- Manual browser/device results: browser attachment unavailable; physical devices NOT VERIFIED.
- Current state: VERIFIED LOCAL.
- Remaining risk or missing business decision: final full verification; hosted/device acceptance and documented OPEN_DECISIONS remain open.
- Safe rollback guidance: revert only this fix's source changes after preserving subsequent work; do not delete queue/storage bytes or undo applied migrations.

## 2026-10-21 09:41 NPT — Fix UI-04
- Workspace/branch/SHA: C:\Users\use\Desktop\babin-rentals-os; main; initial 5d26cf8d8a420c07400b1124a0fafb1b6e7b3710, continuation 43dec886bb98d82138f7f87b4fe3fd532f8933f4.
- Previous local changes preserved: Icon recovery copy/patch and progress snapshot in artifacts/astra-20261021-024418; subsequent shared edits retained.
- Evidence/reproduction on actual local tree: Closed-modal cleanups could release another modal lock and discarded the original overflow. Only actual owners now acquire/release; original overflow is restored after the last owner.
- Files changed: src/components/ui/Modal.tsx; src/components/ui/__tests__/Modal.locks.test.tsx.
- Migration files added (local only): none; existing 0170 retained.
- Summary of code correction: Closed-modal cleanups could release another modal lock and discarded the original overflow. Only actual owners now acquire/release; original overflow is restored after the last owner.
- Data preservation/recovery path: browser data untouched; no migration or queue entries deleted. Fake IndexedDB fixtures alone are reset by tests.
- Tests added or modified: StrictMode, dormant sibling, nested close, final restoration and top Escape tests; 16 related modal/preset component checks passed. Browser attach failed twice; touch/device acceptance is open.
- Commands executed with actual pass/fail counts: see artifacts/astra-20261021-024418/*.log and machine-readable gate receipts; no interrupted run claimed passing.
- Manual browser/device results: browser attachment unavailable; physical devices NOT VERIFIED.
- Current state: VERIFIED LOCAL.
- Remaining risk or missing business decision: final full verification; hosted/device acceptance and documented OPEN_DECISIONS remain open.
- Safe rollback guidance: revert only this fix's source changes after preserving subsequent work; do not delete queue/storage bytes or undo applied migrations.

## 2026-10-21 09:41 NPT — Fix UI-06
- Workspace/branch/SHA: C:\Users\use\Desktop\babin-rentals-os; main; initial 5d26cf8d8a420c07400b1124a0fafb1b6e7b3710, continuation 43dec886bb98d82138f7f87b4fe3fd532f8933f4.
- Previous local changes preserved: Icon recovery copy/patch and progress snapshot in artifacts/astra-20261021-024418; subsequent shared edits retained.
- Evidence/reproduction on actual local tree: Conflicting calendar-span and billable-day matches selected two presets. Presets now use the unchanged billing engine with the entered times, choose a matching return date, and disable impossible durations. Exactly one canonical duration match; 44px targets.
- Files changed: src/lib/rentalDatePreset.ts; src/lib/__tests__/rentalDatePreset.test.ts; src/modules/rentals/booking/DatePresets.tsx; BookingDatesSection.tsx; booking/__tests__/DatePresets.test.tsx.
- Migration files added (local only): none; existing 0170 retained.
- Summary of code correction: Conflicting calendar-span and billable-day matches selected two presets. Presets now use the unchanged billing engine with the entered times, choose a matching return date, and disable impossible durations. Exactly one canonical duration match; 44px targets.
- Data preservation/recovery path: browser data untouched; no migration or queue entries deleted. Fake IndexedDB fixtures alone are reset by tests.
- Tests added or modified: Four preset regressions failed before; six component cases and the boundary helper matrix now pass. The added boundary-test expectation was corrected to cover all impossible equal-time one-day combinations; no engine rule was changed.
- Commands executed with actual pass/fail counts: see artifacts/astra-20261021-024418/*.log and machine-readable gate receipts; no interrupted run claimed passing.
- Manual browser/device results: browser attachment unavailable; physical devices NOT VERIFIED.
- Current state: VERIFIED LOCAL.
- Remaining risk or missing business decision: final full verification; hosted/device acceptance and documented OPEN_DECISIONS remain open.
- Safe rollback guidance: revert only this fix's source changes after preserving subsequent work; do not delete queue/storage bytes or undo applied migrations.

## 2026-10-21 09:41 NPT — Fix WF-07
- Workspace/branch/SHA: C:\Users\use\Desktop\babin-rentals-os; main; initial 5d26cf8d8a420c07400b1124a0fafb1b6e7b3710, continuation 43dec886bb98d82138f7f87b4fe3fd532f8933f4.
- Previous local changes preserved: Icon recovery copy/patch and progress snapshot in artifacts/astra-20261021-024418; subsequent shared edits retained.
- Evidence/reproduction on actual local tree: Quick Today/Tomorrow were anchored to a civil date. They now use operationalDayOf with the configured start; explicit custom dates and carry-over lower-bound behavior are retained.
- Files changed: src/lib/queries/today.ts; src/modules/today/Today.tsx; src/modules/today/__tests__/dashboardLayout.test.tsx.
- Migration files added (local only): none; existing 0170 retained.
- Summary of code correction: Quick Today/Tomorrow were anchored to a civil date. They now use operationalDayOf with the configured start; explicit custom dates and carry-over lower-bound behavior are retained.
- Data preservation/recovery path: browser data untouched; no migration or queue entries deleted. Fake IndexedDB fixtures alone are reset by tests.
- Tests added or modified: 05:59:59 failed before; 06:00, Tomorrow and custom-date regressions pass in the 123-check integration run.
- Commands executed with actual pass/fail counts: see artifacts/astra-20261021-024418/*.log and machine-readable gate receipts; no interrupted run claimed passing.
- Manual browser/device results: browser attachment unavailable; physical devices NOT VERIFIED.
- Current state: VERIFIED LOCAL.
- Remaining risk or missing business decision: final full verification; hosted/device acceptance and documented OPEN_DECISIONS remain open.
- Safe rollback guidance: revert only this fix's source changes after preserving subsequent work; do not delete queue/storage bytes or undo applied migrations.

## 2026-10-21 09:41 NPT — Fix UI-05
- Workspace/branch/SHA: C:\Users\use\Desktop\babin-rentals-os; main; initial 5d26cf8d8a420c07400b1124a0fafb1b6e7b3710, continuation 43dec886bb98d82138f7f87b4fe3fd532f8933f4.
- Previous local changes preserved: Icon recovery copy/patch and progress snapshot in artifacts/astra-20261021-024418; subsequent shared edits retained.
- Evidence/reproduction on actual local tree: Finance sub-header duplicated header Export/Create Invoice controls. The page header now owns those actions; phone Payment remains a single action and secondary commands stay usable in More.
- Files changed: src/modules/finance/Finance.tsx; src/modules/finance/__tests__/Finance.restricted.test.tsx.
- Migration files added (local only): none; existing 0170 retained.
- Summary of code correction: Finance sub-header duplicated header Export/Create Invoice controls. The page header now owns those actions; phone Payment remains a single action and secondary commands stay usable in More.
- Data preservation/recovery path: browser data untouched; no migration or queue entries deleted. Fake IndexedDB fixtures alone are reset by tests.
- Tests added or modified: New phone duplicate assertion failed before; all 23 Finance checks pass in the 123-check integration run. Rendered width/screenshot acceptance unavailable after browser attachment failure.
- Commands executed with actual pass/fail counts: see artifacts/astra-20261021-024418/*.log and machine-readable gate receipts; no interrupted run claimed passing.
- Manual browser/device results: browser attachment unavailable; physical devices NOT VERIFIED.
- Current state: PARTIAL.
- Remaining risk or missing business decision: final full verification; hosted/device acceptance and documented OPEN_DECISIONS remain open.
- Safe rollback guidance: revert only this fix's source changes after preserving subsequent work; do not delete queue/storage bytes or undo applied migrations.

## 2026-10-21 09:41 NPT — Fix WF-02 / WF-03 / WF-04 / WF-05 / WF-08
- Workspace/branch/SHA: C:\Users\use\Desktop\babin-rentals-os; main; initial 5d26cf8d8a420c07400b1124a0fafb1b6e7b3710, continuation 43dec886bb98d82138f7f87b4fe3fd532f8933f4.
- Previous local changes preserved: Icon recovery copy/patch and progress snapshot in artifacts/astra-20261021-024418; subsequent shared edits retained.
- Evidence/reproduction on actual local tree: Missing datasets previously became zero; one-shot report reads and ten-row operational exports truncated data. Shared reads now confirm every ordered page and refuse failures/repeated rows. Closed is completed; cancelled values cannot inflate earned stage/type revenue. ROI remains unknown with missing acquisition cost.
- Files changed: src/lib/queries/reportSupport.ts; rentalReports.ts; operationReports.ts; damageMaintenanceReports.ts; assetRoi.ts; staffReports.ts; clientReports.ts; productReports.ts; promotionsReports.ts; activityReports.ts; related report tests.
- Migration files added (local only): none; existing 0170 retained.
- Summary of code correction: Missing datasets previously became zero; one-shot report reads and ten-row operational exports truncated data. Shared reads now confirm every ordered page and refuse failures/repeated rows. Closed is completed; cancelled values cannot inflate earned stage/type revenue. ROI remains unknown with missing acquisition cost.
- Data preservation/recovery path: browser data untouched; no migration or queue entries deleted. Fake IndexedDB fixtures alone are reset by tests.
- Tests added or modified: 14 missing-dataset regressions failed before; 4 further stage/export/ROI cases failed before. Cap+1 family regressions and final command results are recorded separately. Remaining branch/tax/attribution acceptance is not inferred from fake-client tests.
- Commands executed with actual pass/fail counts: see artifacts/astra-20261021-024418/*.log and machine-readable gate receipts; no interrupted run claimed passing.
- Manual browser/device results: browser attachment unavailable; physical devices NOT VERIFIED.
- Current state: PARTIAL.
- Remaining risk or missing business decision: final full verification; hosted/device acceptance and documented OPEN_DECISIONS remain open.
- Safe rollback guidance: revert only this fix's source changes after preserving subsequent work; do not delete queue/storage bytes or undo applied migrations.

## 2026-10-21 09:41 NPT — Fix QA-02
- Workspace/branch/SHA: C:\Users\use\Desktop\babin-rentals-os; main; initial 5d26cf8d8a420c07400b1124a0fafb1b6e7b3710, continuation 43dec886bb98d82138f7f87b4fe3fd532f8933f4.
- Previous local changes preserved: Icon recovery copy/patch and progress snapshot in artifacts/astra-20261021-024418; subsequent shared edits retained.
- Evidence/reproduction on actual local tree: Test attempts invalidate previous green evidence before starting. Receipts record command/SHA/source/elapsed/environment; stale DB receipts cannot contribute a completion percentage. Structural counts are explicitly separate from acceptance.
- Files changed: scripts/test-receipt.mjs; test-receipt.test.mjs; run-tests.mjs; check-pglite.mjs; e2e-lifecycle.mjs; completion.mjs; package.json; .gitignore.
- Migration files added (local only): none; existing 0170 retained.
- Summary of code correction: Test attempts invalidate previous green evidence before starting. Receipts record command/SHA/source/elapsed/environment; stale DB receipts cannot contribute a completion percentage. Structural counts are explicitly separate from acceptance.
- Data preservation/recovery path: browser data untouched; no migration or queue entries deleted. Fake IndexedDB fixtures alone are reset by tests.
- Tests added or modified: 7 Node regressions pass. Intentional isolated failing fixture produced test exit 1 and completion exit 1 with 0/1, rather than stale green. Final full gates must replace this probe with real current results.
- Commands executed with actual pass/fail counts: see artifacts/astra-20261021-024418/*.log and machine-readable gate receipts; no interrupted run claimed passing.
- Manual browser/device results: browser attachment unavailable; physical devices NOT VERIFIED.
- Current state: PARTIAL.
- Remaining risk or missing business decision: final full verification; hosted/device acceptance and documented OPEN_DECISIONS remain open.
- Safe rollback guidance: revert only this fix's source changes after preserving subsequent work; do not delete queue/storage bytes or undo applied migrations.

## 2026-10-21 17:33 NPT — Fix REL-02 (conflict confirmation follow-up)
- Workspace/branch/SHA: C:\Users\use\Desktop\babin-rentals-os; main; 53ed0ba7329cd5db769e30a6c51d2e2e3b1723b1.
- Previous local changes preserved: existing shared work retained; source before this correction copied to artifacts/astra-20261021-024418/offlineQueue.before-conflict-confirmation.ts.
- Evidence/reproduction on actual local tree: six regressions failed before the correction. A failed conflict read previously allowed the update, and a confirmed read did not constrain the following write to that version.
- Files changed: src/lib/offlineQueue.ts; src/lib/__tests__/offlineQueue.phase0.test.ts; src/lib/__tests__/offlineQueue.conflicts.test.ts.
- Migration files added (local only): none.
- Summary of code correction: unreadable target/version/fields refuse replay and preserve the edit. Replay updates and force-local conflict writes compare updated_at with their confirmed server snapshot; zero affected rows remain unresolved.
- Data preservation/recovery path: queue payloads, IDs and conflict records retained. No browser store was opened, cleared or exported by this task. Unsupported version reads remain pending rather than pretending to be saved.
- Tests added or modified: refused/missing/invalid conflict read; confirmed version filter; intervening server change; version-constrained conflict resolution. Prior permissive read-error assertion deliberately replaced with fail-closed behavior required by REL-02.
- Commands executed with actual pass/fail counts: focused before 20 passed / 6 failed; focused after 40 passed / 0 failed across 6 files. Logs: artifacts/astra-20261021-024418/conflict-confirmation-before.log and conflict-confirmation-after.log. Full final-2 was interrupted deliberately before completion; final-3 is the new full verification attempt.
- Manual browser/device results: further isolated Chrome navigation/state attempts timed out; rendered responsive/physical-device acceptance NOT VERIFIED. The task's mock server was stopped.
- Current state: PARTIAL.
- Remaining risk or missing business decision: original form-observed server version is not captured for legacy edits. Device enqueue time remains insufficient evidence of that baseline; this CAS protects the replay-read-to-write interval only. Branch/provenance and actual browser restart matrices remain open.
- Safe rollback guidance: selectively restore only this correction after preserving subsequent edits. Do not discard pending work, remove conflict records or change remote schema.
