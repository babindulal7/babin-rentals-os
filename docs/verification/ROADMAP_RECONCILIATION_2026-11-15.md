# Roadmap card reconciliation — merged T3 changes, 15 Nov 2026

**Status:** Review only; no card is certified `done` by this document.  
**Baseline:** `main` at `37f3b0e3fd298ab6113212c97d5ee3a2fdf79a6e` (verified 15 Nov 2026)  
**Scope:** T3-07, T3-19, T3-22; related open PR safety notes.  
**No production actions:** No database migration, payment operation, merge, deployment, or CI rerun performed.

## Summary

| Card | Implementation evidence | Proposed roadmap status | Outstanding release evidence |
| --- | --- | --- | --- |
| T3-07 Opening balances and daily closing | [PR #164](https://github.com/babindulal7/babin-rentals-os/pull/164) merged at main `37f3b0e3`; PR-head `typecheck · test · build` success | `doing` — opening-balance slice implemented; full daily/shift close remains to prove | Daily and per-shift carry-forward, cash/bank reconciliation including deposit movement, staging DB/RLS and a documented seven-day sample; migration `0236` is **written**, not automatically live |
| T3-19 Scan gear into New Rental | [PR #163](https://github.com/babindulal7/babin-rentals-os/pull/163) merged at main `037e175a`; PR-head CI success | `acceptance_pending` | Scan QR and Bluetooth/manual for exact serialized unit; duplicate scan filtering, unavailable/quantity conflicts, atomic server reservation and cross-device mobile/tablet verification |
| T3-22 Availability in two taps | [PR #161](https://github.com/babindulal7/babin-rentals-os/pull/161) merged at main `a55d2893`; PR-head CI success | `acceptance_pending` | Confirm ≤2-tap workflow in real UI; search and scanner parity, correct stock/holder/next free date, New Rental consistency, all required role/device tests |

## Verification boundaries

- A GitHub PR merge and a successful `typecheck · test · build` check do **not** equal production/staging acceptance or a successfully completed full test matrix.
- On this review's main head, the `typecheck · test · build` job has **success** but it ran a **Mac dependency-free smoke only**: typecheck, tests, PGlite and build were skipped in that main job. The separate `Mac · full CI (main)` job was still **in progress** when inspected: [run 43696015085](https://github.com/babindulal7/babin-rentals-os/actions/runs/43696015085). Keep exact-head green claims provisional until its completion.
- The roadmap's accepted status vocabulary is `todo`, `doing`, `ready`, `acceptance_pending`, `done` ([track README](https://github.com/babindulal7/babin-rentals-os/blob/main/docs/plans/README.md)). Move to `done` only after the card's exact acceptance conditions are evidenced, then document the relevant test/role/device results in `PROGRESS.md`.

## Open PRs requiring attention

1. [PR #162](https://github.com/babindulal7/babin-rentals-os/pull/162), T3-17: the client `extensionClash.ts` currently maps reservation query errors and invalid/empty data to `hasClash:false` (fail-open UI). Its branch also rewinds the migration ledger to "next free 0233" and claims 0232, already allocated on main. The PR also removes historic `PROGRESS.md` content. A concrete fix request has been [posted](https://github.com/babindulal7/babin-rentals-os/pull/162#issuecomment-6891958448). **Do not merge as-is.**
2. [PR #166](https://github.com/babindulal7/babin-rentals-os/pull/166), T3-24: bill-photo MIME/extension validation accepts a known extension despite a forbidden MIME type (or an unknown extension with blank MIME). A safe validation and storage-policy test request has been [posted](https://github.com/babindulal7/babin-rentals-os/pull/166#issuecomment-6891958999). **Do not merge until reviewed.**
3. [PR #165](https://github.com/babindulal7/babin-rentals-os/pull/165), T0-03: triage was prepared against `main` `037e175a` before PR #164 was merged and before PR #166 opened; refresh the open-PR inventory and report before approval. Do not close unrelated PRs automatically.
4. [PRs #156](https://github.com/babindulal7/babin-rentals-os/pull/156) and [#157](https://github.com/babindulal7/babin-rentals-os/pull/157) are draft website and portal work. Their successful PR-head checks do not authorize a live booking-site deployment or live settings change.
5. [PR #160](https://github.com/babindulal7/babin-rentals-os/pull/160) is responsive test coverage. Owner/device translation acceptance remains separate.

## Smallest safe next steps

1. Let current automatic required CI complete; **do not cancel or rerun** active main builds merely to obtain a new status.
2. Have Lane C repair PR #162's fail-open, migration ledger and history-loss issues, add negative DB tests, and obtain exact-head green CI.
3. Have Finance/Lane C repair PR #166's file-type enforcement and verify storage/RLS.
4. Run remaining device/staging acceptance matrices for the three merged cards; record real evidence and only then advance their status to `done`.
5. Rebase the T0-03 triage report onto current main with the newer PR inventory.

## Owner restrictions

No merge, live Supabase writes, hosted staging expense, domains, payments, workflow cancellation, Booqable cutover or deployment is authorized by this documentation change.


## Follow-up reconciliation — 17 Nov 2026 (evidence only)

**Current main reviewed:** `02a0e0b1a963af28cdd2bbfeab381e923b09d42c`. The full main CI run [#43941677032](https://github.com/babindulal7/babin-rentals-os/actions/runs/43941677032) completed successfully. This is not a device, staging, or feature acceptance sign-off. Earlier dated PR-open warnings above are historical snapshots and should not be interpreted as current open status.

### Thirteen roadmap cards marked ready: disposition

| Card | GitHub evidence as of 17 Nov | Safe next step |
| --- | --- | --- |
| T2-15 | [PR #30](https://github.com/babindulal7/babin-rentals-os/pull/30) merged 2 Nov | Validate booking-linked damage case and notification; update roadmap only after acceptance |
| T2-21 | [PR #170](https://github.com/babindulal7/babin-rentals-os/pull/170) merged 15 Nov UTC | Validate downtime exclusion, calendar and early termination |
| T3-17 | [PR #162](https://github.com/babindulal7/babin-rentals-os/pull/162) merged 15 Nov; follow-up safety [PR #172](https://github.com/babindulal7/babin-rentals-os/pull/172) remains open | **Hold acceptance** until fail-closed availability and quantity-capacity regression are reviewed and tested |
| T3-22 | [PR #161](https://github.com/babindulal7/babin-rentals-os/pull/161) merged 15 Nov | Verify two-tap workflow, device and stock parity |
| T8-02 | Named branch `lane-a/T8-02-plans-admin-screen`: 0 commits ahead, 433 behind main | Verify actual implementation and audit/RBAC tests; no branch merge to perform |
| T8-04 | Named branch `lane-a/T8-04-renew-a-lapsed-membership`: 0 ahead, 280 behind | Verify renewal history and authorization; no branch merge to perform |
| T8-07 | Named branch `lane-a/T8-07-timesheet-by-the-day`: 0 ahead, 259 behind | Verify day-rate and overtime totals; no branch merge to perform |
| T8-08 | Named branch `lane-a/T8-08-tds-on-crew-payouts`: 0 ahead, 411 behind | Verify stored TDS calculations and obtain accountant acceptance |
| T8-09 | Named branch `lane-a/T8-09-staff-renting-gear-finish`: 0 ahead, 433 behind | Verify discount, deposit, invoice and role rules |
| T2-06 | Named branch not found in GitHub branch search; no matching open implementation PR identified | Trace commits and inspect maintenance close-out behavior |
| T2-13 | Named branch not found; no matching open implementation PR identified | Trace self-QC implementation and audit constraints |
| T2-14 | Named branch not found; no matching open implementation PR identified | Trace scanner item-card and finance-hiding behavior |
| T4-08 | Named branch not found; no matching open implementation PR identified; historical [PR #35](https://github.com/babindulal7/babin-rentals-os/pull/35) closed unmerged | Trace rider-link implementation and verify token expiry, access scope, revocation and privacy |

**Interpretation:** 4 implementation PRs already merged, 5 referenced branches fully contained in main history (zero ahead), 4 branch references unresolved. None of these facts alone certifies `done`. Do not blindly merge obsolete branches or count an open documentation PR as feature completion.

**Next verification order:** T3-17 fail-closed and quantity-capacity safety; T4-08 rider-token privacy; T2-13 solo-QC audit; T2-06 repair availability; remaining cards after evidence. Reconcile the task status headings in a separate reviewed change once acceptance results are recorded.

**Restrictions:** Documentation-only update. No live settings, migrations, deployment, automatic CI reruns, or merge. Avoid claiming exact-head integration readiness for stale PRs.
