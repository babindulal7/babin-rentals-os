# Saved-source before / after visual matrix

Existing local mock corpus. Before was rendered from saved pre-edit source; after records the implementation at the captured source hash. Current-source attempts were invalidated by checkout changes and completed zero fresh UI checks.

| Viewport / theme | Before | After | Dialog width before → after | Min stage height | Page overflow | Footer count | Geometry at capture |
|---|---|---|---|---:|---:|---:|---|
| 1440×900 / light | [Before](before/operations-1440-light.png) | [After](after/operations-1440-light.png) | 1400 → 1320px | 64px | 0px | 1 | PASS |
| 1440×900 / dark | [Before](before/operations-1440-dark.png) | [After](after/operations-1440-dark.png) | 1400 → 1320px | 64px | 0px | 1 | PASS |
| 1024×768 / light | [Before](before/operations-1024-light.png) | [After](after/operations-1024-light.png) | 1024 → 1024px | 64px | 0px | 1 | PASS |
| 1024×768 / dark | [Before](before/operations-1024-dark.png) | [After](after/operations-1024-dark.png) | 1024 → 1024px | 64px | 0px | 1 | PASS |
| 768×1024 / light | [Before](before/operations-768-light.png) | [After](after/operations-768-light.png) | 768 → 768px | 64px | 0px | 1 | PASS |
| 768×1024 / dark | [Before](before/operations-768-dark.png) | [After](after/operations-768-dark.png) | 768 → 768px | 64px | 0px | 1 | PASS |
| 390×844 / light | [Before](before/operations-390-light.png) | [After](after/operations-390-light.png) | 390 → 390px | 74px | 0px | 1 | PASS |
| 390×844 / dark | [Before](before/operations-390-dark.png) | [After](after/operations-390-dark.png) | 390 → 390px | 74px | 0px | 1 | PASS |

Affected classes/files: operations-shell__stages, operations-shell__stage, operations-shell__details and operations-shell__footer in OperationsShell.tsx / operationsShell.css; BookingOperationsMenu.tsx / booking-operations-menu.css; scoped Modal presentation and fixed header slots.

Measured checks: stage targets ≥44px, confirmation ≥56px and inside the viewport, one footer, no horizontal page overflow. Before/after body tables remain the existing domain workspaces. Density improves by removing duplicate context and conflicting chrome, with no invented percentage.

after/interactions.json records nested scanner layering, ignored outer stage shortcut, Escape closing the scanner only, opener focus return and desktop dock ownership. No scan, signature or floor confirmation was submitted. Native zoom, forced colors and the later dirty-resize change were not certified by the interrupted fresh attempt.

See REMAINING_UI_ISSUES.md for the Return reservation blocker and current-copy verification gaps.

## Final preserved-checkpoint browser proof

Checkpoint `9dc9058837d1c163cd9332ad1ac16d5f71a20c4f`, source fingerprint `34d968ba962ca548138c6a3af47c04d0ae5b46781481f9b7ad15246b7f52c70f`, unchanged during the run. [Gallery](frozen-checkpoint-9dc/gallery.html) · [Measurements and checks](frozen-checkpoint-9dc/report.json). Existing built-in local mock corpus only. These are newer checkpoint screenshots, separate from the historical before/after set above and interrupted active-copy attempts.

| Viewport / theme | Screenshot file in final run | Min stage height | Confirm height | Page / content overflow | Footers | Measured geometry |
|---|---|---:|---:|---|---:|---|
| 1440×900 / light and dark | operations-1440x900-{light,dark}.png | 64px | 56px | 0 / 0px | 1 | PASS |
| 1024×768 / light and dark | operations-1024x768-{light,dark}.png | 64px | 56px | 0 / 0px | 1 | PASS |
| 768×1024 / light and dark | operations-768x1024-{light,dark}.png | 64px | 56px | 0 / 0px | 1 | PASS |
| 390×844 / light and dark | operations-390x844-{light,dark}.png | 74px | 56px | 0 / 0px | 1 | PASS |
| 320×844 / light | operations-320x844-light.png | 89px | 56px | 0 / 0px | 1 | PASS; stage navigator scrolls locally |
| 430×844 / forced colors | operations-430x844-light-forced.png | 74px | 56px | 0 / 0px | 1 | PASS |
| 720×450 / light, 200%-equivalent | operations-720x450-light-200equivalent.png | 74px | 56px | 0 / 0px | 1 | PASS; CSS viewport evidence only |
| 512×384 / dark, 200%-equivalent | operations-512x384-dark-200equivalent.png | 74px | 56px | 0 / 0px | 1 | PASS; CSS viewport evidence only |

All 12 layout cases and four interaction checks pass (16/16, zero page errors). Nested scanner shortcut/Escape ownership and focus restoration pass. Unsaved manual triage persists through dock narrowing and Keep editing, then is explicitly discarded; no Return is confirmed. The existing Warehouse mock login has no monetary fields in Operations DOM. Representative desktop, tablet portrait/landscape and phone screenshots were visually inspected. Native zoom, screen reader, physical devices, on-screen keyboard, actual scanning/signature persistence, Technician/Driver authentication and hosted RLS remain untested.
