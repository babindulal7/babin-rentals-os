# Babin Rentals OS — Global Shell Phase 1 Changelog

**Date**: 23 October 2026  
**Branch**: `feat/global-shell-phase1`  
**Execution Scope**: Shared Chrome and Page Frame (Header, Sidebar, Phone Bottom Bar, Page Shell) across core pilot routes (`/today`, `/rentals`, `/calendar`, `/inventory`, `/operations`).

---

## 1. Architectural Summary & Invariants

Phase 1 establishes a single, reliable, compact, premium global application frame shared across all existing modules without altering business logic, query contracts, role permissions, or booking lifecycle engines.

### Key Invariants Established:
1. **Single-Row Application Header**:
   - Exactly one visible horizontal header row (fixed 64px `--header-h`, `flex-wrap: nowrap`).
   - Sticky top positioning with background blur (`backdrop-filter: blur(20px)`).
   - Zero horizontal wrapping or secondary toolbar rows.
2. **Deterministic 3-Zone Architecture**:
   - **Zone 1 (Left)**: Filter toggle (if present) → Back navigation (if registered/autoBack) → Icon → Title/Breadcrumbs → Record status pill → Unsaved dirty indicator → InfoTooltip.
   - **Zone 2 (Center)**: Exactly one search control owned by the single-owner precedence contract:
     1. Page Portal Search (`WorkspaceHeaderSearch`) if mounted (e.g. `RentalsList`)
     2. Page Config Search (`PageHeaderSearchConfig` via `PageHeader`) if active (e.g. `Today`, `Calendar`, `Inventory`, `OperationsQueues`)
     3. Fallback Global Command Palette Search trigger (`Ctrl+K / ⌘K`, `/` hotkey)
     - Accompanied by the Outbox Sync heartbeat badge (active when pending mutations or sync errors exist).
   - **Zone 3 (Right)**: Canonical right-anchored slot sequence:
     - Secondary actions (up to 2 visible on desktop when header room allows; folded into More when constrained)
     - Add action / `GlobalAddMenu` (consistent creation entry)
     - More overflow menu (captures excess secondary actions, registry overflow, and custom menus)
     - Primary action / CTA (single prominent action, e.g. Save, Confirm, New Rental)
     - Internal Notes trigger (desktop/tablet; placed in More on phone)
     - Phone Search trigger/panel (phone only)
     - Mock Mode indicator (when active in local testing)
     - User Profile trigger / Avatar (44px hit target)
3. **Touch Targets & Accessibility**:
   - All interactive controls maintain $\ge 44 \times 44\text{px}$ floor targets (Law 15).
   - WCAG AA contrast compliance maintained across Light, Dark, High-contrast, and Glass themes (82/82 contrast checks pass).
4. **Responsive Breakpoint & Density Alignment**:
   - Standard breakpoint contract: `< 768px` phone, `768–1279px` tablet, `≥ 1280px` desktop.
   - `src/lib/displayDensity.tsx` normalized to `< BP.phone` (768px), eliminating off-by-one behavior at 768px while fully preserving persisted user preferences.
5. **Navigation & Floor Presence**:
   - Desktop/tablet Sidebar: 256px expanded / 64px compact icon rail with independent persistence.
   - Phone BottomBar: 58px height + safe area (`BAR_BOX`), single thumb-reachable Scanner trigger (`toggleScanner`), no dual scanner collision (AUD-014).

---

## 2. File Changes & Responsibilities

| File | Type | Description |
|---|---|---|
| `src/components/shell/shellLayoutContract.ts` | **NEW** | Canonical layout contract defining dimensions, slot types, zone ordering, search owner resolution, and phone search resolution. |
| `src/components/shell/__tests__/shellLayoutContract.test.ts` | **NEW** | Unit test suite covering layout dimensions, slot sequences, and search precedence logic. |
| `src/components/shell/Header.tsx` | **EDIT** | Integrated `resolveSearchOwner` and `resolvePhoneSearchKind` to guarantee single search ownership in Zone 2 and Zone 3; enforced zero row wrapping and clean slot containment. |
| `src/lib/displayDensity.tsx` | **EDIT** | Normalized initial density check from `<= 768` to `< BP.phone` (768px) to align with repository breakpoint contracts while preserving localStorage preferences. |
| `src/lib/__tests__/displayDensity.test.tsx` | **NEW** | Test suite verifying density defaults across phone (<768px), tablet boundary (768px), desktop (1280px), and localStorage persistence. |
| `src/__tests__/e2e/globalShellPilotRoutes.test.tsx` | **NEW** | End-to-end integration test certifying that `/today`, `/rentals`, `/calendar`, `/inventory`, and `/operations` all mount correctly under the unified global frame with single header and search ownership. |

---

## 3. Pilot Route Verification

- **`/today`**:pickup and return board, search input registered in Zone 2, `GlobalAddMenu` in Add slot, operations and movement refresh in More menu.
- **`/rentals`**: rentals list with filter button in Zone 1, portaled search in Zone 2, booking operations and freshness badge in secondary slot, Add/New Rental in Add slot.
- **`/calendar`**: master operational schedule, filter toggle in Zone 1, registered calendar search in Zone 2, availability CTA in primary slot, view switcher in secondary/overflow.
- **`/inventory`**: equipment catalogue, filter button in Zone 1, model count pill in Zone 1, search input in Zone 2, Add Equipment dropdown in Add slot.
- **`/operations`**: turnaround queues, queue status indicator in Zone 1, active queue search in Zone 2, delivery and sub-rental navigation in secondary slot.
