import { supabase } from '../supabase'
import { rupees, type Paisa } from '../money'
import { rowsOf, type ReportFilterOptions } from './reportSupport'

/**
 * Client Reports — the client base, booking frequency, and receivables.
 *
 * RULING 2026-10-16 (R-P6-STATES, Law 16): this read counted clients (with
 * `|| 1248` / `|| 436` fallbacks) and the page rendered `data/clientReports` —
 * invented growth curves, retention, ageing, top clients, high-risk clients and
 * "insights" — on every path. It now returns what the tables record:
 *
 *   - client base, new in period, members      — `clients`, `client_memberships`
 *   - booked / repeat clients, frequency bands  — non-cancelled `bookings` picked up in the period
 *   - invoiced per client in the period          — `invoices` (not Draft/Void), money roles only
 *   - receivables and their ageing, now          — open invoices' `outstanding_amount` by `due_date`
 *
 * Throws on failure; an empty client base is empty. A money-blind session
 * does not read invoices at all (Law 6). Revert = restore the seed re-exports
 * and the `catch`.
 */

export interface ClientReportRow {
  clientId: string
  code: string
  name: string
  bookings: number
  invoiced: Paisa | null
  outstanding: Paisa | null
}

export interface AgeingBucket {
  label: string
  amount: Paisa
  invoices: number
}

export interface FrequencyBand {
  label: string
  clients: number
}

export interface HighRiskClient {
  clientId: string
  name: string
  overdue: Paisa
  oldestDaysOverdue: number
}

export interface ClientReportsSummary {
  totalClients: number
  activeClients: number
  newClients: number
  members: number
  bookedClients: number
  repeatClients: number
  frequency: FrequencyBand[]
  /** Clients with bookings or invoices in the period, most valuable first. */
  topClients: ClientReportRow[]
  money: {
    invoiced: Paisa
    receivables: Paisa
    ageing: AgeingBucket[]
    highRisk: HighRiskClient[]
  } | null
}

const OPEN_STATUSES = ['Sent', 'Partially Paid', 'Overdue']
const DAY = 86_400_000

