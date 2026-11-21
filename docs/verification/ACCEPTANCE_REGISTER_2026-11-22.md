# Acceptance register — 33 pending cards — 22 November 2026

- **Baseline:** `origin/main` at `89e8a56e` (fetched 22 Nov 2026).
- **Count re-check:** 155 cards on `main`: 33 `acceptance_pending`, 98 `done`, 1 `done in part`, 6 `doing`, 4 `ready`, 12 `todo`, 1 `launch_checklist_ready`. Matches the sprint snapshot.
- **PR #311** (T1-06, T2-22): open, unmerged, head `1554ff451f43056de6bc8472ae247055ee67adc5`, merge state CLEAN, no review decision. Not merged here.
- **Scope of this register:** read-only. It checks that cited migrations, lifecycle steps and test files exist on `main`. It does **not** run hosted staging, device, merchant or owner checks. No status on `main` is changed.

## Disposition key

`PARTIAL` = local or repo evidence exists, hosted/owner gate missing. `NOT_RUN` = no check run yet. `BLOCKED_OWNER`, `BLOCKED_EXTERNAL`, `BLOCKED_DEPENDENCY`, `DEFERRED_PHASE2` as defined in the sprint brief. No card is `PASS_WITH_EVIDENCE` for acceptance: each still needs hosted, owner or device sign-off.

## Register

| Card | Disposition | Repo evidence found on `main` | Missing before acceptance |
|---|---|---|---|
| T0-03 Open PR triage | NOT_RUN | — | PR disposition matrix; owner acceptance |
| T0-09 Active CI + local gates | NOT_RUN | — | Exact-head run IDs; branch-protection check; owner sign-off on repo settings |
| T0-12 5 Nov rule conflicts | PARTIAL | Card says merged; device/owner acceptance not documented | Role matrix run; owner acceptance |
| T1-17 Two-step sign-in | BLOCKED_OWNER | — | Staging TOTP run; production MFA is separate owner activation |
| T1-18 Sign-in history / new-device email | BLOCKED_DEPENDENCY | PR #204 merged per card | Staging email dispatch to a test inbox; authorised email infra |
| T2-06 Repair job closes damage | PARTIAL | `verify-floor-operations-acceptance.mjs` (local PGlite only) | Hosted staged run |
| T2-14 Scan label → item card | DEFERRED_PHASE2 (hardware) | Manual search path not separately verified here | Manual/search acceptance run; hardware is Phase 2 |
| T2-15 Damage found during reset | PARTIAL | Local walkthrough script | Hosted run; sandbox notice check |
| T2-19 Signature at Return | DEFERRED_PHASE2 (iPad) | PR #209 merged per card | Desktop/manual alternative run |
| T2-21 Planned downtime | PARTIAL | Local walkthrough script | Hosted run; public blackout check |
| T2-22 Turnaround buffer | BLOCKED_OWNER | PR #311 candidate, CLEAN, head `1554ff45` | Independent review; separate merge approval |
| T2-23 Selected-product overbooking | PARTIAL | — | **Citation error:** card cites migration 0245, but `0245_delivery_zone_vehicle_fee_grid.sql` is unrelated. Correct migration number needed. Hosted run |
| T3-02 Per-product deposits | NOT_RUN | — | Role/CSV dry run on staging; owner data-entry plan |
| T3-06 Invoices and agreements | BLOCKED_EXTERNAL | — | Accountant review; separate production activation |
| T3-13 Fully booked → alternative/sub-rent | BLOCKED_OWNER | PR #182 merged per card | Partner roster; multi-device owner check |
| T3-30 Consumables | PARTIAL | Lifecycle L73 (PGlite, passed 22 Nov) | Hosted pricing/RLS and restock run |
| T4-08 One-time rider link | PARTIAL | Migrations 0190, 0204 present | Field phone acceptance; security review note |
| T7-01 Online booking contract | PARTIAL | `docs/ONLINE_BOOKING_SPEC.md` present | Independent reconciliation of RLS wording; owner acceptance |
| T7-02 Public catalogue | PARTIAL | Migration 0255 present; lifecycle L93 | Hosted anon/published-only run; mobile performance |
| T7-03 Verified-email client accounts | PARTIAL | Migration 0257; lifecycle L95 | Hosted two-client isolation run |
| T7-05 Fonepay payments | BLOCKED_EXTERNAL | Migration 0258 present | Merchant credentials; sandbox evidence; no live payment without approval |
| T7-06 eSewa and Khalti | BLOCKED_EXTERNAL | Adapters in tests per card | Merchant accounts |
| T7-08 My bookings | PARTIAL | `src/booking/account/__tests__/myBookings.test.tsx` | Staged client A/B run; depends on T7-05 |
| T7-09 Bot and abuse protection | BLOCKED_EXTERNAL | — | Production Turnstile domain configuration (owner) |
| T7-12 Recommended items | PARTIAL | `src/lib/__tests__/recommendations.test.ts` | Staged UI check; New Rental add flow |
| T7-13 Product options on one page | NOT_RUN | — | Option stock/rates test; staged run |
| T7-14 Away switch | PARTIAL | `src/lib/__tests__/awayMode.test.ts` | Staged server-denial run |
| T7-15 Payment links | PARTIAL | Migration 0259; lifecycle L96 | Sandbox callback run; tamper/expiry/replay cases |
| T7-16 GA4 / Meta Pixel | PARTIAL | `src/lib/__tests__/storeAnalytics.test.ts` | Staging event proof; owner IDs |
| T7-17 Existing store links | BLOCKED_EXTERNAL | `scripts/reconcile-booqable-backup.mjs` exists | Cloudflare mapping (outside repo); staging resolver run |
| T9-01 Catalogue/client import | BLOCKED_OWNER | Card heading says "ready for merge" on a lane branch | Owner match report approval; reconcile wording |
| T9-02 Booqable holds | BLOCKED_DEPENDENCY | — | T9-01 dependency; authorised sync |
| T9-07 Staff training | DEFERRED_PHASE2 (iPad/scanner/printer) | — | Desk/manual training sign-off; Phase 2 hardware |

## Findings to fix (not done here)

1. **T2-23 migration citation** points at an unrelated migration (0245). Needs the correct number before its receipt can be written.
2. **T9-01 heading** says `acceptance_pending` but also "ready for merge" on a lane branch. Wording needs reconciling.
3. **T2-14 and T9-07** rely on Phase-2 hardware deferrals. Their Phase-1 manual paths still need their own evidence.

## Next safe actions (no staging writes)

- Write per-card receipts (`ACCEPTANCE_<ID>_2026-11-22.md`) for T7-01, T7-02 and T7-03 from local evidence, marked PARTIAL.
- Staging checks for T2-06, T2-15, T2-21, T3-30 and T7-02 need your explicit task-specific authorisation before any write.
