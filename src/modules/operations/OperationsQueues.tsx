import { useState, useMemo, useEffect, useRef, useCallback, type CSSProperties } from 'react'
import { Link, useSearchParams, useNavigate } from 'react-router-dom'
import Icon, { type IconName } from '../../components/ui/Icon'
import { Card, PageHeader, PageActions, Button, cardStyle } from '../../components/ui/Page'
import { PageShell } from '../../components/ui/PageShell'
import { PageBody } from '../../components/ui/PageBody'
import { DataAgeBadge } from '../../components/ui/DataAgeBadge'
import { FastReturnModal } from '../rentals/modals/FastReturnModal'
import { BarcodeLookupModal } from '../rentals/modals/BarcodeLookupModal'
import { CasesWorkspace } from './CasesWorkspace'
import { STATUS } from '../../lib/status'
import { statusToken, JOBS as JOBS_META, type JobName, type BookingStatus } from '../../lib/workflow'
import { latePickups, listBookings, overdue, quotesExpiring, type BookingListRow } from '../../lib/queries/bookings'
import { useList, type ListResult } from '../../lib/queries/useList'
import type { ListFilters } from '../../lib/queries/listQuery'
import {
  QUEUES,
  GROUP_LABEL,
  URL_KEY,
  formatDueAt,
  groupFromParam,
  jobListFilters,
  jobRoute,
  queueCountFilters,
  queueFromParam,
  toJobRow,
  businessNowAd,
  overdueAlert,
  quoteLapsedAlert,
  periodRange,
  isOpenStatus,
  type JobRow,
  type Queue,
} from '../../lib/queries/operations'
import AlertsPanel from '../today/AlertsPanel'
import { useViewport } from '../../lib/device'
import { ConfirmDialog } from '../../components/ui/ConfirmDialog'
import OperationsShell from './OperationsShell'
import { useCompactHeader } from '../../lib/headerRoom'
import { kathmanduCivil, NPT_OFFSET_MIN, getBusinessToday } from '../../lib/bs'
import { CalendarPopover, DateField } from '../../components/ui/DateField'
import { FilterButton, FilterDrawer, FilterSection } from '../../components/ui/FilterDrawer'
import { FilterDatePicker } from '../../components/ui/FilterDatePicker'
import { AppPageToolbar } from '../../components/ui/AppPageToolbar'
import { Pagination } from '../../components/ui/Pagination'
import { DataTableShell } from '../../components/ui/DataTable'
import './operations.css'
import { useOperationsWorkspace } from './OperationsWorkspaceContext'
import { useDomainEvent } from '../../events/useDomainEvent'
import { EVENT_TYPES } from '../../events/eventBus'
import { listCases, type Case } from '../../lib/queries/cases'


const th = {
  textAlign: 'left' as const,
  padding: '9px 10px',
  fontSize: 'var(--t-th)',
  fontWeight: 600,
  color: 'var(--text2)',
  whiteSpace: 'nowrap' as const,
  borderBottom: '1px solid var(--border)',
}
/*
 * `height` on a `<td>` behaves as a MINIMUM, so this is the §7.3 row floor
 * ("rows >= 56px") expressed with the token rather than with padding
 * arithmetic; the horizontal padding is left alone.
 *
 * These rows already clear 56 today — but by accident, not by rule. The Action
 * cell holds a primary `Button`, `Page.tsx` gives that `minHeight: 44`, and 44
 * plus this cell's 10px padding is the only thing holding the row open.
 * Nothing states it, and the cell beside it would be the first casualty: it is
 * a 44x44 overflow `Link`, so quieten or drop the verb button and the row falls
 * to ~38px, at which point that 44px target overhangs its neighbours by ~3px
 * top and bottom, the rows touch, and the later row in the DOM wins a tap in
 * the overlap band. The Link goes to `/rentals/:bookingNo` and this queue is
 * time-ordered, so the row above and the row below are two different bookings
 * due minutes apart — the wrong one is a plausible-looking wrong one.
 *
 * Stating the floor here makes the height a property of the row rather than of
 * one control that happens to be tall.
 */
const td = { height: 'var(--row-min-h)', padding: '10px', fontSize: 'var(--t-meta)', color: 'var(--text)', whiteSpace: 'nowrap' as const }

/**
 * **Floor** — spec 03 §3.1, `/operations`.
 *
 * > *"queue chips filter one time-ordered list"*
 *
 * That sentence is the whole screen, and it is what this rebuild implements.
 * The chip row selects a predicate; the list underneath is always the same
 * list, ordered by the instant each job is due. Three layouts:
 *
 *  - **desktop ≥1280** — chips, then the table, then a right rail;
 *  - **tablet 768–1279** — chips, then the same table, then the rail's content
 *    **inline beneath it**. Rulings §7: *"right rails collapse below 1280"
 *    means reflow, not hide* — so the rail is not wrapped in `Rail`
 *    (`CollapsibleAside`) at this width, because that hides it behind a 28px
 *    handle, which is not what §3.1's tablet drawing shows;
 *  - **phone <768** — the table becomes card rows, rail content still inline.
 *
 * ## Consolidated 22 Sep 2026 (owner review)
 *
 * The day scope, client and project filters had grown three surfaces — a
 * topline row, a filters row, and the drawer — so the same control appeared
 * two or three times on one screen. There is now exactly one of each: the
 * header holds page actions only (Scan, More), the chip row selects the
 * queue, and one toolbar below it carries day scope, search, client,
 * project and the drawer's Filters button. The drawer keeps only what has
 * no toolbar home (queue side, exception facets, alerts). The dead
 * "All staff" select — one option, no handler — was removed rather than
 * shipped as a disabled promise.
 *
 * ## What changed on 12 Aug, and why
 *
 * 1. **Five KPI-sized queue CARDS became five chips.** §3.1 draws
 *    `(Packing 6) (Handover 4) (Return 5) (Reset 3)` on one line above one
 *    list. Nothing is lost — a chip carries the same queried count the card
 *    did — so this is the arrangement change the wireframe specifies, not a
 *    content deletion (Rulings §1).
 * 2. **A day scope appeared** — `[Today] [Tomorrow] [Custom ▾]`, drawn in the
 *    §3.1 header at all three widths. `data/operations.ts` recorded that
 *    `operationQueue`'s `fromAd`/`toAd` were never passed because *"there is
 *    no date control on this screen to bind them to, and inventing one would
 *    be a product decision"*. The spec now supplies the control, so the
 *    arguments have a source and are bound. Custom with no dates picked is
 *    every day — that is where "one Floor page for **all** days" (spec line 3)
 *    lives, rather than in a fourth chip the drawing does not have.
 * 3. **Cases left the chip row.** See CASES below.
 *
 * ## Law 6 — this screen asks for no money
 *
 * `listBookings` is called without `withDeposit`, so `deposit_required` is not
 * in the select at all. That is not a formality: the column is unmasked on the
 * base table and `bookings_select` is `auth_is_staff()`, which includes the
 * three money-blind roles, so the query refusing to ask is the only thing
 * standing between the floor and a rupee figure.
 */

