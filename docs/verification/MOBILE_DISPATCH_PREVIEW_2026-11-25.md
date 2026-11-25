# Mobile dispatch refinement

Based on owner iPhone screenshot of the private staging preview. No business logic or permissions changes.

- Phone summary cards retain real counts and warnings, use full-width compact details, and preserve loaded-subset qualifications.
- Place the pickup/return queue ahead of the optional workbench on phone; keep desktop/tablet layout.
- Keep all header actions and 44px hit areas; reclaim spacing in Today only. The create menu remains labelled and operable.
- Show STAGING only for the known staging backend (not via user input or a hostname alone).

Acceptance: test 320, 375, 390, 430px phone widths, 768/1024px tablets, desktop. Verify no horizontal overflow, all four cards retain error/loading and subset semantics, no clipped count, date filters and pickup/return tabs work, workbench remains reachable, touch targets >=44px, header actions accessible by keyboard, staging label absent in production/mock. Verify actual hosted preview independently after exact-head CI; do not deploy automatically. Existing operations design unchanged.
