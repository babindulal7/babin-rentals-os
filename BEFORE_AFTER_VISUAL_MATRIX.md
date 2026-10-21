# Before / after visual matrix

Local mock only · 21 October 2026 NPT. The tables measure page overflow, header height and header control bounds/targets; PASS is scoped to those measurements, not an entire workflow certification.

Before screenshots: `docs/verification/premium-design/before/`. After screenshots: `after/`. Raw computed values are in each folder’s `measurements.json`. [Side-by-side gallery](docs/verification/premium-design/gallery.html).

## Verified issue register

| Issue | Owner | Before | After / evidence |
|---|---|---|---|
| Conflicting Card border/elevation | Card.tsx, theme.css, ui-v2.css | Inline 1.5px border competed with global CSS | CSS-owned 1px semantic outline, 10px radius; actual default/bordered/interactive/status/disabled Card variants checked in `checks/interactions.json` |
| Equipment save hierarchy | RecordWorkspace, RecordForm | Header New Equipment plus bottom Create strip | One hosted Create/Save in header; alternate creation and Cancel in More; 375/820/1440 real clicks pass |
| Small unit controls | equipment-assist.css, Inventory.tsx | 38px serial fields, 36px row icons, 28px inventory expand, 32px quick view | 44px minimums; computed unit sizes retained in interaction evidence |
| Tablet form columns | equipment-assist.css | Description/gallery could occupy narrow grid tracks | Full-width groups at every width; Add/Edit use the same grid |
| Tracking text contrast | equipment-assist.css | Dark text on dark selected fill | Existing selected foreground token; measured light/dark/high-contrast ratios in interaction evidence |
| Phone Add reservation | shell.css | 106px tablet minimum survived into a 44px phone slot | Phone minimum reset to 44px, retaining targets and action order |
| Finance / Calendar phone clipping | Finance.tsx, Calendar.tsx | Payment/Availability competed with Search and information | Search remains in More; primary and information remain reachable; final bounds below |
| Mock indicator crowding | Header.tsx | Separate 44px phone button pushed profile off screen | Visible Mock profile face, same options in menu; desktop/tablet keep dedicated indicator |
| Heavy local table shadow | rentals.css | Independent 20px table shadow | Shared DataTableShell elevation |
| Today queue furniture | dashboard.css | Already-flat rows; larger local queue header | Shared outline/elevation and smaller header padding; custody/status/urgent facts retained |

## Scope and limitations

- 125% rows emulate effective CSS viewport and DPR; actual browser-chrome zoom and physical iPad/scanner behavior remain unverified.
- The invalid initial `hc` before theme is excluded from high-contrast comparisons. Final high-contrast captures use the real `high-contrast` theme.
- Internal wide-table/anchor scrolling is intentional; page-level overflow must remain zero.
- Money checks use the real built-in Warehouse sign-in; its direct editor route is restricted. Technician/Driver are covered by automated permissions/RLS tests, not invented mock identities.
- UI interaction details and screenshots: `checks/interactions.json` and `checks/additional-browser-checks.json`.

## Per-screen viewport matrix

### today

| Width / scale | Theme | Page overflow before → after | Header | Off-screen / small controls | Evidence | Result |
|---|---|---|---|---|---|---|
| 375 / 100% | light | 0 → 0px | 64px | 0 / 0 | [before](docs/verification/premium-design/before/today-375-light-100.png) · [after](docs/verification/premium-design/after/today-375-light-100.png) | PASS |
| 768 / 100% | light | 0 → 0px | 64px | 0 / 0 | [before](docs/verification/premium-design/before/today-768-light-100.png) · [after](docs/verification/premium-design/after/today-768-light-100.png) | PASS |
| 820 / 100% | light | 0 → 0px | 64px | 0 / 0 | [before](docs/verification/premium-design/before/today-820-light-100.png) · [after](docs/verification/premium-design/after/today-820-light-100.png) | PASS |
| 1024 / 100% | light | 0 → 0px | 64px | 0 / 0 | [before](docs/verification/premium-design/before/today-1024-light-100.png) · [after](docs/verification/premium-design/after/today-1024-light-100.png) | PASS |
| 1280 / 100% | light | 0 → 0px | 64px | 0 / 0 | [before](docs/verification/premium-design/before/today-1280-light-100.png) · [after](docs/verification/premium-design/after/today-1280-light-100.png) | PASS |
| 1440 / 100% | light | 0 → 0px | 64px | 0 / 0 | [before](docs/verification/premium-design/before/today-1440-light-100.png) · [after](docs/verification/premium-design/after/today-1440-light-100.png) | PASS |
| 1920 / 100% | light | 0 → 0px | 64px | 0 / 0 | [before](docs/verification/premium-design/before/today-1920-light-100.png) · [after](docs/verification/premium-design/after/today-1920-light-100.png) | PASS |
| 820 / 100% | dark | 0 → 0px | 64px | 0 / 0 | [before](docs/verification/premium-design/before/today-820-dark-100.png) · [after](docs/verification/premium-design/after/today-820-dark-100.png) | PASS |
| 1440 / 100% | dark | 0 → 0px | 64px | 0 / 0 | [before](docs/verification/premium-design/before/today-1440-dark-100.png) · [after](docs/verification/premium-design/after/today-1440-dark-100.png) | PASS |
| 820 / 125% | light | 0 → 0px | 64px | 0 / 0 | [before](docs/verification/premium-design/before/today-820-light-125.png) · [after](docs/verification/premium-design/after/today-820-light-125.png) | PASS |
| 1440 / 125% | dark | 0 → 0px | 64px | 0 / 0 | [before](docs/verification/premium-design/before/today-1440-dark-125.png) · [after](docs/verification/premium-design/after/today-1440-dark-125.png) | PASS |
| 1440 / 100% | high-contrast | no valid baseline → 0px | 64px | 0 / 0 | [after](docs/verification/premium-design/after/today-1440-high-contrast-100.png) | PASS |
| 375 / 100% reduced motion | light | 0 → 0px | 64px | 0 / 0 | [before](docs/verification/premium-design/before/today-375-light-100-reduced.png) · [after](docs/verification/premium-design/after/today-375-light-100-reduced.png) | PASS |

