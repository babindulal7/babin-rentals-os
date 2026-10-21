# Rulings — 21 October 2026: local premium design recovery

Implements Babin's explicit local-only design brief. Permissions and save/custody engines are unchanged. No migration is written or applied by this pass.

| Presentation conflict | Authority / decision | Changed where | Revert |
|---|---|---|---|
| Inline Card borders and shadows compete with global surface CSS | One primitive owner in `ui-v2.css`, semantic role values in `theme.css` and the token package. Legacy inline consumers share `surfaceStyle`. Preserve theme selection and explicit glass styles. | Card, Page, theme, ui-v2 | Restore the prior surface recipe and inline declarations together |
| Hosted Add/Edit advertises New Equipment above a separate Create bar | The existing primary/More slots own hosted record actions. Cancel and alternate creation remain in More, the same handlers/guards apply. Isolated previews retain the local bar. Phone Save is a labelled 44px icon button. | RecordWorkspace, RecordForm | Restore local RecordActions rendering; remove hosted portals |
| Phone Search competes with a reachable Save/Payment | Extend the existing Booking Detail precedent: Search lives in More on shared Add/Edit and Finance Dashboard/Invoices on phones. Tablet/desktop retain their normal search. No search or payment handler changes. | RecordForm, RecordActions, Finance | Remove corresponding searchInMore registration and Search menu entry together |
| New mock indicator consumes another 44px and clips phone profile/actions | Phone profile face visibly says Mock; the same mock options remain in its menu. Desktop/tablet retain the dedicated indicator. No reset action is executed by verification. | Header | Restore standalone phone indicator and initials |
| Narrow equipment anchors occupy three rows; serial controls are below target floor | Preserve all seven anchors in a horizontally scrollable strip. Fields and row actions have 44px targets. Active tracking text reads the existing selected foreground token. | equipment-assist.css | Restore prior wrapping and control geometry |
| Compact density sets a 224px sidebar despite requested 256/64 geometry | Keep density for content; use 256px expanded and 64px collapsed navigation as explicitly requested. Collapse persistence is unchanged. | theme; token package header height synchronized to the existing 64px runtime | Restore compact sidebar token to 224px |

No new product decision. Equipment draft persistence, attachment/relationship backend work and hosted/device verification remain separate.
