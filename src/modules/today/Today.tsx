import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { createPortal } from 'react-dom'
import Icon from '../../components/ui/Icon'
import { CalendarPopover } from '../../components/ui/DateField'
import { PageHeader } from '../../components/ui/Page'
import { OverflowMenu } from '../../components/ui/OverflowMenu'
import { GlobalAddMenu } from '../../components/ui/creation/GlobalAddMenu'
import { DataAgeBadge } from '../../components/ui/DataAgeBadge'
import { PageShell } from '../../components/ui/PageShell'
import { SegmentedControl } from '../../components/ui/SegmentedControl'
import { useDomainEvent } from '../../events/useDomainEvent'
import { EVENT_TYPES } from '../../events/eventBus'
import { formatAd } from '../../lib/bs'
import { businessDayAd, businessNowAd, overDays, pickupsQuery, toMovementRow, type MovementRow } from '../../lib/queries/today'
import { listBookings, operationQueue, todaysOutgoing } from '../../lib/queries/bookings'
import type { ListFilters } from '../../lib/queries/listQuery'
import { useList, type ListQueryResult, type ListResult } from '../../lib/queries/useList'
import { useViewport } from '../../lib/device'
import { useAuth } from '../../lib/auth'
import { canViewMoney } from '../../lib/rbac'
import { formatMoney, type Paisa } from '../../lib/money'
import { CASES, isOpenStatus, openCasesCount } from '../../data/cases'
import { useOperationsWorkspace } from '../operations/OperationsWorkspaceContext'
import type { BookingStatus } from '../../lib/workflow'
import RawDashboardMovementPanel from './DashboardMovementPanel'
import ShiftHandoverPanel from './ShiftHandoverPanel'
import './dashboard.css'

const DashboardMovementPanel = RawDashboardMovementPanel as React.ComponentType<
  React.ComponentProps<typeof RawDashboardMovementPanel> & {
    noun?: 'pickup' | 'return'
    date?: string
  }
>

type QuickPeriod = 'Today' | 'Tomorrow' | 'Next 7 Days'
type DateFilter = { kind: 'quick'; period: QuickPeriod } | { kind: 'custom'; from: string; to: string }

const QUICK_PERIODS: readonly QuickPeriod[] = ['Today', 'Tomorrow', 'Next 7 Days']
const STORAGE_DISPATCH = 'dashboard.dispatchDateFilter'
const STORAGE_PICKUPS = 'dashboard.pickupDateFilter'
const STORAGE_RETURNS = 'dashboard.returnDateFilter'

function shiftDay(day: string, amount: number): string {
  const date = new Date(`${day}T00:00:00.000Z`)
  date.setUTCDate(date.getUTCDate() + amount)
  return date.toISOString().slice(0, 10)
}

function isCalendarDay(day: unknown): day is string {
  if (typeof day !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(day)) return false
  const date = new Date(`${day}T00:00:00.000Z`)
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === day
}

function readStoredFilter(key?: string): DateFilter {
  if (typeof window === 'undefined') return { kind: 'quick', period: 'Today' }
  try {
    const raw = key
      ? window.sessionStorage.getItem(key)
      : (window.sessionStorage.getItem(STORAGE_DISPATCH) ??
         window.sessionStorage.getItem(STORAGE_PICKUPS) ??
         window.sessionStorage.getItem(STORAGE_RETURNS))
    const parsed = JSON.parse(raw ?? 'null') as DateFilter | null
    if (parsed?.kind === 'quick' && QUICK_PERIODS.includes(parsed.period)) return parsed
    if (parsed?.kind === 'custom' && isCalendarDay(parsed.from) && isCalendarDay(parsed.to) && parsed.from <= parsed.to) return parsed
  } catch {
    // Stale browser storage should not break dispatch board
  }
  return { kind: 'quick', period: 'Today' }
}

function rangeFor(filter: DateFilter, today: string): { from: string; to: string } {
  if (filter.kind === 'custom') return { from: filter.from, to: filter.to }
  if (filter.period === 'Tomorrow') {
    const tomorrow = shiftDay(today, 1)
    return { from: tomorrow, to: tomorrow }
  }
  if (filter.period === 'Next 7 Days') return { from: today, to: shiftDay(today, 6) }
  return { from: today, to: today }
}

function pickupFilter(filter: DateFilter, today: string) {
  if (filter.kind === 'quick') {
    if (filter.period === 'Today') {
      const q = todaysOutgoing(today)
      // When viewing 'Today', include past unfulfilled Booked / Packed pickups (carry-over), matching Operations queue
      return {
        filters: {
          ...q,
          dateRange: q.dateRange ? { column: q.dateRange.column, toAd: q.dateRange.toAd } : undefined,
        },
        impossible: false,
      }
    }
    return pickupsQuery(filter.period, [], today)
  }
  return { filters: overDays(todaysOutgoing, { from: filter.from, to: filter.to }, today), impossible: false }
}

function returnFilter(filter: DateFilter, today: string): ListFilters {
  const range = rangeFor(filter, today)
  // Today intentionally has no lower bound so unresolved overdue returns remain visible.
  return operationQueue('return', filter.kind === 'quick' && filter.period === 'Today' ? undefined : range.from, range.to)
}

import { useCurrentLanguage } from '../../lib/i18n'

const QUICK_PERIOD_LABELS: Record<'en' | 'ne', Record<QuickPeriod, string>> = {
  en: {
    Today: 'Today',
    Tomorrow: 'Tomorrow',
    'Next 7 Days': 'Next 7 Days',
  },
  ne: {
    Today: 'आज',
    Tomorrow: 'भोलि',
    'Next 7 Days': 'यो हप्ता (७ दिन)',
  },
}