### rentals

| Width / scale | Theme | Page overflow before → after | Header | Off-screen / small controls | Evidence | Result |
|---|---|---|---|---|---|---|
| 375 / 100% | light | 0 → 0px | 64px | 0 / 0 | [before](docs/verification/premium-design/before/rentals-375-light-100.png) · [after](docs/verification/premium-design/after/rentals-375-light-100.png) | PASS |
| 768 / 100% | light | 0 → 0px | 64px | 0 / 0 | [before](docs/verification/premium-design/before/rentals-768-light-100.png) · [after](docs/verification/premium-design/after/rentals-768-light-100.png) | PASS |
| 820 / 100% | light | 0 → 0px | 64px | 0 / 0 | [before](docs/verification/premium-design/before/rentals-820-light-100.png) · [after](docs/verification/premium-design/after/rentals-820-light-100.png) | PASS |
| 1024 / 100% | light | 0 → 0px | 64px | 0 / 0 | [before](docs/verification/premium-design/before/rentals-1024-light-100.png) · [after](docs/verification/premium-design/after/rentals-1024-light-100.png) | PASS |
| 1280 / 100% | light | 0 → 0px | 64px | 0 / 0 | [before](docs/verification/premium-design/before/rentals-1280-light-100.png) · [after](docs/verification/premium-design/after/rentals-1280-light-100.png) | PASS |
| 1440 / 100% | light | 0 → 0px | 64px | 0 / 0 | [before](docs/verification/premium-design/before/rentals-1440-light-100.png) · [after](docs/verification/premium-design/after/rentals-1440-light-100.png) | PASS |
| 1920 / 100% | light | 0 → 0px | 64px | 0 / 0 | [before](docs/verification/premium-design/before/rentals-1920-light-100.png) · [after](docs/verification/premium-design/after/rentals-1920-light-100.png) | PASS |
| 820 / 100% | dark | 0 → 0px | 64px | 0 / 0 | [before](docs/verification/premium-design/before/rentals-820-dark-100.png) · [after](docs/verification/premium-design/after/rentals-820-dark-100.png) | PASS |
| 1440 / 100% | dark | 0 → 0px | 64px | 0 / 0 | [before](docs/verification/premium-design/before/rentals-1440-dark-100.png) · [after](docs/verification/premium-design/after/rentals-1440-dark-100.png) | PASS |
| 820 / 125% | light | 0 → 0px | 64px | 0 / 0 | [before](docs/verification/premium-design/before/rentals-820-light-125.png) · [after](docs/verification/premium-design/after/rentals-820-light-125.png) | PASS |
| 1440 / 125% | dark | 0 → 0px | 64px | 0 / 0 | [before](docs/verification/premium-design/before/rentals-1440-dark-125.png) · [after](docs/verification/premium-design/after/rentals-1440-dark-125.png) | PASS |
| 1440 / 100% | high-contrast | no valid baseline → 0px | 64px | 0 / 0 | [after](docs/verification/premium-design/after/rentals-1440-high-contrast-100.png) | PASS |
| 375 / 100% reduced motion | light | 0 → 0px | 64px | 0 / 0 | [before](docs/verification/premium-design/before/rentals-375-light-100-reduced.png) · [after](docs/verification/premium-design/after/rentals-375-light-100-reduced.png) | PASS |

### new-rental

