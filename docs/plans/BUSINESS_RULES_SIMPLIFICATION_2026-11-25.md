# Business Rules Simplification — owner-approved policy and implementation plan

Date: 2026-11-25 (Nepal time). Status: OWNER POLICY APPROVED FOR REVIEWED IMPLEMENTATION; NOT ACTIVE RUNTIME POLICY, NOT IMPLEMENTED OR VERIFIED. This is an isolated documentation proposal; no production deployment, merge, live settings, or migration application authorized by this approval. Preserve existing behavior until reviewed implementation is accepted.

## Owner's exact approval

| ID | Rule | Owner choice | Implementation contract / review boundary |
|---|---|---|---|
| BRS-01 | Allow booking without advance payment | Authorized override | Draft/quote unrestricted; confirmation lacking required advance needs existing authorized override capability and real actor/reason. Never fabricate payment. Verify existing role scope before changing. |
| BRS-02 | Allow unpaid equipment handover | Warning only | Ordinary payment outstanding produces visible acknowledgment + audit, not a financial manager gate. No amount shown to money-blind roles. Does not waive On Stop, custody, identity, or physical safety gates. |
| BRS-03 | Allow security deposit waiver | Allowed | Authorized commercial staff can explicitly set deposit requirement to zero/waived without extra approval step; record actor, reason and previous amount. Do not write fictitious receipt, release or forfeiture; existing held funds remain liabilities. Exact role scope and whether any product-specific exceptions remain require review. |
| BRS-04 | Allow cancellation fee adjustment | Authorized override | Preserve existing default fee grid; authorized actor may adjust with reason. Preserve issued invoice, tax classification, linked credit note/reversal and atomic cancel semantics. |
| BRS-05 | Allow late fee adjustment | Allowed | Existing price-edit-capable role can adjust/waive proposed late fee without extra approval; record amount delta and actor. No mutation of issued invoice, no backdoor to payment ledger. |
| BRS-06 | Allow quotes for On Stop clients | Warning only | Quote/draft creation allowed with warning. Confirm and dispatch restrictions and R-25.4 authorized override remain; do not weaken physical availability. |
| BRS-07 | Allow operational completion with outstanding payments | Allowed | Finish custody and reset after actual serial reconciliation and QC; track financial settlement/cases independently. Preserve financial Closed gate, receivables and debt reminders, and missing/damaged unit quarantine. Never infer paid/settled from operational completion. |
| BRS-08 | Require equipment photographs | Allowed | Ambiguous selection: proposal interprets Allowed as photography permitted, routine photos not mandatory; damage/dispute/legal evidence requirements remain pending explicit review. Do not change evidence gates on assumption. |
| BRS-09 | Require barcode scanning | Allowed | Ambiguous selection: proposal interprets Allowed as scanning permitted, equivalent manual lookup/serial verification allowed. Verify manual identity and counts equally; no fake scan or bypass of reservation/assignment. Review meaning before enforcement changes. |
| BRS-10 | Allow manual equipment substitution | Allowed | Select compatible available replacement; transactional release/reassign, immutable movement history, no overlap, no wrong serial, approved pricing effects only. |
| BRS-11 | Allow staff to correct operational mistakes | Audited correction | Role/branch-authorized compensating movement or correction; actor, reason, before/after, timestamp; stale state/idempotency guards; no direct history rewrite, no unsafe stage bypass. |
| BRS-12 | Allow unused draft removal | Archive | Archive only unused drafts, no DELETE. Preserve IDs and audit; if reservations, custody, documents or payments exist, route to proper cancellation/terminal workflow. |
| BRS-13 | Prevent physical double booking | Always enforced | Keep database exclusion and concurrency checks, including extensions, substitutions and partial returns. Resolve conflict by alternate serial, schedule, sub-rental or waitlist. |
| BRS-14 | Protect financial records and permissions | Always enforced | Keep append-only payment/deposit/audit ledgers, tax document numbering, RLS, client isolation, branch and role checks, secure actor derivation and no false success. |

Interpretation for Allowed: no extra approval step for a user who already has the capability; not blanket permission for all roles. Warning-only is not a silent failure or approval bypass of unrelated hard controls. Proposed reason/audit mechanics and role mapping require review; no new thresholds invented.

## Conflict inventory and reconciliation targets

