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