| Width / scale | Theme | Page overflow before → after | Header | Off-screen / small controls | Evidence | Result |
|---|---|---|---|---|---|---|
| 375 / 100% | light | 0 → 0px | 64px | 0 / 0 | [before](docs/verification/premium-design/before/new-rental-375-light-100.png) · [after](docs/verification/premium-design/after/new-rental-375-light-100.png) | PASS |
| 768 / 100% | light | 0 → 0px | 64px | 0 / 0 | [before](docs/verification/premium-design/before/new-rental-768-light-100.png) · [after](docs/verification/premium-design/after/new-rental-768-light-100.png) | PASS |
| 820 / 100% | light | 0 → 0px | 64px | 0 / 0 | [before](docs/verification/premium-design/before/new-rental-820-light-100.png) · [after](docs/verification/premium-design/after/new-rental-820-light-100.png) | PASS |
| 1024 / 100% | light | 0 → 0px | 64px | 0 / 0 | [before](docs/verification/premium-design/before/new-rental-1024-light-100.png) · [after](docs/verification/premium-design/after/new-rental-1024-light-100.png) | PASS |
| 1280 / 100% | light | 0 → 0px | 64px | 0 / 0 | [before](docs/verification/premium-design/before/new-rental-1280-light-100.png) · [after](docs/verification/premium-design/after/new-rental-1280-light-100.png) | PASS |
| 1440 / 100% | light | 0 → 0px | 64px | 0 / 0 | [before](docs/verification/premium-design/before/new-rental-1440-light-100.png) · [after](docs/verification/premium-design/after/new-rental-1440-light-100.png) | PASS |
| 1920 / 100% | light | 0 → 0px | 64px | 0 / 0 | [before](docs/verification/premium-design/before/new-rental-1920-light-100.png) · [after](docs/verification/premium-design/after/new-rental-1920-light-100.png) | PASS |
| 820 / 100% | dark | 0 → 0px | 64px | 0 / 0 | [before](docs/verification/premium-design/before/new-rental-820-dark-100.png) · [after](docs/verification/premium-design/after/new-rental-820-dark-100.png) | PASS |
| 1440 / 100% | dark | 0 → 0px | 64px | 0 / 0 | [before](docs/verification/premium-design/before/new-rental-1440-dark-100.png) · [after](docs/verification/premium-design/after/new-rental-1440-dark-100.png) | PASS |
| 820 / 125% | light | 0 → 0px | 64px | 0 / 0 | [before](docs/verification/premium-design/before/new-rental-820-light-125.png) · [after](docs/verification/premium-design/after/new-rental-820-light-125.png) | PASS |
| 1440 / 125% | dark | 0 → 0px | 64px | 0 / 0 | [before](docs/verification/premium-design/before/new-rental-1440-dark-125.png) · [after](docs/verification/premium-design/after/new-rental-1440-dark-125.png) | PASS |
| 1440 / 100% | high-contrast | no valid baseline → 0px | 64px | 0 / 0 | [after](docs/verification/premium-design/after/new-rental-1440-high-contrast-100.png) | PASS |
| 375 / 100% reduced motion | light | 0 → 0px | 64px | 0 / 0 | [before](docs/verification/premium-design/before/new-rental-375-light-100-reduced.png) · [after](docs/verification/premium-design/after/new-rental-375-light-100-reduced.png) | PASS |

### booking

| Width / scale | Theme | Page overflow before → after | Header | Off-screen / small controls | Evidence | Result |
|---|---|---|---|---|---|---|
| 375 / 100% | light | 0 → 0px | 64px | 0 / 0 | [before](docs/verification/premium-design/before/booking-375-light-100.png) · [after](docs/verification/premium-design/after/booking-375-light-100.png) | PASS |
| 768 / 100% | light | 0 → 0px | 64px | 0 / 0 | [before](docs/verification/premium-design/before/booking-768-light-100.png) · [after](docs/verification/premium-design/after/booking-768-light-100.png) | PASS |
| 820 / 100% | light | 0 → 0px | 64px | 0 / 0 | [before](docs/verification/premium-design/before/booking-820-light-100.png) · [after](docs/verification/premium-design/after/booking-820-light-100.png) | PASS |
| 1024 / 100% | light | 0 → 0px | 64px | 0 / 0 | [before](docs/verification/premium-design/before/booking-1024-light-100.png) · [after](docs/verification/premium-design/after/booking-1024-light-100.png) | PASS |
| 1280 / 100% | light | 0 → 0px | 64px | 0 / 0 | [before](docs/verification/premium-design/before/booking-1280-light-100.png) · [after](docs/verification/premium-design/after/booking-1280-light-100.png) | PASS |
| 1440 / 100% | light | 0 → 0px | 64px | 0 / 0 | [before](docs/verification/premium-design/before/booking-1440-light-100.png) · [after](docs/verification/premium-design/after/booking-1440-light-100.png) | PASS |
| 1920 / 100% | light | 0 → 0px | 64px | 0 / 0 | [before](docs/verification/premium-design/before/booking-1920-light-100.png) · [after](docs/verification/premium-design/after/booking-1920-light-100.png) | PASS |
| 820 / 100% | dark | 0 → 0px | 64px | 0 / 0 | [before](docs/verification/premium-design/before/booking-820-dark-100.png) · [after](docs/verification/premium-design/after/booking-820-dark-100.png) | PASS |
| 1440 / 100% | dark | 0 → 0px | 64px | 0 / 0 | [before](docs/verification/premium-design/before/booking-1440-dark-100.png) · [after](docs/verification/premium-design/after/booking-1440-dark-100.png) | PASS |
| 820 / 125% | light | 0 → 0px | 64px | 0 / 0 | [before](docs/verification/premium-design/before/booking-820-light-125.png) · [after](docs/verification/premium-design/after/booking-820-light-125.png) | PASS |
| 1440 / 125% | dark | 0 → 0px | 64px | 0 / 0 | [before](docs/verification/premium-design/before/booking-1440-dark-125.png) · [after](docs/verification/premium-design/after/booking-1440-dark-125.png) | PASS |
| 1440 / 100% | high-contrast | no valid baseline → 0px | 64px | 0 / 0 | [after](docs/verification/premium-design/after/booking-1440-high-contrast-100.png) | PASS |
| 375 / 100% reduced motion | light | 0 → 0px | 64px | 0 / 0 | [before](docs/verification/premium-design/before/booking-375-light-100-reduced.png) · [after](docs/verification/premium-design/after/booking-375-light-100-reduced.png) | PASS |

