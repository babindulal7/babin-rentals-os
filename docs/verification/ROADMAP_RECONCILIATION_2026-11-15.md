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
