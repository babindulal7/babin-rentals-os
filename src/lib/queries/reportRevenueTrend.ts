import { supabase } from '../supabase'
import {
  aggregatePrevious,
  aggregateRevenue,
  buildRevenueTrendReport,
  ISSUED_INVOICE_STATUSES,
  previousWindow,
  resolveWindow,
  RevenueSourceError,
  type InvoiceRevenueSource,
  type RevenueTrendReport,
  type RevenueWindow,
  type WindowResolution,
} from '../intel/revenueTrend'

/**
 * # Revenue report read adapter
 *
 * Reads `invoices` directly through PostgREST — the same table, RLS policy and
 * columns Finance ▸ Invoices reads — so the trend can never disagree with the
 * invoice list about which invoices exist.
 *
 * ⚠ Call this ONLY after the caller has established the session may see
 * financial reports (`canViewFinancialReports`). A money-blind session gets zero
 * rows from RLS, and zero rows must never be drawn as "Rs 0 revenue"; the page
 * does not fetch at all for those roles.
 *
 * Why not a SQL aggregate RPC: the live project is behind the repo's migration
 * chain (N-5 — Babin applies), so a new RPC would fail on live until applied,
 * and the invoice volume (hundreds of rows) does not need one yet. When it does,
 * the RPC should return these same `RevenueSeries` buckets and this adapter
 * swaps its body; the engine and page do not change.
 *
 * ## Completeness — a truncated page is not an actual trend
 *
 * PostgREST caps every response (`max-rows`, 1000 by default, configurable
 * lower). Stopping when a page comes back short would silently drop rows if the
 * cap were below `PAGE_SIZE`. So every read asks for the exact count and the
 * adapter refuses to aggregate unless it holds exactly that many distinct rows.
 * Any failure throws; nothing here returns a fallback figure.
 *
 * Known limit (offset paging): if, between two page reads of a period with more
 * than PAGE_SIZE invoices, one counted invoice is voided AND another is issued,
 * the count is unchanged but the offsets shift and one row can be missed until
 * Refresh. It needs 500+ invoices in the window and both writes inside the
 * milliseconds between pages; a single-snapshot SQL aggregate (see above)
 * removes it when volume warrants that RPC.
 */

const INVOICE_FIELDS =
  'id, invoice_no, issue_date, status, currency, taxable_amount, vat_amount, total_amount, voided_at'

export const PAGE_SIZE = 500
/** Above this the period should be narrowed (or the SQL aggregate built). */
export const MAX_ROWS = 20_000

interface PageResult<T> {
  data: T[] | null
  error: { message: string } | null
  count: number | null
}

/**
 * Pages through a query until it holds exactly the server's count of rows.
 * `page(from, to)` must order deterministically (a unique tiebreak), or rows can
 * repeat or vanish between pages.
 */
export async function readAll<T extends { id: string }>(
  label: string,
  page: (from: number, to: number) => PromiseLike<PageResult<T>>,
): Promise<T[]> {
  const rows: T[] = []
  const ids = new Set<string>()
  let expected: number | null = null

  // Advance by the rows actually received, not by PAGE_SIZE: a server capped
  // below PAGE_SIZE returns short pages that are not the last page.
  for (;;) {
    const from = rows.length
    const res = await page(from, from + PAGE_SIZE - 1)
    if (res.error) throw new RevenueSourceError(`${label} could not be read: ${res.error.message}`)
    if (!res.data) throw new RevenueSourceError(`${label} returned no data set.`)
    if (res.count === null) throw new RevenueSourceError(`${label}: the server did not confirm how many rows exist.`)
    if (expected === null) {
      expected = res.count
      if (expected > MAX_ROWS) {
        throw new RevenueSourceError(`${label}: ${expected} rows is more than this report reads at once. Choose a shorter period.`)
      }
    } else if (res.count !== expected) {
      throw new RevenueSourceError(`${label} changed while it was being read. Retry.`)
    }
    for (const row of res.data) {
      if (ids.has(row.id)) throw new RevenueSourceError(`${label} returned a row twice while paging. Retry.`)
      ids.add(row.id)
      rows.push(row)
    }
    if (rows.length >= expected || res.data.length === 0) break
  }

  if (rows.length !== expected) {
    throw new RevenueSourceError(`${label} returned ${rows.length} of ${expected ?? 0} rows. Retry.`)
  }
  return rows
}