### inventory

| Width / scale | Theme | Page overflow before → after | Header | Off-screen / small controls | Evidence | Result |
|---|---|---|---|---|---|---|
| 375 / 100% | light | 0 → 0px | 64px | 0 / 0 | [before](docs/verification/premium-design/before/inventory-375-light-100.png) · [after](docs/verification/premium-design/after/inventory-375-light-100.png) | PASS |
| 768 / 100% | light | 0 → 0px | 64px | 0 / 0 | [before](docs/verification/premium-design/before/inventory-768-light-100.png) · [after](docs/verification/premium-design/after/inventory-768-light-100.png) | PASS |
| 820 / 100% | light | 0 → 0px | 64px | 0 / 0 | [before](docs/verification/premium-design/before/inventory-820-light-100.png) · [after](docs/verification/premium-design/after/inventory-820-light-100.png) | PASS |
| 1024 / 100% | light | 0 → 0px | 64px | 0 / 0 | [before](docs/verification/premium-design/before/inventory-1024-light-100.png) · [after](docs/verification/premium-design/after/inventory-1024-light-100.png) | PASS |
| 1280 / 100% | light | 0 → 0px | 64px | 0 / 0 | [before](docs/verification/premium-design/before/inventory-1280-light-100.png) · [after](docs/verification/premium-design/after/inventory-1280-light-100.png) | PASS |
| 1440 / 100% | light | 0 → 0px | 64px | 0 / 0 | [before](docs/verification/premium-design/before/inventory-1440-light-100.png) · [after](docs/verification/premium-design/after/inventory-1440-light-100.png) | PASS |
| 1920 / 100% | light | 0 → 0px | 64px | 0 / 0 | [before](docs/verification/premium-design/before/inventory-1920-light-100.png) · [after](docs/verification/premium-design/after/inventory-1920-light-100.png) | PASS |
| 820 / 100% | dark | 0 → 0px | 64px | 0 / 0 | [before](docs/verification/premium-design/before/inventory-820-dark-100.png) · [after](docs/verification/premium-design/after/inventory-820-dark-100.png) | PASS |
| 1440 / 100% | dark | 0 → 0px | 64px | 0 / 0 | [before](docs/verification/premium-design/before/inventory-1440-dark-100.png) · [after](docs/verification/premium-design/after/inventory-1440-dark-100.png) | PASS |
| 820 / 125% | light | 0 → 0px | 64px | 0 / 0 | [before](docs/verification/premium-design/before/inventory-820-light-125.png) · [after](docs/verification/premium-design/after/inventory-820-light-125.png) | PASS |
| 1440 / 125% | dark | 0 → 0px | 64px | 0 / 0 | [before](docs/verification/premium-design/before/inventory-1440-dark-125.png) · [after](docs/verification/premium-design/after/inventory-1440-dark-125.png) | PASS |
| 1440 / 100% | high-contrast | no valid baseline → 0px | 64px | 0 / 0 | [after](docs/verification/premium-design/after/inventory-1440-high-contrast-100.png) | PASS |
| 375 / 100% reduced motion | light | 0 → 0px | 64px | 0 / 0 | [before](docs/verification/premium-design/before/inventory-375-light-100-reduced.png) · [after](docs/verification/premium-design/after/inventory-375-light-100-reduced.png) | PASS |

### add-equipment

| Width / scale | Theme | Page overflow before → after | Header | Off-screen / small controls | Evidence | Result |
|---|---|---|---|---|---|---|
| 375 / 100% | light | 0 → 0px | 64px | 0 / 0 | [before](docs/verification/premium-design/before/add-equipment-375-light-100.png) · [after](docs/verification/premium-design/after/add-equipment-375-light-100.png) | PASS |
| 768 / 100% | light | 0 → 0px | 64px | 0 / 0 | [before](docs/verification/premium-design/before/add-equipment-768-light-100.png) · [after](docs/verification/premium-design/after/add-equipment-768-light-100.png) | PASS |
| 820 / 100% | light | 0 → 0px | 64px | 0 / 0 | [before](docs/verification/premium-design/before/add-equipment-820-light-100.png) · [after](docs/verification/premium-design/after/add-equipment-820-light-100.png) | PASS |
| 1024 / 100% | light | 0 → 0px | 64px | 0 / 0 | [before](docs/verification/premium-design/before/add-equipment-1024-light-100.png) · [after](docs/verification/premium-design/after/add-equipment-1024-light-100.png) | PASS |
| 1280 / 100% | light | 0 → 0px | 64px | 0 / 0 | [before](docs/verification/premium-design/before/add-equipment-1280-light-100.png) · [after](docs/verification/premium-design/after/add-equipment-1280-light-100.png) | PASS |
| 1440 / 100% | light | 0 → 0px | 64px | 0 / 0 | [before](docs/verification/premium-design/before/add-equipment-1440-light-100.png) · [after](docs/verification/premium-design/after/add-equipment-1440-light-100.png) | PASS |
| 1920 / 100% | light | 0 → 0px | 64px | 0 / 0 | [before](docs/verification/premium-design/before/add-equipment-1920-light-100.png) · [after](docs/verification/premium-design/after/add-equipment-1920-light-100.png) | PASS |
| 820 / 100% | dark | 0 → 0px | 64px | 0 / 0 | [before](docs/verification/premium-design/before/add-equipment-820-dark-100.png) · [after](docs/verification/premium-design/after/add-equipment-820-dark-100.png) | PASS |
| 1440 / 100% | dark | 0 → 0px | 64px | 0 / 0 | [before](docs/verification/premium-design/before/add-equipment-1440-dark-100.png) · [after](docs/verification/premium-design/after/add-equipment-1440-dark-100.png) | PASS |
| 820 / 125% | light | 0 → 0px | 64px | 0 / 0 | [before](docs/verification/premium-design/before/add-equipment-820-light-125.png) · [after](docs/verification/premium-design/after/add-equipment-820-light-125.png) | PASS |
| 1440 / 125% | dark | 0 → 0px | 64px | 0 / 0 | [before](docs/verification/premium-design/before/add-equipment-1440-dark-125.png) · [after](docs/verification/premium-design/after/add-equipment-1440-dark-125.png) | PASS |
| 1440 / 100% | high-contrast | no valid baseline → 0px | 64px | 0 / 0 | [after](docs/verification/premium-design/after/add-equipment-1440-high-contrast-100.png) | PASS |
| 375 / 100% reduced motion | light | 0 → 0px | 64px | 0 / 0 | [before](docs/verification/premium-design/before/add-equipment-375-light-100-reduced.png) · [after](docs/verification/premium-design/after/add-equipment-375-light-100-reduced.png) | PASS |

