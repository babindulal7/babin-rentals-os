# Responsive orientation implementation and acceptance matrix

**Baseline:** main d4486a4 (12 Nov 2026). **Status:** proposed verification and design criteria, not executed acceptance. Reuses [03_INFORMATION_ARCHITECTURE.md](03_INFORMATION_ARCHITECTURE.md), [07_DESIGN_SYSTEM.md](07_DESIGN_SYSTEM.md), [09_USABILITY_AND_ACCEPTANCE.md](09_USABILITY_AND_ACCEPTANCE.md) and `src/lib/breakpoints.ts`.

## Layout principles

- **CSS width contract:** phone <768; tablet 768–1279; desktop >=1280. Avoid `data-device="ipad"` or UA-specific paths that change business behavior. Use media/container queries; optional orientation/height queries only for space constraints.
- **A phone physically rotated to 844×390 has CSS width 844px**; applying only a `max-width:767px` rule would produce tablet mode. Protect short-height scanner/camera layout with **available height**, coarse-pointer and/or orientation-aware styles without inventing a new app/platform feature gate.
- **One domain action:** same React component and action function across responsive presentations. No second disabled/hidden mutation button that may submit twice. Use existing header owner `PageActions`, floor `OperationsShell` primary and `RecordActions`.
- **No role leaks:** financial data must not be in props/DOM/API payload for Warehouse, Technician, Driver or Client, regardless of width or overlay; server scope remains authoritative.
- **No fake clean/ready count:** partial Return, defect holds, outbox state and reservation eligibility remain different facts.
- **Themes:** approved Graphite/Paper light/dark, high-contrast preserved; semantic status color + icon + label. Source Sans 3 body and Outfit headings; no Inter or per-page palette.
- **Touch:** all controls >=44px, primary floor verbs >=56px; sticky bars above safe area; focus/scroll/unsaved work preserved.

## Five configurations to test

| Mode | Representative CSS viewport | Nav/shell | Content | Dialog, scanning, focus |
| --- | --- | --- | --- | --- |
| Desktop landscape | 1440×900 and 1920×1080 | full permitted left sidebar; **desktop global search via Ctrl/Cmd+K**, not permanent text box (G-16) | readable table + inline sticky rail on booking forms >=1280; Today pickup/return equal columns | existing modal for destructive confirm, context rails not forced drawers |
| iPad landscape | 1194×834 or 1024×768 | compact accessible nav when permitted; icon labels available to assistive tech | dual-pane floor workbench **only where total usable width allows**; queue ~320 and work flexible | protected scanner focus, dirty changes guard, scan confirmation 56px |
| iPad portrait | 820×1180 or 768×1024 | compact nav, search icon, visible context | single-column queue, own scroll position, existing operations modal/workspace | sheet/full-screen task only when 420px side sheet would obscure useful list |
| Phone portrait | 390×844 and 375×812, 320 robustness | 5-slot bottom bar Today/Rentals/Scan/Inventory/More | task-first list cards, status+time+client, minimal KPI chrome; dates/filters **outside** result boxes | bottom sheet or controlled modal with sticky footer above safe area and virtual keyboard |
| Phone landscape | 844×390 and 812×375 | shorter chrome while capture running; maintain exit and role filtered nav | scanner/camera left and checklist right if height and content permit; otherwise single task + toggle | no clipping, accessible scanner fallback, don't hide required action or focus on rotation |

**Physical device tests are separate** from CSS viewport emulation. Do not label an emulated 820px browser as a verified iPad Safari session.

## Today: separate dates and all filters OUTSIDE result boxes

**Design contract:**
1. Shared header: Today, one page/keyboard search owner, creation in existing global Add/More (not duplicate CTA).
2. Above the two result areas, provide an **outer toolbar**: pickup date independently selecting Today/Tomorrow/Next 7/Custom; return date independently selecting the same; status and relevant staff/branch controls **only when backed by real query semantics**; clear filters and visible count/age. Prefer progressive disclosure on phone with **the two dates still visible**.
3. Results: left Pickups, right Returns; overdue stays associated with Returns and sorted first; preserve carry-over pickups and due-overdue scope from `src/modules/today/Today.tsx`.
4. On phone: outer two independent date controls + Filter; accessible Pickups/Returns/Overdue segment if existing query supports it; one result list at a time. Do not let an Overdue-only switch silently alter the Pickups result.
5. **G-6 is authoritative**: Today row opens rental detail; Pack/Handover/Return/Reset commits live in Operations. The older mockup's per-row Start Packing/Return & Inspect buttons must **not** be copied.
6. Reuse the existing `DataAgeBadge`, independent `pickupDateFilter` / `returnDateFilter`, storage, query invalidation and failed-read handling; do not build another "master date" store. If the current shared preset changes both, label it as shared, not Pickup-only.
7. Verify both filters remain visible/active after navigating to a rental and back, even on mobile; no totals from failed/partial queries presented as zero.

