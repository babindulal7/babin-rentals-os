# Why Booqable feels clean — and what changed in ours

**15 Oct 2026 · measured, not inferred.** Behaviour-only, per the scrape folder's `DESIGN.md`
contract: no Booqable colour, typeface or spacing value was carried over. Rulings for the code
changes are in `RULINGS-2026-10-15.md`.

**Evidence.** Booqable: the trial Orders screenshot
`Desktop/scrape/BOOQABLE-AUDIT/screenshots/orders-list-default.png` and the 56-file behaviour
audit beside it (`systems/table-system.md`, `systems/hover-system.md`,
`evidence/production-design-observations.md`). Ours: the mock build, Owner, measured in the
browser at 1280×860 with the sidebar open (the narrowest desktop: a 1024px header, a 975px table).

## The reasons, ranked by how much of the difference they explain

| # | Booqable | Ours, before (measured) | This pass |
|---|---|---|---|
| 1 | **One row ≈ one line.** An Orders row is ~50px; no cell wraps. | Rentals rows **166–200px**. The client cell wrapped to six lines, Pickup and Return to four or five each. | Rentals rows **85px**. |
| 2 | **The header holds three things:** title, search, one primary button. | Inventory's right-hand cluster was **539px** (Refresh, Export, ⋮, New Equipment ▾, chat, avatar) and could not shrink, so the title was squeezed to **14px** ("I."). Clients read "Cli…". | Titles render in full; Refresh/Export live in More. |
| 3 | **Each fact is said once.** | The pickup location printed twice in the same row. A late return was said **four ways in two hues** (red tag, amber date pill, red "N days late", red progress dots). Status was a pill plus a dot track that restated it. | Location on the hover card only; lateness named once ("N days late") with the amber Return date showing where; the pill alone for status. |
| 4 | **No icons inside data.** Cells are text. | A calendar, clock, house or box icon led every line of every date and item cell. | None in Rentals data cells. |
| 5 | **Headers are sentence case, one line.** | Uppercase with letter-spacing forced "BOOKING / ID" and "TOTAL / AMOUNT" onto two lines. `theme.css` already ruled operations-table headers sentence case; `rentals.css` overrode it. | The override is removed. |
| 6 | **Space is not reserved for nothing.** | The Actions column measured **190px** for one ⋮ button. | 60px, which is the 44px touch target plus padding. |
| 7 | **An amount is one token.** "Rs.100.00" never breaks. | Clients' Outstanding wrapped to "Rs" / "74,940.75". | 0 of 43 money cells wrap. |
| 8 | **One search per page.** | Inventory shows the header search *and* an in-page search with the same placeholder. | Not changed (follow-up). |
| 9 | **Filters are a quiet vertical panel with counts.** | Horizontal chip rows wrap. The Clients toolbar drops "Stats" onto a second line. | Not changed (follow-up). |

The first four reasons account for most of the visual gap. Both products use a grey canvas with
bordered white cards. The difference is how much text each row carries and how many times it
says the same thing.

## Before → after (1280×860, sidebar open, mock Owner)

| Measure | Before | After |
|---|---|---|
| Rentals row height | 166–200px (avg ≈ 186) | 85px, all rows |
| Rentals rows fully visible on first load (860px tall) | 2 | 5 |
| Rentals Actions column | 190px | 60px |
| Rentals header row | two-line uppercase labels | sentence case |
| Inventory page title | 14px wide ("I.") | 80px ("Inventory") |
| Inventory header search | 67px | 192px |
| Inventory header right cluster | 539px | 349px |
| Clients page title | truncated ("Cli…") | full |
| Clients money cells that wrap | visible wraps | 0 / 43 |
| Header overflow, 9 main routes | — | 0px on every route |

The 85px floor comes from the client link's 44px touch-target wrapper (Law 15) plus the project
line. It is not padding and should not be squeezed further.

## What did not move, on purpose

- **Dates stay BS above AD** (RULINGS-2026-10-07 "Stacked operational dates"). The time now sits
  beside the AD date and moves to its own line, whole, only when the column is too narrow.
- **Project Type stays a fixed column.** The table comment cites §13 for that.
- **Created Date stays.** Making it optional touches saved views and export, so it is out of scope.
- **The 104px healthy-sync placeholder in the desktop header.** RULINGS-2026-10-13 keeps that slot
  reserved on desktop.

## Follow-ups this pass found but did not change

1. **Booking Detail header.** A 610px action cluster (status, More, Operations, Print) squeezes the
   record title to ~37px. This was already the behaviour before this pass, on the same code path.
2. **Today return cards** say lateness four ways ("86d late", red edge, pink fill, "Overdue · 86
   days late"), and each card is ~200px. Booqable's dashboard row is one line. **Done the same
   day:** RULINGS-2026-10-15 rows 19–23. At 1280 cards went 204 → 104px (2 → 5 visible); at 390,
   240 → 131px (1 → 3). Lateness is now said once.
3. **Inventory's double search** (header and in-page).
4. **List toolbars that wrap** (Clients' Stats; Inventory's chips).