### edit-equipment

| Width / scale | Theme | Page overflow before → after | Header | Off-screen / small controls | Evidence | Result |
|---|---|---|---|---|---|---|
| 375 / 100% | light | 0 → 0px | 64px | 0 / 0 | [before](docs/verification/premium-design/before/edit-equipment-375-light-100.png) · [after](docs/verification/premium-design/after/edit-equipment-375-light-100.png) | PASS |
| 768 / 100% | light | 0 → 0px | 64px | 0 / 0 | [before](docs/verification/premium-design/before/edit-equipment-768-light-100.png) · [after](docs/verification/premium-design/after/edit-equipment-768-light-100.png) | PASS |
| 820 / 100% | light | 0 → 0px | 64px | 0 / 0 | [before](docs/verification/premium-design/before/edit-equipment-820-light-100.png) · [after](docs/verification/premium-design/after/edit-equipment-820-light-100.png) | PASS |
| 1024 / 100% | light | 0 → 0px | 64px | 0 / 0 | [before](docs/verification/premium-design/before/edit-equipment-1024-light-100.png) · [after](docs/verification/premium-design/after/edit-equipment-1024-light-100.png) | PASS |
| 1280 / 100% | light | 0 → 0px | 64px | 0 / 0 | [before](docs/verification/premium-design/before/edit-equipment-1280-light-100.png) · [after](docs/verification/premium-design/after/edit-equipment-1280-light-100.png) | PASS |
| 1440 / 100% | light | 0 → 0px | 64px | 0 / 0 | [before](docs/verification/premium-design/before/edit-equipment-1440-light-100.png) · [after](docs/verification/premium-design/after/edit-equipment-1440-light-100.png) | PASS |
| 1920 / 100% | light | 0 → 0px | 64px | 0 / 0 | [before](docs/verification/premium-design/before/edit-equipment-1920-light-100.png) · [after](docs/verification/premium-design/after/edit-equipment-1920-light-100.png) | PASS |
| 820 / 100% | dark | 0 → 0px | 64px | 0 / 0 | [before](docs/verification/premium-design/before/edit-equipment-820-dark-100.png) · [after](docs/verification/premium-design/after/edit-equipment-820-dark-100.png) | PASS |
| 1440 / 100% | dark | 0 → 0px | 64px | 0 / 0 | [before](docs/verification/premium-design/before/edit-equipment-1440-dark-100.png) · [after](docs/verification/premium-design/after/edit-equipment-1440-dark-100.png) | PASS |
| 820 / 125% | light | 0 → 0px | 64px | 0 / 0 | [before](docs/verification/premium-design/before/edit-equipment-820-light-125.png) · [after](docs/verification/premium-design/after/edit-equipment-820-light-125.png) | PASS |
| 1440 / 125% | dark | 0 → 0px | 64px | 0 / 0 | [before](docs/verification/premium-design/before/edit-equipment-1440-dark-125.png) · [after](docs/verification/premium-design/after/edit-equipment-1440-dark-125.png) | PASS |
| 1440 / 100% | high-contrast | no valid baseline → 0px | 64px | 0 / 0 | [after](docs/verification/premium-design/after/edit-equipment-1440-high-contrast-100.png) | PASS |
| 375 / 100% reduced motion | light | 0 → 0px | 64px | 0 / 0 | [before](docs/verification/premium-design/before/edit-equipment-375-light-100-reduced.png) · [after](docs/verification/premium-design/after/edit-equipment-375-light-100-reduced.png) | PASS |

### clients