## Module-specific orientation tests

| Journey/module | Desktop | iPad landscape | iPad portrait | Phone portrait/landscape |
| --- | --- | --- | --- | --- |
| Rental list, Detail | table + inline rail | split if readable | one column + rail reflow | cards and one primary, no clipped actions |
| New Rental, dates, conflict modal | dense sections and live availability feedback | context rail when room | stacked sections | no auto-scroll lost draft, modal fits keyboard |
| Packing/scan | table scan or manual | queue + scan workspace | full focus-first scan | landscape capture+checklist when room, fallback |
| Handover and signature | receiver/vehicle evidence | large forms with drawn signature | easy scrolling and save proof | signed approval never hidden behind keyboard |
| Return/inspection | expected vs received | barcode + conditions | per-unit checklist | partial return, missing, damaged photo, offline refusal |
| Reset/cleaning | category QC table | task and needed-next | one task at a time | unsafe media-formatting NOT automatic |
| Clients, Inventory | dense filterable table | adaptive lists | cards with visible filters | filter drawer and correct responsive role gate |
| Finance/Reports | sums/charts role-gated | table/graph if allowed | tab cards/chart reflow | no money DOM for floor; no duplicate invoice/payment action |
| Calendar/Delivery/Crew | dual BS/AD dates | usable day/roster columns | reduce columns | timeline/cards and explicit time zone |
| Settings/More | four groups + Admin if permitted | group navigation | group navigation | five-slot bottom bar to More; no phantom permissions |

## Required state matrix per test

For each changed screen and role: loading, empty, filtered empty, populated, offline/stale, read error/retry, saved/unsaved, server rejection, permission-hidden; transitions on all six booking stages; overdue flag, partial return, damage, cleaning and branch grants. Record test fixture, observed action/response, **persisted readback**, screenshot, width+height, device/orientation, light/dark, accessibility, and source SHA.

### Common acceptance criteria

- **R-01:** at 375, 390, 768, 820, 1024, 1194, 1280, 1440 and 1920 width no clipped primary, hidden error or unexpected document horizontal overflow; 320 is a robustness check.
- **R-02:** iPad and phone landscape rotations preserve typed/queued-but-uncommitted work, scanner focus logic, navigation return and form identity.
- **R-03:** desktop 36–40px density is only for non-touch tables; touch targets remain >=44px and >=56px for floor verbs regardless of device.
- **R-04:** phone has one accessible Scan entry, no duplicate floating scanner FAB.
- **R-05:** all status indicators have icon+text and enough theme contrast; no promise of synthetic live KPI values or client financials in restricted roles.
- **R-06:** Pack/Handover/Return/Close gates only execute through existing actions/RPC and online guards; service-only rentals and offline limitations remain supported honestly.
- **R-07:** two independent Today date filters live outside result containers, with real count/filter semantics and no duplication or routing loss.
- **R-08:** physical iPad Safari, iPhone portrait and landscape, Bluetooth scanner, low light and keyboard are **acceptance_pending** until actually tested. Screenshots in PR #128 are useful baselines, **not** device signoff.

## Implementation order

1. **Reconcile latest decisions with mounted UI**, especially Today G-6 buttons, Graphite/Paper tokens, Glass-removal state and nav labels. Log observed mismatches before changing shared components.
2. **Fix Today filter placement** and independent date semantics without breaking pickup carry-over or overdue Returns.
3. **Responsive Operations** Pack → Handover → Return → Reset across two iPad orientations and phone portrait/landscape.
4. **Finish source wiring** of New Rental conflict experience, signed evidence, outbox honesty, scoped read/retry, role-safe financial areas.
5. **Verify** via required local `npm run gates`, browser viewports, staging real JWT/RLS and physical-device sessions; only then mark individual tickets done.

No automatic theme, action or schema changes are authorized by this planning document.
