import { useRef, useState, useMemo, useEffect, isValidElement, lazy, Suspense, type ReactNode } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import Icon, { type IconName } from '../ui/Icon'
import { useAuth } from '../../lib/auth'
import { useViewport } from '../../lib/device'
import { useCompactHeader } from '../../lib/headerRoom'
import { openCommandPalette } from './CommandPalette'
import { useSync } from '../../lib/syncContext'
import { useOptionalWorkspace, type PageHeaderSearchConfig } from '../../lib/workspaceContext'
import { InfoTooltip } from '../ui/InfoTooltip'
import { Button } from '../ui/Button'
import { ConfirmDialog } from '../ui/ConfirmDialog'
import type { OverflowMenuItem } from '../ui/OverflowMenu'
import { extractValidActions, PageActions, ActionsOverflowMenu, type PageActionsProps } from '../ui/PageActions'
import {
  type PageActionItem,
  type PageActionContext,
  resolvePageActions,
  isActionEnabled,
  isActionVisible,
} from '../ui/header/pageActionRegistry'
import { AddDropdownButton } from '../ui/header/PageHeader'
import { GlobalAddMenu } from '../ui/creation/GlobalAddMenu'
import { MobileHeaderSearch } from './MobileHeaderSearch'
import { UnsavedChangesIndicator } from '../ui/header/UnsavedChangesIndicator'
import { IS_MOCK } from '../../lib/supabase'
import { resolveSearchOwner, resolvePhoneSearchKind } from './shellLayoutContract'
import './shell.css'

const HandoverSheet = lazy(() => import('../../modules/auth/HandoverSheet'))
const InternalNotesDrawer = lazy(() => import('../../modules/notes/InternalNotesDrawer'))

export interface Crumb {
  label: string
  to?: string
}

const DEFAULT_PAGE_INFO: Record<string, string> = {
  Today: 'Prepare pickups, receive returns, and keep equipment moving.',
  Dashboard: 'Prepare pickups, receive returns, and keep equipment moving.',
  Rentals: 'Manage bookings, pickups, returns, and turnaround states.',
  'New Rental': 'Create a new rental booking, select dates, and assign inventory.',
  Calendar: 'Master operational schedule of deliveries, returns, and bookings.',
  Operations: 'Daily turnaround workflows: packing, inspection, dispatch, and check-in.',
  Inventory: 'Equipment catalog, serial tracking, availability, and condition.',
  Clients: 'Client directory, contacts, rental history, and credit terms.',
  Finance: 'Invoices, payments, daily closing, and financial ledgers.',
  Documents: 'Rental agreements, delivery notes, and verified handovers.',
  Analytics: 'Fleet utilization, revenue metrics, and operational performance.',
  Reports: 'Fleet utilization, revenue metrics, and operational performance.',
  'Crew Assist': 'Technician rosters, driver dispatch, and field assignments.',
  'Team Notes': 'Operational scratchpad, shift handovers, gear defects & field alerts.',
  Tools: 'Calculators, pricing sandbox, and technical utilities.',
  Settings: 'System configuration, warehouse locations, and staff permissions.',
}

interface HeaderProps {
  /** Breadcrumb trail. The first entry renders in the theme accent. */
  crumbs: Crumb[]
  searchPlaceholder?: string
  /** Right-hand action cluster, rendered before the fixed chrome. */
  actions?: ReactNode
}

// Law 15: keep the shared icon target at least 44px at every width.
const iconBtn = {
  width: 44,
  height: 44,
  minWidth: 44,
  minHeight: 44,
  borderRadius: 'var(--r-btn, 8px)',
  border: '1px solid var(--border)',
  background: 'transparent',
  color: 'var(--text2)',
  cursor: 'pointer',
  display: 'grid',
  placeItems: 'center',
  flexShrink: 0,
  boxSizing: 'border-box' as const,
} as const

/**
 * Universal Compact Single-Row Global Application Header.
 *
 * Implements the single-row standard:
 * Desktop layout: [Page Icon + Title / Status] — [Search] — [Add ▼] [Primary Action] [More ⋯] [Messages] [Avatar]
 *
 * Invariants:
 * - Exactly ONE horizontal row.
 * - Fixed height 64px (--header-h).
 * - Zero wrapping (flex-wrap: nowrap).
 * - No second toolbar row anywhere.
 * - Dropdowns float above content.
 */