| Width / scale | Theme | Page overflow before → after | Header | Off-screen / small controls | Evidence | Result |
|---|---|---|---|---|---|---|
| 375 / 100% | light | 0 → 0px | 64px | 0 / 0 | [before](docs/verification/premium-design/before/clients-375-light-100.png) · [after](docs/verification/premium-design/after/clients-375-light-100.png) | PASS |
| 768 / 100% | light | 0 → 0px | 64px | 0 / 0 | [before](docs/verification/premium-design/before/clients-768-light-100.png) · [after](docs/verification/premium-design/after/clients-768-light-100.png) | PASS |
| 820 / 100% | light | 0 → 0px | 64px | 0 / 0 | [before](docs/verification/premium-design/before/clients-820-light-100.png) · [after](docs/verification/premium-design/after/clients-820-light-100.png) | PASS |
| 1024 / 100% | light | 0 → 0px | 64px | 0 / 0 | [before](docs/verification/premium-design/before/clients-1024-light-100.png) · [after](docs/verification/premium-design/after/clients-1024-light-100.png) | PASS |
| 1280 / 100% | light | 0 → 0px | 64px | 0 / 0 | [before](docs/verification/premium-design/before/clients-1280-light-100.png) · [after](docs/verification/premium-design/after/clients-1280-light-100.png) | PASS |
| 1440 / 100% | light | 0 → 0px | 64px | 0 / 0 | [before](docs/verification/premium-design/before/clients-1440-light-100.png) · [after](docs/verification/premium-design/after/clients-1440-light-100.png) | PASS |
| 1920 / 100% | light | 0 → 0px | 64px | 0 / 0 | [before](docs/verification/premium-design/before/clients-1920-light-100.png) · [after](docs/verification/premium-design/after/clients-1920-light-100.png) | PASS |
| 820 / 100% | dark | 0 → 0px | 64px | 0 / 0 | [before](docs/verification/premium-design/before/clients-820-dark-100.png) · [after](docs/verification/premium-design/after/clients-820-dark-100.png) | PASS |
| 1440 / 100% | dark | 0 → 0px | 64px | 0 / 0 | [before](docs/verification/premium-design/before/clients-1440-dark-100.png) · [after](docs/verification/premium-design/after/clients-1440-dark-100.png) | PASS |
| 820 / 125% | light | 0 → 0px | 64px | 0 / 0 | [before](docs/verification/premium-design/before/clients-820-light-125.png) · [after](docs/verification/premium-design/after/clients-820-light-125.png) | PASS |
| 1440 / 125% | dark | 0 → 0px | 64px | 0 / 0 | [before](docs/verification/premium-design/before/clients-1440-dark-125.png) · [after](docs/verification/premium-design/after/clients-1440-dark-125.png) | PASS |
| 1440 / 100% | high-contrast | no valid baseline → 0px | 64px | 0 / 0 | [after](docs/verification/premium-design/after/clients-1440-high-contrast-100.png) | PASS |
| 375 / 100% reduced motion | light | 0 → 0px | 64px | 0 / 0 | [before](docs/verification/premium-design/before/clients-375-light-100-reduced.png) · [after](docs/verification/premium-design/after/clients-375-light-100-reduced.png) | PASS |

### finance

| Width / scale | Theme | Page overflow before → after | Header | Off-screen / small controls | Evidence | Result |
|---|---|---|---|---|---|---|
| 375 / 100% | light | 0 → 0px | 64px | 0 / 0 | [before](docs/verification/premium-design/before/finance-375-light-100.png) · [after](docs/verification/premium-design/after/finance-375-light-100.png) | PASS |
| 768 / 100% | light | 0 → 0px | 64px | 0 / 0 | [before](docs/verification/premium-design/before/finance-768-light-100.png) · [after](docs/verification/premium-design/after/finance-768-light-100.png) | PASS |
| 820 / 100% | light | 0 → 0px | 64px | 0 / 0 | [before](docs/verification/premium-design/before/finance-820-light-100.png) · [after](docs/verification/premium-design/after/finance-820-light-100.png) | PASS |
| 1024 / 100% | light | 0 → 0px | 64px | 0 / 0 | [before](docs/verification/premium-design/before/finance-1024-light-100.png) · [after](docs/verification/premium-design/after/finance-1024-light-100.png) | PASS |
| 1280 / 100% | light | 0 → 0px | 64px | 0 / 0 | [before](docs/verification/premium-design/before/finance-1280-light-100.png) · [after](docs/verification/premium-design/after/finance-1280-light-100.png) | PASS |
| 1440 / 100% | light | 0 → 0px | 64px | 0 / 0 | [before](docs/verification/premium-design/before/finance-1440-light-100.png) · [after](docs/verification/premium-design/after/finance-1440-light-100.png) | PASS |
| 1920 / 100% | light | 0 → 0px | 64px | 0 / 0 | [before](docs/verification/premium-design/before/finance-1920-light-100.png) · [after](docs/verification/premium-design/after/finance-1920-light-100.png) | PASS |
| 820 / 100% | dark | 0 → 0px | 64px | 0 / 0 | [before](docs/verification/premium-design/before/finance-820-dark-100.png) · [after](docs/verification/premium-design/after/finance-820-dark-100.png) | PASS |
| 1440 / 100% | dark | 0 → 0px | 64px | 0 / 0 | [before](docs/verification/premium-design/before/finance-1440-dark-100.png) · [after](docs/verification/premium-design/after/finance-1440-dark-100.png) | PASS |
| 820 / 125% | light | 0 → 0px | 64px | 0 / 0 | [before](docs/verification/premium-design/before/finance-820-light-125.png) · [after](docs/verification/premium-design/after/finance-820-light-125.png) | PASS |
| 1440 / 125% | dark | 0 → 0px | 64px | 0 / 0 | [before](docs/verification/premium-design/before/finance-1440-dark-125.png) · [after](docs/verification/premium-design/after/finance-1440-dark-125.png) | PASS |
| 1440 / 100% | high-contrast | no valid baseline → 0px | 64px | 0 / 0 | [after](docs/verification/premium-design/after/finance-1440-high-contrast-100.png) | PASS |
| 375 / 100% reduced motion | light | 0 → 0px | 64px | 0 / 0 | [before](docs/verification/premium-design/before/finance-375-light-100-reduced.png) · [after](docs/verification/premium-design/after/finance-375-light-100-reduced.png) | PASS |