function issuedInvoices(window: RevenueWindow): Promise<InvoiceRevenueSource[]> {
  return readAll<InvoiceRevenueSource>('Invoices', (from, to) =>
    supabase
      .from('invoices')
      .select(INVOICE_FIELDS, { count: 'exact' })
      .in('status', [...ISSUED_INVOICE_STATUSES])
      .is('voided_at', null)
      .gte('issue_date', window.fromDay)
      .lte('issue_date', window.toDay)
      .order('issue_date', { ascending: true })
      .order('id', { ascending: true })
      .range(from, to) as unknown as PromiseLike<PageResult<InvoiceRevenueSource>>,
  )
}

/** The first day an issued, non-voided invoice exists — the start of "All dates". */
async function earliestIssuedDay(): Promise<string | null> {
  const { data, error } = (await supabase
    .from('invoices')
    .select('issue_date')
    .in('status', [...ISSUED_INVOICE_STATUSES])
    .is('voided_at', null)
    .order('issue_date', { ascending: true })
    .limit(1)) as unknown as { data: Array<{ issue_date: string }> | null; error: { message: string } | null }
  if (error) throw new RevenueSourceError(`Invoices could not be read: ${error.message}`)
  if (!data) throw new RevenueSourceError('Invoices returned no data set.')
  return data[0]?.issue_date ?? null
}

/**
 * Credit notes against invoices this report counts. Today only `void_invoice()`
 * writes credit notes, so this is expected to be zero; a non-zero answer makes
 * the report Partial instead of silently netting or ignoring them.
 */
async function unnettedCreditNotes(countedInvoiceIds: ReadonlySet<string>): Promise<number> {
  const notes = await readAll<{ id: string; invoice_id: string }>('Credit notes', (from, to) =>
    supabase
      .from('credit_notes')
      .select('id, invoice_id', { count: 'exact' })
      .order('id', { ascending: true })
      .range(from, to) as unknown as PromiseLike<PageResult<{ id: string; invoice_id: string }>>,
  )
  return notes.filter((n) => countedInvoiceIds.has(n.invoice_id)).length
}

export interface RevenueTrendRequest {
  /** Inclusive Kathmandu civil days from the report toolbar; null = open-ended. */
  fromDay: string | null
  toDay: string | null
  compare: boolean
  /** The Kathmandu business day (`businessDayAd()`), injected so tests are deterministic. */
  today: string
  now?: Date
}

export type RevenueTrendResult =
  | { kind: 'report'; report: RevenueTrendReport; clampedToToday: boolean }
  | Exclude<WindowResolution, { kind: 'ok' }>

export async function loadRevenueTrend(req: RevenueTrendRequest): Promise<RevenueTrendResult> {
  const earliest = req.fromDay ? null : await earliestIssuedDay()
  const resolved = resolveWindow({ fromDay: req.fromDay, toDay: req.toDay, earliestIssuedDay: earliest, today: req.today })
  if (resolved.kind !== 'ok') return resolved

  const { window, granularity } = resolved
  const prevWindow = req.compare ? previousWindow(window) : null

  const [currentRows, previousRows] = await Promise.all([
    issuedInvoices(window),
    prevWindow ? issuedInvoices(prevWindow) : Promise.resolve(null),
  ])
  const counted = new Set([...currentRows, ...(previousRows ?? [])].map((r) => r.id))
  const notes = await unnettedCreditNotes(counted)

  const current = aggregateRevenue(currentRows, window, granularity, req.today)
  const previous = previousRows ? aggregatePrevious(previousRows, current) : null

  return {
    kind: 'report',
    report: buildRevenueTrendReport({ current, previous, unnettedCreditNotes: notes, calculatedAt: req.now ?? new Date() }),
    clampedToToday: resolved.clampedToToday,
  }
}
