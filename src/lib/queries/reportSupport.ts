import { supabase } from '../supabase'
import { rupees, type Paisa } from '../money'

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
 * `data: null` with no error is an empty read (PostgREST returns `[]`, but a
 * mock or a head-only read may not) — an honest zero rows, not a failure.
 */
export function rowsOf<T>(res: ReadResult, what: string): T[] {
  if (res.error) throw new Error(`${what}: ${res.error.message}`)
  return Array.isArray(res.data) ? (res.data as T[]) : []
}

/** `booking_lines` columns every money figure in the reports is built from. */
export interface PricedLine {
  qty?: number | null
  days?: number | null
  rate?: number | string | null
  discount_amount?: number | string | null
  voided_at?: string | null
}

/**
 * One line's value in paisa: qty × days × rate − discount, never negative.
 *
 * `booking_lines.rate` and `discount_amount` are RUPEES (numeric(14,2), see
 * `bookings.ts`). The reports used to compute this in rupees and then pass
 * `Math.round(total / 100)` to `rupees()`, which printed one hundredth of the
 * real figure. A voided line is worth nothing.
 */
export function lineValue(line: PricedLine, fallbackDays = 1): Paisa {
  if (line.voided_at) return 0 as Paisa
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
  const res = await supabase
    .from('booking_lines_v')
    .select('booking_id, product_id, bundle_id, qty, days, rate, discount_amount, voided_at')
    .is('voided_at', null)
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
