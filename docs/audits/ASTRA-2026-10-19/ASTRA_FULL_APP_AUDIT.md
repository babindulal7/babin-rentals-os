# ASTRA Full Application Audit

Audit date: 18–19 October 2026 (Asia/Katmandu). Repository: https://github.com/babindulal7/babin-rentals-os. Baseline: latest accessible main, ad8ce1e4afc54cc88df841425d0e281bd15665bc, fetched 18 October and rechecked 19 October. All file references are relative to that immutable revision.

Audit only: no application fixes, merge, deployment, production database access or production mutations. Local SQL probes used disposable PGlite fixtures. Browser used a separate mock preview at 127.0.0.1:3026.

## Executive judgment

**HOLD: not ready for an independently approved production launch.** Main has reproduced authenticated data/role/audit weaknesses, invented report outputs, a100× report money error and failing tests. The migration chain and31 lifecycle checks pass, demonstrating useful safeguards but not complete business correctness.

**Scope honesty:** this is a repository-wide inventory and risk-focused audit with executed gates, isolated exploit/logic probes and sampled browser rendering. It is not exhaustive verification of every control, role, populated route, integration or device. Browser recovery allowed limited responsive checks; live infrastructure was intentionally not accessed. The inventory and acceptance ledger enumerate the gaps. Do not present this as a completed full application certification.

## Most consequential verified findings

1. SEC-01: unrelated document/evidence access and overwrite by authenticated accounts (local policy proof, hosted grant caveat).
2. SEC-02: financial helper RPCs reveal amounts to Warehouse/Client.
3. SEC-03: authenticated Client can forge a permanent Owner audit row.
4. SEC-04: Admin can directly demote another Owner.
5. SEC-05: Driver with no trips reads unrelated booking/client rows.
6. WF-01: Sales/VAT schema errors/empty data become invented financial statements.
7. WF-02: rental reporting converts Rs1000 into Rs10.
8. WF-03: wrong lifecycle statuses corrupt completion/cancellation reporting.
9. WF-04/05: operational compliance and asset ROI mix/invent business figures.
10. REL-02: an offline zero-row update deletes the only pending mutation as saved.

Full evidence, source locations, impact, correction and regression requirements are in ASTRA_BUG_REGISTER.md. Do not treat an exploit under local fixtures as a report of an observed production breach.

## Architecture assessment

React18/TS strict/Vite two-entry build; Shell/BookingShell route presentation; shared engine/query/action layers; Supabase SQL policies/definers; Dexie outbox and local caches. PWA pre-cache includes self-hosted fonts. Source maps disabled. CI pins Node24 and uses lockfile installation, typecheck/lint/tests/DB gates/build/coverage. These are useful controls.

The architectural boundary is inconsistently honored: productions/shift/warranty remain local-only; report adapters fabricate results instead of preserving errors; SQL internal helpers are exposed to broad authenticated execution; queue data lacks submitting identity. These concrete gaps matter more than total component/route count. Reusable Modal/header abstractions exist, but component bookkeeping and duplicate action placement still fail.

Actual booking state: Quote→Booked→Packed→On Rent→Returned→Closed. Cancellation/archive are flags, Draft is device draft, and packing/handover/inspection/reset are workflow/session activities. Verified correction rules restrict reversal before pickup and archive to terminal records. No unsupported extra enum states are assumed.

## Commands executed

Dependencies installed with npm ci --ignore-scripts --no-audit --no-fund (674 packages; exit0). Install lifecycle scripts were deliberately skipped; this differs from CI npm ci. Test commands used VITE_DATA_SOURCE=mock. Initial build also inherited mock; a separate live-default build is recorded in supplementary evidence and does not contain deploy credentials.

| Command | Exit | Evidence |
|---|---:|---|
| npm run typecheck | 0 | audit-typecheck.log |
| npm run lint | 0 | audit-lint.log |
| npm run test | 1 | audit-test.log |
| npm run check:pglite | 0 | audit-check-pglite.log |
| npm run check:lifecycle | 0 | audit-check-lifecycle.log |
| npm run build | 0 | audit-build.log |
| npm run check:contrast | 0 | audit-check-contrast.log |
| npm run lint:shell | 0 | audit-lint-shell.log |
| npm run lint:ui-copy | 0 | audit-lint-ui-copy.log |
| npm run lint:progress | 0 | audit-lint-progress.log |
| npm run test:coverage | 1 | audit-test-coverage.log |
| npm run completion | 0 | audit-completion.log |