export async function getClientReportsSummary(
  options: ReportFilterOptions = {},
  { includeMoney = true, now = new Date() }: { includeMoney?: boolean; now?: Date } = {},
): Promise<ClientReportsSummary> {
  let bookingsQ = supabase.from('bookings').select('client_id').is('cancelled_at', null)
  if (options.from) bookingsQ = bookingsQ.gte('pickup_at', options.from)
  if (options.to) bookingsQ = bookingsQ.lte('pickup_at', options.to)
  if (options.branchId) bookingsQ = bookingsQ.eq('branch_id', options.branchId)

  // Law 6 — a money-blind session never builds, let alone sends, an invoice read.
  const invoiceReads = () => {
    let invoicedQ = supabase
      .from('invoices')
      .select('client_id, total_amount')
      .neq('status', 'Draft')
      .neq('status', 'Void')
      .is('voided_at', null)
    if (options.from) invoicedQ = invoicedQ.gte('issue_date', options.from)
    if (options.to) invoicedQ = invoicedQ.lte('issue_date', options.to)
    if (options.branchId) invoicedQ = invoicedQ.eq('branch_id', options.branchId)
    let openQ = supabase.from('invoices').select('client_id, outstanding_amount, due_date').in('status', OPEN_STATUSES).is('voided_at', null)
    if (options.branchId) openQ = openQ.eq('branch_id', options.branchId)
    return [invoicedQ, openQ] as const
  }
  const none = Promise.resolve({ data: [], error: null })
  const [invoicedRead, openRead] = includeMoney ? invoiceReads() : [none, none]

  const [clientsRes, membershipsRes, bookingsRes, invoicedRes, openRes] = await Promise.all([
    supabase.from('clients').select('id, client_code, name, status, created_at, merged_into_client_id'),
    supabase.from('client_memberships').select('client_id, superseded_at'),
    bookingsQ,
    invoicedRead,
    openRead,
  ])
  const clients = rowsOf<{ id: string; client_code: string | null; name: string | null; status: string | null; created_at: string | null; merged_into_client_id: string | null }>(
    clientsRes,
    'Clients read failed',
  ).filter((c) => !c.merged_into_client_id)
  const memberships = rowsOf<{ client_id: string; superseded_at: string | null }>(membershipsRes, 'Memberships read failed')
  const bookings = rowsOf<{ client_id: string }>(bookingsRes, 'Bookings read failed')
  const invoiced = rowsOf<{ client_id: string; total_amount: number | string | null }>(invoicedRes, 'Invoices read failed')
  const open = rowsOf<{ client_id: string; outstanding_amount: number | string | null; due_date: string | null }>(openRes, 'Open invoices read failed')

  const fromMs = options.from ? Date.parse(options.from) : -Infinity
  const toMs = options.to ? Date.parse(options.to) : Infinity
  const newClients = clients.filter((c) => {
    const t = Date.parse(c.created_at ?? '')
    return !Number.isNaN(t) && t >= fromMs && t <= toMs
  }).length

  const bookingsByClient = new Map<string, number>()
  for (const b of bookings) bookingsByClient.set(b.client_id, (bookingsByClient.get(b.client_id) ?? 0) + 1)
  const invoicedByClient = new Map<string, number>()
  for (const i of invoiced) invoicedByClient.set(i.client_id, (invoicedByClient.get(i.client_id) ?? 0) + rupees(Number(i.total_amount ?? 0) || 0))

  const buckets = [
    { label: 'Not yet due', min: -Infinity, max: 0 },
    { label: '1–30 days', min: 1, max: 30 },
    { label: '31–60 days', min: 31, max: 60 },
    { label: '61–90 days', min: 61, max: 90 },
    { label: '90+ days', min: 91, max: Infinity },
  ].map((b) => ({ ...b, amount: 0, invoices: 0 }))
  const outstandingByClient = new Map<string, number>()
  const risk = new Map<string, { overdue: number; oldest: number }>()
  let receivables = 0
  for (const o of open) {
    const amt = rupees(Number(o.outstanding_amount ?? 0) || 0)
    if (amt <= 0) continue
    receivables += amt
    outstandingByClient.set(o.client_id, (outstandingByClient.get(o.client_id) ?? 0) + amt)
    const due = Date.parse(o.due_date ?? '')
    const days = Number.isNaN(due) ? 0 : Math.floor((now.getTime() - due) / DAY)
    const bucket = buckets.find((b) => days >= b.min && days <= b.max)
    if (bucket) {
      bucket.amount += amt
      bucket.invoices++
    }
    if (days > 60) {
      const r = risk.get(o.client_id) ?? { overdue: 0, oldest: 0 }
      r.overdue += amt
      r.oldest = Math.max(r.oldest, days)
      risk.set(o.client_id, r)
    }
  }

  const clientById = new Map(clients.map((c) => [c.id, c]))
  const nameOf = (id: string) => clientById.get(id)?.name?.trim() || '—'
  const involved = new Set([...bookingsByClient.keys(), ...invoicedByClient.keys()])
  const topClients: ClientReportRow[] = [...involved]
    .map((id) => ({
      clientId: id,
      code: clientById.get(id)?.client_code ?? '—',
      name: nameOf(id),
      bookings: bookingsByClient.get(id) ?? 0,
      invoiced: includeMoney ? ((invoicedByClient.get(id) ?? 0) as Paisa) : null,
      outstanding: includeMoney ? ((outstandingByClient.get(id) ?? 0) as Paisa) : null,
    }))
    .sort((a, b) => (b.invoiced ?? 0) - (a.invoiced ?? 0) || b.bookings - a.bookings)
    .slice(0, 10)

  const counts = [...bookingsByClient.values()]
  const band = (min: number, max: number) => counts.filter((n) => n >= min && n <= max).length

  return {
    totalClients: clients.length,
    activeClients: clients.filter((c) => c.status === 'Active').length,
    newClients,
    members: new Set(memberships.filter((m) => !m.superseded_at).map((m) => m.client_id)).size,
    bookedClients: bookingsByClient.size,
    repeatClients: counts.filter((n) => n >= 2).length,
    frequency: [
      { label: '1 booking', clients: band(1, 1) },
      { label: '2–3 bookings', clients: band(2, 3) },
      { label: '4–6 bookings', clients: band(4, 6) },
      { label: '7+ bookings', clients: band(7, Infinity) },
    ],
    topClients,
    money: includeMoney
      ? {
          invoiced: [...invoicedByClient.values()].reduce((a, n) => a + n, 0) as Paisa,
          receivables: receivables as Paisa,
          ageing: buckets.map((b) => ({ label: b.label, amount: b.amount as Paisa, invoices: b.invoices })),
          highRisk: [...risk.entries()]
            .map(([id, r]) => ({ clientId: id, name: nameOf(id), overdue: r.overdue as Paisa, oldestDaysOverdue: r.oldest }))
            .sort((a, b) => b.overdue - a.overdue)
            .slice(0, 10),
        }
      : null,
  }
}
