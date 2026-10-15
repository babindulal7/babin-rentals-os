# App-wide UI/UX improvement plan

Started 13 October 2026. Active goal: improve button placement and user experience throughout the app, check every workflow status, and improve phone and iPad layouts. This plan supplements the user's one-header acceptance plan in `ONE_HEADER_ACCEPTANCE.md`; a completed local patch does not complete the app-wide goal.

## Design guidance

Requested skills located and read:
- `C:/Users/use/Desktop/Rental workspasce/.agents/skills/high-end-visual-design/SKILL.md` (relocated copy).
- `C:/Users/use/.gemini/config/skills/agency-ui-designer/SKILL.md`.
- `C:/Users/use/.gemini/config/skills/agency-ux-architect/SKILL.md`.
- `C:/Users/use/.gemini/config/skills/agency-evidence-collector/SKILL.md`.
- The requested visualize skill: use a conversational visual only when it helps explain or compare; actual app changes and screenshots remain the deliverable here.

Keep the existing semantic tokens, Outfit/Source Sans/JetBrains fonts, Tabler icons, 768/1280 breakpoints, and the user's single 64px header. Apply consistent spacing, clear visual hierarchy, restrained depth, accessible focus, and progressive disclosure. Marketing-style oversized sections, decorative blur, floating navigation and delayed content reveals conflict with the agreed operational app and are not adopted.

## Step plan and evidence

| Step | Scope | State / evidence required |
|---|---|---|
| 1 | Shared shell, search, primary actions, More | First patch locally verified 12 Oct; Today phone search, Clear/Escape focus, Refresh and More verified 13 Oct. The 768px Today title truncation was resolved and visually verified 14 Oct. |
| 2 | Rentals list selection, pagination, New Rental and Booking Detail | Existing work needs the full acceptance matrix; consolidate selected-row actions without losing callbacks. |
| 3 | Pack, Handover, Return, Inspection, Cleaning/Reset | Phone stage navigation/footer and local booking lookup fixed; On Rent return popup and completed/locked navigation verified 14 Oct. Every persisted status, exceptions and safe test-database writes/reload still need acceptance. |
| 4 | Today and Calendar | Today responsive pass verified in local mock at 320/390/768/1024/1280/1440px; Today quick filter preserves the layout. Calendar and remaining status/data reconciliation still need acceptance. |
| 5 | Inventory, Bundles, Clients, Membership | Match form/navigation patterns; create/edit/retire and duplicate/hold/history states with permission checks. |
| 6 | Finance, Payments, Expenses, Documents | Validate immutable money flows, error feedback, double-submit prevention, print/export and money-blind roles. |
| 7 | Crew, Delivery, Reports, Settings, Tools | Verify assignment/status transitions, saved settings, report reconciliation, useful empty/error states and every enabled action. |
| 8 | Cross-app acceptance | Desktop, phone, iPad; light/dark; keyboard; 100%/125% native zoom; relevant role matrix; staging JWT/PostgREST and reload evidence. |

For each page record: loading, populated, empty, filtered-empty, error/retry, restricted, offline/stale, saving, persisted success and failed save. Status-specific checks include Draft, Quote, Booked, Packed, Handed Over/On Rent, overdue, partial return, Returned, Inspected, Reset, Closed and Cancelled, plus damage/missing and financial states where applicable. Verify actual domain labels and engines before changing status presentation.

## Acceptance contract

- One header and one primary action for the current task; 44px targets (56px floor primary actions), no clipped controls or unintended horizontal page scrolling.
- Every enabled button has a real effect. Search clear/dismissal and menus preserve usable focus; filters remain consistent after navigation.
- At minimum inspect 1440, 1280, 1024, 768, 390 and 320px. Width emulation is not an actual iPad Safari or native browser zoom test; record those separately.
- Screenshots prove appearance; interaction assertions and persisted database state prove behavior. Do not substitute historical green tests for current evidence.
- Run repository checks in the required order after changes. Local PGlite does not establish live JWT/PostgREST security.
- Do not apply live migrations, wipe live data, widen role permissions, or alter money/day/custody rules during visual work.

## Continuation

13 October: Today now keeps its date control with the movement queues, puts Operations and Refresh in More, and provides contextual phone search. Narrow cards separate pickup/return dates, wrap client names, and retain 56px primary actions. Data freshness stays visible on phones.

