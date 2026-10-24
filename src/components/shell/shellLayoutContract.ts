/**
 * src/components/shell/shellLayoutContract.ts — Babin Rentals OS
 *
 * Universal Shell Layout Contract for Global Shell Phase 1.
 * Defines canonical header slot architecture, dimension invariants,
 * zone ordering, search ownership precedence, and collision rules.
 *
 * Invariants:
 * 1. Exactly ONE visible horizontal header row (64px, flex-wrap: nowrap).
 * 2. Exactly ONE search control rendered in Zone 2 on tablet/desktop,
 *    and exactly ONE search trigger/input in Zone 3 on phone.
 * 3. Canonical slot sequence across all viewports (1920px, 1280px, 1194/800px, 390px).
 * 4. Hit targets >= 44x44px at every width (Law 15).
 * 5. Role-blind money protection (Law 6).
 */

export const SHELL_DIMENSIONS = {
  headerHeight: 64, // var(--header-h)
  sidebarExpandedWidth: 256, // var(--app-sidebar-width)
  sidebarCollapsedWidth: 64, // var(--app-sidebar-collapsed-width)
  bottomBarHeight: 58, // BOTTOM_BAR_HEIGHT
  minTouchTarget: 44, // Law 15: >= 44px
  titleMinPhoneWidth: 120,
  titleMinTabletWidth: 140,
  titleMinDesktopWidth: 180,
  centerSearchMaxWidth: 420,
  centerSearchTabletMaxWidth: 280,
} as const

/** Canonical Zone 1 (Left) Slot IDs */
export type HeaderZone1Slot =
  | 'filters'
  | 'back'
  | 'icon'
  | 'breadcrumbs'
  | 'status'
  | 'dirty'
  | 'info'

/** Canonical Zone 2 (Center) Slot IDs */
export type HeaderZone2Slot =
  | 'search'
  | 'sync'

/** Canonical Zone 3 (Right) Slot IDs */
export type HeaderZone3Slot =
  | 'secondary'
  | 'add'
  | 'more'
  | 'primary'
  | 'notes'
  | 'phone-search'
  | 'mock'
  | 'profile'

export type HeaderSlotId = HeaderZone1Slot | HeaderZone2Slot | HeaderZone3Slot

/**
 * Slot precedence definition for Zone 3 right-anchored actions:
 * [Secondary actions] -> [Add dropdown] -> [More overflow] -> [Primary action / CTA]
 */
export const ZONE3_SLOT_SEQUENCE: readonly HeaderZone3Slot[] = [
  'secondary',
  'add',
  'more',
  'primary',
  'notes',
  'phone-search',
  'mock',
  'profile',
] as const

/**
 * Determines which search implementation owns Zone 2.
 * Precedence:
 * 1. Page Portal Search (`WorkspaceHeaderSearch`) if mounted
 * 2. Page Config Search (`PageHeaderSearchConfig` via `PageHeader`) if active
 * 3. Fallback Global Command Palette Search trigger
 */
export type SearchOwner = 'portal' | 'config' | 'command-palette' | 'none'

export function resolveSearchOwner(opts: {
  isPhone: boolean
  hasPortalSearch: boolean
  hasConfigSearch: boolean
  isDispatch: boolean
}): SearchOwner {
  if (opts.isPhone) return 'none'
  if (opts.hasPortalSearch) return 'portal'
  if (opts.hasConfigSearch) return 'config'
  if (opts.isDispatch) return 'none'
  return 'command-palette'
}

/**
 * Resolves phone search behavior in Zone 3:
 * - 'panel': MobileHeaderSearch trigger that opens search panel beneath header
 * - 'trigger': CommandPalette trigger button
 * - 'none': When search is inside More menu or route does not have search
 */
export type PhoneSearchKind = 'panel' | 'trigger' | 'none'

export function resolvePhoneSearchKind(opts: {
  isPhone: boolean
  searchInMore?: boolean | undefined
  hasPortalSearch: boolean
  hasConfigSearch: boolean
  isDispatch: boolean
}): PhoneSearchKind {
  if (!opts.isPhone || opts.searchInMore) return 'none'
  if (opts.hasConfigSearch && !opts.hasPortalSearch) return 'panel'
  if (!opts.hasConfigSearch && !opts.isDispatch && !opts.hasPortalSearch) return 'trigger'
  return 'none'
}
