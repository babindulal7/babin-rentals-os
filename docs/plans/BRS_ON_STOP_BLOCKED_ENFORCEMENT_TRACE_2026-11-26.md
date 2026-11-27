# BRS-06 enforcement trace: On Stop and manual Blocked

Snapshot: origin/main ccfc7bd8 (26 November 2026). Static migration and source reading only. No runtime test, no live database attestation. Supports review of PR #460 and the BRS-06 gate in #461.

## Effective definitions (latest migration wins)

| Object | Latest definition | Ledger status |
|---|---|---|
| `create_booking(jsonb)` | 0243_change_confirmed_booking.sql | 0243 verified |
| `confirm_booking_atomic(...)` | 0253_temporary_stock_from_partners.sql | 0253 verified |
| `apply_booking_stage_transition()` (stage gates) | 0181_collateral_deposit_id_card.sql | 0181 verified |

## Verified / unverified table

| Check | Where | Status |
|---|---|---|
| Manual Blocked blocks Quote→Booked (confirm path) | 0181 `apply_booking_stage_transition`, "1. Quote -> Booked": raises `gate.booking.client_blocked` when a `client_flags` row with `flag_type='Blocked'` and `removed_at is null` exists | **Verified in source.** Enforced by a database trigger on the stage transition, not by the confirm RPC body. |
| Confirm RPC routes through that trigger | `confirm_booking_atomic` body (0253), step 7: `insert into booking_stage_transitions` (line 244). The trigger `trg_apply_booking_stage_transition` runs `apply_booking_stage_transition` on that insert (named in 0100). | **Verified in source.** Confirm writes the stage row that fires the Blocked gate. Confirm itself has no separate Blocked check; the trigger is the gate. |
| `create_booking` (quote save) has no Blocked check | 0243 body: no block/flag reference except money-blind gates | **Verified in source.** This is consistent with BRS-06 (quote allowed with warning), but it means quote save depends on the client-side warning only, which is the intended behaviour. |
| On Stop (derived credit or overdue equipment) enforced server-side | `git grep -i "on_stop\|onstop" origin/main -- supabase/migrations` | **Not present.** No migration references On Stop. The only On Stop check is in client code (`src/modules/rentals/booking/newRentalGuards.ts:167-170,222`). **Gap.** |
| Credit-stop or 24-hour overdue-equipment rule enforced server-side | Search of all migrations for overdue/24h/stage-2/recovery stop logic. `overdueStopDays` appears only as a settings key (0158, 0202). No server-side stop logic found. | **Not present in migrations.** R-25.4 (`RULINGS-2026-11-25.md`) is documentation only on main. |
| Handover (checkout) enforces Blocked | 0179 and 0149 join `client_flags` in gate functions | **Partially verified.** The join exists in gate functions. I did not read the full checkout path or confirm that On Stop is absent from it. |

## Consequence for BRS-06 (#461)

- Manual Blocked is protected at the database on the Quote→Booked transition. Relaxing the UI for quotes does not weaken it.
- On Stop has no server-side protection on confirm or checkout that this trace can find. Relaxing the quote warning for On Stop clients is therefore safe only after a forward-only server gate exists and is verified. This is the gap #461 requires to be closed first.
- Migration 0058 (late-fee approver rank) is marked "NOT APPLIED" in its header and has no ledger row. Do not cite it as enforced.

## Next steps (no code change in this document)

1. Confirm on a PGlite run (`npm run check:pglite`) that a Quote→Booked confirm of a Blocked client is refused (not run here).
2. Propose a forward-only gate for On Stop at Quote→Booked and handover, to be reviewed separately before any UI change.
