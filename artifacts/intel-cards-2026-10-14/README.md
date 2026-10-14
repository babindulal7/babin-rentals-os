# Equipment and Client Intel acceptance — 14 October 2026

## Environment

Existing Chrome app tab at `http://localhost:3000`. The visible banner identified **mock mode**, using the supplied sample catalogue/client/booking corpus. No record, note, block flag, payment or transition was saved. These checks do not certify live authenticated permissions.

## Findings fixed

- Equipment tabs scrolled completely out of view with its seven-entry Current list. Shared Preview tabs are now sticky for every entity. The existing rental sticky summary remains intact.
- Clicking an Equipment Intel tab opened its originating row's separate quick-view drawer. React portal clicks were bubbling through the original row. Intel now contains clicks from its overlay and touch sheet. The focused-control regression additionally verifies that closing the card does not invoke the parent row action.

## Browser acceptance

Measured CSS widths: desktop **1440px**, tablet **769px**, phone **360px**. Requested viewport dimensions account for the existing Chrome zoom; the zoom setting was preserved. Temporary viewport and touch emulation were successfully cleared at the end.

- Equipment: all seven Current entries returned; desktop and tablet cards stayed within the viewport without horizontal overflow. On the phone sheet, the final entries and sticky tabs remained readable after scrolling. Notes editor appeared in Notes and was absent from Current.
- Equipment tab click regression: after closing the unintended drawer and applying the fix, Notes → Current left exactly one dialog open, with no notes editor in Current.
- Client: Info/Current/History/Payments/Notes were available. Both current rental entries were present at desktop and phone sizes. All three measured layouts had no horizontal card overflow.
- Client Notes: one editor in Notes, zero editors in Current, one active dialog. Nothing was submitted.
- Client-to-rental navigation: `#825` replaced the phone card, exposing Back. The underlying URL remained `/clients`, and Back restored the originating client with one dialog.
- Identifier-only hover: hovering the contact cell for 400ms yielded no dialog. Hovering the name produced the card after the delay. Moving into the card and waiting another 400ms kept exactly one dialog open.
- Wall-clock hover samples (tool transport included): zero dialogs at 39, 176 and 301ms; one at 424ms. These bound the observed delayed appearance; they do not measure an exact browser-side 300ms. Automated fake-clock tests verify 299ms closed / 300ms open. Shared initial and adjacent timers both remain 300ms; touch remains 500ms.

`checks.json` retains the measured rectangles/counts. Six screenshots cover the Equipment and Client desktop/tablet/phone layouts.

## Verification and remaining acceptance

- Full suite: 348 files / 4,446 tests passed, including the focused-control/row click and Smart Intel suites.
- PGlite: 160/160 migrations rebuilt, exposure and definer gates passed. Lifecycle: 30/30 passed. Detailed gate logs are `.intel-cards-next-*.log`; final lint/build/contrast status is recorded in PROGRESS.md.
- The mock directory shows zero blocked clients. No live Warehouse/Accounts session was available during these checks. A request for an already signed-in live test session was sent to the user; no passwords were requested.
- Blocked-client conditions and money omission retain their automated DOM/payload and local RLS coverage. Live JWT/PostgREST role acceptance, blocked live-record acceptance and production verification remain pending.