/*
 * ── CASES ──────────────────────────────────────────────────────────────────
 *
 * TODO(decision): spec 03 §3.1 draws **five** chips — the four verbs plus
 * `(Cases 1)` — over "one time-ordered list". The audit
 * (`CONFLICTS.md` 03 §8) offered exactly two lawful readings and forbade the
 * third, which is what this file used to do: swap `<CasesQueue />` in for the
 * whole list when the chip was pressed, so the chip *replaced* the list
 * instead of filtering it.
 *
 * **Taken: drop Cases from the chip row; it keeps its own route.** The
 * projection was considered and rejected on three counts, each of which would
 * have meant inventing a value:
 *
 *  - **time** — the shared row is ordered by the instant a job is due
 *    (`pickup_at` / `return_at`). A `Case` (`data/cases.ts:234`) carries
 *    `openedAd`, which is when the incident was raised, not when anything is
 *    due. Sorting the two together orders one list by two different clocks.
 *  - **client** — the row's client column is the booking's client. A Case
 *    carries `counterpartyName`, which is a client *or a vendor or an
 *    insurer* (`counterpartyKind`). Rendering a vendor under "client" is a
 *    wrong label, not a projection.
 *  - **one query** — the four verb queues are server-side predicates over
 *    `bookings`. `CASES` is a seeded array in `data/cases.ts`. A merged list
 *    cannot be time-ordered by one query, and re-introducing an in-memory
 *    merge is the exact thing this file was rewritten to remove.
 *
 * The Cases page lives at `/inventory/cases` (see `CASES_ROUTE` below;
 * `/operations/cases` replace-redirects) and is linked from the chip strip,
 * so nothing is unreachable. Revisit if Cases gains a due instant and a
 * booking link.
 */
/* Open cases, off the same seed the Cases page lists — chip equals page. */
const fetchCases = () => listCases()

/**
 * The four verb chips. `QUEUES` still declares Cases; it is filtered out here,
 * not deleted there — `Queue.job` stays `JobName | 'Cases'` so nothing else
 * that reads the queue vocabulary has to change.
 */
type VerbQueue = Omit<Queue, 'job'> & { job: JobName }
const CHIPS: VerbQueue[] = QUEUES.filter((q): q is VerbQueue => q.job !== 'Cases')

/* ── Day scope ────────────────────────────────────────────────────────────
 *
 * §3.1's `[Today] [Tomorrow] [Custom ▾]`.
 *
 * Law 7: instants are stored AD/UTC and rendered in NPT, so a "day" on this
 * screen is a Kathmandu civil day converted back to a bounded instant range.
 * The offset string is FORMATTED from `bs.ts`'s `NPT_OFFSET_MIN` rather than
 * typed again — `queries/bookings.ts:657` does the same arithmetic for its own
 * private `startOfDay`/`endOfDay`, which are not exported.
 */
const NPT_OFFSET = `${NPT_OFFSET_MIN < 0 ? '-' : '+'}${String(Math.floor(Math.abs(NPT_OFFSET_MIN) / 60)).padStart(2, '0')}:${String(Math.abs(NPT_OFFSET_MIN) % 60).padStart(2, '0')}`

/** A `Date` → the Kathmandu civil day it falls on, `YYYY-MM-DD`. */
function nepalDay(ad: Date): string {
  return new Date(kathmanduCivil(ad)).toISOString().slice(0, 10)
}

/**
 * ⛔ This read a module-scope `TODAY = getBusinessToday()` (X-05). The day scope
 * is resolved once per import, so a tablet left on this screen across midnight
 * kept querying yesterday under chips reading Today and Tomorrow.
 * `getBusinessToday()` is called here instead, on every evaluation.
 */
function dayOffsetFromToday(days: number): string {
  return nepalDay(new Date(getBusinessToday().getTime() + days * 86_400_000))
}

export type DayScope = 'today' | 'tomorrow' | 'week' | 'next7' | 'custom'

const SCOPE_LABEL: Record<DayScope, string> = {
  today: 'Today',
  tomorrow: 'Tomorrow',
  week: 'This Week',
  next7: 'Next 7 Days',
  custom: 'Custom',
}
/** The compact Operations picker intentionally keeps the four operational presets. */
const DISPLAY_SCOPE_ORDER: DayScope[] = ['today', 'tomorrow', 'week', 'custom']

function scopeFromParam(param: string | null): DayScope {
  return param === 'tomorrow' || param === 'week' || param === 'next7' || param === 'custom' ? param : 'today'
}

/**
 * The scope as a `dateRange`, or `null` for "no constraint".
 *
 * Custom with neither end picked is deliberately `null` rather than an
 * open-ended range: it is the "all days" the page's own subtitle promises, and
 * an unbounded `dateRange` would be a filter that filters nothing while
 * telling `useList` the list is filtered.
 */
function scopeRange(scope: DayScope, from: string, to: string): { fromAd: string; toAd: string } | null {
  if (scope === 'today') {
    const d = dayOffsetFromToday(0)
    return { fromAd: `${d}T00:00:00.000${NPT_OFFSET}`, toAd: `${d}T23:59:59.999${NPT_OFFSET}` }
  }
  if (scope === 'tomorrow') {
    const d = dayOffsetFromToday(1)
    return { fromAd: `${d}T00:00:00.000${NPT_OFFSET}`, toAd: `${d}T23:59:59.999${NPT_OFFSET}` }
  }
  /*
   * The two multi-day scopes (added 30 Aug) delegate to `data/today.ts`'s
   * `periodRange`, which already states the app's two conventions in one
   * correctable place: This Week runs Monday→Sunday (CAL_WEEKDAYS starts on
   * MON; Saturday is the weekend day off, not the week's start), and Next 7
   * Days is today plus six — seven days INCLUDING today. Re-deriving either
   * here would be a second opinion waiting to disagree.
   */
  if (scope === 'week' || scope === 'next7') {
    const r = periodRange(scope === 'week' ? 'This Week' : 'Next 7 Days', dayOffsetFromToday(0))
    if (!r) return null
    return { fromAd: `${r.from}T00:00:00.000${NPT_OFFSET}`, toAd: `${r.to}T23:59:59.999${NPT_OFFSET}` }
  }
  if (!from && !to) return null
  return {
    ...(from ? { fromAd: `${from}T00:00:00.000${NPT_OFFSET}` } : {}),
    ...(to ? { toAd: `${to}T23:59:59.999${NPT_OFFSET}` } : {}),
  } as { fromAd: string; toAd: string }
}

/**
 * Bind the scope onto a filter set.
 *
 * The column is whichever the set already sorts by — `jobListFilters` picks
 * `pickup_at` for the two jobs that put gear out and `return_at` for the two
 * that bring it back, and the Due cell reads the same column. Filtering on the
 * sort column is what keeps "Today" meaning the same thing as the instant in
 * the row.
 */
function withScope(filters: ListFilters, range: { fromAd?: string; toAd?: string } | null, carryOver: boolean): ListFilters {
  if (!range) return filters
  const column = filters.sort?.column ?? 'pickup_at'
  // 7 Oct audit: unfinished jobs remain due after their scheduled day passes.
  // Today/week scopes include carry-over; future and custom dates stay bounded.
  if (carryOver) {
    return { ...filters, dateRange: { column, ...(range.toAd ? { toAd: range.toAd } : {}) } }
  }
  return { ...filters, dateRange: { column, ...range } }
}

/**
 * The one fetcher both the list and the four chip counts use.
 *
 * `withCount: true` on every call is what makes "one number, one source" true:
 * the number on a chip and the number in the list header are the same
 * server-side count of the same set, not two constants that can disagree.
 * **No `withDeposit`** — see Law 6 above.
 */
const fetchBookings = (filters: ListFilters) => listBookings({ ...filters, withCount: true })
const fetchQueueCount = (filters: ListFilters) => listBookings({ ...filters, headOnly: true })

/** One chip's count, scoped to the same day range the list is showing (pure HEAD count, no row joins). */
function useQueueCount(job: JobName, range: { fromAd?: string; toAd?: string } | null, carryOver: boolean): ListResult<BookingListRow> {
  return useList<BookingListRow>(fetchQueueCount, withScope(queueCountFilters(job), range, carryOver), { isFilteredOverride: false })
}

/* ── Law L3: The four-way exception facet group ─────────────────────────── */

export type ExceptionFacet = 'starting_today' | 'ending_today' | 'overdue_start' | 'overdue_end'

export const EXCEPTION_FACETS: Array<{ key: ExceptionFacet; label: string; icon: 'truck' | 'return_arrow' | 'alert_triangle' | 'timer' }> = [
  { key: 'starting_today', label: 'Starting today', icon: 'truck' },
  { key: 'ending_today', label: 'Ending today', icon: 'return_arrow' },
  { key: 'overdue_start', label: 'Overdue start', icon: 'alert_triangle' },
  { key: 'overdue_end', label: 'Overdue end', icon: 'timer' },
]

