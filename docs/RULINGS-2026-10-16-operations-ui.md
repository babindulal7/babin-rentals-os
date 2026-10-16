# Rulings — 16 October 2026 — Unified rental Operations UI

Authority: Babin's explicit request to improve the four rental Operations steps, reduce side panels to one side, and make the steps look alike. This supersedes the three-column presentation described by older floor-workspace comments; it changes no custody rule.

| ID | Ruling | Reason | Revert |
|---|---|---|---|
| O16-1 | Packing, Handover, Return and Cleaning use the main checklist plus one visible right-side column. Packing/Reset filters move into that column beneath progress/checks. Narrow panes stack the column beneath the main work. | One consistent layout, no opposing side-panel handles. | Restore the four workspaces' FloorAside/floorPlacements calls and three-column grids. |
| O16-2 | Four common stage controls use short visible names and full accessible names/status. The existing gated navigation and completion callbacks remain. Booking actions reuses RentalMoreActions inside Operations, including its role/stage-aware cancellation flow. | Consistent stage navigation and cancellation discoverability from a rental operation. | Remove the new shared stage styling and Operations booking menu. |

## O16-3 — Confirmed lifecycle scope

Babin explicitly selected **before handover only** for Manager stage reversal and **Closed or Cancelled only** for Archive. Manager, Admin and Owner may perform these online with a reason of at least ten characters. Manager access is limited to their branch. Booked may revert to Quote; Packed may revert to Booked or Quote. Handover is never undone. Packing history remains; existing database reservation triggers release holds at Quote and retain them at Booked. No invoice or payment is changed. Archive hides terminal bookings from the default Rentals list; search includes their retained history. Cancellation keeps its existing role and custody rules.

Implementation: migration 0167, manageRentalLifecycle action, rentalLifecycle policy and the shared RentalMoreActions menu. Request keys are immutable and retried without changing the payload. Migration status is WRITTEN until both local database gates pass; never applied live by an agent. Revert: remove these menu entries and capability grants together; retain historical audit and transition rows.
