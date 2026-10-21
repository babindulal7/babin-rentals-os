# Before / after visual matrix

Local mock corpus only, 21 October 2026 NPT. Baseline capture is in progress; an issue is not marked fixed until an after screenshot and a measured interaction check support it.

Screenshots and measurements: `docs/verification/premium-design/before/` and `after/`.

## Initial observed issues

| Screen | Evidence | Owning file / class | Observation | State |
|---|---|---|---|---|
| Add Equipment | `before/add-equipment-1440-light-100.png` | `RecordActions`, `RecordForm` | Create is in a bottom action strip while header advertises New Equipment | Confirmed |
| Record sections | same screenshot | `Card.tsx`, `.surface-card` | Inline 1.5px borders defeat the CSS default; card header has a second treatment | Confirmed |
| Rentals | `before/rentals-1440-light-100.png` | `.rentals-v2 [data-table-scroll]` | Local 20px shadow differs from the shared surface | Confirmed |
| Inventory | `before/inventory-1440-light-100.png` | `Inventory.tsx` row actions | 28px expand and 32px quick view controls | Confirmed |
| Equipment serial table | `equipment-assist.css` | `.equipment-cell-input`, `.equipment-icon-button` | 38px fields / 36px row buttons; verify actual Add/Edit table after settling | Source finding |
| Today | `before/today-1440-light-100.png` | `dashboard.css` | Existing modern layer already renders flat queue rows; preserve it | Already present |
| Finance | screenshot matrix | `Finance.tsx`, Header | Existing compact action implementation must be measured before any change | Under inspection |
