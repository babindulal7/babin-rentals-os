# Acceptance-status evidence repair — 22 November 2026

**Type:** release-blocking documentation and verification audit, not a code or production fix  
**Source baseline:** main `772c62614dbaf3adc1d38ef5e17740cd95e4e013`  
**Scope:** eight roadmap cards with specific unresolved review findings in merged PRs.  
**Authority:** status may become `done` only after its own Done-when criteria, independent review, all required local gates, exact-head CI, and any external/owner acceptance are evidenced.

## Why this branch exists

Multiple merged PRs promoted cards to `done` based on targeted/unit tests or draft paperwork, despite later code-review findings that the card's complete acceptance criteria were not met. A merged implementation is not equivalent to approved real-data acceptance. This branch returns the eight **specific documented gaps** to `acceptance_pending`, without reversing implemented features or changing live settings.

| Card | Review source | Missing evidence or implementation | Acceptance gate before Done |
| --- | --- | --- | --- |
| T1-09 Email from @babinrentals.com | PR #313 review (P1) | DNS/provider setup and real delivered messages not evidenced; do not assume Resend is unconfigured | Record provider/domain SPF/DKIM verification, genuine non-sensitive test delivery and password-reset email receipt, delivery-failure checks |
| T9-01 Booqable catalogue/client migration | PR #313 review (P1) | Prior comparison treated exported rows as unchanged without reading OS DB; pricing examples were hard-coded, not OS-generated | Reconcile real imported/staging rows, totals and exceptions, confirm representative pricing via OS engine; owner approval before any import write |
| T9-02 Imported rentals block availability | PR #316 review (P1) | `0206` was delivery route map pins, not persisted external-hold constraints; helper tests used in-memory arrays | Implement DB-backed imported rental holds, durable synchronization and concurrent reservation exclusion; fail-closed conflict tests in PGlite and hosted staging |
| T7-01 Online booking security spec | PR #316 review (P1) | `docs/ONLINE_BOOKING_SPEC.md` §17 still requires corrected-spec owner review | Close explicitly documented spec choices, record owner acceptance, verify guest upload, settings permissions, public quote and exact time |
| T7-07 Refunds and reconciliation | PR #315 review (P2) | No recorded hosted decline→refund→zero-balance and sandbox-day reconciliation | Staging/sandbox refund lifecycle, callback idempotency, zero outstanding balance, day reconciliation with safe redacted evidence |
| T7-14 Online booking Away mode | PR #316 review (P1) | Helper not called by `submit_booking_request`; no demonstrated server-side refusal | Server-enforced Away setting with controlled public message, authenticated/guest request denial and online/offline/error tests |
| T3-06 Invoice/agreement PDFs | PR #317 review (P1) | PDF tests mock Storage/exporter; signed agreement persistence and paper-invoice traceability on staging not verified | Hosted staging signed agreement record, immutable document validation, paper invoice tracking and accountant acceptance |
| T3-23 Monthly accountant pack | PR #307 review (P1) | Sign-off was of a manually assembled sample ZIP, not actual app-generated export; receipt photo and vendor PAN claims differ from code | Export from application with synthetic records, compare real ZIP CSVs, attachments, vendor PAN, reconcile amounts; obtain external accountant acceptance of that output |

## Additional audit still required — PR #314

Six more **currently marked Done** cards were challenged for incomplete full 17-gate CI evidence: T2-06, T2-15, T2-19, T2-21, T2-23, T3-30. This branch does **not** automatically demote them, because a later complete integrated CI receipt could clear that finding. Windows should inspect the current exact-head receipts and either attach the complete evidence or raise a separate narrowly scoped follow-up status correction. The PR #314 reviewer finding must not be silently dismissed.

## Execution lanes and acceptance rules

**Windows Antigravity — lane A:** T1-09, T9-01, T9-02. Investigate existing implementation before changing a line. Use separate focused branches for real fixes; prefer local/PGlite tests and read-only staging evidence. Any staging data writes require scoped prior authorization; **no production writes**.

**Windows Antigravity — lane C (serial, not competing checkout):** T7-01, T7-07, T7-14, T3-06, T3-23. Fix database/server controls before UI claims. For payment testing use sandbox provider only, with no live merchant activation or real charges.

**Mac:** CI runner only. Run the complete required exact-HEAD CI matrix for each reviewable PR and integrated `main`; report run URL, commit SHA, pass/fail and any unresolved reviews. Mac performs no independent feature implementation.

**Owner/accountant:** owner approves corrected online spec and any staging-write scope; accountant verifies **actual app-exported** accounting artifacts. Prior general decisions do not waive named acceptance gates.

## Verification commands (safe local baseline)

```bash
npm run typecheck
npm run lint
npx vitest run src/lib/__tests__/roadmapStatusTruth.test.ts src/lib/__tests__/t3RoadmapDocumentation.test.ts
npm run lint:progress
npm run check:pglite
npm run check:lifecycle
npm run gates
```

Record all **17 required gates** with exact SHA, environment, and logs. `npm run gates` must not be represented as passed unless actually executed. CI status is **not verified by this documentation-only PR**.

## Explicit non-actions

- No automatic merge, deployment, domain/DNS activation, payment activation, or Booqable cancellation.
- No production schema/data/auth/settings changes. No production credentials in GitHub or chat.
- No staging credential rotation, hosted mutations, synthetic resets, or service-role execution without separate in-scope authorization.
- No weakening tests to force green. Status regression tests must enforce honest acceptance state.

## What success looks like

Each of the eight pending cards must have (a) a focused implementation/evidence PR, (b) independent accepted verification, (c) exact-head full CI pass, and (d) explicit owner/accountant sign-off wherever required. Only then may a separate approved roadmap reconciliation promote it back to `done`.