function compactDate(day: string): string {
  return formatAd(new Date(`${day}T00:00:00.000Z`))
}

function filterLabel(filter: DateFilter, lang: 'en' | 'ne' = 'en'): string {
  if (filter.kind === 'quick') return QUICK_PERIOD_LABELS[lang][filter.period]
  if (filter.from === filter.to) return compactDate(filter.from)
  return `${compactDate(filter.from)} – ${compactDate(filter.to)}`
}

const AD_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'] as const

/** The picker button's one-line label: "Today", else the English date ("16 Oct"), a range as "16 Oct – 22 Oct". */
function compactDateLabel(filter: DateFilter, today: string, lang: 'en' | 'ne' = 'en'): string {
  if (filter.kind === 'quick') return QUICK_PERIOD_LABELS[lang][filter.period]
  const day = (d: string) => {
    const dt = new Date(`${d}T00:00:00.000Z`)
    const base = `${dt.getUTCDate()} ${AD_MONTHS[dt.getUTCMonth()]}`
    return d.slice(0, 4) === today.slice(0, 4) ? base : `${base} ${dt.getUTCFullYear()}`
  }
  if (filter.from === today && filter.to === today) return QUICK_PERIOD_LABELS[lang].Today
  return filter.from === filter.to ? day(filter.from) : `${day(filter.from)} – ${day(filter.to)}`
}

/**
 * Dashboard calendars used to render inline (`position: absolute`) inside the
 * page header and the movement-panel headers. Ancestors there sit under
 * transformed parents (`.animate-entrance` keeps a set transform), and a
 * non-none transform makes an ancestor a stacking context — so an open
 * calendar painted UNDER the panels below it. Portaling to `document.body`
 * with `position: fixed` escapes every ancestor context; `--z-dropdown` keeps
 * it above panels and tables. Position tracks the trigger (re-measured on
 * scroll/resize). On phone widths the stylesheet turns `.dashboard-calendar`
 * into a bottom sheet, so only the stacking is overridden there.
 */
function CalendarPortal({
  triggerRef,
  dialogRef,
  id,
  label,
  children,
}: {
  triggerRef: React.RefObject<HTMLButtonElement>
  dialogRef: React.RefObject<HTMLDivElement>
  id: string
  label: string
  children: React.ReactNode
}) {
  const viewport = useViewport()
  const [rect, setRect] = useState<DOMRect | null>(null)
  const focused = useRef(false)
  const adjusted = useRef(false)
  useEffect(() => {
    const measure = () => {
      const el = triggerRef.current
      if (!el) return
      adjusted.current = false
      setRect(el.getBoundingClientRect())
    }
    measure()
    window.addEventListener('scroll', measure, true)
    window.addEventListener('resize', measure)
    return () => {
      window.removeEventListener('scroll', measure, true)
      window.removeEventListener('resize', measure)
    }
  }, [triggerRef])
  // The panel renders one beat after the trigger opens (rect starts null),
  // so the opener's focus effect fires before the dialog exists — focus here,
  // when the portaled panel actually lands in the document.
  useEffect(() => {
    if (rect && !focused.current) {
      focused.current = true
      dialogRef.current?.focus()
    }
  }, [rect, dialogRef])
  // Pull the panel up when it would run past the viewport bottom — a card
  // filter near the fold would otherwise open its calendar off-screen.
  useLayoutEffect(() => {
    if (!rect || viewport === 'phone' || adjusted.current) return
    const panel = dialogRef.current
    if (!panel) return
    const overflow = panel.getBoundingClientRect().bottom - window.innerHeight + 8
    if (overflow > 0) {
      adjusted.current = true
      const el = triggerRef.current
      if (el) {
        const r = el.getBoundingClientRect()
        setRect(new DOMRect(r.x, r.y - overflow, r.width, r.height))
      }
    }
  }, [rect, viewport, dialogRef, triggerRef])
  if (!rect) return null
  const style: React.CSSProperties =
    viewport === 'phone'
      ? { zIndex: 'var(--z-dropdown)' }
      : {
          position: 'fixed',
          top: rect.bottom + 10,
          right: Math.max(12, window.innerWidth - rect.right),
          zIndex: 'var(--z-dropdown)',
        }
  return createPortal(
    <div id={id} className="dashboard-calendar" role="dialog" aria-label={label} tabIndex={-1} ref={dialogRef} style={style}>
      {children}
    </div>,
    document.body,
  )
}

function DashboardCalendarContent({
  title,
  filter,
  onChange,
  onClose,
  today,
  lang = 'en',
}: {
  title: string
  filter: DateFilter
  onChange: (filter: DateFilter) => void
  onClose: () => void
  today: string
  lang?: 'en' | 'ne'
}) {
  const selected = rangeFor(filter, today)

  const commit = (next: DateFilter) => {
    onChange(next)
    onClose()
  }

  return (
    <>
      <div className="dashboard-calendar__heading">
        <div>
          <strong>{title}</strong>
          <span aria-live="polite">
            {lang === 'ne' ? 'मिति छान्नुहोस्' : 'Choose a date'}
          </span>
        </div>
        <button type="button" aria-label="Close calendar" onClick={onClose}><Icon name="close" size={18} /></button>
      </div>
      <div className="dashboard-calendar__quick" role="group" aria-label="Quick date filters">
        {QUICK_PERIODS.map((period) => (
          <button key={period} type="button" aria-pressed={filter.kind === 'quick' && filter.period === period} onClick={() => commit({ kind: 'quick', period })}>
            {QUICK_PERIOD_LABELS[lang][period]}
          </button>
        ))}
      </div>
      <CalendarPopover
        embedded
        showHeader={false}
        title={title}
        value={selected.from}
        todayDate={today}
        shadePastDates={false}
        onSelect={(day) => commit({ kind: 'custom', from: day, to: day })}
        onDismiss={onClose}
      />
    </>
  )
}

