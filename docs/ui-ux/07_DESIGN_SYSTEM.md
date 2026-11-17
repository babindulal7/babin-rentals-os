# Design system, responsiveness and accessibility

The current approved OS direction is **functional, compact, readable, precise**, with light default and dark mode. This document does not replace newer rulings, packages/design-tokens, src/styles/theme.css or docs/UI_UX_RULES.md.

## Token and typography checks

- **Display:** Outfit via --font-display; **body:** Source Sans 3 via --font-body; **identifiers/numbers:** JetBrains Mono via --font-id / approved numeric token. Nepali fallback must work with locally hosted fonts.
- Self-host fonts already imported by src/main.tsx; no CDN dependency, no redistributed font files, and no font replacement without rendering/contrast tests.
- Audit computed font families on actual pages: docs and runtime CSS may drift; do not claim a fix without a real computed-style result.
- Use semantic CSS tokens from packages/design-tokens and src/styles/theme.css, not screen-specific hardcoded palette colors. Keep tables solid and legible.
- **Status** is not the action color. Semantics: blue scheduled/committed, yellow in-house progress/cleaning/QC, orange On Rent, green returned/in-stock/paid, red alarm, gray terminal; gold outline denotes external/sub-rented. Always include readable label/icon.
- One restrained emphasis hierarchy: primary action, record identity, critical blocker, then dense data; avoid decorative KPI cards on the floor.

## Components before screens

Existing: PageHeader/PageActions, PageShell, RecordWorkspace, RecordActions, Input, MoneyField, Select, DateField, DataTable, FilterDrawer, Modal, ConfirmDialog, StateViews, Badge, OperationsShell, scanner and SignaturePad. Audits should either reuse them, document a narrowly scoped gap, or propose a nonbreaking enhancement. Do not introduce duplicate modal/action stacks or a parallel form validation system.

## Responsive contract

| Context | Desired density | Interaction |
| --- | --- | --- |
| Phone 360–767 | one task at a time, exact booking/unit identity, readable cards | 44px controls, 56px floor main action, no hover dependence |
| iPad 768–1279 | orientation-aware, scan-first workspace and condensed context | large scan focus, safe spacing for gloves/stylus, split only when container allows |
| Desktop >=1280 | compact tables and side-by-side context | sticky summary rail, keyboard and search, one 64px header |
| 320px robustness | graceful reflow, no cropped actions | not a new canonical breakpoint |

Screen widths to inspect: **375, 820, 1440 px** minimum for every changed screen per docs/USABILITY_TESTS.md; additional 320, 390, 768, 1024, 1280 and physical iPad portrait/landscape/phone checks when relevant. Test at native 100% and 125% zoom, light and dark; do not equate viewport emulation with physical acceptance.

## Interaction state checklist

Each control defines: default, hover-if-pointer, focus-visible, pressed, disabled-with-reason, loading, success, error, readonly, offline and permission-hidden as applicable. Screen states: loading, empty, filtered empty, populated, stale, read error/retry, edit/dirty, submitting, server success, server refusal, restricted and offline. Errors remain inline; toast means the asynchronous operation actually succeeded.

## Specific invariants

- No browser-native confirm/alert for destructive/dirty decisions; use ConfirmDialog.
- No placeholder-only labels; support required/optional state, aria-describedby, error summary focusing invalid field.
- Role gates are DOM omission **and** server-side enforcement, not disabled financial controls or masked text strings for floor roles.
- No arbitrary CSS transitions while scanning/typing; respect reduced motion and accessibility contrast.
- Every status row includes text and icon; no color-only signal.
- Preserve Nepali IME composition in scanner, search, quantity and command shortcuts (open UX PRs may already address this).
- Use actual server timestamps for age/overdue; invalid timestamps are not 'Fresh'.
- Do not introduce fake AI badges, placeholder interactive save buttons, phantom scanner successes or fabricated data.

## Design QA evidence

Source of truth: docs/USABILITY_TESTS.md, npm run check:contrast, source component tests, physical device trials, and local gate commands in docs/plans/README.md. A design token check does not certify operational persistence.
