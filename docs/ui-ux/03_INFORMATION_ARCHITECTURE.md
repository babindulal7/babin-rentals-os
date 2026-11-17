# Information architecture and screen structure

## Existing primary navigation (read from src/data/nav.ts on 9 Nov 2026)

The actual primary-nav list is **eleven** destinations in this order: **New Rental, Today, Operations, Rentals, Calendar, Crew Assist, Inventory, Clients, Finance, Tools, Settings**. New Rental resolves into the Rentals workspace; Finance owns tabs including invoices, payments, expenses, documents, closing and reports. Role filters remove inaccessible destinations. Do not redesign the nav from an older 12-item list.

## Task-first structure

| Destination | Main question | Core focus | Secondary navigation |
| --- | --- | --- | --- |
| Today | What moves today? | Pickups left, returns right, overdue inside returns | Independent date scopes, quick operations |
| New Rental | Can I quote/confirm safely? | Client + schedule, catalogue, selected lines | Crew/delivery, pricing, summary |
| Rentals | Where is this rental in its lifecycle? | Search/list, selected record detail | One next verb, More, history |
| Operations | What must the floor do now? | Pack/Handover/Return/Reset queue | One shared workspace/modal or desktop dock |
| Calendar | Where are commitments/conflicts? | BS+AD calendar, stock/time windows | Navigate back to booking |
| Crew Assist | Who is working and when? | Assignments and availability | Role and overtime gates |
| Inventory | Which product/unit is usable? | Product list → unit detail/condition | Location, maintenance, usage |
| Clients | Who is renting and what history? | Client profile and rentals | Membership |
| Finance | What was invoiced/settled? | Records, payments, reports | Financial role gate |
| Tools | Which utility answers the task? | Searchable tools and calculators | Role filtering |
| Settings | What can this role configure? | Grouped settings | Owner/Admin/Manager checks per capability |

## Common page skeleton

A. **Shared 64px header**: title, current context, status/data age and one primary action. Search and More follow the existing shell rules.  
B. **Primary work area**: task-specific data, scanning or form; minimal decorative cards.  
C. **Secondary context**: sticky right rail on desktop >=1280, below main content on tablet/phone; never a new header toggle.  
D. **Actions**: one filled verb, two or fewer visible secondary actions, rest in More; exceptions within existing modal/flow.  
E. **Feedback**: persistent inline error + recovery, saved states from real server, no optimistic custody/finance completion.

## Responsive IA

- **360–767 phone:** current record identity, one main task, scanning/search, single-column data cards, action reachable without hover; mobile bottom navigation/More.
- **768–1279 tablet:** floor-friendly 44/56px controls; adaptive split only if container allows; both iPad orientations tested.
- **>=1280 desktop:** dense readable tables, right summary rail, preview/operations dock where already approved; keyboard navigation.
- No platform user-agent branches in layout decisions; use CSS/container bounds. Consider 320px as a robustness probe, not a new canonical breakpoint.
- Preserve working filters, search terms, scroll location and unsaved drafts while navigating.

## UX layer relationships

- Booking status is NOT the same as a floor job, asset availability, condition, reservation, payment or local UI progress.
- Only a server/persisted session may change a custody state. A local checkmark is not a committed record.
- **Physical readiness** should be shown separately from **eligibility to reserve for a future window** (see six-stage plan).
- Cancelled is an orthogonal condition and overdue a flag/time condition, not extra booking stages.
- A successful return of one unit does not imply that all booking lines returned or that all units are cleaned.

## Screen template acceptance

Every screen must answer at a glance: which screen, which record/client/unit, current state, next action, where to search, how to leave, what is pending and whether the last write actually saved. Source: ../USABILITY_TESTS.md §1.
