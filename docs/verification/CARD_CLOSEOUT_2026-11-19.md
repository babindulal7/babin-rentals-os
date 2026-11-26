# Closeout reconciliation — 19 November 2026

Scope: the 11 cards labeled `ready` and 12 labeled `acceptance_pending` on local main `53e7b56100773833478b7350a696e858db9e7506`. Local main was one commit ahead of `origin/main` when observed. This is an evidence register, not owner acceptance or a release certification. No card is marked done here.

## Cards labeled ready

| Card | Implementation evidence on local main | Remaining |
|---|---|---|
| T2-06 | Commit `22aee89e` includes repair job and migration 0184. | Verify staged damage → repair → closure, permissions and audit. |
| T2-13 | Commit `800b2729` and migration 0183. | Staged solo/two-person QC and audit. |
| T2-14 | Commit `1188d2b4`. | Real scanner/iPad workflow, privacy and speed. |
| T2-15 | PR #30 merged. | Staged reset damage, evidence and resulting case. |
| T2-19 | PR #209 merged. | Staged signature/refusal and real-device acceptance. |
| T2-20 | PR #189 merged. | Staged Pack/Handover writes and money-blind role checks. |
| T2-21 | PR #170 merged. | Staged downtime conflicts, early release and audit. |
| T2-22 | PR #184 merged. | Staged account/product turnaround and conflicting booking checks. |
| T3-10 | PR #188 merged. | Staged booking, pricing and role acceptance. |
| T3-11 | PR #210 merged. | Staged return/waiver role and financial acceptance. |
| T4-08 | Merge commit `917a7fbd` includes review-fixes branch. | Hosted Edge/JWT, token lifecycle, isolation, anti-abuse and phone acceptance. |

Each requires its card's complete acceptance and an evidence-backed status correction; a prior merge does not prove the feature is release-ready. Check implementation and current PR state again before any merge or status change.

## Cards already labeled acceptance pending

| Card | Missing acceptance |
|---|---|
| T0-12 | Hosted and physical-device owner acceptance. |
| T3-02 | Staged role/CSV checks and staff completion of real product deposits. |
| T3-06 | Owner reports accountant review and 13% added to invoice total; reviewed sample/approval not yet located, and staged signed-agreement storage remains untested. |
| T3-17 | Blocked: current preview selects `inventory_reservations.line_id` although the migration schema defines `booking_line_id`; its quantity path counts rows instead of `qty`, and skips other holds with missing periods. Repair and test real schema/quantity boundaries before staging acceptance. Issue #171 is closed but this separate defect remains. |
| T3-22 | Real-date availability and mobile two-tap/owner acceptance. |
| T3-24 | Staged bill-photo storage permissions and receipt verification. |
| T3-30 | Staged pricing/RLS, restock and low-stock acceptance. |
| T8-02 | Staged plan permissions, retirement and audit. |
| T8-04 | Staged renewal and term-history preservation. |
| T8-07 | Reconciliation of timesheets and actual crew payouts. |
| T8-08 | Owner reports accountant confirmed 15% for crew; preserve this as reported, obtain accountant evidence and validate the exact taxable base before applying any financial configuration. Staged gross/TDS/net payout acceptance remains. |
| T8-09 | Staged eligible staff discount and audit. |

## Evidence and next safe action

- Read-only Supabase project inventory on 19 Nov showed existing `babin-staging` healthy, with **zero public tables and zero migration history entries**. Staged tests cannot run until a reviewed, synthetic staging schema/data plan is installed and validated. This is not authorization to copy production data or change a hosted database.
- Focused mock-only run on local main `53e7b561` reported **53/53 tests in 7 files**: return signature, floor consumables, late-fee acceptance, after-hours line, downtime queries, rider-link queries and membership renewal. It does not establish physical-device, Auth, PostgREST, Edge, Storage or real payment behavior.
- T3-17 source inspection: `src/lib/queries/extensionClash.ts` requests `line_id` (schema uses `booking_line_id`) and counts quantity reservation rows instead of `qty`; missing overlapping periods are skipped. Mock-only tests cannot establish this query contract. This is a source finding, not evidence of a live double booking.
- T3-29 / T3-17 server review: migration 0241 `extend_booking` releases the next booking’s serialized hold for `move_next_booking` without verifying a replacement or setting an at-risk row. It also overwrites reservation end times with the raw new return time, so the 0240 turnaround window needs authoritative regression verification. These are source findings; neither is proof of an actual production incident. Keep T3-17 and T3-29 blocked pending database fixes and lifecycle tests.
- Staging draft PR #179 identifies seed/privacy, ordering and transaction-boundary review work; pending migration 0241 also requires the table-isolation repair in #225 and financial-resolution hardening in #226. Refresh the source inventory against the actual selected release commit before rehearsal.
- The old branch labels are stale. Prepare owner review of this register, reconcile the cards in a separately owned worktree, and complete the staging preflight with explicit target, migration list, synthetic data, outbound delivery disabled and rollback. Do not claim acceptance until each actual role/device/accountant condition is evidenced.

## Migration-number conflict observed 20 November

The separate at-risk safeguard worktree claims 0244, while the active `lane-a/T2-23-allow-overbooking-safe-shortages` checkout ledger also lists 0244 for counter sale and 0245–0247 for other cards. These are independent drafts, not a merged sequence. Coordinate ownership and renumber/reverify before integration; do not overwrite either draft or apply a hosted migration. The T3-17 preview repair itself has no migration.

## T3-17 preview repair in progress — 20 November

An isolated branch `lane-c/T3-17-preview-current` based on `11253bf6` repairs the preview query and quantity logic. Focused mock tests pass, but the full current-source gates, authoritative server hold-release/turnaround repair, real PostgREST/JWT and staging acceptance remain outstanding. The preview refuses to claim clear when existing holds have turnaround buffers or inclusive ends that the current server extension cannot safely preserve. It is not a completed card.

## Local database reproduction — 20 November

On isolated PGlite using source based on `11253bf6`, a synthetic manager-approved `move_next_booking` extension completed while the next booking had zero active holds and zero unresolved at-risk rows. The safety assertion failed (`L76a`, 77/78 earlier checks green); its enclosing transaction rolled back. This confirms the source defect locally, not a production incident. T3-17 / T3-29 remain blocked until an authoritative transaction preserves secured replacement or a risk block and preserves turnaround.
