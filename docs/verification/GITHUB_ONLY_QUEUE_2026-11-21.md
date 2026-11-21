# GitHub-only execution queue — Babin Rentals OS (21 Nov 2026)

> This queue is for work that can be **prepared and reviewed through connected GitHub alone** without using the owner's Windows development PC, Mac self-hosted CI runners, hosted staging database, or live production settings. It is not a replacement for the canonical 155-card roadmap. No card in the canonical roadmap should be promoted from this file alone.

## Boundary

- **Allowed here:** read PRs/issues/diffs, compare branches, inspect completed CI logs, perform static reviews, draft isolated code/test/doc patches via GitHub, open draft PRs, post source-grounded review notes, update docs-only evidence.
- **Not independently verifiable here:** actual Vitest suites requiring repo dependencies, PGlite migration execution, PostgREST/RLS behavioral tests, end-to-end browser/device tests, self-hosted runner results, hosted payments, SMTP delivery, or staging migration application.
- **Prohibited without separate owner action:** merge, auto-merge, force-push other agents' branches, delete branches, modify production/staging/Cloudflare/DNS/Resend settings, apply migrations, send real email or payments, start runner jobs. Windows owns development/staging; Mac runs CI only.
- **Branching:** for small corrections to large active PRs, create a child draft PR with base set to the original PR **head branch**, not `main`. The current CI workflow filters `pull_request` to `main` and `push` to `main`; no runner is required merely to record a child draft correction. Do not imply those drafts are merged.

## Completed here — prepared, NOT merged / release-accepted

| Item | Evidence | Status | External gate remaining |
|---|---|---|---|
| T1-09 DNS documentation repair | [Child draft #279](https://github.com/babindulal7/babin-rentals-os/pull/279) → parent #275 | **prepared**; provider-generated DKIM/SPF/return-path instructions | Review and incorporate into parent; verify real provider records in approved domain operation |
| T7-11 domain cutover document repair | [Child draft #280](https://github.com/babindulal7/babin-rentals-os/pull/280) → parent #271 | **prepared**; one-way book→apex redirect, no invented phone number | Review and incorporate into parent; later owner-approved DNS/deployment verification |
| T7-02 visibility security source review | [PR #277 comment](https://github.com/babindulal7/babin-rentals-os/pull/277#issuecomment-7053689603) | **reviewed, not accepted** | Migration immutability/provenance + exact-head local gates + independently authorized staging isolation |
| All open PR / 155-card snapshot | [Draft audit #278](https://github.com/babindulal7/babin-rentals-os/pull/278) | **documented, not accepted** | Reconcile again at current main/head when merging; statuses are declarations, not independent evidence |
| Public booking Kathmandu date default | [Isolated source branch](https://github.com/babindulal7/babin-rentals-os/tree/fix/booking-kathmandu-date-defaults-20261121) | **source fix prepared, unmerged** | Review overlap with #276; Windows test run, full CI and device matrix before acceptance |

## Latest prepared security children — 21 November 2026

| Parent | Child draft | GitHub-only preparation completed | Runtime acceptance remaining |
|---|---|---|---|
| [#266 refunds](https://github.com/babindulal7/babin-rentals-os/pull/266) | [#283](https://github.com/babindulal7/babin-rentals-os/pull/283) | Terminal refunded state guard in SQL allocation + Edge verify, plus static regression test | Duplicate callback/refund concurrency, ledger invariants, full local gates, independent review; caller-auth/provider verification remains separate P0 |
| [#269 payment links/portal](https://github.com/babindulal7/babin-rentals-os/pull/269) | [#284](https://github.com/babindulal7/babin-rentals-os/pull/284) | Narrow KYC Storage policy, raw profile staff read, exposed view, plus static regression test | Supabase Storage/role JWT integration, policy union review, signed URL/ownership checks and staging preflight |

**Static source review:** 12/12 inspected assertions matched, **not** a Vitest or PGlite run. Both changes are *prepared only*, neither the parent nor main has been updated. No runner dispatch, hosted database write, merge or deployment.

## Next GitHub-only work — no computer necessary to prepare

| Priority | Input | Smallest useful action here | Must remain blocked without computer/approval |
|---|---|---|---|
| P0 | [PR #276](https://github.com/babindulal7/babin-rentals-os/pull/276) | Source trace for 9 review threads (tenant view, payment-intent auth, rupees→paisa, fail-closed Fonepay, staff request handling). Prepare narrowly scoped tests and draft patches in distinct child PRs, not a broad rewrite | PGlite/RLS and hosted verified-payment behavior |
| P0 | [PR #269](https://github.com/babindulal7/babin-rentals-os/pull/269) + [#266](https://github.com/babindulal7/babin-rentals-os/pull/266) | Categorize overlap and separate verified provider settlement, refund terminality, KYC storage ACL, request confirmation retry defects. Document exact function/file dependencies | Local simulation, provider settlement verification, migration acceptance |
| P0 | [Issues #66](https://github.com/babindulal7/babin-rentals-os/issues/66), [#223](https://github.com/babindulal7/babin-rentals-os/issues/223), [#226](https://github.com/babindulal7/babin-rentals-os/issues/226) | Inspect current main SQL and proposed patches; trace read/write authorization for Warehouse, Client, Coordinator, Accounts; prepare negative test scenarios | Claiming a production exploit fixed or RLS accepted without evidence |
| P1 | [PR #270](https://github.com/babindulal7/babin-rentals-os/pull/270) | Propose a fail-closed client submission UI path; do not display success or clear cart until a real persisted request ID exists. Prepare mock-mode and error regression tests | Real database write / live submission validation |
| P1 | [PR #275](https://github.com/babindulal7/babin-rentals-os/pull/275) and [#271](https://github.com/babindulal7/babin-rentals-os/pull/271) | Finish child-PR documentation review and close documentation findings only **after** parent incorporates fixes | DNS switching / actual SMTP / domain cutover |
| P1 | T0–T9 roadmap status audit | Match candidate cards against current main SHA, merged PR, specific acceptance criteria, device proof, and local/CI receipts | Marking `done` based only on an open PR, static review or status label |
| P1 | Desktop, tablet, phone shell | Static audit 375/820/1440 width behavior, ARIA, touch targets, mock/error states and role visibility; prepare small isolated tests | Real viewport/browser acceptance claim |

## Approval and evidence convention

- `reviewed` = source or diff inspected, no runtime guarantee.
- `prepared` = source/documentation change committed to a branch or draft PR, **not** verified/accepted.
- `CI success` = observed workflow result for an **exact SHA**; never substitutes for reviewer closure, role isolation or staging acceptance.
- `acceptance_pending` = unfinished until every card-specific test and independent owner/device gate is evidenced.
- `done` = merged plus every applicable acceptance condition demonstrated and recorded (per `docs/plans/README.md`).

**Current launch constraints:** Preserve existing rental-day/price/VAT rules and the owner's decisions; no new scanner dependence, no automatic payment confirmation without verified provider settlement, no public access to private stock, KYC, client identity or hidden finance. Prefer an explicit HOLD to an unsupported success.

## GitHub-only completion receipt

- Draft PRs #279 and #280 exist against parent implementation branches; the parent branches are untouched by these child changes.
- Static security review receipt posted on #277; no hosted checks or access decisions were modified.
- No new automatic runner jobs should result from PRs targeting non-main branches under the inspected CI event filters; this must still be checked against current GitHub Actions results.
- Nothing in this queue constitutes an instruction to merge, deploy, apply migrations or change live configuration.