### operations

| Width / scale | Theme | Page overflow before → after | Header | Off-screen / small controls | Evidence | Result |
|---|---|---|---|---|---|---|
| 375 / 100% | light | 0 → 0px | 64px | 0 / 0 | [before](docs/verification/premium-design/before/operations-375-light-100.png) · [after](docs/verification/premium-design/after/operations-375-light-100.png) | PASS |
| 768 / 100% | light | 0 → 0px | 64px | 0 / 0 | [before](docs/verification/premium-design/before/operations-768-light-100.png) · [after](docs/verification/premium-design/after/operations-768-light-100.png) | PASS |
| 820 / 100% | light | 0 → 0px | 64px | 0 / 0 | [before](docs/verification/premium-design/before/operations-820-light-100.png) · [after](docs/verification/premium-design/after/operations-820-light-100.png) | PASS |
| 1024 / 100% | light | 0 → 0px | 64px | 0 / 0 | [before](docs/verification/premium-design/before/operations-1024-light-100.png) · [after](docs/verification/premium-design/after/operations-1024-light-100.png) | PASS |
| 1280 / 100% | light | 0 → 0px | 64px | 0 / 0 | [before](docs/verification/premium-design/before/operations-1280-light-100.png) · [after](docs/verification/premium-design/after/operations-1280-light-100.png) | PASS |
| 1440 / 100% | light | 0 → 0px | 64px | 0 / 0 | [before](docs/verification/premium-design/before/operations-1440-light-100.png) · [after](docs/verification/premium-design/after/operations-1440-light-100.png) | PASS |
| 1920 / 100% | light | 0 → 0px | 64px | 0 / 0 | [before](docs/verification/premium-design/before/operations-1920-light-100.png) · [after](docs/verification/premium-design/after/operations-1920-light-100.png) | PASS |
| 820 / 100% | dark | 0 → 0px | 64px | 0 / 0 | [before](docs/verification/premium-design/before/operations-820-dark-100.png) · [after](docs/verification/premium-design/after/operations-820-dark-100.png) | PASS |
| 1440 / 100% | dark | 0 → 0px | 64px | 0 / 0 | [before](docs/verification/premium-design/before/operations-1440-dark-100.png) · [after](docs/verification/premium-design/after/operations-1440-dark-100.png) | PASS |
| 820 / 125% | light | 0 → 0px | 64px | 0 / 0 | [before](docs/verification/premium-design/before/operations-820-light-125.png) · [after](docs/verification/premium-design/after/operations-820-light-125.png) | PASS |
| 1440 / 125% | dark | 0 → 0px | 64px | 0 / 0 | [before](docs/verification/premium-design/before/operations-1440-dark-125.png) · [after](docs/verification/premium-design/after/operations-1440-dark-125.png) | PASS |
| 1440 / 100% | high-contrast | no valid baseline → 0px | 64px | 0 / 0 | [after](docs/verification/premium-design/after/operations-1440-high-contrast-100.png) | PASS |
| 375 / 100% reduced motion | light | 0 → 0px | 64px | 0 / 0 | [before](docs/verification/premium-design/before/operations-375-light-100-reduced.png) · [after](docs/verification/premium-design/after/operations-375-light-100-reduced.png) | PASS |

### reports