- Full test and coverage each:365/370 files pass;4670/4678 tests pass,8 fail. No successful coverage percentage is claimed.
- check:pglite167/167;31views/20allowed anon functions/74pinned definers.
- check:lifecycle31/31. PGlite is a single-connection local engine, not hosted Auth/PostgREST or concurrent network clients.
- Contrast82/82 is theme-token evidence, not screen-wide accessibility.
- audit-workflow-repro.cjs: actual source with controlled query responses verifies money/report failures plus day/advance controls.
- audit-security-probe.mjs: rebuilt SQL under authenticated roles reproduces SEC findings.
- audit-offline-repro.cjs: actual drainQueue with controlled zero-row response reproduces lost pending work.
- audit-evidence/modal-lock.test.tsx: one failure reproduces shared scroll-lock bug. The initial mistakenly broad modal run was interrupted; only targeted log is cited.

## Failed-test classification

| Failure | Classification and evidence |
|---|---|
|core.test.ts orphan operations.pack/handover/return/reset|Capability declaration/registration contract drift: dispatcher handles four literal capabilities with no action declarations found by scanner. Not proof of exploitable widening by itself; keep release gate red until intentional contract fixed.|
|pulse.test.ts mock before loadMockClient|Fixture initialization defect: test calls query without boot loader; main.tsx initializes mock before rendering. Not enough evidence of production Pulse failure.|
|Finance.restricted phone action test|Current product defect, independently rendered and measured (UI-05).|
|rentalsOperationsHeader four tests|Missing Router fixture around newly nested RentalMoreActions useNavigate. Runtime routes have BrowserRouter; not evidence four operation buttons fail in app.|
|clientsCopy search company|Current advertised-search contract mismatch: placeholder reintroduces company; source comment and mapping say company not backed by view. Search implementation includes an optional company property, so validate real schema before choosing wording or mapping correction.|

No tests were changed to make the audit green.

## Historical risk recheck

| Hypothesis | Current disposition |
|---|---|
|Rental audit log navigation|/admin/audit-log renders in mock; prior routing failure not reproduced. Drawer category filtering remains a separate inspection item.|
|Productions navigation|Route renders; actual persistence is incomplete (UI-01).|
|Finance invoice query parameters|FinanceTabRedirect exists for invoices and other tabs. Browser preservation of all search parameters NOT VERIFIED; do not label broken.|
|Revenue trend date validation|Current reader has pagination/error handling; no historical date-format failure reproduced. Arbitrary-filter browser coverage pending.|
|Header hover/collapse|Sample responsive screens render; exhaustive hover stability NOT VERIFIED.|
|New-rental inconsistency|Duration double selection verified; full creation UI unverified on live backend.|
|Double booking|Sequential overlapping reservation refused by lifecycle; real two-connection interleaving NOT VERIFIED.|
|Discount type / unauthorized finance writes|Discounted lifecycle passes; financial scalar leaks separately reproduced. Not all finance writes tested.|
|Incomplete transitions / close / void|31 lifecycle cases pass; full multi-device browser flow NOT VERIFIED.|
|Owner staff listing|Role policy inspected, no historical Owner-list failure reproduced; hosted Auth staff listing NOT VERIFIED.|
|Migration ordering|All167files apply in isolation; deployed ledger NOT VERIFIED.|
|Missing actions / fake data|Shift recount no-op, local modules and report fabrication confirmed.|

## Scorecard and criteria

A category earns a numerical score only when its full enumerated acceptance scope has been exercised across representative records/roles/environments; unknowns are not assumed passes. Test pass ratio is not product completeness. This audit found enough evidence to reject launch readiness, but not enough for defensible whole-category percentages.

