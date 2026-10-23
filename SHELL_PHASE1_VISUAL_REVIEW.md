# Babin Rentals OS — Global Shell Phase 1 Visual Review

**Date**: 23 October 2026  
**Branch**: `feat/global-shell-phase1`  
**Execution Context**: Verification across 5 target responsive widths: 1920px (Desktop), 1280px (Laptop), 1194px (iPad Pro landscape), 800px (iPad portrait / tablet), 390px (Phone).

---

## 1. Frame Architecture Across Target Breakpoints

```
1920px & 1280px Desktop:
+-------------------+-----------------------------------------------------------------------------------------+
| Sidebar (256px)   | Header: [Filter] [Back] [Title / Status] -- [Single Search / Sync] -- [Sec] [Add] [More] [CTA] [Avatar] |
| - Flat 11 routes  +-----------------------------------------------------------------------------------------+
| - Outfit font     | Workspace Scroll Container (main#main-content, padding: clamp(14px, 1.35vw, 18px))      |
| - 44px row height |   PageShell (max-width: 1600px, width: 100%)                                            |
+-------------------+-----------------------------------------------------------------------------------------+

1194px & 800px Tablet:
+--------+----------------------------------------------------------------------------------------------------+
| Rail   | Header: [Filter] [Back] [Title / Status] -- [Single Search] -- [Add] [More (Sec folded)] [CTA] [Avatar]  |
| (64px) +----------------------------------------------------------------------------------------------------+
| - Icons| Workspace Scroll Container                                                                         |
+--------+----------------------------------------------------------------------------------------------------+

390px Phone:
+-------------------------------------------------------------------------------------------------------------+
| Header (64px): [Filter] [Title >= 120px] --------------------------------- [Add] [More] [Search] [Avatar]  |
+-------------------------------------------------------------------------------------------------------------+
| Workspace Scroll Container (bottom padding: calc(58px + safe-area))                                         |
+-------------------------------------------------------------------------------------------------------------+
| BottomBar (58px + safe-area): [Today] [Rentals] [ Scan ⦿ ] [Inventory] [More]                               |
+-------------------------------------------------------------------------------------------------------------+
```

---

## 2. Pilot Routes Multi-Viewport Inspection

### 2.1 Route: `/today`
- **1920px / 1280px**:
  - Global header shows "Today" module crumb with page tooltip.
  - Center search input active: `"Search or scan… (press /)"` with autofocus shortcut.
  - Zone 3 displays `GlobalAddMenu` (`+`) and More menu containing Operations quick link and Refresh movements.
  - Page body mounts `dispatch-toolbar` with `Pickup & return board` and movement summaries. No redundant secondary header bar.
- **1194px / 800px**:
  - Sidebar collapses to 64px compact icon rail by default; full remaining width given to movement cards.
  - Center search scales to max 280px width without overlapping actions.
- **390px**:
  - Sidebar hidden; bottom bar active.
  - Header title given minimum 120px floor; `GlobalAddMenu` renders compact icon-only button (44px target).
  - Search trigger opens contextual search panel beneath header.

### 2.2 Route: `/rentals`
- **1920px / 1280px**:
  - Left zone displays filter toggle button with active count badge.
  - Center zone hosts `WorkspaceHeaderSearch` (`Search rentals…`).
  - Zone 3 displays contextual `BookingOperationsMenu` (when row selected), `DataAgeBadge`, `New Rental` primary CTA, and More menu.
  - Table selection triggers `bulkSelection` bar in header, replacing action cluster with selection count and bulk actions.
- **1194px / 800px**:
  - Secondary booking operations fold into More menu.
  - `New Rental` button compacts smoothly (`min-width: 106px` floor).
- **390px**:
  - Mobile search button in Zone 3 opens clean overlay.
  - Bottom bar centers Scan trigger (`Scan ⦿`).

### 2.3 Route: `/calendar`
- **1920px / 1280px**:
  - Filter toggle button in Zone 1.
  - Calendar search (`Search calendar events (press /)`) in Zone 2.
  - `Check availability` prominent primary CTA button in Zone 3.
  - View switcher (Month, Week, Day, Timeline) and contextual navigation buttons cleanly aligned.
- **1194px / 800px / 390px**:
  - Calendar view switches into compact single-day or list mode on phone.
  - Header maintains single 64px line; availability button compacts to `Availability` or icon.

### 2.4 Route: `/inventory`
- **1920px / 1280px**:
  - Filter toggle in Zone 1, alongside model count chip (`N models`).
  - Search input in Zone 2 (`Search equipment or asset code (press /)`).
  - Add Equipment split dropdown in Add slot.
  - Clean bento equipment cards and table views.
- **1194px / 800px**:
  - Model count pill hides on narrow tablet to preserve title room.
- **390px**:
  - Add button displays single `+` icon (44x44px target).

### 2.5 Route: `/operations`
- **1920px / 1280px**:
  - Queue selector badge in Zone 1 (`Packing`, `Handover`, `Return`, `Reset`, `Cases`).
  - Active queue owns header search (`Filter current queue… (press /)`).
  - Secondary slot displays Delivery & Logistics and Sub-Rentals links.
- **1194px / 800px**:
  - Delivery and Sub-Rentals move into More menu via `useCompactHeader()`.
- **390px**:
  - Segmented control in page body allows rapid thumb switching between operational queues.

---

## 3. Strict Prohibitions & Zero-Drift Certification

- **Zero Git Push / Merge / Deploy**: Execution is 100% confined to local branch `feat/global-shell-phase1`.
- **Zero Database / Migration Mutations**: No migrations created or applied; Supabase schema untouched.
- **Zero Business Logic Changes**: Booking lifecycle gates, financial calculations, RLS policies, and query contracts remain unaltered.
- **Strict AGPL Boundary**: No external coss packages installed or imported.
- **Money Blindness (Law 6)**: Non-financial roles (`Warehouse`, `Technician`, `Driver`, `Client`) remain strictly isolated from financial amounts across all header slots and views.