export function exceptionFilters(facet: ExceptionFacet, nowAd: string, todayAd: string): ListFilters {
  const dayStart = `${todayAd}T00:00:00.000${NPT_OFFSET}`
  const dayEnd = `${todayAd}T23:59:59.999${NPT_OFFSET}`

  switch (facet) {
    case 'starting_today':
      return {
        dateRange: { column: 'pickup_at', fromAd: dayStart, toAd: dayEnd },
        chips: { stage: ['Booked', 'Packed'] },
        presence: { cancelled_at: false },
        sort: { column: 'pickup_at', ascending: true },
      }
    case 'ending_today':
      return {
        dateRange: { column: 'return_at', fromAd: dayStart, toAd: dayEnd },
        chips: { stage: ['On Rent'] },
        presence: { cancelled_at: false },
        sort: { column: 'return_at', ascending: true },
      }
    case 'overdue_start':
      // L3 fourth-facet half: the named late-pickup set (minute-floored instant,
      // Booked/Packed, cancelled excluded) — not a second inline answer.
      return latePickups(nowAd)
    case 'overdue_end':
      // L3 fourth-facet half: the named overdue set — same delegation.
      return overdue(nowAd)
  }
}

/* ── Chips ─────────────────────────────────────────────────────────────── */

function chipStyle(on: boolean) {
  return {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 'var(--sp-sm)',
    minHeight: 44,
    padding: '0 14px',
    borderRadius: 'var(--r-btn)',
    border: `1.5px solid ${on ? 'var(--primary, #2456d6)' : 'var(--border)'}`,
    background: on ? 'var(--select-bg)' : 'var(--card)',
    color: on ? 'var(--select-fg)' : 'var(--text)',
    fontSize: 'var(--t-meta)',
    fontWeight: 600,
    fontFamily: 'inherit',
    cursor: 'pointer',
    whiteSpace: 'nowrap' as const,
    flexShrink: 0,
    boxShadow: on ? '0 1px 3px rgba(0, 0, 0, 0.1)' : 'none',
    transition: 'all 120ms ease',
  }
}

function formatOperationBookingId(bookingNo: string | null | undefined): string {
  if (!bookingNo) return '—'
  const trimmed = bookingNo.trim()
  if (/^#?\d+$/.test(trimmed)) {
    const digits = trimmed.replace(/^#/, '')
    return `#${digits.padStart(4, '0')}`
  }
  return trimmed
}

function getJobButtonProps(job: JobName): {
  icon: IconName
  style: CSSProperties
} {
  switch (job) {
    case 'Pack':
      return {
        icon: 'package',
        style: {
          minWidth: 104,
          minHeight: 44,
          justifyContent: 'center',
          gap: 6,
          background: 'color-mix(in srgb, var(--primary, #2563eb) 12%, var(--card))',
          border: '1px solid color-mix(in srgb, var(--primary, #2563eb) 45%, transparent)',
          color: 'var(--primary-text, #1d4ed8)',
          fontWeight: 600,
          borderRadius: 'var(--r-btn, 8px)',
          boxShadow: '0 1px 2px rgba(37, 99, 235, 0.08)',
        },
      }
    case 'Handover':
      return {
        icon: 'truck',
        style: {
          minWidth: 104,
          minHeight: 44,
          justifyContent: 'center',
          gap: 6,
          background: 'color-mix(in srgb, var(--success, #16a34a) 12%, var(--card))',
          border: '1px solid color-mix(in srgb, var(--success, #16a34a) 45%, transparent)',
          color: 'var(--success-text, #15803d)',
          fontWeight: 600,
          borderRadius: 'var(--r-btn, 8px)',
          boxShadow: '0 1px 2px rgba(22, 163, 74, 0.08)',
        },
      }
    case 'Return':
      return {
        icon: 'return_arrow',
        style: {
          minWidth: 104,
          minHeight: 44,
          justifyContent: 'center',
          gap: 6,
          background: 'color-mix(in srgb, var(--warn, #ea580c) 12%, var(--card))',
          border: '1px solid color-mix(in srgb, var(--warn, #ea580c) 45%, transparent)',
          color: 'var(--warn-text, #c2410c)',
          fontWeight: 600,
          borderRadius: 'var(--r-btn, 8px)',
          boxShadow: '0 1px 2px rgba(234, 88, 12, 0.08)',
        },
      }
    case 'Reset':
      return {
        icon: 'tool',
        style: {
          minWidth: 104,
          minHeight: 44,
          justifyContent: 'center',
          gap: 6,
          background: 'color-mix(in srgb, var(--ready, #ca8a04) 14%, var(--card))',
          border: '1px solid color-mix(in srgb, var(--ready, #ca8a04) 45%, transparent)',
          color: 'var(--ready-text, #a16207)',
          fontWeight: 600,
          borderRadius: 'var(--r-btn, 8px)',
          boxShadow: '0 1px 2px rgba(202, 138, 4, 0.08)',
        },
      }
  }
}

interface QueueChipProps {
  queue: VerbQueue
  active: boolean
  total: number | null
  loading: boolean
  error: string | null
  onToggle: () => void
}

function QueueChip({ queue, active, total, loading, error, onToggle }: QueueChipProps) {
  const tok = total === 0 ? STATUS.neutral : queue.job === 'Reset' ? STATUS.progress : STATUS[statusToken(JOBS_META[queue.job].runsAt)]

  /*
   * The count, or an explicit non-value. `—` is not a zero and must not be
   * mistakable for one: it means this chip has no number to show, which
   * happens while a count query is in flight for the first time and when one
   * has failed. Never a plausible default.
   */
  const countText = loading && total === null ? '…' : total === null ? '—' : String(total)
  const countLabel =
    total === null ? `${queue.title}: no count available` : `${queue.title}: ${total} ${total === 1 ? 'job' : 'jobs'}`

  return (
    <button
      type="button"
      className="operations-v2__queue"
      onClick={onToggle}
      aria-pressed={active}
      style={chipStyle(active)}
      {...(error ? { title: error } : {})}
    >
      {/* Law 11 — the queue's stage tone never carries the meaning alone; the icon and the word are both present. */}
      <Icon name={queue.icon} size={15} style={{ color: active ? 'var(--select-fg)' : 'var(--text2)', flexShrink: 0 }} />
      {queue.title}
      <span
        className="figure"
        aria-label={countLabel}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          minWidth: 22,
          height: 20,
          padding: '0 6px',
          borderRadius: 'var(--r-badge)',
          background: active ? 'var(--select-fg)' : tok.bg,
          color: active ? 'var(--select-bg)' : tok.fg,
          fontSize: 'var(--t-meta)',
          fontWeight: 700,
        }}
      >
        {countText}
      </span>
    </button>
  )
}

/** The stage badge — Law 11: icon **and** label **and** colour, never colour alone. */
function StageBadge({ stage }: { stage: JobRow['stage'] }) {
  const tok = STATUS[statusToken(stage)]
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 'var(--sp-xs)',
        height: 20,
        padding: '0 8px',
        borderRadius: 'var(--r-badge)',
        background: tok.bg,
        color: tok.fg,
        fontSize: 'var(--t-meta)',
        fontWeight: 600,
      }}
    >
      <Icon name="dot" size={9} />
      {stage}
    </span>
  )
}

