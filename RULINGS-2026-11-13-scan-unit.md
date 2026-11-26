# Rulings — 13 Nov 2026 — scanned unit in New Rental (T3-19)

| # | Ruling | Why | Revert |
|---|---|---|---|
| S1 | Scanning a unit's code in New Rental reserves **that exact unit** (sent as the line's `units` to `create_booking`; no migration). If that unit is not free for the dates the booking is **refused with the reason**; it is never swapped for another serial. | The operator scanned that serial; a quiet swap puts different gear on the booking than the one in their hand. | In `planCreationUnits` (`src/lib/queries/availability.ts`) report `refusals` as `problems` so Create falls back to least-used. |
| S2 | The similar-item / sub-rent offer on a booked scanned unit is built after T3-13 merges, not on its unmerged branch. | Avoids a large conflict in `AddItemPanel.tsx` and pulling in T3-17 and its migration. | n/a |
