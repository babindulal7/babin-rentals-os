# Whole-app refinement sprint — 25 November 2026

Scope: refine existing functionality, not a redesign or feature expansion. Controlled internal launch remains targeted for December 31, subject to owner approval. Public website and client portal have separate gates. No automatic merge, deploy, production settings/data/schema change, live communications, payment activation, new paid services, or owner computer work. Use free hosted Ubuntu for disposable database/browser verification and existing Mac lanes for CI. Keep independent verification separate.

## Baseline and evidence

- main ccfc7bd8926c10fd9db589b35d1564cb71e6d474 is not the green integration candidate.
- Integration #417 fd8b4515 passed 8,173 tests, 272 migrations, 18 disposable auth cases, 9 hosted staging smoke cases, and isolated Cloudflare builds. Current integration head 2d4ce364 includes verified rental draft tests; rerun status must be refreshed.
- #420 3/3 draft persistence passed, #415 latest Mac CI passed. #419 latest expense run 23 passed, 1 mobile timeout; no certified complete workflow yet.
- #407 claims 115 route declarations and 185 controls on an older baseline. Treat as discovery input, not comprehensive executed evidence. Do not use a percentage without a reconciled denominator and actual receipts.

## Work queue (ordered, recheck existing PRs before implementation)

| ID | Scope | Completion evidence |
|---|---|---|
| WR-01 | Integrate verified #409–#421 without overlapping edits; reconcile migrations and payment hold | exact-head full CI + cloud checks + independent review; no merge |
| WR-02 | Route/control inventory and core navigation | current AST route list, actual rendered control IDs, device/role/state matrix; initial 21 route tests in this PR, execution pending |
| WR-03 | Today, Rentals, Calendar | counts and filters match canonical queries, draft/quote/confirm/retry persistence, concurrent conflict, navigation recovery |
| WR-04 | Operations | real Packing → Handover → Return → Reset, held/refused/partial/double submit, custody and QC guards, no premature stock release |
| WR-05 | Inventory, cases, maintenance | role-scoped partner stock, serial/unit/bundle integrity, holds and reload |
| WR-06 | Clients and portal | durable registration, duplicate handling, tenant isolation, request/away-mode gates; public release separate |
| WR-07 | Finance, expenses, documents, sales | real manual payments, deposits, refunds via approved mechanisms only, invoice and paper VAT references, expense reload, accounting exports |
| WR-08 | Crew, delivery, approvals, notes | assigned roles, conflicts, work logs, durable saves, escalation; no invented rules |
| WR-09 | Settings, auth, admin | PIN/session, MFA enforcement, RBAC, audit logs, immutable history; test unauthorized reads/writes |
| WR-10 | Communication, reporting, intelligence, tools | verified data/exports, no phantom recommendations, templates, delivery state; no real outbound sends, keep online payments held |
| WR-11 | Shared UX | one header/primary action, save/error/retry/dirty guard, filters, keyboard, focus, EN/NE, desktop/tablet portrait+landscape/mobile; measure before changes |
| WR-12 | Performance and recovery | repeatable timings, request/console errors, sync failure/recovery, backup/restore and hosted ledger acceptance; separate owner-gated release |

## Evidence protocol

For every control record route, role, viewport, initial state, action, expected visible result, expected persisted state or explicit no-write, negative case, current SHA, actual test/run URL, result, defect ID and retest. Separate source inspection, mock test, disposable browser/API, hosted staging and physical staff acceptance. Mark untested controls UNKNOWN, not PASS. Include explicit stage names for timeouts. Do not hide real regressions by skipping or extending timeouts indiscriminately. Prioritize a single confirmed defect or independent coverage batch per hourly iteration. Reuse canonical components and avoid duplicate workflows. New test-only branch uses a separate targeted CI group to avoid canceling pending integration/expense checks; reconcile temporary triggers before merge.

## Existing owner constraints

Manual payment at launch; no gateway activation. Hardware acceptance deferred as ruled; emulated layouts are not physical-device evidence. Production changes, backup/restore execution, email/domain/monitoring configuration, and launch require the existing explicit authorization gates. No automatic Software Factory dispatch.