export default function OperationsQueues() {
  const { openOperations } = useOperationsWorkspace()
  const routeNavigate = useNavigate()
  // Keep the existing dense table render readable while changing its action
  // from URL navigation to the global modal host.
  const navigate = (route: string) => {
    const match = route.match(/^\/rentals\/([^/]+)\/(packing|handover|return|reset)$/)
    if (!match) { routeNavigate(route); return }
    const row = jobs.find((candidate) => candidate.bookingNo === match[1])
    if (!row) return
    /* RULING 2026-10-14 (R14-1): desktop (≥1280) docks the job beside the queue; narrower widths keep the full-screen sheet. */
    if (viewport === 'desktop') requestDock({ bookingNo: row.bookingNo, stage: row.stage, job: row.job })
    else openOperations(row.bookingNo, row.stage, row.job)
  }
  type Dock = { bookingNo: string; stage: BookingStatus; job: JobName }
  const [dock, setDock] = useState<Dock | null>(null)
  const [pendingDock, setPendingDock] = useState<Dock | null>(null)
  const [cursorNo, setCursorNo] = useState<string | null>(null)
  const dockDirty = useRef(false)
  const dockBusy = useRef(false)
  const [dockProtected, setDockProtected] = useState(false)
  const [dockNotice, setDockNotice] = useState<string | null>(null)
  const onDockDirty = useCallback((dirty: boolean) => { dockDirty.current = dirty; setDockProtected(dirty || dockBusy.current) }, [])
  const onDockBusy = useCallback((busy: boolean) => { dockBusy.current = busy; setDockProtected(busy || dockDirty.current); if (!busy) setDockNotice(null) }, [])
  /* RULING 2026-10-14 (R14-3): swapping the docked booking would drop unsaved packing work, so ask first. */
  const requestDock = (next: Dock) => {
    if (dockBusy.current) { setDockNotice('An operation is being saved. Wait for its result before changing bookings.'); return }
    if (dock && (dock.bookingNo !== next.bookingNo || dock.job !== next.job) && dockDirty.current) setPendingDock(next)
    else setDock(next)
  }
  const [params, setParams] = useSearchParams()
  const [fastReturnOpen, setFastReturnOpen] = useState(false)
  const [barcodeModalOpen, setBarcodeModalOpen] = useState(false)
  const [searchInput, setSearchInput] = useState('')
  const [caseSearchInput, setCaseSearchInput] = useState('')
  const [search, setSearch] = useState('')
  const [clientFilter, setClientFilter] = useState('all')
  const [projectFilter, setProjectFilter] = useState('all')
  const [showDateMenu, setShowDateMenu] = useState(false)
  const [showMoreFilters, setShowMoreFilters] = useState(false)
  const [selectedBookingNos, setSelectedBookingNos] = useState<Set<string>>(() => new Set())
  const [page, setPage] = useState(0)
  const [pageSize, setPageSize] = useState(25)
  const dateMenuRef = useRef<HTMLDivElement | null>(null)
  /* Law 13/14 — width decides, at v4.1 §7.7's 768 / 1280. */
  const viewport = useViewport()
  const phone = viewport === 'phone'
  const tabular = !phone
  // Keep the SAME workspace mounted when rotation/zoom crosses a breakpoint
  // with unsaved marks or an in-flight write. New narrow-screen jobs still use
  // the global modal; this existing dock becomes a focused inline workspace.
  const dockOpen = dock !== null && (viewport === 'desktop' || dockProtected)
  useEffect(() => {
    if (dockOpen && dockProtected && viewport !== 'desktop') document.querySelector('.operations-shell__panel')?.scrollIntoView({ block: 'start' })
  }, [dockOpen, dockProtected, viewport])
  /* RULING 2026-10-15: below desktop the two workspace links live in More and a fresh
     data badge takes no width, so the page title keeps the header (BLOCKER-02: at 375px
     the header overflowed by 207px; at 768px the title measured 0px). Revert = set this
     to `false`. RULING 2026-10-15 (zoom audit): decided by the header's own width, so a
     1280px desktop with the sidebar open (header 1024px) is compact too. */
  const compactHeader = useCompactHeader()

  /* The URL is the state (§5.1). `?queue=packing` and `?quick=pickup` are
     mutually exclusive — setting either clears the other — so a queue is
     linkable, shareable and survives a reload, and the sidebar child and the
     chip cannot disagree about which queue is open. `?day=` carries the scope
     alongside either. */
  const selected = queueFromParam(params.get('queue'))
  const group = groupFromParam(params.get('quick'))
  const scope = scopeFromParam(params.get('day'))
  const customFrom = params.get('from') ?? ''
  const customTo = params.get('to') ?? ''
  const exceptionParam = params.get('exception') as ExceptionFacet | null
  const exception = exceptionParam && ['starting_today', 'ending_today', 'overdue_start', 'overdue_end'].includes(exceptionParam) ? exceptionParam : null
  /* `queueFromParam` can still answer 'Cases' from a bookmarked URL. It is no
     longer a chip, so it selects nothing rather than swapping the list out. */
  const activeJob: JobName | null = selected === 'Cases' ? null : selected
  const range = scopeRange(scope, customFrom, customTo)
  const isFiltered = activeJob !== null || group !== null || params.has('day') || exception !== null

  const patch = (next: Record<string, string | null>) => {
    const merged = new URLSearchParams(params)
    for (const [k, v] of Object.entries(next)) {
      if (v === null) merged.delete(k)
      else merged.set(k, v)
    }
    setParams(merged)
  }

  const setActive = (job: JobName | null) => patch({ queue: job ? URL_KEY[job] : null, quick: null, exception: null })
  const setQuick = (q: 'pickup' | 'return') => patch({ quick: group === q ? null : q, queue: null, exception: null })
  const setScope = (s: DayScope) => patch({ day: s, ...(s === 'custom' ? {} : { from: null, to: null }) })
  const clearAllFilters = () => setParams(new URLSearchParams())
  const clearOperationFilters = () => {
    clearAllFilters()
    setSearchInput('')
    setSearch('')
    setClientFilter('all')
    setProjectFilter('all')
    setSelectedBookingNos(new Set())
  }

  /* Queue search stays local to the already server-filtered operation set and
     waits briefly between keystrokes, so scanning a booking number does not
     cause a render for every physical key press. */
  useEffect(() => {
    const timeout = window.setTimeout(() => setSearch(searchInput), 250)
    return () => window.clearTimeout(timeout)
  }, [searchInput])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setShowDateMenu(false)
        setShowMoreFilters(false)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  useEffect(() => {
    if (!showDateMenu) return
    const onPointerDown = (event: MouseEvent) => {
      const target = event.target as Node
      if (!dateMenuRef.current?.contains(target)) setShowDateMenu(false)
    }
    document.addEventListener('mousedown', onPointerDown)
    return () => document.removeEventListener('mousedown', onPointerDown)
  }, [showDateMenu])

  const nowAd = businessNowAd()
  const todayNepal = dayOffsetFromToday(0)

  const activeFilters = useMemo(() => {
    if (exception) {
      return exceptionFilters(exception, nowAd, todayNepal)
    }
    return withScope(jobListFilters(activeJob, group), range, scope === 'today' || scope === 'week')
  }, [exception, nowAd, todayNepal, activeJob, group, range, scope])

  /*
   * The one list. Every predicate server-side: a queue chip → that queue's
   * stage; a group chip → the stage union of its two jobs; an exception facet →
   * the 4-way L3 exception filter; neither → all four verbs. The day scope
   * binds onto whichever of those is active.
   */
  const list = useList<BookingListRow>(fetchBookings, activeFilters, {
    isFilteredOverride: isFiltered,
  })

  /*
   * One count query per chip, four fixed calls in a fixed order — never a loop
   * over `CHIPS`, so the hook order cannot change between renders. Each asks
   * for a single row and reads `total`, so the cost is four counts, not four
   * lists.
   */
  const packCount = useQueueCount('Pack', range, scope === 'today' || scope === 'week')
  const handoverCount = useQueueCount('Handover', range, scope === 'today' || scope === 'week')
  const returnCount = useQueueCount('Return', range, scope === 'today' || scope === 'week')
  const resetCount = useQueueCount('Reset', range, scope === 'today' || scope === 'week')
  const casesList = useList<Case>(fetchCases, {}, { isFilteredOverride: false })
  const openCases = casesList.error || casesList.loading ? null : casesList.rows.filter((c) => isOpenStatus(c.status)).length
  const counts: Record<JobName, ListResult<BookingListRow>> = {
    Pack: packCount,
    Handover: handoverCount,
    Return: returnCount,
    Reset: resetCount,
  }

  const alertsQ = useList<BookingListRow>(fetchBookings, overdue(nowAd), { isFilteredOverride: false })
  const quotesQ = useList<BookingListRow>(fetchBookings, quotesExpiring(nowAd), { isFilteredOverride: false })
  const alertRows = [
    ...alertsQ.rows.map((r) => overdueAlert(r, nowAd)),
    ...quotesQ.rows.map((r) => quoteLapsedAlert(r)),
  ]
  const retryAlerts = () => {
    alertsQ.refetch()
    quotesQ.refetch()
  }

  /* RULING 2026-10-14 (R14-2): desktop keyboard — J/K (or ↓/↑) move a cursor through the page, Enter opens the cursor row's job
     in the dock. Moving never opens anything, so a cursor sweep cannot discard work in the panel. */
  useEffect(() => {
    if (viewport !== 'desktop') return
    const onKey = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey) return
      const t = event.target instanceof Element ? event.target : null
      if (t?.closest('input, textarea, select, button, a, [contenteditable="true"], [role="dialog"], [role="alertdialog"]')) return
      if (document.querySelector('.operations-shell__panel') && t?.closest('.operations-shell__panel')) return
      const down = event.key === 'j' || event.key === 'ArrowDown'
      const up = event.key === 'k' || event.key === 'ArrowUp'
      if (down || up) {
        if (pagedJobs.length === 0) return
        event.preventDefault()
        const at = pagedJobs.findIndex((j) => j.bookingNo === (cursorNo ?? dock?.bookingNo))
        const next = at < 0 ? 0 : Math.min(pagedJobs.length - 1, Math.max(0, at + (down ? 1 : -1)))
        const no = pagedJobs[next]!.bookingNo
        setCursorNo(no)
        document.querySelector(`tr[data-booking-no="${CSS.escape(no)}"]`)?.scrollIntoView?.({ block: 'nearest' })
      } else if (event.key === 'Enter' && cursorNo) {
        const row = pagedJobs.find((j) => j.bookingNo === cursorNo)
        if (!row) return
        event.preventDefault()
        requestDock({ bookingNo: row.bookingNo, stage: row.stage, job: row.job })
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  const refreshAll = () => {
    list.refetch()
    packCount.refetch()
    handoverCount.refetch()
    returnCount.refetch()
    resetCount.refetch()
    /* The Alerts panel lives on this page now — the header's Refresh must not
       leave it quoting stale exceptions beside a fresh queue list. */
    alertsQ.refetch()
    quotesQ.refetch()
  }

  useDomainEvent(EVENT_TYPES.RENTAL_PACKED, refreshAll)
  useDomainEvent(EVENT_TYPES.RENTAL_HANDED_OVER, refreshAll)
  useDomainEvent(EVENT_TYPES.RENTAL_PICKED_UP, refreshAll)
  useDomainEvent(EVENT_TYPES.RENTAL_RETURNED, refreshAll)
  useDomainEvent(EVENT_TYPES.RENTAL_RESET_COMPLETED, refreshAll)
  useDomainEvent(EVENT_TYPES.RENTAL_CONFIRMED, refreshAll)
  useDomainEvent(EVENT_TYPES.RENTAL_CLOSED, refreshAll)
  useDomainEvent(EVENT_TYPES.RENTAL_CANCELLED, refreshAll)


  /* Resolved once per render, and passed in, so the row mapping stays pure. */
  const now = Date.now()
  const jobs: JobRow[] = list.rows.flatMap((row) => {
    const j = toJobRow(row, now)
    return j ? [j] : []
  })
  const visibleJobs = useMemo(() => {
    const term = search.trim().toLocaleLowerCase()
    return jobs.filter((job) =>
      (clientFilter === 'all' || job.clientId === clientFilter) &&
      (projectFilter === 'all' || job.project === projectFilter) &&
      (!term || [job.bookingNo, job.clientName, job.project ?? '', job.stage, job.job].some((value) => value.toLocaleLowerCase().includes(term))),
    )
  }, [jobs, search, clientFilter, projectFilter])
  const clients = useMemo(() => Array.from(new Map(jobs.map((job) => [job.clientId, job.clientName])).entries()), [jobs])
  const projects = useMemo(() => Array.from(new Set(jobs.flatMap((job) => job.project ? [job.project] : []))).sort(), [jobs])
  const localFilterOn = search.trim() !== '' || clientFilter !== 'all' || projectFilter !== 'all'
  const pageCount = Math.max(1, Math.ceil(visibleJobs.length / pageSize))
  const currentPage = Math.min(page, pageCount - 1)
  const pagedJobs = visibleJobs.slice(currentPage * pageSize, currentPage * pageSize + pageSize)
  const allVisibleSelected = pagedJobs.length > 0 && pagedJobs.every((job) => selectedBookingNos.has(job.bookingNo))
  const operationFilterCount = [
    scope !== 'today',
    group !== null,
    exception !== null,
    clientFilter !== 'all',
    projectFilter !== 'all',
    search.trim() !== '',
  ].filter(Boolean).length
  useEffect(() => {
    setPage(0)
  }, [search, clientFilter, projectFilter, selected, group, exception, scope, pageSize])
  const toggleBooking = (bookingNo: string) => {
    setSelectedBookingNos((current) => {
      const next = new Set(current)
      if (next.has(bookingNo)) next.delete(bookingNo)
      else next.add(bookingNo)
      return next
    })
  }
  const toggleVisibleBookings = () => {
    setSelectedBookingNos((current) => {
      const next = new Set(current)
      if (allVisibleSelected) pagedJobs.forEach((job) => next.delete(job.bookingNo))
      else pagedJobs.forEach((job) => next.add(job.bookingNo))
      return next
    })
  }

  const overdueCount = useMemo(() => jobs.filter((j) => j.isPastDue).length, [jobs])

  const listLabel = exception
    ? (EXCEPTION_FACETS.find((ef) => ef.key === exception)?.label ?? exception)
    : activeJob
      ? (CHIPS.find((q) => q.job === activeJob)?.title ?? activeJob)
      : group
        ? GROUP_LABEL[group]
        : 'All jobs'
  // One line on the date button: "Today", else the English date (a range shows both ends).
  const adLabel = (day: string) => new Date(`${day}T00:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })
  const dateButtonLabel =
    scope === 'today'
      ? (overdueCount > 0 ? `Today & Overdue (${overdueCount})` : 'Today')
      : scope === 'tomorrow' ? adLabel(dayOffsetFromToday(1))
      : scope === 'custom'
        ? (!range ? 'All days' : customFrom && customTo && customFrom !== customTo ? `${adLabel(customFrom)} – ${adLabel(customTo)}` : customFrom ? adLabel(customFrom) : 'Custom range')
        : SCOPE_LABEL[scope]
  const scopeLabel = scope === 'custom' && !range ? 'all days' : SCOPE_LABEL[scope].toLowerCase()
  const emptyTitle = isFiltered ? `Nothing in ${listLabel} for ${scopeLabel}` : 'No jobs right now'
  const emptyMessage = activeJob
    ? 'This queue is clear for the selected days — widen the day scope or check back once the next booking reaches this stage.'
    : group
      ? 'Both queues on this side are clear for the selected days.'
      : 'No booking is sitting at a stage that has floor work in this range.'

  return (
    <PageShell width="full">
      <div
        className="operations-v2"
        style={{
          display: 'grid',
          gridTemplateColumns: 'minmax(0,1fr)',
          gap: 'var(--sp-md)',
          alignItems: 'start',
        }}
      >
      {/* Renders in the global header beside the page name (FilterButton's default).
          On a phone it moves into More with the two links (see `compactHeader`). */}
      {selected !== 'Cases' && !phone && (
        <FilterButton
          onClick={() => setShowMoreFilters((open) => !open)}
          activeCount={operationFilterCount}
          controls="operations-filters"
          expanded={showMoreFilters}
        />
      )}
      <div style={{ gridColumn: '1 / -1' }}>
        {/* RULING 2026-10-23: the active queue owns the shell's single search. */}
        <PageHeader
          title="Operations"
          module="operations"
          search={selected === 'Cases' ? {
            value: caseSearchInput,
            onChange: setCaseSearchInput,
            onClear: () => { setCaseSearchInput(''); patch({ q: null }) },
            onKeyDown: event => { if (event.key === 'Enter') patch({ q: caseSearchInput || null }) },
            placeholder: 'Search cases by ID, title, client… (press /)',
            ariaLabel: 'Search cases by ID, title, or client',
          } : {
            value: searchInput,
            onChange: setSearchInput,
            onClear: () => setSearchInput(''),
            placeholder: 'Filter current queue… (press /)',
            ariaLabel: 'Search ID, client, project',
          }}
          status={
            selected && !phone ? (
              <span
                className="eyebrow-pill"
                style={{
                  textTransform: 'none',
                  fontWeight: 600,
                  fontSize: 'var(--t-meta, 13px)',
                  letterSpacing: 'normal',
                }}
              >
                {selected}
              </span>
            ) : null
          }
          actions={
            <PageActions
              secondary={compactHeader ? [] : [
                <Button
                  key="delivery"
                  variant="outline"
                  icon="truck"
                  onClick={() => routeNavigate('/operations/delivery')}
                >
                  Delivery & Logistics
                </Button>,
                <Button
                  key="sub-rentals"
                  variant="outline"
                  icon="box"
                  onClick={() => routeNavigate('/operations/sub-rental')}
                >
                  Sub-Rentals
                </Button>,
              ]}
              overflow={compactHeader ? [
                { label: 'Delivery & Logistics', icon: 'truck', onClick: () => routeNavigate('/operations/delivery') },
                { label: 'Sub-Rentals', icon: 'box', onClick: () => routeNavigate('/operations/sub-rental') },
                ...(phone && selected !== 'Cases' ? [{
                  label: operationFilterCount > 0 ? `Filters (${operationFilterCount})` : 'Filters',
                  icon: 'filter' as const,
                  onClick: () => setShowMoreFilters(true),
                }] : []),
              ] : undefined}
              extra={<DataAgeBadge loadedAt={list.lastFetchedAt} onRefresh={refreshAll} loading={list.loading} quietWhenFresh={compactHeader} />}
            />
          }
        />
      </div>

      <div
        style={{
          gridColumn: 1,
          gridRow: 2,
          minWidth: 0,
          display: 'flex',
          flexDirection: 'column',
          gap: 'var(--sp-md)',
        }}
      >

      <div className="operations-v2__queues" role="group" aria-label="Operational queues">
        <button
          type="button"
          className="operations-v2__queue"
          onClick={() => setActive(null)}
          aria-pressed={selected === null && group === null && exception === null}
          aria-label={list.loading && list.total === null ? 'All Active: loading count' : list.error ? 'All Active: count unavailable' : `All Active: ${list.total ?? jobs.length} jobs`}
          style={chipStyle(selected === null && group === null && exception === null)}
        >
          <Icon name="checklist" size={15} style={{ color: (selected === null && group === null && exception === null) ? 'var(--select-fg)' : 'var(--text2)', flexShrink: 0 }} />
          All Active
          <span
            className="figure"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              minWidth: 22,
              height: 20,
              padding: '0 6px',
              borderRadius: 'var(--r-badge)',
              background: (selected === null && group === null && exception === null) ? 'var(--select-fg)' : 'var(--border)',
              color: (selected === null && group === null && exception === null) ? 'var(--select-bg)' : 'var(--text2)',
              fontSize: 'var(--t-meta)',
              fontWeight: 700,
            }}
          >
            {list.loading && list.total === null ? '…' : list.error ? '—' : String(list.total ?? jobs.length)}
          </span>
        </button>
        {CHIPS.map((q) => <QueueChip key={q.job} queue={q} active={selected === q.job} total={counts[q.job].total} loading={counts[q.job].loading} error={counts[q.job].error} onToggle={() => setActive(selected === q.job ? null : q.job)} />)}
        <Link
          to="/inventory/cases"
          onClick={(event) => { event.preventDefault(); patch({ queue: selected === 'Cases' ? null : 'cases', quick: null }) }}
          aria-pressed={selected === 'Cases'}
          className="operations-v2__queue"
          style={{ ...chipStyle(selected === 'Cases'), textDecoration: 'none' }}
        >
          <Icon name="briefcase" size={15} style={{ color: selected === 'Cases' ? 'var(--select-fg)' : 'var(--text2)', flexShrink: 0 }} />
          Cases
          <span
            className="figure"
            title={casesList.error ?? undefined}
            aria-label={casesList.loading && openCases === null ? 'Cases: loading count' : casesList.error ? 'Cases: count unavailable' : `Cases: ${openCases ?? 0} open cases`}
            style={{
              minWidth: 22,
              height: 20,
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '0 6px',
              borderRadius: 'var(--r-badge)',
              background: selected === 'Cases' ? 'var(--select-fg)' : openCases ? STATUS.danger.bg : STATUS.neutral.bg,
              color: selected === 'Cases' ? 'var(--select-bg)' : openCases ? STATUS.danger.fg : STATUS.neutral.fg,
              textAlign: 'center',
              fontSize: 'var(--t-meta)',
              fontWeight: 700,
            }}
          >
            {casesList.loading && openCases === null ? '…' : casesList.error ? '—' : (openCases ?? '—')}
          </span>
        </Link>
      </div>

      {selected !== 'Cases' && <><div className="operations-v2__filters" aria-label="Operations filters">
        <div ref={dateMenuRef} className="operations-v2__date-wrap">
          <Button variant="outline" icon="calendar" iconRight={<Icon name={showDateMenu ? 'chevron_up' : 'chevron_down'} size={14} />} onClick={() => setShowDateMenu((open) => !open)} aria-expanded={showDateMenu} aria-controls="operations-date-menu">
            {dateButtonLabel}
          </Button>
          {showDateMenu && (
            <div id="operations-date-menu" className="operations-v2__popover operations-v2__date-popover">
              <div className="operations-v2__date-options" role="group" aria-label="Date range">
                {DISPLAY_SCOPE_ORDER.map((item) => (
                  <Button
                    key={item}
                    variant={scope === item ? 'secondary' : 'ghost'}
                    size="sm"
                    className="operations-v2__date-option"
                    onClick={() => { setScope(item); setShowDateMenu(item === 'custom') }}
                  >
                    {item === 'today' && overdueCount > 0 ? `Today & Overdue (${overdueCount})` : SCOPE_LABEL[item]}
                  </Button>
                ))}
              </div>
              <div className="operations-v2__calendar-range">
                {scope === 'custom' ? <>
                  <CalendarPopover embedded showHeader={false} title="Custom range" range={{ from: customFrom, to: customTo }} onSelectRange={({ from, to }) => patch({ from: from || null, to: to || null })} onDismiss={() => setShowDateMenu(false)} />
                  <div className="operations-v2__custom-range">
                    <label>From<DateField ariaLabel="Queue from this day" value={customFrom} onChange={(value) => patch({ from: value || null })} showBs={false} clearable /></label>
                    <label>To<DateField ariaLabel="Queue up to this day" value={customTo} onChange={(value) => patch({ to: value || null })} showBs={false} clearable align="right" /></label>
                  </div>
                </> : <CalendarPopover embedded showHeader={false} title="Select a day" value={todayNepal} onSelect={(value) => patch({ day: 'custom', from: value, to: value })} onDismiss={() => setShowDateMenu(false)} />}
              </div>
            </div>
          )}
        </div>
        {scope === 'today' && overdueCount > 0 && (
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 5,
              padding: '4px 10px',
              borderRadius: 'var(--r-badge, 9999px)',
              background: 'var(--st-danger-bg, #fee2e2)',
              color: 'var(--st-danger-fg, #b91c1c)',
              fontSize: 'var(--t-meta, 12px)',
              fontWeight: 600,
              border: '1px solid var(--st-danger-border, #fca5a5)',
              flexShrink: 0,
            }}
            title={`${overdueCount} orders are past due and displayed in today's queue`}
          >
            <Icon name="alert_circle" size={13} />
            {overdueCount} Overdue
          </span>
        )}
        {(isFiltered || search || clientFilter !== 'all' || projectFilter !== 'all') && <Button variant="ghost" onClick={clearOperationFilters}>Clear filters</Button>}
      </div>

      <AppPageToolbar
        bulkActions={selectedBookingNos.size > 0 ? <span className="figure">{selectedBookingNos.size} selected</span> : undefined}
      />
      </>}

      {selected === 'Cases' ? <CasesWorkspace embedded searchControl={{ value: caseSearchInput, onChange: setCaseSearchInput }} /> : (
        <>
        {dockNotice && <p role="status">{dockNotice}</p>}
        <div className={`operations-v2__split${dockOpen ? ' operations-v2__split--open' : ''}`} data-dock-focused={dockProtected && viewport !== 'desktop' ? 'true' : undefined}>
        <Card style={{ overflow: 'hidden' }} bodyStyle={{ padding: 0 }}>
          <PageBody
            loading={list.loading}
            error={list.error}
            onRetry={refreshAll}
            hasRows={jobs.length > 0}
            /* From main's d7ca3bc: empty means nothing VISIBLE. Search, client
               and project filter on screen, so the server set can hold rows
               while the table shows none; that drew a bare table with no way
               back. When those local filters are why, PageBody's own filtered
               copy and Clear filters apply. */
            empty={list.isEmpty || (!list.loading && !list.error && visibleJobs.length === 0)}
            emptyIsFiltered={list.isFiltered || isFiltered || localFilterOn}
            onClearFilters={clearOperationFilters}
            noun="jobs"
            skeleton="table"
            skeletonRows={6}
            {...(localFilterOn && jobs.length > 0 ? {} : { emptyTitle, emptyMessage })}
          >
            {!tabular && (
              <div style={{ padding: 'var(--sp-sm)', display: 'grid', gap: 'var(--sp-sm)' }}>
                {pagedJobs.map((job) => {
                  const jobBtn = getJobButtonProps(job.job)
                  return (
                    <article
                      key={job.id}
                      style={{
                        ...cardStyle,
                        padding: '14px 16px',
                        display: 'grid',
                        gap: 10,
                        borderLeft: job.isPastDue ? '4px solid var(--danger, #ef4444)' : undefined,
                        boxShadow: '0 1px 3px rgba(0, 0, 0, 0.04)',
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                        <Link
                          to={`/rentals/${job.bookingNo}`}
                          className="identifier"
                          style={{
                            color: 'var(--link)',
                            fontWeight: 700,
                            fontSize: 'var(--t-ui, 15px)',
                            textDecoration: 'none',
                            fontFamily: 'var(--font-mono, "Outfit", sans-serif)',
                          }}
                        >
                          {formatOperationBookingId(job.bookingNo)}
                        </Link>
                        <StageBadge stage={job.stage} />
                      </div>
                      <div style={{ fontSize: 'var(--t-meta)', color: 'var(--text)' }}>
                        <span style={{ fontWeight: 600 }}>{job.clientName}</span>
                        {job.project ? (
                          <span style={{ color: 'var(--text2)' }}> · {job.project}</span>
                        ) : (
                          <span style={{ color: 'var(--muted)', fontStyle: 'italic' }}> · Direct Rental</span>
                        )}
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', fontSize: 'var(--t-meta)', color: 'var(--text2)' }}>
                        <span className="figure" style={{ fontWeight: job.isPastDue ? 700 : 500, color: job.isPastDue ? 'var(--danger-text)' : 'inherit' }}>
                          {formatDueAt(job.dueAtAd)}
                        </span>
                        <span style={{ color: 'var(--muted)' }}>·</span>
                        <span><span className="figure">{job.itemCount}</span> items</span>
                        <span
                          style={{
                            marginLeft: 2,
                            fontSize: '11px',
                            padding: '2px 7px',
                            borderRadius: 4,
                            background: 'var(--surface2, rgba(0,0,0,0.04))',
                            color: 'var(--text2)',
                            fontWeight: 500,
                          }}
                          title={`${job.itemCount} items in this ${job.job} queue`}
                        >
                          {job.itemCount >= 10 ? 'Heavy pull' : job.itemCount >= 4 ? 'Standard kit' : 'Quick pull'}
                        </span>
                      </div>
                      <Button
                        size="sm"
                        variant="secondary"
                        data-primary-verb="true"
                        className="btn-floor-primary"
                        style={{ ...jobBtn.style, width: '100%', minHeight: 56, marginTop: 4 }}
                        onClick={() => navigate(jobRoute(job.bookingNo, job.job))}
                      >
                        <Icon name={jobBtn.icon} size={15} />
                        {job.job}
                      </Button>
                    </article>
                  )
                })}
              </div>
            )}
            {tabular && (
              /* RULING 2026-10-17 (zoom audit): `overflow: 'hidden'` after `overflowX` won the cascade and
                  clipped the queue at 911px — Action and the row link were unreachable. The corners
                  still clip with overflowY hidden; the last two columns are pinned (operations.css). */
              <DataTableShell ariaLabel="Operations queues" data-table-scroll style={{ overflowX: 'auto', overflowY: 'hidden' }}>
                <table className="operations-v2__table">
                  <thead>
                    <tr>
                      <th style={{ ...th, width: 44 }}>
                        <input
                          type="checkbox"
                          checked={allVisibleSelected}
                          onChange={toggleVisibleBookings}
                          aria-label="Select visible bookings"
                        />
                      </th>
                      {['Booking', 'Client', 'Items', 'Stage', 'Time', 'Action', ''].map((heading, index) => (
                        <th key={heading || index} style={th}>{heading}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {pagedJobs.map((job) => {
                      const jobBtn = getJobButtonProps(job.job)
                      return (
                        <tr
                          key={job.id}
                          className={`operations-v2__row${dockOpen && dock?.bookingNo === job.bookingNo ? ' operations-v2__row--active' : ''}${viewport === 'desktop' && cursorNo === job.bookingNo ? ' operations-v2__row--cursor' : ''}`}
                          data-booking-no={job.bookingNo}
                          aria-selected={dockOpen && dock?.bookingNo === job.bookingNo ? true : undefined}
                          /* A click anywhere on the row's blank space opens the booking (8 Oct 2026,
                             RULINGS-2026-10-08.md). Links, buttons and the checkbox keep their own
                             action, a text selection is left alone, and Ctrl/⌘-click opens a new tab.
                             Keyboard users have the booking-number link, so the row adds no tab stop. */
                          onClick={(event) => {
                            const target = event.target as HTMLElement
                            if (target.closest('a, button, input, label, select, textarea')) return
                            if (window.getSelection()?.toString()) return
                            const url = `/rentals/${job.bookingNo}`
                            if (event.metaKey || event.ctrlKey) window.open(url, '_blank', 'noopener')
                            else routeNavigate(url)
                          }}
                        >
                          <td style={{ ...td, width: 44, borderLeft: job.isPastDue ? '4px solid var(--danger, #ef4444)' : '4px solid transparent', paddingLeft: 8 }}>
                            <input
                              type="checkbox"
                              checked={selectedBookingNos.has(job.bookingNo)}
                              onChange={() => toggleBooking(job.bookingNo)}
                              aria-label={`Select ${job.bookingNo}`}
                            />
                          </td>
                          <td style={td}>
                            <Link
                              to={`/rentals/${job.bookingNo}`}
                              className="identifier"
                              style={{
                                color: 'var(--link)',
                                fontWeight: 700,
                                textDecoration: 'none',
                                fontFamily: 'var(--font-mono, "Outfit", sans-serif)',
                              }}
                            >
                              {formatOperationBookingId(job.bookingNo)}
                            </Link>
                          </td>
                          <td style={td}>
                            <Link to={`/clients/${job.clientId}`} style={{ color: 'inherit', textDecoration: 'none', fontWeight: 600 }}>
                              {job.clientName}
                            </Link>
                            <div
                              style={{
                                fontSize: '11px',
                                color: job.project ? 'var(--text2)' : 'var(--muted)',
                                fontStyle: job.project ? 'normal' : 'italic',
                                marginTop: 2,
                              }}
                            >
                              {job.project || 'Direct Rental'}
                            </div>
                          </td>
                          <td style={td}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                              <span className="figure" style={{ fontWeight: 600 }}>{job.itemCount} items</span>
                              <span
                                style={{
                                  fontSize: '11px',
                                  padding: '1px 6px',
                                  borderRadius: 4,
                                  background: 'var(--surface2, rgba(0,0,0,0.04))',
                                  color: 'var(--text2)',
                                  fontWeight: 500,
                                }}
                                title={`${job.itemCount} items in this ${job.job} queue`}
                              >
                                {job.itemCount >= 10 ? 'Heavy pull' : job.itemCount >= 4 ? 'Standard kit' : 'Quick pull'}
                              </span>
                            </div>
                          </td>
                          <td style={td}>
                            <StageBadge stage={job.stage} />
                          </td>
                          <td className="figure" style={{ ...td, fontWeight: job.isPastDue ? 700 : 500, color: job.isPastDue ? 'var(--danger-text)' : 'var(--text)' }}>
                            {formatDueAt(job.dueAtAd)}
                          </td>
                          <td style={td}>
                            <Button
                              size="sm"
                              variant="secondary"
                              style={jobBtn.style}
                              onClick={() => navigate(jobRoute(job.bookingNo, job.job))}
                            >
                              <Icon name={jobBtn.icon} size={15} />
                              {job.job}
                            </Button>
                          </td>
                          <td style={{ ...td, width: 44 }}>
                            <Link
                              to={`/rentals/${job.bookingNo}`}
                              aria-label={`More for booking ${job.bookingNo}`}
                              style={{
                                color: 'var(--muted)',
                                display: 'inline-flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                minWidth: 44,
                                minHeight: 44,
                              }}
                            >
                              <Icon name="chevron_right" size={18} />
                            </Link>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
                {jobs.length > 0 && visibleJobs.length === 0 && (
                  <div className="operations-v2__empty-search">No jobs match “{search}”.</div>
                )}
              </DataTableShell>
            )}
          </PageBody>
          {visibleJobs.length > 0 && (
            <div style={{ padding: 'var(--sp-md)', borderTop: '1px solid var(--border)' }}>
              <Pagination
                page={currentPage + 1}
                total={visibleJobs.length}
                pageSize={pageSize}
                pageSizeOptions={[25, 50, 100]}
                onPageChange={(nextPage) => setPage(nextPage - 1)}
                onPageSizeChange={setPageSize}
              />
            </div>
          )}
        </Card>
        {dockOpen && dock && (
          <OperationsShell
            key={dock.bookingNo}
            layout="panel"
            isOpen
            bookingNo={dock.bookingNo}
            bookingStatus={dock.stage}
            initialJob={dock.job}
            onClose={() => setDock(null)}
            onDirtyChange={onDockDirty}
            onBusyChange={onDockBusy}
          />
        )}
        </div>
        </>
      )}
      </div>

      <ConfirmDialog
        isOpen={pendingDock !== null}
        onClose={() => setPendingDock(null)}
        onConfirm={() => { if (dockBusy.current) return; const next = pendingDock; setPendingDock(null); if (next) setDock(next) }}
        title="You have unsaved changes."
        description={`Discard them and open ${pendingDock?.bookingNo ?? 'the next job'}?`}
        cancelLabel="Stay Here"
        confirmLabel="Discard & Open"
        variant="danger"
      />
      <FastReturnModal isOpen={fastReturnOpen} onClose={() => setFastReturnOpen(false)} onSuccess={refreshAll} />
      <BarcodeLookupModal isOpen={barcodeModalOpen} onClose={() => setBarcodeModalOpen(false)} />
      <FilterDrawer
        id="operations-filters"
        open={showMoreFilters}
        onClose={() => setShowMoreFilters(false)}
        desktopMode="overlay"
        resultCount={visibleJobs.length}
        noun={visibleJobs.length === 1 ? 'job' : 'jobs'}
        activeCount={operationFilterCount}
        onClearAll={clearOperationFilters}
        standardFooter
        onApply={() => setShowMoreFilters(false)}
      >
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 'var(--sp-xs)' }}>
          <FilterSection title="Date range">
            <FilterDatePicker
              from={scope === 'custom' ? customFrom : ''}
              to={scope === 'custom' ? customTo : ''}
              presets={(['today', 'tomorrow', 'week'] as const).map((item) => ({ key: item, label: SCOPE_LABEL[item], active: scope === item, onSelect: () => setScope(item) }))}
              onRange={({ from, to }) => patch({ day: 'custom', from, to })}
            />
          </FilterSection>

          <FilterSection title="Queue side">
            <div className="operations-v2__facet-grid">
              {(['pickup', 'return'] as const).map((item) => (
                <Button key={item} variant={group === item ? 'secondary' : 'ghost'} size="sm" className="operations-v2__facet" onClick={() => setQuick(item)}>
                  {GROUP_LABEL[item]}
                </Button>
              ))}
            </div>
          </FilterSection>

          <FilterSection title="Client and project">
            <div style={{ display: 'grid', gap: 'var(--sp-sm)' }}>
              <label style={{ display: 'grid', gap: 4, color: 'var(--text2)', fontSize: 'var(--t-meta)' }}>
                Client
                <select className="operations-v2__filter-select" aria-label="Drawer client filter" value={clientFilter} onChange={(event) => setClientFilter(event.target.value)}>
                  <option value="all">All clients</option>
                  {clients.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
                </select>
              </label>
              <label style={{ display: 'grid', gap: 4, color: 'var(--text2)', fontSize: 'var(--t-meta)' }}>
                Project
                <select className="operations-v2__filter-select" aria-label="Drawer project filter" value={projectFilter} onChange={(event) => setProjectFilter(event.target.value)}>
                  <option value="all">All projects</option>
                  {projects.map((project) => <option key={project} value={project}>{project}</option>)}
                </select>
              </label>
            </div>
          </FilterSection>

          <FilterSection title="Attention required">
            <div className="operations-v2__facet-grid">
              {EXCEPTION_FACETS.map((facet) => {
                const isActive = exception === facet.key
                return (
                  <Button
                    key={facet.key}
                    variant={isActive ? 'secondary' : 'ghost'}
                    size="sm"
                    className="operations-v2__facet"
                    icon={facet.icon}
                    onClick={() => patch({ exception: isActive ? null : facet.key, queue: null, quick: null })}
                  >
                    {facet.label}
                  </Button>
                )
              })}
            </div>
          </FilterSection>

          <FilterSection title="Alerts" defaultOpen={false}>
            <AlertsPanel alerts={alertRows} loading={alertsQ.loading || quotesQ.loading} error={alertsQ.error ?? quotesQ.error} onRetry={retryAlerts} />
          </FilterSection>
        </div>
      </FilterDrawer>
      <div style={{ gridColumn: '1 / -1' }}>
      </div>
    </div>
    </PageShell>
  )
}
