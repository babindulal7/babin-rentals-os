# MAC Audit — Babin Rentals OS — 19 November 2026, 03:38 NPT

Computer / agent: Mac Antigravity (Lane A — Floor Operations)
Repo path / worktree: `/Users/babindulal/Documents/GitHub/babin-rentals-os` (branch `audit/mac-8-card-audit-20261119`)
Observed origin/main SHA: `44300a17e01705676cd0c21b9518edf23a9a0fda`
Local HEAD SHA / branch: `44300a17e01705676cd0c21b9518edf23a9a0fda` (`audit/mac-8-card-audit-20261119`)
Clean / dirty worktree? Clean worktree (0 modified files, 0 untracked files).
Branch ahead/behind main: 0 ahead, 0 behind `origin/main` (at branch point).
Last exact-head main CI run and result: GitHub Run ID `44387475554` (success on SHA `44300a17e01705676cd0c21b9518edf23a9a0fda`).
Open PRs connected to this lane: None open for these 8 cards (all implementation PRs #30, #170, #184, #189, #209 and direct commits are merged into `main`).

| Card | Canonical status | Code location / merged PR | Tests passed (exact command) | Device / staging / role proof | Missing acceptance | Conclusion |
|---|---|---|---|---|---|---|
| **T2-14** | `ready — awaiting merge` (stale heading in `T2_FLOOR.md`) | `1188d2b4` (`src/components/shell/ScannerFab.tsx`, `src/modules/inventory/ItemCardSheet.tsx`, `src/lib/queries/inventory.ts`) | `npm test -- src/components/shell/__tests__/ScannerFab.itemCard.test.tsx src/lib/__tests__/itemCountdown.test.ts src/lib/queries/__tests__/itemCardLookup.test.ts src/modules/inventory/__tests__/ItemCardSheet.test.tsx` (18/18 pass) | `NOT TESTED` (Unit tests verify Law 6 zero-money leakage; physical Bluetooth scanner and iPad timing not executed) | Physical iPad camera and Bluetooth HID scanner ≤ 1.0s timing receipt; staging Warehouse role money verification | BLOCKED (Hardware/Device) |
| **T2-13** | `ready — awaiting merge` (stale heading in `T2_FLOOR.md`) | `800b2729` (migration `0183_reset_self_qc_when_alone.sql`, `src/modules/rentals/ResetWorkspace.tsx`, `src/actions/rentals/floorVerb.ts`) | `npm test -- src/actions/rentals/__tests__/resetSelfQc.test.ts src/actions/rentals/__tests__/floorVerbs.test.ts` (108/108 pass); `npm run check:lifecycle` step `L40` | `NOT TESTED` (Database CHECK constraint and audit log verified in PGlite; staging multi-user seat session pending) | Multi-role staging session proving alone-on-shift checkbox allows pass while unflagged same-person QC is rejected | BLOCKED (Staging) |
| **T2-15** | `ready — awaiting merge` (stale heading in `T2_FLOOR.md`) | `4d1903d0` / PR #30 (migration `0194_reset_damage_opens_case.sql`, `src/modules/rentals/ResetWorkspace.tsx`, `src/actions/cases/createCase.ts`) | `npm test -- src/lib/__tests__/damage.test.ts src/lib/queries/__tests__/damage.test.ts` (25/25 pass); `npm run check:lifecycle` step `L56` | `NOT TESTED` (PGlite audit verifies unpriced case creation; live email sandbox and manager signoff pending) | Staged Reset damage walkthrough: linked booking verification, damage notice email triggered without amount, manager approval tier | BLOCKED (Staging/Email) |
| **T2-06** | `ready — awaiting merge` (stale heading in `T2_FLOOR.md`) | `a9f760ae` (migration `0184_complete_maintenance_clears_damage.sql`, `src/modules/inventory/MaintenanceJobDetail.tsx`, `completeMaintenance.ts`) | `npm test -- src/actions/maintenance/__tests__/maintenance.test.ts src/modules/inventory/__tests__/MaintenanceJobDetail.test.tsx src/modules/inventory/__tests__/maintenanceQueue.test.tsx` (21/21 pass); `check:lifecycle` `L41` | `NOT TESTED` (Technician close-job note requirement and role masking verified locally; staging photo upload pending) | Staged repair-job close walkthrough and evidence-photo upload integration (depends on hosted Supabase Storage / T1-06) | BLOCKED (Staging/Storage) |
| **T2-20** | `ready — awaiting merge` (stale heading in `T2_FLOOR.md`) | `78c2787b` / PR #189 (`src/modules/rentals/PackingWorkspace.tsx`, `HandoverWorkspace.tsx`, `addConsumableLine.ts`) | `npm test -- src/modules/rentals/__tests__/FloorConsumables.test.tsx src/lib/__tests__/consumablesPricingAndRestock.test.ts` (14/14 pass); `check:lifecycle` `L73` | `NOT TESTED` (Money masking in DOM verified in Vitest; staging network payload audit pending) | Staged network inspection confirming Warehouse role receives no price fields in PostgREST payloads; stock deduction at Handover | BLOCKED (Staging) |
| **T2-21** | `ready — awaiting merge` (stale heading in `T2_FLOOR.md`) | `2221b29f` / PR #170 (migration `0237_planned_equipment_downtime.sql`, `src/lib/availability.ts`, `planDowntime.ts`, `endDowntime.ts`) | `npm test -- src/actions/inventory/__tests__/planDowntime.test.ts src/actions/inventory/__tests__/endDowntime.test.ts src/lib/queries/__tests__/downtime.test.ts src/modules/inventory/sections/__tests__/PlannedDowntimeCard.test.tsx` (15/15 pass); `check:lifecycle` `L72` | `NOT TESTED` (Booking collision rejection, early release, and calendar model verified locally; staging visual audit pending) | Visual calendar inspection on staging across staff roles; public catalog blackout confirmation | BLOCKED (Staging) |
| **T2-22** | `ready — awaiting merge` (stale heading in `T2_FLOOR.md`) | `92b16821` / PR #184 (migration `0240_time_between_rentals.sql`, `src/lib/availability.ts`, `src/modules/settings/sections/System.tsx`) | `npm test -- src/lib/__tests__/availability.test.ts` (82/82 pass); `npm run check:lifecycle` steps `L74` and `L75` | `NOT TESTED` (Reservation bounds and exclusion rules verified in PGlite; staging settings walkthrough pending) | Staged settings toggle walkthrough (Account-wide vs Per product) and verification of reservation exclusion constraint | BLOCKED (Staging) |
| **T2-19** | `ready — awaiting merge` (stale heading in `T2_FLOOR.md`) | `b555a1f3` / PR #209 (migration `0242_return_damage_signature_and_refusal.sql`, `src/modules/rentals/ReturnWorkspace.tsx`, `floorVerb.ts`; T2-18 merged via `8251c1f2` / PR #80) | `npm test -- src/modules/rentals/__tests__/ReturnWorkspace.damageSignature.test.tsx src/modules/rentals/__tests__/ReturnWorkspace.damageEvidence.test.tsx` (4/4 pass); `check:lifecycle` `L78`, `L79` | `NOT TESTED` (Signature modal and ≥10 char refusal reason verified in Vitest mock; physical touchscreen signature pending) | Physical iPad touchscreen signature verification; live Return damage report and notice presentation | BLOCKED (Hardware/Device) |

## Summary:
- Assigned cards: 8 Mac (T2-14, T2-13, T2-15, T2-06, T2-20, T2-21, T2-22, T2-19)
- Newly VERIFIED DONE since prior baseline: 0 (Strict compliance: no card marked `done` without hardware/staging acceptance evidence)
- Already done previously, status corrected: 0
- Implemented and merged but still pending acceptance: 8 (T2-14, T2-13, T2-15, T2-06, T2-20, T2-21, T2-22, T2-19)
- Implemented only on local branch: 0 (All 8 are merged into `origin/main`)
- Open PRs awaiting review: 0 for these 8 cards
- Blocked by external owner/accountant/staging/device: 8 cards
  - T2-14: Physical Bluetooth HID wedge scanner & iPad hardware
  - T2-13: Staging multi-user seat walk-through
  - T2-15: Staging email sandbox & manager approval workflow
  - T2-06: Hosted Supabase Storage bucket & staging repair lifecycle
  - T2-20: Staging PostgREST network payload audit for Warehouse role
  - T2-21: Staging calendar visual check & public catalog blackout
  - T2-22: Staging settings toggle & database exclusion constraint check
  - T2-19: Physical iPad touchscreen signature verification
- Fully unimplemented: 0
- Worktree unpushed commits/changes: This verification report on branch `audit/mac-8-card-audit-20261119`
- Exact next 3 safe actions, in dependency order:
  1. Schedule a physical device test session with Babin on the shop iPad with Bluetooth scanner for T2-14 and T2-19.
  2. Coordinate staging deployment verification (once T1-02/T1-06 staging is active) for T2-13, T2-15, T2-06, T2-20, T2-21, and T2-22.
  3. Reconcile stale roadmap card headings in `docs/plans/T2_FLOOR.md` from `ready — awaiting merge` to `acceptance_pending` once coordinated with the Windows lane.
- Questions requiring Babin's explicit decision, if any:
  - Do you want an automated staging script or manual physical checklist run for the iPad scanner (T2-14) and touchscreen signature (T2-19)?
- No deployment/live writes performed: YES (All checks were local and read-only against `main`; no migrations pushed to remote Supabase, no configuration changes).
