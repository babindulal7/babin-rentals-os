# T2-22 — Current main review, 19 November 2026

**Scope:** local `main` at `44300a17`. PR #184 (`92b16821`) is already merged and includes the T2-22 implementation; PR #170 (`2221b29f`) contains T2-21. The earlier draft on this review branch was made against an older main and is superseded for implementation planning. The card label on main still says “ready — awaiting merge”; do not take that label as evidence that the PR is unmerged or that acceptance is complete.

## Potential high-severity gap — cleaning buffer after Return

In `supabase/migrations/0240_time_between_rentals.sql:89`, `reservations_follow_stage_transition()` sets `released_at` when a booking reaches Returned. The serialized GiST exclusion in `0188_smart_reservation_holds.sql:40` applies only while `released_at is null`; the quantity-capacity trigger uses the same liveness condition. If a camera returns at 18:00 and requires 120 minutes of cleaning, a new 19:00 pickup with zero prep can therefore cease to conflict with that reservation immediately after Return, although the ruled availability time is 20:00. The helper widens the original period, but releasing the row removes it from these guards. This is a source-derived scenario, not a completed database reproduction. Verify whether any separate authoritative cleaning/downtime constraint prevents it before drawing a final conclusion.

## Potential gap — legacy reservations after enabling per-product mode

Migration 0240 widens new reservation/hold windows, and does not rewrite existing reservations. That preserves existing rows as required, but a reservation created in account-wide mode retains its unbuffered period. The migration's new-reservation path does not appear to expand the existing reservation's period during conflict comparison. With prior return 18:00, 120 cleaning minutes, and the next pickup 19:00 with zero prep, the new window begins after the old stored end and can miss the previous booking's cleaning time. Reproduce with a reservation created before switching modes; do not rewrite or cancel the existing booking as a shortcut.

## Verification scope

The merged verification note cites L74/L75 for per-product and account-wide boundaries. L74 creates reservations while per-product mode is already active and checks overlap before Return; it does not establish either scenario above. Add independent lifecycle tests for a returned booking's residual cleaning window, a legacy reservation across a mode switch, and both serialized and quantity capacity. Verify actual transition/hold/confirm paths and concurrent writes under the final merged T2-21 logic. Keep the GiST guard, existing booking history, and current account-wide behavior intact. No migration has been written or applied in this review.
