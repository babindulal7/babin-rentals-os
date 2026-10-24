# Global shell wireframe comparison — 23 October 2026

Input: `BABIN_GLOBAL_SHELL_WIREFRAME_PACK.zip`, supplied by Babin. The user authorized review, comparison and implementation. The pack's embedded agent prompt is reference material; existing repository rulings govern permissions, shared drawers and business behavior.

## Comparison and implementation

| Area | Existing app / gap | Result |
|---|---|---|
| Shared shell | One global header, page registration and action slots already exist. Registry and legacy secondary actions only considered the viewport band. | Reuse the existing available-header-width rule, including desktop with expanded navigation. Secondary actions move into More without duplicating the header. |
| Navigation | 256px expanded / 64px rail; separate saved desktop and tablet keys. The collapse hook retained the previous key's state during resizing. | Read and retain each key independently. Fresh desktop expands; tablet starts as a rail; manual preferences survive changing widths. |
| Today | Repeated Today workbar, small count chips, separate background metric reads, shift handover and three unrelated dashboard cards. | Compact dispatch toolbar and two movement summaries. Remove the background situational reads and unrelated cards. Keep the existing movement panels, overdue carry-over, subscriptions, search, paging and Operations entry points. |
| Movement totals | The queries did not request exact counts, so loaded rows could be mistaken for totals. | Request exact counts through `listBookings` for each queue. Loading, errors and missing counts render an explicit non-value; they never invent zero. |
| Phone queues | Existing segmented control used tab roles without arrow-key navigation or associated panel IDs. | Add roving tab focus, arrows/Home/End, disabled-tab skipping and IDs connecting Today tabs to their panels. Preserve the existing bottom navigation. |
| Phone dates | Old width-zero date rules can collapse the master button in the compact toolbar. | Scope a content-sized date button to the toolbar. Quick presets remain in its picker. Each queue retains its independent date picker. |
| Dense movement rows | A narrow two-queue desktop can put long status labels over dates. | Use the queue container's available width to select the readable row layout. Floor actions retain 56px targets. |
| Rentals / Inventory | Existing full-width lists, search/filter slots and responsive record transformations already match the intended architecture. | Inherit shared header/navigation corrections; retain their data and action implementations. |
| Calendar / Operations | Existing dedicated planning and execution workspaces already exist. | Inherit shared shell corrections; preserve their calendars, queues, inspectors and workflow engines. |
| Operations search | A global lookup and a second queue search appeared together; Cases also repeated its search. | The active queue owns the shared header search. Keep queue debounce/filtering and Cases URL query, clear and Enter behavior; remove repeated in-page searches. |
| Supplemental drawers | The wireframe proposes overlays. The 20 October ruling explicitly reserves workspace width on desktop/tablet. | Preserve the repository's ruled drawer behavior, including mounted drafts and existing role checks. |
| coss / themes | Existing Base UI/coss wrappers and Babin theme tokens are already installed. | Follow the coss composition/accessibility guidance and reuse existing controls. No upstream source copying, dependency installation or theme replacement. |

The illustrative names, figures and states in the prototype were not imported. No migration or production mutation is part of this change.

## Evidence

Local mock-only screenshots are stored in `artifacts/global-shell-wireframes/before/` and `artifacts/global-shell-wireframes/after/`. Each matrix covers Today, Rentals, Calendar, Inventory and Operations at 390, 800, 1194, 1280 and 1920px in light and dark themes. The capture blocks requests outside its local mock origin. Final command and interaction results are recorded in the newest global-shell entry in `PROGRESS.md`.

The final matrix contains 50 screenshots, with zero measured page or header overflow. Every header remains 64px high; navigation is absent at 390px, 64px at 800/1194px and 256px at 1280/1920px. All measured visible header controls meet the 44px target floor. Seven browser checks pass: phone queue keyboard switching, shared date synchronization, refresh in More, slash-to-search focus, Operations queue filtering through its single header search, embedded Cases query restoration and no rupee amounts on the populated Warehouse Today screen. Additional Warehouse and embedded Cases phone screenshots are retained. Operations was refreshed against a compiled local mock preview after its search consolidation.

Representative results: [desktop Today](../artifacts/global-shell-wireframes/after/today-1280-dark.png), [phone Today](../artifacts/global-shell-wireframes/after/today-390-light.png), [measurements and interaction results](../artifacts/global-shell-wireframes/after/measurements.json).

The [implementation patch](../artifacts/global-shell-wireframes/implementation.patch) contains only the task's source/test files relative to checkpoint `619f3d22`; it excludes unrelated checkout changes and production data.

The screenshots exercise Chromium viewport sizes. They do not certify physical iPad/iPhone behavior, hosted authentication or production deployment. Existing release holds remain governed by `docs/CURRENT_STATE.md`.