| Width / scale | Theme | Page overflow before → after | Header | Off-screen / small controls | Evidence | Result |
|---|---|---|---|---|---|---|
| 375 / 100% | light | 0 → 0px | 64px | 0 / 0 | [before](docs/verification/premium-design/before/reports-375-light-100.png) · [after](docs/verification/premium-design/after/reports-375-light-100.png) | PASS |
| 768 / 100% | light | 0 → 0px | 64px | 0 / 0 | [before](docs/verification/premium-design/before/reports-768-light-100.png) · [after](docs/verification/premium-design/after/reports-768-light-100.png) | PASS |
| 820 / 100% | light | 0 → 0px | 64px | 0 / 0 | [before](docs/verification/premium-design/before/reports-820-light-100.png) · [after](docs/verification/premium-design/after/reports-820-light-100.png) | PASS |
| 1024 / 100% | light | 0 → 0px | 64px | 0 / 0 | [before](docs/verification/premium-design/before/reports-1024-light-100.png) · [after](docs/verification/premium-design/after/reports-1024-light-100.png) | PASS |
| 1280 / 100% | light | 0 → 0px | 64px | 0 / 0 | [before](docs/verification/premium-design/before/reports-1280-light-100.png) · [after](docs/verification/premium-design/after/reports-1280-light-100.png) | PASS |
| 1440 / 100% | light | 0 → 0px | 64px | 0 / 0 | [before](docs/verification/premium-design/before/reports-1440-light-100.png) · [after](docs/verification/premium-design/after/reports-1440-light-100.png) | PASS |
| 1920 / 100% | light | 0 → 0px | 64px | 0 / 0 | [before](docs/verification/premium-design/before/reports-1920-light-100.png) · [after](docs/verification/premium-design/after/reports-1920-light-100.png) | PASS |
| 820 / 100% | dark | 0 → 0px | 64px | 0 / 0 | [before](docs/verification/premium-design/before/reports-820-dark-100.png) · [after](docs/verification/premium-design/after/reports-820-dark-100.png) | PASS |
| 1440 / 100% | dark | 0 → 0px | 64px | 0 / 0 | [before](docs/verification/premium-design/before/reports-1440-dark-100.png) · [after](docs/verification/premium-design/after/reports-1440-dark-100.png) | PASS |
| 820 / 125% | light | 0 → 0px | 64px | 0 / 0 | [before](docs/verification/premium-design/before/reports-820-light-125.png) · [after](docs/verification/premium-design/after/reports-820-light-125.png) | PASS |
| 1440 / 125% | dark | 0 → 0px | 64px | 0 / 0 | [before](docs/verification/premium-design/before/reports-1440-dark-125.png) · [after](docs/verification/premium-design/after/reports-1440-dark-125.png) | PASS |
| 1440 / 100% | high-contrast | no valid baseline → 0px | 64px | 0 / 0 | [after](docs/verification/premium-design/after/reports-1440-high-contrast-100.png) | PASS |
| 375 / 100% reduced motion | light | 0 → 0px | 64px | 0 / 0 | [before](docs/verification/premium-design/before/reports-375-light-100-reduced.png) · [after](docs/verification/premium-design/after/reports-375-light-100-reduced.png) | PASS |

### calendar

| Width / scale | Theme | Page overflow before → after | Header | Off-screen / small controls | Evidence | Result |
|---|---|---|---|---|---|---|
| 375 / 100% | light | 0 → 0px | 64px | 0 / 0 | [before](docs/verification/premium-design/before/calendar-375-light-100.png) · [after](docs/verification/premium-design/after/calendar-375-light-100.png) | PASS |
| 768 / 100% | light | 0 → 0px | 64px | 0 / 0 | [before](docs/verification/premium-design/before/calendar-768-light-100.png) · [after](docs/verification/premium-design/after/calendar-768-light-100.png) | PASS |
| 820 / 100% | light | 0 → 0px | 64px | 0 / 0 | [before](docs/verification/premium-design/before/calendar-820-light-100.png) · [after](docs/verification/premium-design/after/calendar-820-light-100.png) | PASS |
| 1024 / 100% | light | 0 → 0px | 64px | 0 / 0 | [before](docs/verification/premium-design/before/calendar-1024-light-100.png) · [after](docs/verification/premium-design/after/calendar-1024-light-100.png) | PASS |
| 1280 / 100% | light | 0 → 0px | 64px | 0 / 0 | [before](docs/verification/premium-design/before/calendar-1280-light-100.png) · [after](docs/verification/premium-design/after/calendar-1280-light-100.png) | PASS |
| 1440 / 100% | light | 0 → 0px | 64px | 0 / 0 | [before](docs/verification/premium-design/before/calendar-1440-light-100.png) · [after](docs/verification/premium-design/after/calendar-1440-light-100.png) | PASS |
| 1920 / 100% | light | 0 → 0px | 64px | 0 / 0 | [before](docs/verification/premium-design/before/calendar-1920-light-100.png) · [after](docs/verification/premium-design/after/calendar-1920-light-100.png) | PASS |
| 820 / 100% | dark | 0 → 0px | 64px | 0 / 0 | [before](docs/verification/premium-design/before/calendar-820-dark-100.png) · [after](docs/verification/premium-design/after/calendar-820-dark-100.png) | PASS |
| 1440 / 100% | dark | 0 → 0px | 64px | 0 / 0 | [before](docs/verification/premium-design/before/calendar-1440-dark-100.png) · [after](docs/verification/premium-design/after/calendar-1440-dark-100.png) | PASS |
| 820 / 125% | light | 0 → 0px | 64px | 0 / 0 | [before](docs/verification/premium-design/before/calendar-820-light-125.png) · [after](docs/verification/premium-design/after/calendar-820-light-125.png) | PASS |
| 1440 / 125% | dark | 0 → 0px | 64px | 0 / 0 | [before](docs/verification/premium-design/before/calendar-1440-dark-125.png) · [after](docs/verification/premium-design/after/calendar-1440-dark-125.png) | PASS |
| 1440 / 100% | high-contrast | no valid baseline → 0px | 64px | 0 / 0 | [after](docs/verification/premium-design/after/calendar-1440-high-contrast-100.png) | PASS |
| 375 / 100% reduced motion | light | 0 → 0px | 64px | 0 / 0 | [before](docs/verification/premium-design/before/calendar-375-light-100-reduced.png) · [after](docs/verification/premium-design/after/calendar-375-light-100-reduced.png) | PASS |

## Result

156 captures; 0 geometry failures. No subjective improvement percentage is assigned.
