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
