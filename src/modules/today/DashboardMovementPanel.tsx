import { formatAd } from '../../lib/bs'
import { useMemo, type ReactNode } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import Icon, { type IconName } from '../../components/ui/Icon'
import { ReturnCountdown } from '../../components/ui/ReturnCountdown'
import { BsAdDate } from '../../components/ui/BsAdDate'
import { PageBody } from '../../components/ui/PageBody'
import { OverflowMenu } from '../../components/ui/OverflowMenu'
import { businessDayAd, has, movementAtAd, timeOf, type MovementRow } from '../../lib/queries/today'
import type { ListResult } from '../../lib/queries/useList'
import { useOperationsWorkspace } from '../operations/OperationsWorkspaceContext'
import { useAuth } from '../../lib/auth'
import { gateContext } from '../../lib/fieldGating'
import { IntelCard } from '../../components/ui/IntelCard'
import { movementGlance, movementDetail } from '../../data/movementIntel'
import { ClientIntelFromId } from '../../components/intel/ClientIntelFromId'
import type { BookingStatus, JobName } from '../../lib/workflow'

interface DashboardMovementPanelProps {
  side: 'outgoing' | 'incoming'
  title: string
  subtitle?: string | undefined
  icon: IconName
  list: ListResult<MovementRow>
  periodLabel: string
  onClearFilters: () => void
  filterControl?: ReactNode
  isToday?: boolean
  onLoadMore?: () => void
  hasMore?: boolean
  globalQuery?: string
  compactEmpty?: boolean
  onSelectPeriod?: (period: 'Tomorrow' | 'Today') => void
  emptyFooter?: ReactNode
  panelId?: string | undefined
  tabId?: string | undefined
}

export function dashboardAction(row: MovementRow, side: 'outgoing' | 'incoming'): {
  label: string
  job: JobName
} {
  if (side === 'incoming') {
    const stage = (row.status ?? '').toLowerCase()
    const note = (row.statusNote ?? '').toLowerCase()
    if (stage.includes('return') || stage.includes('reset') || note.includes('reset') || note.includes('clean')) {
      return { label: 'Cleaning & Reset', job: 'Reset' }
    }
    return { label: 'Return & Inspect', job: 'Return' }
  }

  // Outgoing
  if (row.status === 'Packed') {
    return { label: 'Handover', job: 'Handover' }
  }
  return { label: 'Start Packing', job: 'Pack' }
}

/*
 * Meaningful rows (ruled 8 Oct 2026, RULINGS-2026-10-08.md). Each visual names a
 * fact staff act on, derived only from fields the row already carries:
 *   · the date cell is WHEN it moves — and, for an overdue return, how late;
 *   · the readiness tag reads the stage (Booked = not packed yet, Packed = packed);
 *   · the mode tag reads `delivery_type`.
 * Every tag pairs an icon with words, so none of it is colour alone. A return
 * carries no tag: its date cell already says when it is due (RULINGS-2026-10-15).
 */
type TagTone = 'todo' | 'ready' | 'mode'
interface RowTag { tone: TagTone; icon: IconName; label: string }

const MODE_TAG: Record<string, { icon: IconName; label: string }> = {
  'Babin Delivery': { icon: 'truck', label: 'Delivery' },
  'Client Pickup': { icon: 'user', label: 'Client pickup' },
  Courier: { icon: 'package', label: 'Courier' },
  'Third Party': { icon: 'person', label: 'Third party' },
}

function rowTags(row: MovementRow, side: 'outgoing' | 'incoming'): RowTag[] {
  if (side !== 'outgoing') return []
  const tags: RowTag[] = [row.status === 'Packed'
    ? { tone: 'ready', icon: 'check', label: 'Packed' }
    : { tone: 'todo', icon: 'package', label: 'Not packed yet' }]
  const mode = row.deliveryType ? MODE_TAG[row.deliveryType] : undefined
  if (mode) tags.push({ tone: 'mode', ...mode })
  return tags
}