function MasterDispatchDateControl({
  filter,
  onChange,
  today,
  groupLabel = 'Dispatch day for pickups and returns',
  dialogLabel = 'Dispatch date filter',
}: {
  filter: DateFilter
  onChange: (filter: DateFilter) => void
  today: string
  groupLabel?: string
  dialogLabel?: string
}) {
  const lang = useCurrentLanguage()
  const uid = useId().replace(/:/g, '')
  const dialogId = dialogLabel === 'Dispatch date filter' ? 'dispatch-date-dialog' : `date-dialog-${uid}`
  const [open, setOpen] = useState(false)
  const root = useRef<HTMLDivElement>(null)
  const trigger = useRef<HTMLButtonElement>(null)
  const dialog = useRef<HTMLDivElement>(null)
  const close = () => {
    setOpen(false)
    trigger.current?.focus()
  }

  useEffect(() => {
    if (!open) return
    const closeAway = (event: PointerEvent) => {
      const target = event.target as Node
      if (dialog.current?.contains(target) || root.current?.contains(target)) return
      setOpen(false)
    }
    const closeEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        close()
      }
    }
    document.addEventListener('pointerdown', closeAway)
    document.addEventListener('keydown', closeEscape)
    return () => {
      document.removeEventListener('pointerdown', closeAway)
      document.removeEventListener('keydown', closeEscape)
    }
  }, [open])

  const compactLabel = compactDateLabel(filter, today, lang)

  return (
    <div
      className="dashboard-master-date-control"
      ref={root}
      role="group"
      aria-label={groupLabel}
      onBlur={(event) => {
        const next = event.relatedTarget as Node | null
        if (next && (event.currentTarget.contains(next) || dialog.current?.contains(next))) return
        if (event.relatedTarget) setOpen(false)
      }}
    >
      {/* One compact outline button — "Today", or the English date — that opens the picker. */}
      <button
        ref={trigger}
        type="button"
        className="dashboard-master-date-control__date-btn ui-button ui-button--outline ui-button--sm press tap"
        aria-label={`${compactLabel} — choose ${dialogLabel.toLowerCase()}`}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={open ? dialogId : undefined}
        onClick={() => setOpen((value) => !value)}
      >
        <Icon name="calendar" size={16} className="dashboard-master-date-control__cal" />
        <span className="dashboard-master-date-control__primary">{compactLabel}</span>
        <Icon name={open ? 'chevron_up' : 'chevron_down'} size={14} />
      </button>
      {open && (
        <CalendarPortal triggerRef={trigger} dialogRef={dialog} id={dialogId} label={dialogLabel}>
          <DashboardCalendarContent
            title={dialogLabel === 'Dispatch date filter' ? (lang === 'ne' ? 'डिस्प्याच मिति' : 'Dispatch date') : dialogLabel}
            filter={filter}
            onChange={onChange}
            onClose={close}
            today={today}
            lang={lang}
          />
        </CalendarPortal>
      )}
    </div>
  )
}

