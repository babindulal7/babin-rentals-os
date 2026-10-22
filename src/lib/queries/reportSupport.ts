import { supabase } from '../supabase'
import { parseMoney, rupees, type Paisa } from '../money'

/**
 * **Shared pieces for the report reads (Phase 6 Task 3.4, Law 16 pass).**
 *
 * Every report query used to `try { … } catch { return MOCK_* }`, and most also
 * returned the MOCK block when the read succeeded with no rows, then patched
 * individual figures with `|| MOCK.metric`. So an outage, an empty database and
 * a quiet month all drew the same invented numbers. RULING 2026-10-15/16
 * (RULINGS-2026-10-16.md, R-P6-STATES): a failed read throws and the page draws
 * Error + Retry; a successful empty read is an honest empty; a figure with no
 * source reads {@link NOT_TRACKED}, never a plausible number.
 */

/** What a figure with no source in the database reads. Never a plausible default. */
export const NOT_TRACKED = 'Not tracked yet'

/** The filters every report toolbar hands its query. */
export interface ReportFilterOptions {
  from?: string | undefined
  to?: string | undefined
  branchId?: string | undefined
}

interface ReadResult {
  data: unknown
  error: { message: string } | null
}

/**
 * The rows of a read, or a throw naming which read failed.
 *
 * Only an array confirms a dataset. These are row reads, never head-only
 * counts; null/malformed responses cannot establish zero business activity.
 */
export function rowsOf<T>(res: ReadResult, what: string): T[] {
  if (res.error) throw new Error(`${what}: ${res.error.message}`)
  if (!Array.isArray(res.data)) throw new Error(`${what}: no confirmed dataset`)
  return res.data as T[]
}

interface ReportPageQuery {
  order(column: string, options: { ascending: boolean }): ReportPageQuery
  range(from: number, to: number): PromiseLike<ReadResult>
}

/** Complete ordered reads, including servers that impose a smaller page cap.
 * Every projection must include id. Refuse later-page failure, repeated rows
 * and excessive datasets rather than presenting a partial business total.
 */
export async function completeReportRead(query: ReportPageQuery, what: string): Promise<ReadResult> {
  const ordered = query.order('id', { ascending: true })
  const rows: unknown[] = []
  const seen = new Set<string>()
  while (true) {
    const result = await ordered.range(rows.length, rows.length + 499)
    if (result.error) return { data: null, error: result.error }
    const page = rowsOf<unknown>(result, what)
    if (page.length === 0) return { data: rows, error: null }
    for (const row of page) {
      const id = row && typeof row === 'object' ? (row as { id?: unknown }).id : undefined
      if (typeof id !== 'string' || !id) throw new Error(`${what}: missing row identity`)
      if (seen.has(id)) throw new Error(`${what}: dataset changed or repeated during pagination; retry`)
      seen.add(id)
      rows.push(row)
    }
    if (rows.length > 50_000) throw new Error(`${what}: narrow the report period to load a complete dataset`)
  }
}

/** `booking_lines` columns every money figure in the reports is built from. */
export interface PricedLine {
  line_total?: number | string | null
  qty?: number | null
  days?: number | null
  rate?: number | string | null
  discount_amount?: number | string | null
  voided_at?: string | null
}

/**
 * Recorded net line value in paisa; legacy rows without a total retain the
 * qty × days × rate − discount fallback.
 *
 * `booking_lines.rate` and `discount_amount` are RUPEES (numeric(14,2), see
 * `bookings.ts`). The reports used to compute this in rupees and then pass
 * `Math.round(total / 100)` to `rupees()`, which printed one hundredth of the
 * real figure. A voided line is worth nothing.
 */
export function lineValue(line: PricedLine, fallbackDays = 1): Paisa {
  if (line.voided_at) return 0 as Paisa
  // 0168 records the net quote price, including structures/rulesets. Never
  // rebuild it from a daily rate or subtract its discount a second time.
  if (line.line_total != null) {
    const recorded = String(line.line_total)
    if (!/^\d+(?:\.\d+)?$/.test(recorded)) throw new Error('Invalid recorded booking-line total')
    const amount = parseMoney(recorded)
    if (amount === null || !Number.isSafeInteger(amount)) throw new Error('Recorded booking-line total exceeds safe paisa range')
    return amount
  }
  const qty = Number(line.qty ?? 1) || 1
  const days = Number(line.days ?? fallbackDays) || fallbackDays
  const rate = Number(line.rate ?? 0) || 0
  const discount = Number(line.discount_amount ?? 0) || 0
  return rupees(Math.max(0, qty * days * rate - discount))
}

/** Sum of {@link lineValue} over a booking's lines. */
export function linesValue(lines: readonly PricedLine[] | null | undefined, fallbackDays = 1): Paisa {
  return (lines ?? []).reduce((acc, l) => acc + lineValue(l, fallbackDays), 0) as Paisa
}

/** Whole-number share, or 0 when there is nothing to share (the count beside it says so). */
export function percentOf(part: number, whole: number): number {
  return whole > 0 ? Math.round((part / whole) * 100) : 0
}

/** The name on an embedded `clients!client_id(name)` row, or an em dash. */
export function embeddedName(embed: unknown): string {
  const obj = Array.isArray(embed) ? embed[0] : embed
  const name = (obj as { name?: unknown } | null | undefined)?.name
  return typeof name === 'string' && name.trim() ? name : '—'
}

/**
 * Every live booking line's priced columns, grouped by booking.
 *
 * Read from `booking_lines_v`, never the base table: 0062 revokes `rate` and
 * `discount_amount` on `booking_lines` from every signed-in session, so an
 * embedded `booking_lines(rate, …)` is refused outright (42501) — which is why
 * every money figure on these reports used to fall through to seed data on
 * live. The view returns them to money-visible roles and null to the rest.
 */
export interface ReportLine extends PricedLine {
  booking_id: string
  product_id: string | null
  bundle_id: string | null
}

export async function readLineValues(): Promise<Map<string, ReportLine[]>> {
  const res = await completeReportRead(supabase
    .from('booking_lines_v')
    .select('id, booking_id, product_id, bundle_id, qty, days, rate, discount_amount, line_total, voided_at')
    .is('voided_at', null), 'Booking line values read failed')
  const rows = rowsOf<ReportLine>(res, 'Booking line values read failed')
  const out = new Map<string, ReportLine[]>()
  for (const r of rows) {
    const list = out.get(r.booking_id)
    if (list) list.push(r)
    else out.set(r.booking_id, [r])
  }
  return out
}

/** Postgres "permission denied" — a column this session may not read. */
export function isPermissionDenied(err: { code?: string; message?: string } | null | undefined): boolean {
  return err?.code === '42501' || /permission denied/i.test(err?.message ?? '')
}
