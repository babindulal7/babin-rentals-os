# New Rental search controls — 24 October 2026

Scope: adapt the existing coss InputGroup composition to the live client selector and both equipment search presentations. Keep the existing matching, ranking, health, permission, catalogue, selection and booking callbacks.

## Changes

- Client search: leading search icon, labelled open/close action, query-only clear action and the existing embedded history action. Clearing a query keeps the committed client; Escape restores its name.
- Equipment search: the same input/icon/action arrangement in inline and popup mode, a 44px clear action and an explicit accessible search label. Clearing retains catalogue filters and does not add a booking line.
- The input group owns the focus outline. A scoped stylesheet prevents a duplicate outline on its input. The client popup aligns to the complete field, including its action slots.

Affected application files: `ClientCombobox.tsx`, `AddItemPanel.tsx`, `booking-search-field.css` in `src/modules/rentals/booking/`. Regression coverage: `__tests__/bookingSearchControls.test.tsx` in the same directory.

## Browser evidence

The existing mock corpus was used on a separate local preview origin. No new business records were created or confirmed. These are viewport checks, not physical-device or hosted acceptance.

- `layouts.json`: 360×844, 820×1180 and 1440×1000. Each page's scroll width equals its viewport width; the measured search buttons are 44×44px and the focused equipment input has no duplicate shadow.
- `360.png`, `820.png`, `1440.png`: equipment query and grouped results.
- `client-ipad.png`: client query with the selected-client history action. The popup and field share the same left edge and 684px width.
- `client-dark.png`: client search in the dark theme.
- Browser actions also verified keyboard client selection, clearing/restoring a selected client's query, clearing equipment search with focus retained, and opening the existing Client History dialog.

Gate logs and source-fingerprint results are retained in `artifacts/coss-search-validation/`; the final status is recorded in `PROGRESS.md`. Earlier failed checks are retained in the separate `artifacts/coss-search-*` logs and do not represent the final source.

## Operations follow-up

The later shared checkout contained five red Operations regressions and a build-blocking test helper call. `OperationsShell.tsx` now reads the persisted status before progressing, keeps partial returns On Rent, refuses confirmation on absent/invalid/failed reads, offers a read-only retry after a committed session, and ignores nested-dialog stage shortcuts. Focused follow-up: 29/29 checks pass; the final broad run is retained in `artifacts/coss-search-current/`.

`operations-layouts.json` and `operations-360.png` / `operations-820.png` / `operations-1440.png` record an existing mock Return workspace at each width. The active stage is Return, Reset remains disabled, stage controls are at least 64px high and there is no page overflow. The desktop dock closes when crossing the layout breakpoint; the workspace was reopened through its normal Return button for each modal sample. No equipment check-in or floor commit was performed. These images do not certify real role sessions, physical hardware or hosted persistence.

## Final local checks

All eight commands pass without source changes on fingerprint `a758bf1f03509acdd318dcb36d3aacad423de8465808bbc15ded0506b49e97f9`. Full suite: 5380/5380 in 429 files. Focused follow-up: 70/70. Migration rebuild: 170/170; lifecycle: 31/31; security, lint, contrast (82/82) and build pass. [Receipt](current-gates.json). Final logs are in `artifacts/coss-search-final/`; earlier attempts are retained as history. Generated completion exits 1 because its coverage receipt is historical. No hosted application or physical-device acceptance is claimed.
