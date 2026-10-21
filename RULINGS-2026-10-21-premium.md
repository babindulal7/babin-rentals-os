# Rulings — 21 October 2026: local premium design recovery

Implements Babin's explicit local-only design brief. Permissions and save/custody engines are unchanged. No migration is written or applied by this pass.

| Presentation conflict | Authority / decision | Changed where | Revert |
|---|---|---|---|
| Inline Card borders and shadows compete with global surface CSS | One primitive owner in `ui-v2.css`, semantic role values in `theme.css` and the token package. Legacy inline consumers share `surfaceStyle`. Preserve theme selection and explicit glass styles. | Card, Page, theme, ui-v2 | Restore the prior surface recipe and inline declarations together |
| Hosted Add/Edit advertises New Equipment above a separate Create bar | The existing primary/More slots own hosted record actions. Cancel and alternate creation remain in More, the same handlers/guards apply. Isolated previews retain the local bar. Phone Save is a labelled 44px icon button. | RecordWorkspace, RecordForm | Restore local RecordActions rendering; remove hosted portals |
| Phone Search competes with a reachable Save/Payment/Availability action | Extend the existing Booking Detail precedent: Search lives in More on shared Add/Edit, Finance Dashboard/Invoices and Calendar on phones. Calendar retains the visible Availability word without its redundant icon. Tablet/desktop retain their normal search. No search, payment or availability handler changes. | RecordForm, RecordActions, Finance, Calendar | Remove corresponding searchInMore registration and Search menu entry together; restore Calendar phone icon |
| New mock indicator consumes another 44px and clips phone profile/actions | Phone profile face visibly says Mock; the same mock options remain in its menu. Desktop/tablet retain the dedicated indicator. No reset action is executed by verification. | Header | Restore standalone phone indicator and initials |
| Narrow equipment anchors occupy three rows; serial controls are below target floor | Preserve all seven anchors in a horizontally scrollable strip. Fields and row actions have 44px targets. Active tracking text reads the existing selected foreground token. | equipment-assist.css | Restore prior wrapping and control geometry |
| Compact density sets a 224px sidebar despite requested 256/64 geometry | Keep density for content; use 256px expanded and 64px collapsed navigation as explicitly requested. Collapse persistence is unchanged. | theme; token package header height synchronized to the existing 64px runtime | Restore compact sidebar token to 224px |
| The phone Add slot retains the tablet's 106px minimum | Reset its minimum to 44px in the existing phone band; do not shrink its control. This removes 62px of unused reservation on Rentals, Inventory and Clients. | shell.css | Remove the phone min-width reset |

No new product decision. Equipment draft persistence, attachment/relationship backend work and hosted/device verification remain separate.