Saved screenshots and interaction measurements: `artifacts/today-responsive-2026-10-13/`. Search narrowed 24 mock returns to two Gandaki matches; Clear restored 24 and retained input focus; Escape returned focus to Search Today. Refresh closed its menu and refreshed the visible data timestamp. Tomorrow followed by the date picker's Today shortcut restored Today and closed the calendar while preserving the 64px header.

The six checked widths had no document horizontal overflow. Light screenshots cover 320/768/1024/1440px; dark screenshots cover 390/1280px. This is Chromium viewport emulation, not physical iPad Safari or native 125% zoom. At 768px the shared header truncates Today to Tod…; retain this as an open header issue. The mock corpus exercised empty pickups and overdue returns, not every booking status or role.

Typecheck, source lint, 21 focused tests, a 4,296-test full run, 160 local migrations, 30 lifecycle checks, 54 contrast pairs, shell lint and production build passed for this patch before later concurrent source edits. A separate mock build supplied the saved screenshots. These results do not certify unrelated changes made afterward. Untested modules remain open; no full-app completion claim is made.

## Workflow follow-up — 14 October 2026

- The healthy sync placeholder no longer consumes tablet header width. At 768px, Today renders in full in the 64px header. Offline/queued/syncing/error visibility is covered by the header regression test.
- Operations uses two stage columns on phones and four on tablet/desktop. Phone confirmation is 56px tall above the full-width Back button. Browser checks at 320, 390, 768 and 1440px found no document horizontal overflow or stage label overlap.
- Mock booking numbers now follow the existing bare-number rule while accepting legacy links. Seeded and replayed local records retain stable IDs. Regression coverage resolves all six seeded booking stages and checks allocation across reload.
- The updated mock browser opened booking 864 with two lines/four units. Completed Packing was read-only; Return reopened; Cleaning was disabled; confirmation stayed disabled with incomplete return gates. No return session was submitted. This does not certify persisted transitions or live permissions.
- The pre-refresh New Rental catalogue stayed within the phone viewport, but its View/Add Bundle buttons measured 26px tall. Recheck the current shared-button build and bring these controls to 44px in the next pass. Screenshot/measurement: `artifacts/workflow-responsive-2026-10-13/`.
- Patch verification: typecheck; scoped lint; 4,405 tests in 347 files (including 12 Operations, 6 header ownership and 2 booking lookup tests); local PGlite 160/160 and lifecycle 30/30; production and mock builds. Theme contrast at follow-up: 82/82. Concurrent changes made after these runs are outside this evidence.
- Browser cache was temporarily bypassed for the test tab because it retained the old offline build; cache settings and viewport overrides were restored afterward. Evidence covers dark Chromium viewport emulation, not physical iPad Safari or native zoom.

## Catalogue follow-up — 15 October 2026

- New Rental catalogue View/Add Bundle, crew assignment and transport selection buttons now have visible 44px minimum dimensions, larger labels/icons and wrapping action rows with 8px gaps. The previous 26px painted controls depended on an invisible touch inset. Existing selection callbacks and permission gates are unchanged.
- The earlier apparent bundle removal failure was an off-screen browser click: keyboard activation removed the selected line, and the visible bundle menu's Remove all action cleared the remaining lines and returned the summary to zero items. This is local mock interaction evidence, not persisted booking acceptance.
- Current-run verification and screenshots are recorded in the newest `PROGRESS.md` entry. Physical iPad Safari, native zoom, all booking statuses, roles and persisted writes remain in the app-wide acceptance queue.


## Selected-item follow-up — 16 October 2026

- Selected equipment uses labelled cards when its pane is at most 900px wide, keeping the same cells, permission gates and callbacks. Wider panes retain the table. Quantity/day steppers, bundle toggles and item action triggers have visible 44px controls.
- Bundle feedback now reports the number of components actually added, states that their rental charge is included, and no longer instructs staff to apply a second bundle discount.
- Browser checks on current main covered actual CSS viewport widths 320, 390, 768, 1024, 1280 and 1440px without document overflow. Quantity 1 → 2 and days 2 → 3 gave Rs 2,700 for a Rs 450/day item. The tablet action menu was visible; Remove returned to the empty state. No booking was confirmed. Native browser zoom was retained; viewport overrides were reset.
- Evidence: `artifacts/selected-items-2026-10-15/phone-390.png`, `tablet-768-menu.png`, and `responsive-measurements.json`. Automated checks and their timing are recorded in PROGRESS.md. These checks are Chromium viewport emulation, not physical iPad Safari acceptance.
- Follow-up: the 768px screenshot exposes crowding in the shared header between Search and More. Keep this separate from the now-readable selected-item cards. The app-wide status/role/persistence matrix remains open.