export default function Today() {
  const lang = useCurrentLanguage()
  const viewport = useViewport()
  const isPhone = viewport === 'phone'
  const [mobileTab, setMobileTab] = useState<'pickups' | 'returns'>('pickups')
  const mobileTabChosenRef = useRef(false)
  const { openOperations } = useOperationsWorkspace()
  const { user } = useAuth()
  const canSeeMoney = user ? canViewMoney(user.role) : false
  const [globalSearch, setGlobalSearch] = useState('')
  const counterInputRef = useRef<HTMLInputElement>(null)

  const [pickupDateFilter, setPickupDateFilter] = useState<DateFilter>(() => readStoredFilter(STORAGE_PICKUPS))
  const [returnDateFilter, setReturnDateFilter] = useState<DateFilter>(() => readStoredFilter(STORAGE_RETURNS))

  useEffect(() => {
    try {
      window.sessionStorage.setItem(STORAGE_PICKUPS, JSON.stringify(pickupDateFilter))
      window.sessionStorage.setItem(STORAGE_RETURNS, JSON.stringify(returnDateFilter))
      window.sessionStorage.setItem(STORAGE_DISPATCH, JSON.stringify(pickupDateFilter))
    } catch {
      // Persistence is optional in privacy-restricted browser sessions.
    }
  }, [pickupDateFilter, returnDateFilter])

  const [pickupPage, setPickupPage] = useState(0)
  const [returnPage, setReturnPage] = useState(0)
  const dayAd = businessDayAd()

  const syncBothPanels = useCallback((nextFilter: DateFilter) => {
    setPickupPage(0)
    setReturnPage(0)
    setPickupDateFilter(nextFilter)
    setReturnDateFilter(nextFilter)
  }, [])

  const dispatchDate = useMemo(() => {
    if (pickupDateFilter.kind === 'custom') return pickupDateFilter.from
    return rangeFor(pickupDateFilter, dayAd).from
  }, [pickupDateFilter, dayAd])

  const pickupSet = pickupFilter(pickupDateFilter, dayAd)
  const returnSet = returnFilter(returnDateFilter, dayAd)

  const fetchPickups = useCallback(async (filters: ListFilters): Promise<ListQueryResult<MovementRow>> => {
    if (pickupSet.impossible) return { rows: [], total: 0 }
    const result = await listBookings(filters)
    const now = businessNowAd()
    return { rows: result.rows.map((row) => toMovementRow(row, 'outgoing', now)), total: result.total ?? null }
  }, [pickupSet.impossible])
  const fetchReturns = useCallback(async (filters: ListFilters): Promise<ListQueryResult<MovementRow>> => {
    const result = await listBookings(filters)
    const now = businessNowAd()
    return { rows: result.rows.map((row) => toMovementRow(row, 'incoming', now)), total: result.total ?? null }
  }, [])

  const pickupFilters = { ...pickupSet.filters, page: { index: 0, size: (pickupPage + 1) * 50 } }
  const returnFilters = { ...returnSet, page: { index: 0, size: (returnPage + 1) * 50 } }
  const isPickupFiltered = pickupDateFilter.kind !== 'quick' || pickupDateFilter.period !== 'Today'
  const isReturnFiltered = returnDateFilter.kind !== 'quick' || returnDateFilter.period !== 'Today'
  const pickups: ListResult<MovementRow> = useList(fetchPickups, pickupFilters, { isFilteredOverride: isPickupFiltered })
  const returns: ListResult<MovementRow> = useList(fetchReturns, returnFilters, { isFilteredOverride: isReturnFiltered })
  const { refetch: refetchPickups } = pickups
  const { refetch: refetchReturns } = returns
  const refetchMovement = useCallback(() => { refetchPickups(); refetchReturns() }, [refetchPickups, refetchReturns])

  useDomainEvent(EVENT_TYPES.RENTAL_PACKED, refetchMovement)
  useDomainEvent(EVENT_TYPES.RENTAL_PICKED_UP, refetchMovement)
  useDomainEvent(EVENT_TYPES.RENTAL_HANDED_OVER, refetchMovement)
  useDomainEvent(EVENT_TYPES.RENTAL_RETURN_STARTED, refetchMovement)
  useDomainEvent(EVENT_TYPES.RENTAL_RETURNED, refetchMovement)
  useDomainEvent(EVENT_TYPES.RENTAL_RESET_COMPLETED, refetchMovement)
  useDomainEvent(EVENT_TYPES.RENTAL_CLOSED, refetchMovement)
  useDomainEvent(EVENT_TYPES.RENTAL_CONFIRMED, refetchMovement)
  useDomainEvent(EVENT_TYPES.RENTAL_CANCELLED, refetchMovement)

  const isDispatchToday = pickupDateFilter.kind === 'quick' && pickupDateFilter.period === 'Today'
  const isReturnToday = returnDateFilter.kind === 'quick' && returnDateFilter.period === 'Today'
  const pickupCount = pickups.loading || pickups.error ? undefined : pickups.total ?? pickups.rows.length
  const returnCount = returns.loading || returns.error ? undefined : returns.total ?? returns.rows.length

  const overduePickups = useMemo(() => {
    return pickups.rows.filter((r) => r.flags.includes('Overdue'))
  }, [pickups.rows])

  const [activeRentalsCount, setActiveRentalsCount] = useState<number>(0)
  const [activeRentalsItems, setActiveRentalsItems] = useState<number>(0)
  const [activeRentalsPaisa, setActiveRentalsPaisa] = useState<number>(0)
  const [prepBookedCount, setPrepBookedCount] = useState<number>(0)
  const [prepPackedCount, setPrepPackedCount] = useState<number>(0)
  const [tomorrowReturns, setTomorrowReturns] = useState<MovementRow[]>([])
  const openCases = useMemo(() => openCasesCount(), [])
  const topOpenCases = useMemo(() => {
    return CASES.filter((c) => isOpenStatus(c.status)).slice(0, 4)
  }, [])

  useEffect(() => {
    let active = true
    async function loadSituationalMetrics() {
      try {
        const onRentRes = await listBookings({ chips: { stage: ['On Rent'] }, presence: { cancelled_at: false } })
        if (!active) return
        setActiveRentalsCount(onRentRes.total ?? onRentRes.rows.length)
        const totalItems = onRentRes.rows.reduce((sum, r) => sum + (r.itemCount || 0), 0)
        setActiveRentalsItems(totalItems)
        const totalPaisa = onRentRes.rows.reduce((sum, r) => sum + (r.totalAmount ? Number(r.totalAmount) : 0), 0)
        setActiveRentalsPaisa(totalPaisa)

        const prepRes = await listBookings({ chips: { stage: ['Booked', 'Packed'] }, presence: { cancelled_at: false } })
        if (!active) return
        const booked = prepRes.rows.filter((r) => r.stage === 'Booked').length
        const packed = prepRes.rows.filter((r) => r.stage === 'Packed').length
        setPrepBookedCount(booked)
        setPrepPackedCount(packed)

        const tomorrow = shiftDay(dayAd, 1)
        const tomorrowFilters = operationQueue('return', tomorrow, tomorrow)
        const tomorrowRes = await listBookings(tomorrowFilters)
        if (!active) return
        const now = businessNowAd()
        setTomorrowReturns(tomorrowRes.rows.map((row) => toMovementRow(row, 'incoming', now)))
      } catch {
        // Non-critical background telemetry
      }
    }
    void loadSituationalMetrics()
    return () => { active = false }
  }, [dayAd, pickups.lastFetchedAt, returns.lastFetchedAt])

  useEffect(() => {
    if (isPhone && !mobileTabChosenRef.current && pickupCount === 0 && (returnCount ?? 0) > 0) {
      setMobileTab('returns')
      mobileTabChosenRef.current = true
    }
  }, [isPhone, pickupCount, returnCount])

  const goToToday = useCallback(() => {
    syncBothPanels({ kind: 'quick', period: 'Today' })
  }, [syncBothPanels])

  const steppedFilter = useCallback((from: DateFilter, delta: number): DateFilter => {
    let currentDay = dayAd
    if (from.kind === 'custom') {
      currentDay = from.from
    } else if (from.period === 'Tomorrow') {
      currentDay = shiftDay(dayAd, 1)
    }
    const nextDay = shiftDay(currentDay, delta)
    return nextDay === dayAd ? { kind: 'quick', period: 'Today' } : { kind: 'custom', from: nextDay, to: nextDay }
  }, [dayAd])

  const stepDay = useCallback((delta: number) => {
    syncBothPanels(steppedFilter(pickupDateFilter, delta))
  }, [pickupDateFilter, steppedFilter, syncBothPanels])

  // RULING 2026-10-15: each queue also carries its own date filter (the shared one above still sets both).
  const setPickupFilter = useCallback((next: DateFilter) => { setPickupPage(0); setPickupDateFilter(next) }, [])
  const setReturnFilter = useCallback((next: DateFilter) => { setReturnPage(0); setReturnDateFilter(next) }, [])

  const handleGlobalSearchKeyDown = (e: ReactKeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      const q = globalSearch.trim().toLowerCase()
      if (!q) return
      // Check if there is an exact booking number match in pickups or returns
      const exactPickup = pickups.rows.find((r) => r.bookingNo.toLowerCase() === q || r.bookingNo.toLowerCase() === `b-${q}`)
      if (exactPickup) {
        const isReady = exactPickup.status === 'Packed'
        openOperations(exactPickup.bookingNo, (exactPickup.status as BookingStatus) || 'Booked', isReady ? 'Handover' : 'Pack')
        return
      }
      const exactReturn = returns.rows.find((r) => r.bookingNo.toLowerCase() === q || r.bookingNo.toLowerCase() === `b-${q}`)
      if (exactReturn) {
        openOperations(exactReturn.bookingNo, (exactReturn.status as BookingStatus) || 'On Rent', 'Return')
        return
      }
    }
  }

  // Rapid keyboard navigation for dispatch operators: [ (prev), ] (next), t (today), / (search)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target instanceof Element ? e.target : null
      if (
        target &&
        (target.matches('input, textarea, select') ||
          (target as HTMLElement).isContentEditable ||
          target.closest?.('[role="dialog"]'))
      ) {
        return
      }

      if (e.key === '/' && !isPhone) {
        e.preventDefault()
        counterInputRef.current?.focus()
      } else if (e.key === '[' || e.key === 'p' || e.key === 'P') {
        e.preventDefault()
        stepDay(-1)
      } else if (e.key === ']' || e.key === 'n' || e.key === 'N') {
        e.preventDefault()
        stepDay(1)
      } else if (e.key === 't' || e.key === 'T') {
        e.preventDefault()
        goToToday()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [goToToday, stepDay, isPhone])

  const navigate = useNavigate()

  const returnsEmptyFooter = useMemo(() => {
    if (!isReturnToday) return null
    if (tomorrowReturns.length === 0 && openCases === 0) return null

    return (
      <div className="returns-empty-footer" style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 16 }}>
        {tomorrowReturns.length > 0 && (
          <div
            className="dashboard-situational-card"
            style={{
              background: 'var(--surface-card, var(--card))',
              border: '1px solid var(--border)',
              borderRadius: 'var(--r-card, 12px)',
              padding: '14px 16px',
              boxShadow: 'var(--shadow-card)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: '12px', fontWeight: 600, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                <Icon name="calendar" size={15} style={{ color: 'var(--primary)' }} />
                Returning Tomorrow ({tomorrowReturns.length})
              </span>
              <button
                type="button"
                className="press tap"
                onClick={() => setReturnFilter({ kind: 'quick', period: 'Tomorrow' })}
                style={{
                  background: 'none',
                  border: 'none',
                  color: 'var(--primary-text)',
                  fontSize: '12px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 4,
                  padding: '4px 0',
                  minHeight: 'var(--tap, 44px)',
                }}
              >
                View All ({tomorrowReturns.length}) <Icon name="arrow_right" size={13} />
              </button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {tomorrowReturns.slice(0, 3).map((ret) => (
                <div
                  key={ret.id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '8px 10px',
                    borderRadius: 'var(--r-card-inner, 8px)',
                    background: 'var(--surface-muted, color-mix(in srgb, var(--border) 25%, transparent))',
                    fontSize: '13px',
                  }}
                >
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <Link to={`/rentals/${ret.bookingNo}`} style={{ fontWeight: 600, color: 'var(--text)', textDecoration: 'none' }} className="font-mono">
                        {ret.bookingNo}
                      </Link>
                      <span style={{ color: 'var(--border2)' }}>·</span>
                      <span style={{ fontWeight: 500, color: 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {ret.client}
                      </span>
                    </div>
                    <span style={{ fontSize: '11px', color: 'var(--muted)' }}>
                      {ret.itemCount} {ret.itemCount === 1 ? 'item' : 'items'}
                    </span>
                  </div>
                  <span className="font-mono tabular-nums" style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text2)', whiteSpace: 'nowrap' }}>
                    {ret.due ? ret.due.replace(/^Due\s+/i, '') : timeOf(ret)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {openCases > 0 && (
          <div
            className="dashboard-situational-card"
            style={{
              background: 'var(--surface-card, var(--card))',
              border: '1px solid var(--border)',
              borderRadius: 'var(--r-card, 12px)',
              padding: '14px 16px',
              boxShadow: 'var(--shadow-card)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: '12px', fontWeight: 600, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                <Icon name="tool" size={15} style={{ color: 'var(--warn)' }} />
                Floor Attention: QC & Maintenance Holds ({openCases})
              </span>
              <Link
                to="/inventory/cases"
                className="press tap"
                style={{
                  color: 'var(--primary-text)',
                  fontSize: '12px',
                  fontWeight: 600,
                  textDecoration: 'none',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 4,
                  padding: '4px 0',
                  minHeight: 'var(--tap, 44px)',
                }}
              >
                Resolve →
              </Link>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {topOpenCases.map((c) => {
                const eqName = Array.isArray(c.equipment) ? c.equipment.map((e) => e.name).join(', ') : c.equipment
                return (
                  <div
                    key={c.id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '8px 10px',
                      borderRadius: 'var(--r-card-inner, 8px)',
                      background: 'var(--surface-muted, color-mix(in srgb, var(--border) 25%, transparent))',
                      fontSize: '13px',
                    }}
                  >
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0, paddingRight: 8 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                        <span className="font-mono tabular-nums" style={{ fontWeight: 600, fontSize: '12px', color: 'var(--muted)' }}>
                          {c.id}
                        </span>
                        <span style={{ fontWeight: 600, color: 'var(--text)' }}>
                          {c.title}
                        </span>
                      </div>
                      <span style={{ fontSize: '11px', color: 'var(--text2)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {eqName} · {c.counterpartyName}
                      </span>
                    </div>
                    <span
                      style={{
                        fontSize: '11px',
                        fontWeight: 600,
                        padding: '2px 6px',
                        borderRadius: 'var(--r-btn, 4px)',
                        whiteSpace: 'nowrap',
                        background: c.priority === 'Critical' || c.priority === 'High' ? 'color-mix(in srgb, var(--danger) 12%, var(--card))' : 'color-mix(in srgb, var(--warn) 15%, var(--card))',
                        color: c.priority === 'Critical' || c.priority === 'High' ? 'var(--danger-text)' : 'var(--warn-text)',
                        border: `1px solid color-mix(in srgb, ${c.priority === 'Critical' || c.priority === 'High' ? 'var(--danger)' : 'var(--warn)'} 30%, transparent)`,
                      }}
                    >
                      {c.priority} · {c.status}
                    </span>
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </div>
    )
  }, [isReturnToday, tomorrowReturns, openCases, topOpenCases, setReturnFilter])

  return (
    <PageShell
      className="rental-dashboard"
      header={
        <PageHeader
          title="Today"
          search={{
            value: globalSearch,
            onChange: setGlobalSearch,
            placeholder: 'Search or scan… (press /)',
            onKeyDown: handleGlobalSearchKeyDown,
            onClear: () => setGlobalSearch(''),
            ariaLabel: 'Search or scan bookings, clients, serials',
            inputRef: counterInputRef,
          }}
          actions={
            // RULING 2026-10-13: one compact action cluster; date filtering sits with its queues.
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'nowrap' }}>
              <GlobalAddMenu module="today" />
              <OverflowMenu ariaLabel="More Today actions" items={[
                { label: 'Operations', icon: 'queues', onClick: () => navigate('/operations') },
                { label: 'Refresh movements', icon: 'refresh', onClick: refetchMovement,
                  ...(pickups.loading || returns.loading ? { unavailable: 'Movements are refreshing' } : {}) },
              ]} />
            </div>
          }
        />
      }
    >
      <div className="dashboard-workbar" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12, marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
          <div className="dashboard-workbar__intro" style={{ margin: 0 }}>
            <p style={{ margin: 0 }}>
              {pickupCount === undefined || returnCount === undefined ? (
                'Movement board'
              ) : (
                <>
                  <span className="font-mono tabular-nums">{pickupCount}</span> going out ·{' '}
                  <span className="font-mono tabular-nums">{returnCount}</span> coming back
                </>
              )}
            </p>
            <DataAgeBadge
              loadedAt={pickups.lastFetchedAt && returns.lastFetchedAt
                ? new Date(Math.min(pickups.lastFetchedAt.getTime(), returns.lastFetchedAt.getTime()))
                : null}
              loading={pickups.loading || returns.loading}
              onRefresh={refetchMovement}
              variant="muted"
              compact
            />
          </div>
        </div>

        {/* Unified Page-Level Date Bar */}
        <div
          className="dashboard-page-date-bar"
          role="group"
          aria-label="Dispatch day for pickups and returns"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 3,
            background: 'var(--surface-2)',
            padding: 3,
            borderRadius: 'calc(var(--r-btn) + 2px)',
            border: '1px solid var(--border)',
          }}
        >
          {QUICK_PERIODS.map((period) => {
            const isActive = pickupDateFilter.kind === 'quick' && pickupDateFilter.period === period && returnDateFilter.kind === 'quick' && returnDateFilter.period === period
            return (
              <button
                key={period}
                type="button"
                className="press tap"
                style={{
                  minHeight: 32,
                  padding: '0 12px',
                  borderRadius: 'var(--r-btn)',
                  border: 'none',
                  background: isActive ? 'var(--card)' : 'transparent',
                  color: isActive ? 'var(--text)' : 'var(--text2)',
                  fontWeight: isActive ? 600 : 500,
                  fontSize: 'var(--t-meta, 13px)',
                  fontFamily: 'inherit',
                  boxShadow: isActive ? 'var(--shadow-sm), var(--specular-rim)' : 'none',
                  cursor: 'pointer',
                  transition: 'background var(--dur-fast, 120ms) var(--ease), color var(--dur-fast, 120ms) var(--ease), box-shadow var(--dur-fast, 120ms) var(--ease)',
                }}
                aria-pressed={isActive}
                onClick={() => syncBothPanels({ kind: 'quick', period })}
              >
                {QUICK_PERIOD_LABELS[lang][period]}
              </button>
            )
          })}
          <MasterDispatchDateControl
            filter={pickupDateFilter}
            onChange={syncBothPanels}
            today={dayAd}
            groupLabel="Master date picker"
            dialogLabel="Master dispatch date"
          />
        </div>
      </div>

      {/* Unresolved / Overdue Pickups Alert Banner */}
      {isDispatchToday && overduePickups.length > 0 && (
        <div
          className="dashboard-alert-banner"
          role="alert"
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 12,
            padding: '10px 16px',
            marginBottom: 'var(--sp-md, 12px)',
            borderRadius: 'var(--r-card)',
            background: 'color-mix(in srgb, var(--warn) 12%, var(--card))',
            border: '1px solid color-mix(in srgb, var(--warn) 35%, transparent)',
            color: 'var(--warn-text)',
            fontSize: 'var(--t-meta, 13px)',
            boxShadow: 'var(--shadow-xs)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <Icon name="alert_triangle" size={18} style={{ color: 'var(--warn)', flexShrink: 0 }} />
            <span>
              <strong>Unresolved / Overdue Pickups <span className="font-mono tabular-nums">({overduePickups.length})</span></strong>
              {' — '}
              {overduePickups.length === 1 ? (
                <>
                  <span className="font-mono tabular-nums">1</span> booking is
                </>
              ) : (
                <>
                  <span className="font-mono tabular-nums">{overduePickups.length}</span> bookings are
                </>
              )}{' '}
              past scheduled pickup time awaiting dispatch.
            </span>
          </div>
          <button
            type="button"
            className="ui-button ui-button--sm ui-button--outline press tap"
            style={{
              borderColor: 'color-mix(in srgb, var(--warn) 40%, transparent)',
              color: 'var(--warn-text)',
              flexShrink: 0,
              gap: 6,
            }}
            onClick={() => navigate('/operations?queue=pack')}
          >
            Resolve in Operations <Icon name="arrow_right" size={14} />
          </button>
        </div>
      )}

      {/* Spec §31: Mobile Segmented Control */}
      {isPhone && (
        <div className="dashboard-mobile-nav">
          <SegmentedControl
            fullWidth
            ariaLabel="Dashboard Movements"
            options={[
              { id: 'pickups', label: 'Pickups', badge: pickupCount },
              { id: 'returns', label: 'Returns', badge: returnCount },
            ]}
            value={mobileTab}
            onChange={(nextTab) => {
              mobileTabChosenRef.current = true
              setMobileTab(nextTab)
            }}
          />
        </div>
      )}

      {/* RULING 2026-10-09: date filtering changes records, not queue width or order. */}
      <div className="rental-dashboard__panels">
        {(!isPhone || mobileTab === 'pickups') && (
          <DashboardMovementPanel
            side="outgoing"
            noun="pickup"
            date={dispatchDate}
            title="Pickups"
            subtitle="Scheduled departures"
            icon="truck"
            list={pickups}
            filterControl={
              <MasterDispatchDateControl
                filter={pickupDateFilter}
                onChange={setPickupFilter}
                today={dayAd}
                groupLabel="Date filter for pickups"
                dialogLabel="Pickups date filter"
              />
            }
            periodLabel={filterLabel(pickupDateFilter).toLowerCase()}
            globalQuery={globalSearch}
            onSelectPeriod={(p) => syncBothPanels({ kind: 'quick', period: p })}
            onClearFilters={() => setPickupFilter({ kind: 'quick', period: 'Today' })}
            onLoadMore={() => setPickupPage((page) => page + 1)}
            hasMore={pickups.total !== null && pickups.rows.length < pickups.total}
            isToday={isDispatchToday}
          />
        )}

        {(!isPhone || mobileTab === 'returns') && (
          <DashboardMovementPanel
            side="incoming"
            noun="return"
            date={dispatchDate}
            title="Returns"
            subtitle={isReturnToday ? 'Today · Overdue included' : undefined}
            icon="return_arrow"
            list={returns}
            filterControl={
              <MasterDispatchDateControl
                filter={returnDateFilter}
                onChange={setReturnFilter}
                today={dayAd}
                groupLabel="Date filter for returns"
                dialogLabel="Returns date filter"
              />
            }
            periodLabel={filterLabel(returnDateFilter).toLowerCase()}
            isToday={isReturnToday}
            globalQuery={globalSearch}
            onSelectPeriod={(p) => syncBothPanels({ kind: 'quick', period: p })}
            onClearFilters={() => setReturnFilter({ kind: 'quick', period: 'Today' })}
            onLoadMore={() => setReturnPage((page) => page + 1)}
            hasMore={returns.total !== null && returns.rows.length < returns.total}
            emptyFooter={returnsEmptyFooter}
          />
        )}
      </div>

      <ShiftHandoverPanel />

      {/* Situational Awareness 3-Card Row */}
      <div
        className="dashboard-situational-grid"
        style={{
          display: 'grid',
          gridTemplateColumns: isPhone ? '1fr' : 'repeat(3, minmax(0, 1fr))',
          gap: 'var(--sp-md, 12px)',
          marginTop: 'var(--sp-xl, 24px)',
        }}
      >
        {/* Card 1: Currently Out on Set */}
        <div
          className="dashboard-situational-card lift"
          style={{
            background: 'var(--surface-card, var(--card))',
            border: '1px solid var(--border)',
            borderRadius: 'var(--r-card)',
            padding: '16px 20px',
            boxShadow: 'var(--shadow-card), var(--specular-rim)',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            gap: 12,
            minHeight: 140,
          }}
        >
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
              <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Currently Out on Set
              </span>
              <Icon name="truck" size={18} style={{ color: 'var(--primary)' }} />
            </div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, margin: '2px 0 4px' }}>
              <span className="font-mono tabular-nums" style={{ fontSize: '1.75rem', fontWeight: 700, color: 'var(--text)', fontFamily: 'var(--font-id, sans-serif)' }}>
                {activeRentalsCount}
              </span>
              <span style={{ fontSize: '0.95rem', fontWeight: 600, color: 'var(--text2)' }}>
                Active {activeRentalsCount === 1 ? 'Rental' : 'Rentals'}
              </span>
            </div>
            <p style={{ margin: 0, fontSize: 'var(--t-meta, 13px)', color: 'var(--muted)', lineHeight: 1.4 }}>
              {canSeeMoney && activeRentalsPaisa > 0 ? (
                <>
                  <span className="money font-mono tabular-nums" style={{ fontWeight: 600, color: 'var(--text)' }}>
                    {formatMoney(activeRentalsPaisa as Paisa)}
                  </span>{' '}
                  active value · <span className="font-mono tabular-nums">{activeRentalsItems}</span> items on set
                </>
              ) : (
                <>
                  <span className="font-mono tabular-nums" style={{ fontWeight: 600, color: 'var(--text)' }}>{activeRentalsItems}</span> equipment units currently with clients
                </>
              )}
            </p>
          </div>
          <Link
            to="/operations?queue=return"
            className="press tap"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              minHeight: 'var(--tap, 44px)',
              fontSize: 'var(--t-meta, 13px)',
              fontWeight: 600,
              color: 'var(--primary-text)',
              textDecoration: 'none',
              marginTop: 4,
            }}
          >
            Open Return Queue <Icon name="arrow_right" size={14} />
          </Link>
        </div>

        {/* Card 2: Prep / Packing Queue */}
        <div
          className="dashboard-situational-card lift"
          style={{
            background: 'var(--surface-card, var(--card))',
            border: '1px solid var(--border)',
            borderRadius: 'var(--r-card)',
            padding: '16px 20px',
            boxShadow: 'var(--shadow-card), var(--specular-rim)',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            gap: 12,
            minHeight: 140,
          }}
        >
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
              <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Prep & Packing Queue
              </span>
              <Icon name="package" size={18} style={{ color: 'var(--primary)' }} />
            </div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, margin: '2px 0 4px', flexWrap: 'wrap' }}>
              <span style={{ display: 'inline-flex', alignItems: 'baseline', gap: 4 }}>
                <span className="font-mono tabular-nums" style={{ fontSize: '1.75rem', fontWeight: 700, color: 'var(--text)', fontFamily: 'var(--font-id, sans-serif)' }}>
                  {prepBookedCount}
                </span>
                <span style={{ fontSize: '0.95rem', fontWeight: 600, color: 'var(--text2)' }}>Booked</span>
              </span>
              <span style={{ color: 'var(--border2)' }}>·</span>
              <span style={{ display: 'inline-flex', alignItems: 'baseline', gap: 4 }}>
                <span className="font-mono tabular-nums" style={{ fontSize: '1.75rem', fontWeight: 700, color: 'var(--text)', fontFamily: 'var(--font-id, sans-serif)' }}>
                  {prepPackedCount}
                </span>
                <span style={{ fontSize: '0.95rem', fontWeight: 600, color: 'var(--text2)' }}>Packed</span>
              </span>
            </div>
            <p style={{ margin: 0, fontSize: 'var(--t-meta, 13px)', color: 'var(--muted)', lineHeight: 1.4 }}>
              Orders staged or awaiting warehouse preparation
            </p>
          </div>
          <Link
            to="/operations?queue=pack"
            className="press tap"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              minHeight: 'var(--tap, 44px)',
              fontSize: 'var(--t-meta, 13px)',
              fontWeight: 600,
              color: 'var(--primary-text)',
              textDecoration: 'none',
              marginTop: 4,
            }}
          >
            Open Packing Queue <Icon name="arrow_right" size={14} />
          </Link>
        </div>

        {/* Card 3: Maintenance / QC Hold */}
        <div
          className="dashboard-situational-card lift"
          style={{
            background: 'var(--surface-card, var(--card))',
            border: '1px solid var(--border)',
            borderRadius: 'var(--r-card)',
            padding: '16px 20px',
            boxShadow: 'var(--shadow-card), var(--specular-rim)',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            gap: 12,
            minHeight: 140,
          }}
        >
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
              <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Maintenance & QC Hold
              </span>
              <Icon name="tool" size={18} style={{ color: 'var(--warn)' }} />
            </div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, margin: '2px 0 4px' }}>
              <span className="font-mono tabular-nums" style={{ fontSize: '1.75rem', fontWeight: 700, color: openCases > 0 ? 'var(--warn-text)' : 'var(--text)', fontFamily: 'var(--font-id, sans-serif)' }}>
                {openCases}
              </span>
              <span style={{ fontSize: '0.95rem', fontWeight: 600, color: 'var(--text2)' }}>
                Open {openCases === 1 ? 'Case' : 'Cases'} / Holds
              </span>
            </div>
            <p style={{ margin: 0, fontSize: 'var(--t-meta, 13px)', color: 'var(--muted)', lineHeight: 1.4 }}>
              Equipment flagged for repair, inspection, or missing
            </p>
          </div>
          <Link
            to="/inventory/cases"
            className="press tap"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              minHeight: 'var(--tap, 44px)',
              fontSize: 'var(--t-meta, 13px)',
              fontWeight: 600,
              color: 'var(--warn-text)',
              textDecoration: 'none',
              marginTop: 4,
            }}
          >
            View Cases & QC <Icon name="arrow_right" size={14} />
          </Link>
        </div>
      </div>
    </PageShell>
  )
}