export default function Header({ crumbs, actions }: HeaderProps) {
  const { user, logout, lockNow, hasPin } = useAuth()
  const sync = useSync()
  const syncStatus = sync?.status ?? (sync as { syncStatus?: string } | undefined)?.syncStatus ?? 'synced'
  const pendingCount = sync?.pendingCount ?? 0
  const syncError = sync?.error
  const triggerSync = sync?.triggerSync ?? (async () => {})
  const isAbnormalSync = syncStatus !== 'synced' || pendingCount > 0
  const navigate = useNavigate()
  const vp = useViewport()
  const isPhone = vp === 'phone'
  const isTablet = vp === 'tablet'
  const compactHeader = useCompactHeader()
  const isDispatch = crumbs.some((crumb) => crumb.label === 'Today' || crumb.label === 'Dashboard')
  const [profileOpen, setProfileOpen] = useState(false)
  const [showHandover, setShowHandover] = useState(false)
  const [notesOpen, setNotesOpen] = useState(false)
  const [notesVisited, setNotesVisited] = useState(false)
  useEffect(() => { if (notesOpen) setNotesVisited(true) }, [notesOpen])
  const [activeConfirmAction, setActiveConfirmAction] = useState<PageActionItem | null>(null)
  const [showMockDialog, setShowMockDialog] = useState(false)
  const ws = useOptionalWorkspace()
  const profileBtnRef = useRef<HTMLButtonElement>(null)

  const hData = ws?.headerData

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.altKey && (e.key === 'n' || e.key === 'N')) {
        e.preventDefault()
        setNotesOpen((v) => !v)
      }
    }
    const handleOpenNotes = () => setNotesOpen(true)
    window.addEventListener('keydown', handleKeyDown)
    window.addEventListener('babin:open-notes', handleOpenNotes)
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
      window.removeEventListener('babin:open-notes', handleOpenNotes)
    }
  }, [])

  const activeCrumb = crumbs[crumbs.length - 1]?.label || crumbs[0]?.label || ''

  // RULING 2026-10-13: the page's registered title names the current crumb, and a
  // current crumb that only repeats its parent ("Clients › Clients") collapses into it.
  const displayCrumbs = useMemo((): Crumb[] => {
    const title = hData?.title && hData.title !== 'Babin Rentals OS' ? hData.title : null
    const named = crumbs.map((c, i) => (i === crumbs.length - 1 && title ? { ...c, label: title } : c))
    const current = named[named.length - 1]
    const parent = named[named.length - 2]
    if (current && parent && current.label === parent.label) return [...named.slice(0, -2), { label: parent.label }]
    return named
  }, [crumbs, hData?.title])

  // On a phone only the current crumb shows, so its nearest linked ancestor becomes a back button.
  const autoBack = useMemo(() => {
    if (!isPhone || hData?.backHref || hData?.onBack) return null
    for (let i = displayCrumbs.length - 2; i >= 0; i--) {
      const c = displayCrumbs[i]
      if (c?.to) return { to: c.to, label: c.label }
    }
    return null
  }, [isPhone, hData?.backHref, hData?.onBack, displayCrumbs])

  const effectiveInfo = useMemo(() => {
    if (ws?.pageInfo) return ws.pageInfo
    if (hData?.description) return hData.description
    for (let i = crumbs.length - 1; i >= 0; i--) {
      const label = crumbs[i]?.label
      if (label && DEFAULT_PAGE_INFO[label]) {
        return DEFAULT_PAGE_INFO[label]
      }
    }
    return null
  }, [ws?.pageInfo, hData?.description, crumbs])

  const handleLogoutRequest = () => {
    if (!user) return
    const needsHandover = ['Warehouse', 'Technician', 'Driver'].includes(user.role)
    if (needsHandover) {
      setShowHandover(true)
    } else {
      logout()
      navigate('/login')
    }
  }

  const initials = (user?.name || 'BR').slice(0, 2).toUpperCase()

  // Evaluate action registry from workspace header data if available
  const hasDirty = Boolean(hData?.unsavedChanges || hData?.isDirty)
  const actionContext: PageActionContext = useMemo(
    () => ({
      role: user?.role,
      workflowState: hData?.workflowState,
      isDirty: hasDirty,
    }),
    [user?.role, hData?.workflowState, hasDirty]
  )

  const resolved = hData?.actionsConfig
    ? resolvePageActions(hData.actionsConfig, actionContext)
    : null
  const primaryActionStatus = resolved?.primary ? isActionEnabled(resolved.primary, actionContext) : null
  // Bulk actions use the same permissions, predicates and loading gates as ordinary actions.
  const visibleBulkActions = hData?.bulkSelection?.actions.filter((action) => isActionVisible(action, actionContext)) ?? []

  const handleActionClick = (action: PageActionItem, e?: React.MouseEvent) => {
    if (action.confirm) {
      setActiveConfirmAction(action)
      return
    }
    void action.onClick?.(e)
  }

  // Legacy actions fallback
  const combinedLegacyActions = [
    ...(actions ? extractValidActions(actions) : []),
    ...(hData?.actions ? extractValidActions(hData.actions) : []),
  ]

  // Older pages pass a <PageActions/> element instead of the typed action
  // registry. Split that element into the SAME shared header slots rather than
  // rendering its whole toolbar inside the Save/Confirm position.
  const legacyGroups = combinedLegacyActions
    .filter((node) => isValidElement(node) && node.type === PageActions)
    .map((node) => (node as React.ReactElement<PageActionsProps>).props)
  const looseActions = combinedLegacyActions.filter((node) => !(isValidElement(node) && node.type === PageActions))
  const loosePrimary = looseActions.filter(
    (node) => isValidElement(node) && (node.props as { variant?: string }).variant === 'primary',
  )
  const looseSecondary = looseActions.filter((node) => !loosePrimary.includes(node))
  const allLegacyPrimary = [
    ...legacyGroups.flatMap((group) => extractValidActions(group.primary)),
    ...loosePrimary,
  ]
  // Inventory, Clients and Bundles historically pass GlobalAddMenu as a
  // PageActions primary. Treat that as ADD, never as the Save/Confirm CTA.
  const legacyAdd = allLegacyPrimary.find((node) => isValidElement(node) && node.type === GlobalAddMenu)
  const legacyPrimary = allLegacyPrimary.filter((node) => node !== legacyAdd)
  // Extra includes contextual nav controls (Calendar Today/date steppers)
  // and record badges. These are NOT secondary commands. Keep their own
  // desktop positions visible even when secondary slots fill up.
  const legacyContext = legacyGroups.flatMap((group) => extractValidActions(group.extra))
  const legacySecondary = [
    ...legacyGroups.flatMap((group) => extractValidActions(group.secondary)),
    ...looseSecondary,
    ...legacyPrimary.slice(1),
  ]
  const visibleLegacySecondaryCount = !compactHeader ? Math.max(0, 2 - (resolved?.secondary.length ?? 0)) : 0
  const visibleLegacySecondary = [
    ...(!compactHeader ? legacyContext : []),
    ...legacySecondary.slice(0, visibleLegacySecondaryCount),
  ]
  const moreLegacySecondary = [
    ...(compactHeader ? legacyContext : []),
    ...legacySecondary.slice(visibleLegacySecondaryCount),
  ]
  const legacyOverflowItems = legacyGroups.flatMap((group) =>
    Array.isArray(group.overflow) ? (group.overflow as OverflowMenuItem[]) : [],
  )
  const customLegacyOverflow = legacyGroups
    .map((group) => !Array.isArray(group.overflow) ? group.overflow : null)
    .filter((node): node is ReactNode => node != null)

  // Search configuration from workspace header data
  const isSearchConfig = Boolean(
    hData?.search &&
    typeof hData.search === 'object' &&
    'value' in hData.search &&
    'onChange' in hData.search
  )
  const searchConfig = isSearchConfig ? (hData?.search as PageHeaderSearchConfig) : null

  const searchOwner = resolveSearchOwner({
    isPhone,
    hasPortalSearch: Boolean(ws?.hasPageSearch),
    hasConfigSearch: Boolean(searchConfig),
    isDispatch,
  })

  const phoneSearchKind = resolvePhoneSearchKind({
    isPhone,
    searchInMore: hData?.searchInMore,
    hasPortalSearch: Boolean(ws?.hasPageSearch),
    hasConfigSearch: Boolean(searchConfig),
    isDispatch,
  })

  // RULING 2026-10-15 (row 24): the header search is the page's one search, and its placeholder
  // says "(press /)". On a phone MobileHeaderSearch answers the key; at tablet and desktop
  // nothing did, so `/` focused nothing. A page that wires its own `/` (Today, Rentals,
  // Queues, Notes) still wins: it prevents default first, or refocuses after this runs.
  // Revert = delete this effect and `searchWrapRef`.
  const searchWrapRef = useRef<HTMLLabelElement>(null)
  const hasHeaderSearch = !isPhone && searchOwner === 'config' && searchConfig !== null
  useEffect(() => {
    if (!hasHeaderSearch) return
    const handleSlash = (e: KeyboardEvent) => {
      if (e.key !== '/' || e.defaultPrevented || e.isComposing || e.ctrlKey || e.metaKey || e.altKey) return
      const target = e.target instanceof Element ? e.target : null
      if (target?.closest('input, textarea, select, [contenteditable]:not([contenteditable="false"]), [role="textbox"], [role="dialog"]')) return
      if (document.querySelector('[role="dialog"][aria-modal="true"], dialog[open]')) return
      const input = searchWrapRef.current?.querySelector('input')
      if (!input) return
      e.preventDefault()
      input.focus()
    }
    window.addEventListener('keydown', handleSlash)
    return () => window.removeEventListener('keydown', handleSlash)
  }, [hasHeaderSearch])

  // Overflow items: excess secondary actions + overflow registry actions
  const overflowItems: OverflowMenuItem[] = useMemo(() => {
    if (!resolved) return []
    const items: OverflowMenuItem[] = []

    // RULING 2026-10-23: registry actions follow the header's available width, including an expanded desktop sidebar.
    if (compactHeader) {
      resolved.secondary.forEach((sec) => {
        const status = isActionEnabled(sec, actionContext)
        items.push({
          label: sec.label,
          icon: sec.icon ?? ('circle' as IconName),
          onClick: () => handleActionClick(sec),
          ...(status.reason ? { unavailable: status.reason } : {}),
        })
      })
    }

    resolved.overflow.forEach((item) => {
      const status = isActionEnabled(item, actionContext)
      items.push({
        label: item.label,
        icon: item.icon ?? ('more_vert' as IconName),
        onClick: () => handleActionClick(item),
        ...(status.reason ? { unavailable: status.reason } : {}),
      })
    })

    // On phone, team internal notes collapses into the overflow menu so it remains accessible without occupying a slot
    if (isPhone) {
      items.push({
        label: 'Team Internal Notes',
        icon: 'message' as IconName,
        onClick: () => setNotesOpen(true),
      })
    }

    return items
  }, [resolved, compactHeader, isPhone, actionContext])

  return (
    <>
      <header
        className="app-global-header"
        style={{
          display: 'flex',
          alignItems: 'center',
          flexWrap: 'nowrap',
          minHeight: 'var(--header-h)',
          height: 'var(--header-h)',
          maxHeight: 'var(--header-h)',
          padding: isPhone ? '0 12px' : '0 20px',
          gap: isPhone ? 4 : 8,
          flexShrink: 0,
          borderBottom: '1px solid var(--border)',
          background: 'var(--sidebar)',
          backdropFilter: 'blur(20px)',
          WebkitBackdropFilter: 'blur(20px)',
          transition: 'background-color var(--dur-theme) ease',
          position: 'sticky',
          top: 0,
          zIndex: 20,
          boxSizing: 'border-box',
          overflow: 'visible',
        }}
      >
        {/* =========================================================================
            ZONE 1: LEFT ZONE [Back / Title / Breadcrumb / Status / Info]
            ========================================================================= */}
        <div
          className="app-global-header__breadcrumbs"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            minWidth: isPhone ? '120px' : isTablet ? '140px' : '180px',
            // On phone, keep at least 120px so module names (Rentals, Today, Finance) and IDs do not truncate to Re... or 71...
            // On desktop a module title (one crumb — "Inventory") does not shrink; the search beside it yields first.
            flex: isPhone ? '1 1 auto' : isTablet || displayCrumbs.length > 1 ? '0 1 auto' : '0 0 auto',
            maxWidth: isPhone ? undefined : 'min(520px, 45vw)',
            overflow: 'hidden',
          }}
        >
          {/* RULING 2026-10-15: the page's filter toggle is always the first control at the very left of the header, and its drawer opens from the left. */}
          <span
            className="workspace-page-actions app-global-header__action-slot app-global-header__action-slot--filters"
            data-header-slot="filters"
            ref={ws?.setHeaderActionsElement}
          />

          {/* Back navigation button if registered */}
          {hData?.backHref && (
            <Link
              to={hData.backHref}
              aria-label={hData.backLabel ?? 'Back'}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                minWidth: 44,
                minHeight: 44,
                color: 'var(--text2)',
                textDecoration: 'none',
                flexShrink: 0,
              }}
            >
              <Icon name="chevron_left" size={18} />
            </Link>
          )}
          {hData?.onBack && !hData?.backHref && (
            <button
              type="button"
              onClick={hData.onBack}
              aria-label={hData.backLabel ?? 'Back'}
              style={{
                ...iconBtn,
                color: 'var(--text2)',
              }}
            >
              <Icon name="chevron_left" size={18} />
            </button>
          )}
          {autoBack && (
            <Link
              to={autoBack.to}
              aria-label={`Back to ${autoBack.label}`}
              title={`Back to ${autoBack.label}`}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                minWidth: 44,
                minHeight: 44,
                color: 'var(--text2)',
                textDecoration: 'none',
                flexShrink: 0,
              }}
            >
              <Icon name="chevron_left" size={18} />
            </Link>
          )}

          {/* Module or entity icon */}
          {hData?.icon && (
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                color: 'var(--nav-active-accent)',
                flexShrink: 0,
              }}
              aria-hidden="true"
            >
              <Icon name={hData.icon} size={18} fill />
            </span>
          )}

          {/* Breadcrumb / Title Navigation */}
          <nav aria-label="Breadcrumb" style={{ minWidth: 0, overflow: 'hidden' }}>
            <ol style={{ display: 'flex', alignItems: 'center', gap: 7, margin: 0, padding: 0, listStyle: 'none', minWidth: 0 }}>
              {(isPhone && displayCrumbs.length > 1 ? [displayCrumbs[displayCrumbs.length - 1]!] : displayCrumbs).map((c, i, arr) => {
                const last = i === arr.length - 1
                const labelText = c.label

                const labelEl = (
                  <span
                    aria-current={last ? 'page' : undefined}
                    title={labelText}
                    style={{
                      fontSize: last ? 'clamp(1.05rem, 0.95rem + 0.4vw, 1.3rem)' : 'var(--t-ui)',
                      fontFamily: last ? 'var(--font-display, inherit)' : undefined,
                      letterSpacing: last ? '-0.02em' : undefined,
                      lineHeight: 1.2,
                      fontWeight: i === 0 ? 600 : last ? 600 : 500,
                      color: i === 0 ? 'var(--nav-active-accent)' : last ? 'var(--text)' : 'var(--text2)',
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      display: 'inline-block',
                      maxWidth: isPhone ? '100%' : 'min(420px, 36vw)',
                    }}
                  >
                    {labelText}
                  </span>
                )
                return (
                  <li key={`${i}-${c.label}`} style={{ display: 'flex', alignItems: 'center', gap: 7, minWidth: 0, flexShrink: last ? 1 : 0 }}>
                    {i > 0 && <Icon name="chevron_right" size={13} style={{ color: 'var(--muted)', flexShrink: 0 }} />}
                    {c.to && !last ? (
                      // RULING 2026-10-15: a parent crumb is a link, so it gets the 44px hit height (Law 15);
                      // it measured 45×17 on Booking Detail. Width and the flex rule above are unchanged.
                      <Link to={c.to} style={{ textDecoration: 'none', color: 'inherit', display: 'inline-flex', alignItems: 'center', minHeight: 44, minWidth: 0 }}>
                        {labelEl}
                      </Link>
                    ) : (
                      labelEl
                    )}
                  </li>
                )
              })}
            </ol>
          </nav>

          {/* Contextual record status badge */}
          {hData?.status && (
            <span
              className="app-global-header__status"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                flexShrink: 0,
              }}
            >
              {hData.status}
            </span>
          )}

          {/* Unsaved changes dirty state indicator */}
          {hasDirty && (
            <UnsavedChangesIndicator compact />
          )}

          {/* Page Info Tooltip */}
          <span
            style={{
              display: isPhone || isTablet ? 'none' : 'inline-flex',
              flexShrink: 0,
              visibility: effectiveInfo ? 'visible' : 'hidden',
            }}
            aria-hidden={effectiveInfo ? undefined : true}
          >
            <InfoTooltip
              content={effectiveInfo ?? 'Page info'}
              size={16}
              label={activeCrumb ? `${activeCrumb} info` : 'Page info'}
              style={{ flexShrink: 0 }}
            />
          </span>
        </div>

        {/* =========================================================================
            ZONE 2: CENTER ZONE [Search & Sync Status]
            ========================================================================= */}
        {!isPhone && (
          <div
            className="app-global-header__center"
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flex: '0 1 420px',
              minWidth: 0,
              maxWidth: isTablet ? '280px' : '420px',
              gap: 8,
              margin: '0 auto',
            }}
          >
            {/* If the active page provided a search configuration, render the unified search input */}
            {searchOwner === 'config' && searchConfig ? (
              /* RULING 2026-10-15 (zoom audit): a label, so the whole 44px box focuses the
                 field. The input alone measured 22px tall on every page (Law 15). */
              <label
                ref={searchWrapRef}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  width: '100%',
                  minWidth: 0,
                  cursor: 'text',
                  height: 44,
                  minHeight: 44, /* TouchInset compliant (Law 15) */
                  padding: '0 12px',
                  borderRadius: 'var(--r-input, 8px)',
                  background: 'var(--input-bg)',
                  border: '1px solid var(--input-border)',
                  boxShadow: 'var(--specular-rim), 0 1px 3px rgba(0, 0, 0, 0.04)',
                  boxSizing: 'border-box',
                }}
              >
                <Icon name="search" size={15} style={{ color: 'var(--muted)', flexShrink: 0 }} />
                <input
                  ref={searchConfig.inputRef}
                  type="search"
                  value={searchConfig.value}
                  onChange={(e) => searchConfig.onChange(e.target.value)}
                  onKeyDown={searchConfig.onKeyDown}
                  placeholder={searchConfig.placeholder ?? 'Search page…'}
                  aria-label={searchConfig.ariaLabel ?? `Search ${hData?.title ?? 'page'}`}
                  style={{
                    border: 'none',
                    background: 'transparent',
                    color: 'var(--text)',
                    fontSize: 'var(--t-ui)',
                    outline: 'none',
                    width: '100%',
                    height: '100%',
                    minWidth: 0,
                    minHeight: 44,
                    padding: 0,
                    fontFamily: 'inherit',
                  }}
                />
                {Boolean(searchConfig.value) && (
                  <button
                    type="button"
                    onClick={() => {
                      searchConfig.onChange('')
                      searchConfig.onClear?.()
                    }}
                    aria-label="Clear search query"
                    style={{
                      background: 'transparent',
                      border: 'none',
                      color: 'var(--muted)',
                      cursor: 'pointer',
                      padding: 0,
                      display: 'grid',
                      placeItems: 'center',
                      minWidth: 44,
                      minHeight: 44,
                    }}
                  >
                    <Icon name="close" size={13} />
                  </button>
                )}
              </label>
            ) : searchOwner === 'command-palette' ? (
              <button
                type="button"
                onClick={() => openCommandPalette()}
                aria-label="Search bookings, clients, equipment and pages"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 'var(--sp-sm)',
                  width: '100%',
                  flexShrink: 1,
                  minWidth: 0,
                  height: 44,
                  minHeight: 44, /* TouchInset compliant (Law 15) */
                  padding: '0 14px',
                  borderRadius: 'var(--r-input)',
                  background: 'var(--input-bg)',
                  border: '1px solid var(--input-border)',
                  boxShadow: 'var(--specular-rim), 0 1px 3px rgba(0, 0, 0, 0.04)',
                  boxSizing: 'border-box',
                  cursor: 'pointer',
                  textAlign: 'left',
                  transition: 'border-color var(--dur-fast) var(--ease), box-shadow var(--dur-fast) var(--ease)',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.borderColor = 'var(--input-focus)'
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.borderColor = 'var(--input-border)'
                }}
              >
                <Icon name="search" size={15} style={{ color: 'var(--muted)', flexShrink: 0 }} />
                <span
                  style={{
                    flex: 1,
                    minWidth: 0,
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    fontSize: 'var(--t-ui)',
                    color: 'var(--muted)',
                  }}
                >
                  Search or scan…
                </span>
                {!isTablet && (
                  <kbd
                    className="figure"
                    style={{
                      fontSize: '11px',
                      fontWeight: 600,
                      color: 'var(--muted)',
                      flexShrink: 0,
                      marginLeft: 'auto',
                      padding: '2px 8px',
                      borderRadius: 999,
                      background: 'var(--card)',
                      border: '1px solid var(--border)',
                      boxShadow: '0 1px 2px rgba(0, 0, 0, 0.04)',
                    }}
                  >
                    Ctrl+K / ⌘K
                  </kbd>
                )}
              </button>
            ) : null}

            {/* Mount point for pages that render their own search in the application header */}
            <span
              ref={ws?.setHeaderSearchElement}
              className="workspace-header-search"
              style={{
                display: searchOwner === 'portal' ? 'flex' : 'none',
                width: '100%',
                minWidth: 0,
              }}
            />

            {/* Outbox Sync Heartbeat badge slot */}
            <div
              className="header-sync-context"
              aria-hidden={isAbnormalSync ? undefined : true}
              style={{
                // RULING 2026-10-13: tablets reclaim the healthy sync placeholder for the page title/search.
                // RULING 2026-10-15 (zoom audit): desktops too. The hidden 104px slot plus its gap
                // truncated Finance's title at 1280 and pushed the search over its info button.
                // Revert = `isTablet && !isAbnormalSync ? 'none' : 'flex'`.
                display: !isAbnormalSync ? 'none' : 'flex',
                alignItems: 'center',
                gap: 8,
                flexShrink: 0,
                minWidth: 104,
                justifyContent: 'flex-start',
                visibility: isAbnormalSync ? 'visible' : 'hidden',
              }}
            >
              <button
                className="header-sync-control tap"
                type="button"
                tabIndex={isAbnormalSync ? 0 : -1}
                onClick={() => triggerSync()}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  height: 38,
                  minHeight: 44,
                  minWidth: 96,
                  justifyContent: 'center',
                  whiteSpace: 'nowrap',
                  padding: '4px 11px',
                  borderRadius: 999,
                  background:
                    syncStatus === 'syncing'
                      ? 'var(--nav-active-bg)'
                      : pendingCount > 0 || syncStatus === 'pending'
                      ? 'rgba(232, 118, 45, 0.12)'
                      : syncStatus === 'offline'
                      ? 'var(--surface-2)'
                      : syncStatus === 'error'
                      ? 'var(--danger-soft)'
                      : 'var(--surface-2)',
                  border: '1px solid var(--border)',
                  boxShadow: 'var(--specular-rim)',
                  fontSize: '11px',
                  fontWeight: 600,
                  color:
                    syncStatus === 'syncing'
                      ? 'var(--primary-text)'
                      : pendingCount > 0 || syncStatus === 'pending'
                      ? 'var(--warn-text)'
                      : syncStatus === 'offline'
                      ? 'var(--muted)'
                      : syncStatus === 'error'
                      ? 'var(--danger-text)'
                      : 'var(--success-text)',
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                  transition: 'all var(--dur-fast) var(--ease)',
                }}
                title={
                  syncStatus === 'syncing'
                    ? 'Syncing with Supabase Cloud...'
                    : pendingCount > 0
                    ? `${pendingCount} offline mutations pending. Click to sync now.`
                    : syncStatus === 'offline'
                    ? 'Offline Mode active (Dexie cache). Click to sync when reconnected.'
                    : syncStatus === 'error'
                    ? `Sync failed: ${syncError ?? 'no reason reported'}. Click to retry.`
                    : 'Cloud Database & Local Cache Synced. Click to force sync.'
                }
              >
                <span
                  style={{
                    width: 6,
                    height: 6,
                    borderRadius: '50%',
                    display: 'inline-block',
                    background:
                      syncStatus === 'syncing'
                        ? 'var(--primary-text)'
                        : pendingCount > 0 || syncStatus === 'pending'
                        ? 'var(--warn-text)'
                        : syncStatus === 'error'
                        ? 'var(--danger-text)'
                        : syncStatus === 'offline'
                        ? 'var(--muted)'
                        : 'var(--success-text)',
                    boxShadow:
                      syncStatus === 'syncing'
                        ? '0 0 6px var(--primary-text)'
                        : syncStatus === 'error'
                        ? '0 0 6px var(--danger-text)'
                        : undefined,
                  }}
                />
                <span>
                  {syncStatus === 'syncing'
                    ? 'Syncing…'
                    : pendingCount > 0
                    ? `${pendingCount} Queued`
                    : syncStatus === 'offline'
                    ? 'Offline'
                    : syncStatus === 'error'
                    ? 'Sync Error'
                    : 'Synced'}
                </span>
              </button>
            </div>
          </div>
        )}

        {/* =========================================================================
            ZONE 3: RIGHT ZONE [Add ▼] [Contextual Actions] [More ⋯] [Save/Confirm] [Messages] [Avatar]
            ========================================================================= */}
        <div
          className="app-global-header__right"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: isPhone ? 0 : 8,
            flexShrink: 0,
            marginLeft: 'auto',
            minWidth: 0,
            flexWrap: 'nowrap',
          }}
        >
          {/* Context actions vary by page but never displace Filter or
              move a primary CTA past the More button. */}
          <span className="app-global-header__action-slot app-global-header__action-slot--secondary" data-header-slot="secondary">
                <span ref={ws?.setHeaderSecondaryActionsElement} className="workspace-header-secondary-actions" />
                {!compactHeader && visibleLegacySecondary.map((action, idx) => (
                  <span key={isValidElement(action) && action.key != null ? String(action.key) : `hdr-secondary-${idx}`}>{action}</span>
                ))}
                {!compactHeader && resolved?.secondary?.map((sec) => {
                  const statusCheck = isActionEnabled(sec, actionContext)
                  return (
                    <Button
                      key={sec.id}
                      variant={sec.variant ?? 'secondary'}
                      icon={sec.icon}
                      onClick={(e) => handleActionClick(sec, e)}
                      disabled={!statusCheck.enabled}
                      style={{ minHeight: 44, padding: '0 12px' }}
                      {...(statusCheck.reason ? { title: statusCheck.reason } : {})}
                    >
                      {sec.label}
                    </Button>
                  )
                })}
              </span>

              {/* CANONICAL BUTTON POSITIONS — [Secondary] [Add] [More] [Page CTA / Save / Confirm].
                  The Filters toggle is NOT here: it is the first control at the far left (RULING 2026-10-15). */}

              {/* All Add actions share one location; page-specific creation still
                  honours its permissions and showAddMenu setting. */}
              <span className="app-global-header__action-slot app-global-header__action-slot--add" data-header-slot="add">
                <span ref={ws?.setHeaderAddActionsElement} className="workspace-header-add-actions" />
                {resolved?.add ? (
                  <AddDropdownButton action={resolved.add} />
                ) : legacyAdd ? legacyAdd : !ws?.hasPageAddActions && !ws?.hasPageRightActions && !resolved?.primary && combinedLegacyActions.length === 0 && hData?.showAddMenu !== false ? (
                  <GlobalAddMenu module={hData?.module} contextData={hData?.creationContext} />
                ) : null}
              </span>

              <span className="app-global-header__action-slot app-global-header__action-slot--more" data-header-slot="more">
                <span ref={ws?.setHeaderMoreActionsElement} className="workspace-header-more-actions" />
                {(overflowItems.length > 0 || moreLegacySecondary.length > 0 || legacyOverflowItems.length > 0 || customLegacyOverflow.length > 0) && (
                  <ActionsOverflowMenu
                    ariaLabel="More actions"
                    actions={moreLegacySecondary}
                    overflowItems={[...overflowItems, ...legacyOverflowItems]}
                    customOverflowNode={customLegacyOverflow.length > 0 ? <>{customLegacyOverflow}</> : undefined}
                  />
                )}
              </span>

              {/* The rightmost page slot is always the final action before the
                  fixed Messages/Search/Profile chrome. This includes legacy
                  and portaled New Rental / Save / Confirm buttons. */}
              <span className="app-global-header__action-slot app-global-header__action-slot--primary" data-header-slot="primary">
                <span
                  ref={ws?.setHeaderRightActionsElement}
                  className="workspace-header-right-actions"
                />
                {!resolved?.primary && legacyPrimary[0] && <span className="app-global-header__legacy-primary">{legacyPrimary[0]}</span>}
                {resolved?.primary && (
                  <Button
                    variant={resolved.primary.variant ?? 'primary'}
                    icon={resolved.primary.icon}
                    onClick={(e) => handleActionClick(resolved.primary!, e)}
                    disabled={!primaryActionStatus?.enabled}
                    style={{ minHeight: 44, padding: '0 14px', fontWeight: 600 }}
                    {...(primaryActionStatus?.reason ? { title: primaryActionStatus.reason } : {})}
                  >
                    {resolved.primary.loading
                      ? resolved.primary.loadingLabel ?? `${resolved.primary.label}…`
                      : resolved.primary.label}
                  </Button>
                )}
              </span>

          <span ref={ws?.setHeaderInformationElement} className="workspace-header-information" data-header-slot="information" />

          {/* 7. Team Internal Notes Button (Alt+N) */}
          {!isPhone && <button
            type="button"
            onClick={() => setNotesOpen(true)}
            aria-label="Team internal notes"
            title="Team internal notes (Alt+N)"
            style={iconBtn}
          >
            <Icon name="message" size={17} />
          </button>}

          {/* Phone search is always in the same slot, whether a page has its
              own search or uses the global command palette. */}
          {phoneSearchKind !== 'none' && (
            <span className="app-global-header__phone-search" data-header-slot="search">
              <span ref={ws?.setHeaderPhoneSearchActionsElement} className="workspace-header-phone-search-actions" />
              {phoneSearchKind === 'panel' && searchConfig ? (
                <MobileHeaderSearch key={hData?.title ?? activeCrumb} config={searchConfig} title={hData?.title ?? activeCrumb} />
              ) : phoneSearchKind === 'trigger' ? (
                <button
                  type="button"
                  onClick={() => openCommandPalette()}
                  aria-label="Search"
                  title="Search"
                  style={iconBtn}
                >
                  <Icon name="search" size={17} />
                </button>
              ) : null}
            </span>
          )}

          {/* Mock Mode Icon Indicator (Law 15: >= 44x44px hit area) */}
          {IS_MOCK && !isPhone && (
            <button
              type="button"
              onClick={() => setShowMockDialog(true)}
              aria-label="Mock Mode Active"
              title="Mock Mode — Local test database active (click for options)"
              style={{
                ...iconBtn,
                color: 'var(--brand-mark)',
                position: 'relative',
              }}
            >
              <Icon name="flask" size={17} />
              <span
                style={{
                  position: 'absolute',
                  top: 9,
                  right: 9,
                  width: 6,
                  height: 6,
                  borderRadius: '50%',
                  background: 'var(--brand-mark)',
                }}
              />
            </button>
          )}

          {/* 9. User Profile Trigger (Law 15: >= 44x44px hit area) */}
          <div style={{ position: 'relative' }}>
            <button
              ref={profileBtnRef}
              type="button"
              onClick={() => setProfileOpen((v) => !v)}
              aria-label={`${initials} — user profile${IS_MOCK ? ' · Mock mode' : ''}`}
              title={IS_MOCK ? 'User profile · Mock mode' : 'User profile'}
              aria-expanded={profileOpen}
              style={{
                ...iconBtn,
                padding: 0,
              }}
            >
              <span
                aria-hidden="true"
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: 'var(--r-badge)',
                  background: 'var(--card2)',
                  border: '1px solid var(--border)',
                  display: 'grid',
                  placeItems: 'center',
                  color: 'var(--text)',
                  fontSize: 'var(--t-meta)',
                  fontWeight: 700,
                }}
              >
                {IS_MOCK && isPhone ? 'Mock' : initials}
              </span>
            </button>

            {profileOpen && (
              <>
                <div
                  style={{ position: 'fixed', inset: 0, zIndex: 90 }}
                  onClick={() => {
                    setProfileOpen(false)
                    const active = document.activeElement as Element | null
                    if (!active || active === document.body) profileBtnRef.current?.focus()
                  }}
                  aria-hidden="true"
                />
                <div
                  role="dialog"
                  aria-label="User profile"
                  title="User profile"
                  onKeyDown={(event) => {
                    if (event.key === 'Escape') {
                      setProfileOpen(false)
                      profileBtnRef.current?.focus()
                    }
                  }}
                  style={{
                    position: 'absolute',
                    top: 'calc(100% + 8px)',
                    right: 0,
                    zIndex: 91,
                    width: 230,
                    background: 'var(--card)',
                    border: '1px solid var(--border)',
                    borderRadius: 'var(--r-card)',
                    boxShadow: 'var(--shadow-modal)',
                    padding: '12px 14px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 10,
                  }}
                >
                  <div style={{ borderBottom: '1px solid var(--border)', paddingBottom: 8 }}>
                    <div style={{ fontSize: 'var(--t-ui)', fontWeight: 700, color: 'var(--text)' }}>
                      {user?.name || 'Guest'}
                    </div>
                    <div style={{ fontSize: 'var(--t-meta)', color: 'var(--muted)', marginTop: 2 }}>
                      {user?.role || ''} · Kathmandu HQ
                    </div>
                  </div>
                  {isPhone && (
                    <Button variant="secondary" icon="message" onClick={() => {
                      setProfileOpen(false)
                      setNotesOpen(true)
                    }}>
                      Team internal notes
                    </Button>
                  )}
                  {/* RULING 2026-10-21: retain mock options in the phone
                      profile; a separate 44px control clipped primary actions. */}
                  {IS_MOCK && isPhone && (
                    <Button variant="secondary" icon="flask" onClick={() => {
                      setProfileOpen(false)
                      setShowMockDialog(true)
                    }}>Mock Mode Active</Button>
                  )}
                  {hasPin && (
                    <button
                      type="button"
                      onClick={() => {
                        setProfileOpen(false)
                        lockNow()
                      }}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 8,
                        minHeight: 44,
                        padding: '0 10px',
                        borderRadius: 'var(--r-sm)',
                        border: '1px solid var(--border)',
                        background: 'var(--card2)',
                        color: 'var(--text)',
                        fontSize: 'var(--t-ui)',
                        fontWeight: 600,
                        cursor: 'pointer',
                        fontFamily: 'inherit',
                      }}
                    >
                      <Icon name="lock" size={16} />
                      Lock Session
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => {
                      setProfileOpen(false)
                      handleLogoutRequest()
                    }}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                      minHeight: 44,
                      padding: '0 10px',
                      borderRadius: 'var(--r-sm)',
                      border: '1px solid transparent',
                      background: 'var(--btn-danger-bg)',
                      color: 'var(--btn-danger-fg)',
                      fontSize: 'var(--t-ui)',
                      fontWeight: 600,
                      cursor: 'pointer',
                      fontFamily: 'inherit',
                    }}
                  >
                    Log Out
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </header>

      {/* Floating Bulk Selection Toolbar */}
      {hData?.bulkSelection && hData.bulkSelection.count > 0 && (
        <aside
          role="region"
          aria-label="Bulk selection actions"
          className="bulk-selection-floating-bar"
          style={{
            position: 'fixed',
            bottom: isPhone ? 16 : 24,
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 90,
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            padding: '8px 16px',
            borderRadius: 999,
            background: 'var(--dropdown, var(--card))',
            border: '1px solid var(--border)',
            boxShadow: 'var(--shadow-modal), 0 10px 25px -5px rgba(0, 0, 0, 0.25)',
            backdropFilter: 'blur(16px)',
            WebkitBackdropFilter: 'blur(16px)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span
              style={{
                fontSize: 'var(--t-meta, 13px)',
                fontWeight: 700,
                padding: '2px 8px',
                borderRadius: 999,
                background: 'var(--primary-soft, rgba(37, 99, 235, 0.12))',
                color: 'var(--primary-text)',
                whiteSpace: 'nowrap',
              }}
            >
              {hData.bulkSelection.count} selected
            </span>
            <button
              type="button"
              onClick={hData.bulkSelection.onClear}
              style={{
                minHeight: 44,
                padding: '0 8px',
                background: 'transparent',
                border: 'none',
                color: 'var(--link, #2563eb)',
                cursor: 'pointer',
                fontWeight: 600,
                fontSize: 'var(--t-meta, 13px)',
              }}
            >
              Clear
            </button>
          </div>
          <div style={{ width: 1, height: 20, background: 'var(--border)', flexShrink: 0 }} />
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {visibleBulkActions.map((act) => {
              const status = isActionEnabled(act, actionContext)
              return (
                <Button
                  key={act.id}
                  variant={act.variant ?? 'secondary'}
                  icon={act.icon}
                  onClick={() => handleActionClick(act)}
                  disabled={!status.enabled}
                  style={{ height: 38, minHeight: 44, padding: isTablet && act.icon ? '0 8px' : '0 12px' }}
                  title={status.reason ?? act.label}
                  aria-label={act.label}
                >
                  {isTablet && act.icon ? null : (act.loading ? act.loadingLabel ?? `${act.label}…` : act.label)}
                </Button>
              )
            })}
          </div>
        </aside>
      )}

      {/* Confirmation Dialog for actions requiring confirmation */}
      {activeConfirmAction?.confirm && (
        <ConfirmDialog
          isOpen={true}
          title={activeConfirmAction.confirm.title}
          description={activeConfirmAction.confirm.description}
          confirmLabel={activeConfirmAction.confirm.confirmLabel}
          cancelLabel={activeConfirmAction.confirm.cancelLabel ?? 'Cancel'}
          variant={activeConfirmAction.confirm.variant === 'danger' ? 'danger' : 'default'}
          onClose={() => setActiveConfirmAction(null)}
          onConfirm={() => {
            const actionToRun = activeConfirmAction
            setActiveConfirmAction(null)
            void actionToRun.onClick?.()
          }}
        />
      )}

      <Suspense fallback={null}>
        {showHandover && (
          <HandoverSheet
            isOpen={showHandover}
            onClose={() => setShowHandover(false)}
            userName={user?.name}
            userRole={user?.role}
          />
        )}

        {(notesOpen || notesVisited) && <InternalNotesDrawer isOpen={notesOpen} onClose={() => setNotesOpen(false)} />}
      </Suspense>

      {showMockDialog && (
        <ConfirmDialog
          isOpen={true}
          title="Mock Mode Active"
          description="You are currently running Babin Rentals OS with a local in-browser mock database. Real database mutations are simulated locally. You can reset all local test data at any time."
          confirmLabel="Wipe Mock Data & Reload"
          cancelLabel="Close"
          variant="danger"
          onClose={() => setShowMockDialog(false)}
          onConfirm={() => {
            setShowMockDialog(false)
            try {
              localStorage.setItem('babin_data_wiped', 'true')
              localStorage.setItem('babin_internal_notes_v1', JSON.stringify([]))
              const toRemove: string[] = []
              for (let i = 0; i < localStorage.length; i++) {
                const k = localStorage.key(i)
                if (k && (k.startsWith('babin.mock.') || k.startsWith('sb-') || k.startsWith('babin-active-') || k.startsWith('babin-today-'))) {
                  toRemove.push(k)
                }
              }
              toRemove.forEach((k) => localStorage.removeItem(k))
              if (typeof indexedDB !== 'undefined') {
                try { indexedDB.deleteDatabase('babin.mock.storage.v1') } catch {}
                try { indexedDB.deleteDatabase('BabinOfflineQueue') } catch {}
              }
              window.location.reload()
            } catch {
              /* ignore */
            }
          }}
        />
      )}
    </>
  )
}