export default function DashboardMovementPanel({
  side,
  title,
  subtitle,
  icon,
  list,
  periodLabel,
  onClearFilters,
  filterControl,
  onLoadMore,
  hasMore = false,
  globalQuery = '',
  compactEmpty = false,
  onSelectPeriod,
  emptyFooter,
  panelId,
  tabId,
}: DashboardMovementPanelProps) {
  const navigate = useNavigate()
  const { openOperations } = useOperationsWorkspace()
  const { user } = useAuth()
  const intelGate = useMemo(() => gateContext(user?.role ?? 'Client'), [user?.role])
  const count = list.loading || list.error ? '—' : String(list.total ?? list.rows.length)
  const noun = side === 'outgoing' ? 'pickups' : 'returns'
  const panelSubtitle = compactEmpty ? `No ${noun} ${periodLabel}.` : subtitle
  const today = businessDayAd()
  // Visually place overdue returns before normal returns and apply instant search
  const rows = useMemo(() => {
    let baseRows = list.rows
    if (side === 'incoming') {
      const overdue: MovementRow[] = []
      const normal: MovementRow[] = []
      for (const r of list.rows) {
        if (has(r, 'Overdue')) overdue.push(r)
        else normal.push(r)
      }
      baseRows = [...overdue, ...normal]
    }

    const q = (globalQuery || '').trim().toLowerCase()
    if (!q) return baseRows

    return baseRows.filter((r) => {
      const clientMatch = (r.client ?? '').toLowerCase().includes(q)
      const bookingMatch = (r.bookingNo ?? '').toLowerCase().includes(q)
      const projectMatch = (r.project ?? '').toLowerCase().includes(q)
      const deliveryMatch = (r.deliveryType ?? '').toLowerCase().includes(q)
      return clientMatch || bookingMatch || projectMatch || deliveryMatch
    })
  }, [list.rows, side, globalQuery])

  return (
    <section id={panelId} role={tabId ? 'tabpanel' : undefined} tabIndex={tabId ? 0 : undefined} className={`movement-panel movement-panel--${side}${compactEmpty ? ' movement-panel--compact' : ''}`} aria-labelledby={tabId ?? `${side}-panel-title`}>
      <header className="movement-panel__header">
        <span className={`movement-panel__icon movement-panel__icon--${side}`} aria-hidden="true">
          <Icon name={icon} size={24} />
        </span>
        <div className="movement-panel__heading">
          <h2 id={`${side}-panel-title`}>
            <span>{title}</span>{' '}<span className="figure">{count}</span>
          </h2>
          {panelSubtitle && <p title={panelSubtitle}>{panelSubtitle}</p>}
        </div>
        <div className="movement-panel__rentals-action">
          <button
            type="button"
            onClick={() => navigate(side === 'outgoing' ? '/rentals?quick=Pickups+Today' : '/rentals?quick=Returns+Today')}
            className="movement-panel__rentals-btn press tap"
            title={`View all ${side === 'outgoing' ? 'pickups' : 'returns'} in Rentals list`}
            aria-label={`View all ${side === 'outgoing' ? 'pickups' : 'returns'} in Rentals list`}
          >
            <span>View in Rentals</span>
            <Icon name="arrow_right" size={13} />
          </button>
          {filterControl && <div className="movement-panel__filter">{filterControl}</div>}
        </div>
      </header>

      {!compactEmpty && <div className={`movement-panel__body movement-panel__body--${side}`}>
        <PageBody
          loading={list.loading}
          error={list.error}
          hasRows={list.rows.length > 0}
          onRetry={list.refetch}
          noun={noun}
          skeleton="movement"
          skeletonRows={3}
        >
          {list.isEmpty ? (
            <div className="movement-panel__empty-wrap">
              <div className="movement-panel__empty" role="status">
                <span className="movement-panel__empty-mark" aria-hidden="true">
                  <Icon name={icon} size={22} />
                </span>
                <div className="movement-panel__empty-copy">
                  <p className="movement-panel__empty-title">No {noun} {periodLabel}.</p>
                  <p className="movement-panel__empty-desc">
                    {side === 'outgoing'
                      ? 'Nothing is scheduled to leave in this period.'
                      : 'Nothing is expected back in this period.'}
                  </p>
                  <div className="movement-panel__empty-actions">
                    {onSelectPeriod && (
                      <button
                        type="button"
                        className="ui-button ui-button--sm ui-button--outline press"
                        onClick={() => onSelectPeriod('Tomorrow')}
                      >
                        View Tomorrow's {side === 'outgoing' ? 'Pickups' : 'Returns'} <Icon name="arrow_right" size={14} />
                      </button>
                    )}
                    {side === 'outgoing' ? (
                      <Link
                        to="/rentals?action=new"
                        className="ui-button ui-button--sm ui-button--primary press"
                        style={{ textDecoration: 'none' }}
                      >
                        + Create Booking
                      </Link>
                    ) : (
                      <Link
                        to="/operations?queue=return"
                        className="ui-button ui-button--sm ui-button--primary press"
                        style={{ textDecoration: 'none' }}
                      >
                        Open Return Queue <Icon name="arrow_right" size={14} />
                      </Link>
                    )}
                    {list.isFiltered && (
                      <button type="button" className="movement-panel__empty-reset" onClick={onClearFilters}>
                        Back to Today <Icon name="arrow_right" size={15} />
                      </button>
                    )}
                  </div>
                </div>
              </div>
              {emptyFooter}
            </div>
          ) : rows.length === 0 ? (
            <div className="movement-panel__empty-search" role="status">
              <span className="movement-panel__empty-icon" aria-hidden="true">
                <Icon name="search" size={24} />
              </span>
              <p className="movement-panel__empty-title">
                No {noun} match {globalQuery ? `"${globalQuery}"` : 'the active filter'}.
              </p>
              <p className="movement-panel__empty-desc">
                {globalQuery
                  ? 'Check for typos or try clearing the search input.'
                  : 'Try selecting a different date range or clearing filters.'}
              </p>
              <button
                type="button"
                className="movement-panel__search-reset-btn"
                onClick={() => {
                  onClearFilters()
                }}
              >
                Reset filters
              </button>
            </div>
          ) : (
            <div className="movement-cards-list">
              {rows.map((row, rowIndex) => {
                const action = dashboardAction(row, side)
                const isOverdue = has(row, 'Overdue')
                const isReady = row.status === 'Packed'
                const actionLabel = action.label
                const isPartial =
                  (row.status ?? '').toLowerCase().includes('partial') ||
                  (row.statusNote ?? '').toLowerCase().includes('partial') ||
                  (row.statusNote ?? '').toLowerCase().includes('still with client')

                const isTodayRow = row.atDayAd === today
                const tags = rowTags(row, side)
                const project = row.project || 'No project specified'

                const displayTime = side === 'outgoing'
                  ? `${row.atDayAd !== today ? `${formatAd(new Date(`${row.atDayAd}T00:00:00Z`))} · ` : ''}${timeOf(row)}`
                  : row.due.replace(/^Due\s+/i, '')

                const isWindowExpired = Boolean(
                  side === 'outgoing' &&
                  row.returnAtAd &&
                  new Date(row.returnAtAd).getTime() < Date.now()
                )

                /*
                 * RULING 2026-10-15: one row, each fact once (RULINGS-2026-10-15.md #19–#23).
                 * The card was ~204px and said a late return four ways ("86d
                 * late" rail, red edge, pink fill, "Overdue · 86 days late").
                 * Now: who + which booking | when this movement happens (BS
                 * over AD, or the time alone on today's rows, since the day
                 * control already names the day) and, if late, how late, once,
                 * in danger ink | the 56px verb. The other side's date and the
                 * Pickup/Return captions the panel title already says are gone
                 * from view; the booking hover card keeps both dates.
                 */
                return (
                  <article
                    key={row.id}
                    className={`movement-card movement-card--${side}${isOverdue ? ' movement-card--overdue' : ''}`}
                    aria-label={`${row.bookingNo}, ${row.client}, ${displayTime}`}
                    style={{ '--row-i': Math.min(rowIndex, 12) } as React.CSSProperties}
                  >
                    <div className="movement-card__who">
                      <ClientIntelFromId clientId={row.clientId} name={row.client} context="dashboard" gateContext={intelGate} actionContext={user ? { userId: user.id, role: user.role } : null}>
                        {/* Name and project share one 44px target (Law 13), as on the Rentals table. */}
                        <Link className="movement-card__client-link" to={`/clients/${row.clientId}`}>
                          <strong className="movement-card__client" title={row.client}>{row.client}</strong>
                          <span className="movement-card__project" title={project}>{project}</span>
                        </Link>
                      </ClientIntelFromId>
                    </div>
                    <div className="movement-card__meta">
                      <div className="movement-card__booking-link">
                        <IntelCard
                          glance={movementGlance(row, side)}
                          detail={movementDetail(row)}
                          detailTitle={row.bookingNo}
                          detailSubtitle={`${row.client} · ${row.status}`}
                          entityType="rental"
                          entityId={row.id}
                          context="dashboard"
                          gateContext={intelGate}
                          actionContext={user ? { userId: user.id, role: user.role } : null}
                        >
                          <Link to={`/rentals/${row.bookingNo}`}>
                            <span className="sr-only">Booking </span>
                            <strong className="movement-card__number identifier">{row.bookingNo}</strong>
                          </Link>
                        </IntelCard>
                      </div>
                      <span className="movement-card__items-count">
                        {row.itemCount} {row.itemCount === 1 ? 'item' : 'items'}{side === 'incoming' ? ' booked' : ''}
                      </span>
                    </div>
                    {(tags.length > 0 || isWindowExpired) && (
                      <div className="movement-card__badge-wrap">
                        {isWindowExpired && (
                          <span
                            className="movement-card__status movement-card__status--expired"
                            title="Scheduled return window has passed without dispatch"
                          >
                            <Icon name="alert_triangle" size={14} />
                            Window passed · Reschedule or Cancel
                          </span>
                        )}
                        {tags.map((tag) => (
                          <span key={tag.label} className={`movement-card__tag movement-card__tag--${tag.tone}`}>
                            <Icon name={tag.icon} size={14} />
                            {tag.label}
                          </span>
                        ))}
                      </div>
                    )}

                    <div className={`movement-card__schedule movement-card__schedule--${side === 'incoming' ? 'return' : 'pickup'}`}>
                      {/* The panel title and the verb already say which movement this is. */}
                      <span className="sr-only">{side === 'incoming' ? 'Return' : 'Pickup'} </span>
                      {isTodayRow
                        ? <strong className="movement-card__time figure">{timeOf(row)}</strong>
                        : <BsAdDate className="movement-card__time" date={movementAtAd(row)} showTime />}
                      {/* Lateness is said once, here, beside the date it is counted from. A late
                          pickup says "Awaiting dispatch" (main's wording); a pickup whose whole
                          window has passed says so in the status row instead, not twice. */}
                      {isOverdue && !isWindowExpired && (
                        <span className="movement-card__status movement-card__status--overdue">
                          {side === 'outgoing' ? 'Awaiting dispatch' : (row.statusNote ?? 'Late')}
                        </span>
                      )}
                      {side === 'incoming' && !isOverdue && isPartial && (
                        <span className="movement-card__status movement-card__status--partial">Partial return</span>
                      )}
                      {/* The live distance to `return_at` for gear still out
                          (md brief 11). A row that crosses its due time while
                          the screen is open turns red here until the next
                          refetch flags it overdue. */}
                      {side === 'incoming' && !isOverdue && !isPartial && row.returnDueAtAd && (
                        <ReturnCountdown returnAtAd={row.returnDueAtAd} short />
                      )}
                    </div>

                    <div className="movement-card__actions">
                      <button
                        type="button"
                        className={`movement-card__cta-btn ${(side === 'incoming' || isReady) ? 'is-dominant' : 'is-prep'}`}
                        onClick={() => {
                          const bookingStatus: BookingStatus = (row.status as BookingStatus) || (side === 'incoming' ? 'On Rent' : 'Booked')
                          openOperations(row.bookingNo, bookingStatus, action.job)
                        }}
                        aria-label={`${actionLabel} for ${row.client}, booking ${row.bookingNo}`}
                      >
                        <span>{actionLabel}</span><Icon name="arrow_right" size={15} />
                      </button>
                      <OverflowMenu
                        ariaLabel={`More actions for booking ${row.bookingNo}`}
                        items={[
                          {
                            label: 'View Booking',
                            icon: 'file',
                            onClick: () => navigate(`/rentals/${row.bookingNo}`),
                          },
                          {
                            label: 'Reschedule Dates',
                            icon: 'calendar',
                            onClick: () => navigate(`/rentals/${row.bookingNo}`),
                          },
                          {
                            label: 'Cancel No-Show',
                            icon: 'close',
                            onClick: () => {
                              const bookingStatus: BookingStatus = (row.status as BookingStatus) || (side === 'incoming' ? 'On Rent' : 'Booked')
                              openOperations(row.bookingNo, bookingStatus, action.job)
                            },
                          },
                        ]}
                      />
                    </div>
                  </article>
              )
            })}
          </div>
          )}
          {hasMore && onLoadMore && (
            <div className="movement-panel__load-more">
              <button type="button" className="press" onClick={onLoadMore} aria-label={`Load more ${noun}`}>
                Load more {noun}
              </button>
              <span aria-live="polite">Showing {list.rows.length} of {list.total}</span>
            </div>
          )}
        </PageBody>
        {/* ADOPTIONS item 7 (Booqable §4.3): footer link carries the panel's named
            filter, widened. "View all" is the widen (no separate query). A counted
            "View late" (overdue) drill-down is deferred — it needs an activity-scoped
            /rentals route param that is not wired yet, so it is not shipped half-built. */}
        <div className="movement-panel__footer">
          <Link to="/rentals" className="movement-panel__footer-link press tap">
            <span>View all {side === 'outgoing' ? 'bookings' : 'rentals'}</span>
            <Icon name="arrow_right" size={14} />
          </Link>
        </div>
      </div>}
    </section>
  )
}
