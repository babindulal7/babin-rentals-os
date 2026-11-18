# T2-22 — Time between rentals: design for review

**Status: DRAFT — review required before implementation.** T2-21 is awaiting merge; rebase onto its merged result and inspect its final database checks before coding. This note proposes a design, not a product ruling or migration. No live database changes are authorized by this note.

## Current behavior and intended rule

`rentalTurnaround` currently chooses an endpoint convention, not a number of minutes: `Same-instant handover allowed` maps to half-open ranges and `Turnaround required` to closed ranges (`src/lib/settingsStore.ts`, `src/lib/availability.ts`). Preserve both behaviors exactly in account-wide mode, including existing defaults and unknown-value handling. Add an account-wide/per-product selector, defaulting existing accounts to account-wide. In per-product mode, evaluate a rental as `[pickup - prep_time_minutes, return + cleaning_time_minutes)`; a previous 18:00 return with 120 cleaning minutes conflicts with a 19:00 pickup, while a 09:00 pickup with 60 prep minutes needs the unit by 08:00. Compare both sides' effective windows so cleaning and the next booking's preparation are respected. Validate non-negative whole minutes and UTC arithmetic.

## Database and concurrency

After T2-21 lands, claim the next free migration number before SQL. Put one authoritative, side-effect-free window calculation and availability predicate in Postgres, used by stage-transition reservation creation and the latest definitions of `confirm_booking_atomic` and `create_or_extend_hold` (currently superseded beyond 0188; verify exact latest definitions after rebase). Keep the existing GiST no-double-booking constraint and T2-21 downtime enforcement. Protect the check and write against concurrent confirmations/holds with the same transaction and appropriate per-unit/per-product locks; a preflight query alone is insufficient. Quantity stock must count every overlapping effective reservation without double-counting units, including temporary holds. Reject invalid per-product minutes rather than silently offering an unsafe slot; retain the current account-wide fallback for unrecognized legacy labels.

**Existing bookings and reservations:** never rewrite their stored ranges or change confirmed stages. The conflict predicate must also account for effective windows of legacy reservations when a new hold or confirmation is attempted; merely widening new rows would miss an older booking's cleaning window. Preserve booking identity, original dates and existing reservation history. Specify and test how changed settings or product minutes affect future checks without retroactively mutating existing reservations. Any resulting conflicts are surfaced, not automatically cancelled. Coordinate with T2-21's downtime ranges and lock order to avoid bypasses and deadlocks. Review whether effective buffers are best persisted as a separately versioned snapshot or evaluated against current policy before selecting the implementation; neither approach may invalidate the no-rewrite requirement.

## Client and settings

Keep Settings as presentation only; save the shared policy through the existing settings authority. Put matching window and overlap evaluation in `src/lib/availability.ts` / `availabilityEvaluation.ts`, consumed by `src/lib/queries/availability.ts` and all availability surfaces. Postgres remains authoritative if the screen is stale. Equipment form copy must state prep and cleaning minutes apply in per-product mode. Show an actionable conflict without exposing money to floor roles. Refresh/re-evaluate when the setting or product changes; do not fabricate availability on an error or offline write.

## Required proof before ready

- PGlite and lifecycle in the same run: a floor/desk booking inside a two-hour cleaning interval is refused; a booking exactly at the allowed boundary is accepted; 60-minute preparation is enforced; and both account-wide settings preserve their present boundary behavior.
- Exercise a pre-existing reservation created before the switch, unmodified after the switch; test zero minutes, expired/released holds, quantity capacity, serialized units, T2-21 downtime, simultaneous confirmations, and hold-to-confirm conversion. Assert no existing booking or reservation is changed by rollout.
- Unit tests establish client/Postgres boundary parity and invalid-input behavior. Run every card gate and the required 375/820/1440 role-based screen checks. No production migration application.

**Review needed:** The plan calls the current endpoint choice “account-wide turnaround”; it does not currently store an account-wide duration. Confirm that preserving these endpoint semantics satisfies B11 before implementation. Also review concurrency/legacy-range strategy and the combined cleaning-plus-preparation boundary. Babin shares this note with Claude at the next check-in.