- PRODUCT_RULES.md Laws 3/4/5/6/8/9/10 and P1–P10: preserve hard protections; archive not delete; no role expansion implied. Existing Law 9 billing duration unchanged by this approval.
- PERMISSIONS.md W2/R-9 vs WORKFLOWS.md §5.4 (Nov 24 manager approval for unpaid handover): BRS-02 explicitly resolves business direction; maintain independent On Stop/receiver/physical gates. Trace current SQL and UI; do not remove payment data privacy.
- RULINGS-2026-11-24.md R-24.4 limits deposit waiver to verified repeat/VIP with Manager/Owner. BRS-03 changes approval friction; exact qualifying roles/client scope must be reviewed before code. Preserve deposit liability and actual settlement (R-25.5).
- RULINGS-2026-11-25.md R-25.4 blocks quotes and checkout for On Stop clients; BRS-06 supersedes quote restriction only after implementation. Retain checkout/confirmation controls and audited exception.
- WORKFLOWS.md §3.3 and R-41: finance close requires invoices, deposit resolution, damage disposition, no open cases or reservations. BRS-07 adds independent operational-completion concept; do not weaken financial close or misstate equipment returned. Existing state machine remains until transition review.
- src/lib/validation.ts: potentially stale handover validation; identify actual callers before removal/change. src/lib/bookingRules.ts: device-local overbooking UI is not authoritative; remove misleading semantics only after tracing consumers, keep database GiST protection R-25.3.
- R-39 fewest clicks is a design target, not authority to weaken RLS. UI standards and other unrelated fees, durations, membership thresholds and rollout gates remain unchanged.
- Existing compliance issues #446 (VAT), #447 (identity privacy), #448 (payroll), security #440 (cancellation) and UAT #443 (custody): link dependencies, do not duplicate or claim resolved. Accountant acceptance and statutory obligations remain mandatory.

## Batches and acceptance

| Batch | Scope | Acceptance / dependency |
|---|---|---|
| 01 | Rule inventory and canonical reconciliation | Enumerate all dated rulings, action predicates, RPCs/triggers, policies, migrations in effective order, UI checks, tests and evidence; identify active versus dead code. Record same-commit rule, permission/fixture, progress and code references per CLAUDE.md when implementing. No runtime behavior in this PR. |
| 02 | Booking confirmation, quote warnings, unused draft archive (01/06/12) | Missing advance authorized/unapproved; quote On Stop allowed, confirm/checkout blocked absent existing exception; archive unused only, no effects on live records; forged actor rejected. |
| 03 | Handover, deposit waiver and fees (02/03/04/05) | Ordinary unpaid handover warns + audit; actual checkout identity/serial/On Stop preserved; waiver never changes held deposit; fee adjustment respects roles and immutable invoices; cancellation race and branch security #440 prerequisite. |
| 04 | Packing/handover/return/manual substitution (08/09/10) | Confirm photo/scan ambiguity first; manual selection same custody/serial checks as scanner; partial pickup/return, missing/damaged unit, concurrent substitution and no double booking. Coordinate #443. |
| 05 | Separate custody/financial completion (07) | Returned/reset safe units available while debt open; unresolved damage stays tracked/quarantined; financial closure refuses unsettled invoice, deposit/cases; reporting and status remain accurate. |
| 06 | Audited operational corrections (11) | Role and branch matrix; compensating movements only, rejected forged/stale/duplicate writes, immutable audit; correction cannot reset or erase money. |
| 07 | Central Settings Rules & Policies | Shared versioned server enforcement using current capability system, settings changes audited, safe defaults and effective dates, rollback with history. No universal off switch for hard invariants. No unapproved changes to business values. |
| 08 | UI rules cleanup | Remove duplicated warnings/approval dialogs, show yellow Attention + reason and next action, responsive accessibility; keep current Operations composition. Other design laws not superseded absent owner decision. |
| 09 | Portal/website alignment | Quote request vs confirmation distinct, client isolation and server role rules enforced; N-7 portal write gate unchanged. |
| 10 | Independent acceptance | Full positive/negative role and branch matrix, regression on all 14 IDs, concurrency, partials, retry/idempotency, financial and inventory reconciliation, desktop/tablet/mobile Playwright. No production deploy. |

Each implementation PR: check existing PRs, branch from current main, one bounded card, record changed files and tests, migration forward-only and local/staging only, rollback plan (no destructive schema rollback), independent verifier, exact-head CI evidence, no automatic merge/deployment. Windows/implementation lane and separate verifier; Mac CI-only if available. Avoid paid services and local-owner work as prerequisites where existing CI suffices.

## Verification commands (from package.json)

Use `npm run typecheck`, `npm test`, `npm run build`, `npm run lint:progress`, `npm run check:pglite`, `npm run check:lifecycle`, `npm run check:security`, `npm run test:race`, `npm run test:partial-return`, and `npm run test:server-contracts` as applicable. Use actual existing Playwright config/workflows (discover path; no invented command). Record exact commit, environment, pass/fail, test logs, residual blockers. Green code checks do not establish deployed database state.

## Release boundaries and owner review items

- No production changes, migrations, data, integrations, settings, release/merge or paid services under this plan.
- Preserve Dec 31 internal launch / January portal sequence, dual-entry and R-25.7 cutover reconciliation gates.
- Explicit clarification before changing BRS-08/09 enforcement: Allowed means optional routine evidence/scan with equivalent manual identity checks? Recommended yes, preserve required incident evidence.
- Review BRS-03 exact authorized role and client eligibility scope; BRS-01/04 override capability mapping must follow existing server grants.
- Independent verification and accountant acceptance remain required. Do not mark feature complete based on this planning document.