| Category | Score | Reason |
|---|---|---|
| Architecture | Not Rated | Acceptance scope only partially verified; see module/device ledger |
| Security | Not Rated | Known authorization failures; full endpoint/hosted matrix incomplete |
| Database integrity | Not Rated | Acceptance scope only partially verified; see module/device ledger |
| Rental operations | Not Rated | Acceptance scope only partially verified; see module/device ledger |
| Finance correctness | Not Rated | Acceptance scope only partially verified; see module/device ledger |
| Functional completeness | Not Rated | Acceptance scope only partially verified; see module/device ledger |
| UI/UX consistency | Not Rated | Acceptance scope only partially verified; see module/device ledger |
| Desktop usability | Not Rated | Acceptance scope only partially verified; see module/device ledger |
| iPad usability | Not Rated | Acceptance scope only partially verified; see module/device ledger |
| Mobile usability | Not Rated | Acceptance scope only partially verified; see module/device ledger |
| Performance | Not Rated | Bundle measured; real-device/network profiles missing |
| Test coverage | Not Rated | Full suite executed but coverage command fails; acceptance gaps remain |

## Answers to the ten required questions

1. **Actual functionality complete:** no defensible percentage measured. completion tool prints≈99% from54action stubs/implementations,52selected data classifications,9gates,44capabilities and31lifecycle steps. It also cites a staleOct16 test receipt. That is structural bookkeeping and contradicted by uncovered local-only/report defects; it must not be sold as functional completion.
2. **Working/partial/missing/broken:** local SQL creation/reservation/session/settlement controls pass their stated cases; core date/advance boundaries pass. Core landing pages render in mock. Production/shift/warranty persistence is partial/local-only. Reports WF-01–05 and Finance phone action placement are broken. Full real-device/live workflow completeness remains unverified.
3. **Ten most consequential bugs:** ranked above, with full register.
4. **Personal/financial protection:** insufficient in audited main due SEC-01–05; actual production exposure not established.
5. **Simultaneous rental of same equipment:** exclusion/capacity gates refuse sequential overlaps; cannot certify real concurrency without two PostgreSQL connections. Availability previews can be incomplete (WF-06). No successful committed double booking was reproduced.
6. **End-to-end operations without workarounds:** local31-step lifecycle succeeds; real multi-role UI/peripheral/storage/offline completion not certified. Local-only supporting modules prevent claiming complete operational support.
7. **Finance/report trust:** core tested settlement controls are encouraging; several reports are demonstrably untrustworthy. Reconcile each named metric before relying on it.
8. **Desktop/iPad/phone usability:** sampled views render; iPad retains desktop navigation architecture. Phone Finance clips an important action. Seven widths on two screens do not prove all workflows usable.
9. **Launch blockers:** verified security/integrity/report defects, failed main tests, hosted role/storage and concurrent-operation gaps, deployment/restore acceptance not verified.
10. **Safest order:** security and durable write identity, financial/report truth, business workflow completeness, shared responsive fixes, measured performance, full staging/regression/owner release. See roadmap.

## Continuation checklist

Complete the UI inventory’s NOT VERIFIED rows using staging fixtures and all roles; test every visible action/search/filter/pagination/export; extend SQL probes to all authenticated definers and branches; test real concurrent staff connections, identity switching/offline recovery, scanner/signature/file flows, backup restoration, email/Auth and external integrations. Re-run all gates and retain SHA-bound evidence. Do not call this partial acceptance a comprehensive certification.

## Final supplementary evidence — 19 October 2026

The register now contains 24 findings, with varying evidence levels stated individually. Additional executed query probes demonstrate fabricated empty-data results in staff, client, product and promotion reports (WF-08): 3 staff, 1,248 clients, 5 products and 842 redemptions. Evidence: audit-report-family-repro.log.

The separate live-default build passed (audit-build-live.log). Its main bundle is 699.79 kB before compression / 198.53 kB gzip; the build emitted the large-chunk warning. No production deployment occurred.

Supplementary local gates passed: financial-integrity (8 cases), race (11 checks), test:audit-coverage, test:settings, test:saved-views, test:pricing-structures, check:fixtures and db:plan:selftest. See audit-extra-gates.json and audit-supplementary.jsonl with their referenced logs. The race harness uses sequential contenders on one connection; real concurrent PostgreSQL remains NOT VERIFIED. Fixture guard success does not negate WF-08: its static detection scope does not cover every imported fabricated metric.

These extra passes do not change the full-suite result: 4,670 passed and 8 failed. This is a documented source/local audit and sampled browser assessment, not completed exhaustive functional acceptance. Remaining scope is explicitly listed above and in the UI report.
