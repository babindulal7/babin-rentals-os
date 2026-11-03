import { supabase } from '../supabase'
import { rupees, type Paisa } from '../money'
import { rowsOf, type ReportFilterOptions } from './reportSupport'
import { fetchLatestOpeningBalance } from './openingBalances'

/**
 * Cash Flow and Working Capital — read from the ledgers, never from a seed.
 *
 * RULING 2026-10-16 (R-P6-STATES, Law 16): `getLiquiditySummary` read the
 * ledgers, then both pages discarded the result and rendered
 * `data/liquidityReports` — one invented closed month, an invented opening
 * balance, an invented Rs 56,000 equipment purchase — on every path. The read
 * itself was wrong three ways:
 *   - it filtered `payments.status = 'Completed'`, which is not a
 *     `payment_status` value (Received · Refunded · Failed · Cancelled, 0001):
 *     Postgres rejects the literal, so "collected" could never be read. It is
 *     `'Received'` (the same bug Pulse had — RULINGS-2026-10-16);
 *   - it selected `invoices.total` / `balance`, which do not exist (0006:
 *     `total_amount`, `outstanding_amount`);
 *   - it summed every payment, deposits included — but a deposit is a
 *     liability, never revenue or own cash (Law 4).
 *
 * Both reads now throw on failure (Error + Retry) and return honest zeros on
 * an empty period. What no table records — the bank balance, so opening and
 * closing cash, runway, capital spend, and therefore working capital itself —
 * is `null`, which the pages print as "Not tracked yet".
 * Revert = restore `getLiquiditySummary` and its `catch`.
 */

const money = (v: number | string | null | undefined): Paisa => rupees(Number(v ?? 0) || 0)
const sum = <T,>(rows: T[], f: (r: T) => number): Paisa => rows.reduce((a, r) => a + f(r), 0) as Paisa
const DAY = 86_400_000

export interface ExpenseCategoryLine {
  category: string
  amount: Paisa
}

export interface CashFlowSummary {
  /** Rental payments received in the period (Advance Payment, status Received). */
  collected: Paisa
  /** Refund payments made in the period. */
  refunds: Paisa
  /** Expenses with status Paid, by expense date. */
  expensesPaid: Paisa
  expensesByCategory: ExpenseCategoryLine[]
  /** collected − refunds − expensesPaid. */
  netOperatingCash: Paisa
  /** Deposits taken and given back in the period — held in trust, not own cash (Law 4). */
  depositsReceived: Paisa
  depositsReleased: Paisa
  /** Invoices issued in the period (not Draft/Void). */
  invoiced: Paisa
  /** collected ÷ invoiced; null when nothing was invoiced. */
  collectionRatePct: number | null
  /** Opening cash balance for the period (from opening_balances table). Null if not set. */
  openingCash: Paisa | null
  /** Closing cash = opening + netOperatingCash. Null if opening is not set. */
  closingCash: Paisa | null
  capitalSpend: null
  runwayMonths: null
}

export async function getCashFlowSummary(options: ReportFilterOptions = {}): Promise<CashFlowSummary> {
  let paymentsQ = supabase.from('payments').select('amount, payment_type').eq('status', 'Received')
  let expensesQ = supabase.from('expenses').select('amount, category_id').eq('status', 'Paid')
  let movementsQ = supabase.from('deposit_movements').select('movement_type, amount')
  let invoicesQ = supabase.from('invoices').select('total_amount').neq('status', 'Draft').neq('status', 'Void').is('voided_at', null)
  if (options.from) {
    paymentsQ = paymentsQ.gte('payment_date', options.from)
    expensesQ = expensesQ.gte('expense_date', options.from)
    movementsQ = movementsQ.gte('created_at', options.from)
    invoicesQ = invoicesQ.gte('issue_date', options.from)
  }
  if (options.to) {
    paymentsQ = paymentsQ.lte('payment_date', options.to)
    expensesQ = expensesQ.lte('expense_date', options.to)
    movementsQ = movementsQ.lte('created_at', options.to)
    invoicesQ = invoicesQ.lte('issue_date', options.to)
  }
  if (options.branchId) {
    paymentsQ = paymentsQ.eq('branch_id', options.branchId)
    expensesQ = expensesQ.eq('branch_id', options.branchId)
    invoicesQ = invoicesQ.eq('branch_id', options.branchId)
  }

  const [paymentsRes, expensesRes, categoriesRes, movementsRes, invoicesRes] = await Promise.all([
    paymentsQ,
    expensesQ,
    supabase.from('expense_categories').select('id, name'),
    movementsQ,
    invoicesQ,
  ])
  const payments = rowsOf<{ amount: number | string | null; payment_type: string }>(paymentsRes, 'Payments read failed')
  const expenses = rowsOf<{ amount: number | string | null; category_id: string | null }>(expensesRes, 'Expenses read failed')
  const categories = rowsOf<{ id: string; name: string | null }>(categoriesRes, 'Expense categories read failed')
  const movements = rowsOf<{ movement_type: string; amount: number | string | null }>(movementsRes, 'Deposit movements read failed')
  const invoices = rowsOf<{ total_amount: number | string | null }>(invoicesRes, 'Invoices read failed')

  const collected = sum(payments.filter((p) => p.payment_type === 'Advance Payment'), (p) => money(p.amount))
  const refunds = sum(payments.filter((p) => p.payment_type === 'Refund'), (p) => money(p.amount))
  const expensesPaid = sum(expenses, (e) => money(e.amount))
  const invoiced = sum(invoices, (i) => money(i.total_amount))

  const categoryName = new Map(categories.map((c) => [c.id, c.name?.trim() || '—']))
  const byCat = new Map<string, number>()
  for (const e of expenses) {
    const name = (e.category_id && categoryName.get(e.category_id)) || 'Uncategorised'
    byCat.set(name, (byCat.get(name) ?? 0) + money(e.amount))
  }

  // Fetch opening balance for the period (T3-07)
  const asOfDate = options.to ?? new Date().toISOString().slice(0, 10)
  const openingBalance = await fetchLatestOpeningBalance('cash', null, asOfDate).catch(() => null)
  const openingCash = openingBalance?.amountPaisa ?? null
  const closingCash = openingCash !== null ? (openingCash + (collected - refunds - expensesPaid)) as Paisa : null

  return {
    collected,
    refunds,
    expensesPaid,
    expensesByCategory: [...byCat.entries()].map(([category, amount]) => ({ category, amount: amount as Paisa })).sort((a, b) => b.amount - a.amount),
    netOperatingCash: (collected - refunds - expensesPaid) as Paisa,
    depositsReceived: sum(movements.filter((m) => m.movement_type === 'Received'), (m) => money(m.amount)),
    depositsReleased: sum(movements.filter((m) => m.movement_type === 'Released'), (m) => money(m.amount)),
    invoiced,
    collectionRatePct: invoiced > 0 ? Math.round((collected / invoiced) * 100) : null,
    openingCash,
    closingCash,
    capitalSpend: null,
    runwayMonths: null,
  }
}

export interface ReceivableAgeing {
  label: string
  amount: Paisa
  invoices: number
}

export interface WorkingCapitalSummary {
  /** Outstanding on open invoices (Sent · Partially Paid · Overdue), now. */
  receivables: Paisa
  overdueReceivables: Paisa
  ageing: ReceivableAgeing[]
  /** Deposits held in trust now: received − refunded − applied (Law 4 — a liability). */
  depositsHeld: Paisa
  /** Expenses approved but not yet paid — the only payable the schema records. */
  approvedUnpaidExpenses: Paisa
  /** Days sales outstanding: receivables ÷ (invoiced over the last 90 days ÷ 90); null with no recent invoicing. */
  daysSalesOutstanding: number | null
  /** No bank balance and no supplier-invoice table: these have no source. */
  cash: null
  workingCapital: null
  currentRatio: null
}

const OPEN_STATUSES = ['Sent', 'Partially Paid', 'Overdue']

export async function getWorkingCapitalSummary(
  options: Pick<ReportFilterOptions, 'branchId'> = {},
  now: Date = new Date(),
): Promise<WorkingCapitalSummary> {
  const since = new Date(now.getTime() - 90 * DAY).toISOString().slice(0, 10)
  let openQ = supabase.from('invoices').select('outstanding_amount, due_date').in('status', OPEN_STATUSES).is('voided_at', null)
  let recentQ = supabase.from('invoices').select('total_amount').neq('status', 'Draft').neq('status', 'Void').is('voided_at', null).gte('issue_date', since)
  let depositsQ = supabase.from('security_deposits').select('received_amount, refunded_amount, applied_amount')
  let expensesQ = supabase.from('expenses').select('amount').eq('status', 'Approved')
  if (options.branchId) {
    openQ = openQ.eq('branch_id', options.branchId)
    recentQ = recentQ.eq('branch_id', options.branchId)
    depositsQ = depositsQ.eq('branch_id', options.branchId)
    expensesQ = expensesQ.eq('branch_id', options.branchId)
  }
  const [openRes, recentRes, depositsRes, expensesRes] = await Promise.all([openQ, recentQ, depositsQ, expensesQ])
  const open = rowsOf<{ outstanding_amount: number | string | null; due_date: string | null }>(openRes, 'Open invoices read failed')
  const recent = rowsOf<{ total_amount: number | string | null }>(recentRes, 'Recent invoices read failed')
  const deposits = rowsOf<{ received_amount: number | string | null; refunded_amount: number | string | null; applied_amount: number | string | null }>(
    depositsRes,
    'Security deposits read failed',
  )
  const expenses = rowsOf<{ amount: number | string | null }>(expensesRes, 'Expenses read failed')

  const buckets = [
    { label: 'Not yet due', min: -Infinity, max: 0 },
    { label: '1–30 days', min: 1, max: 30 },
    { label: '31–60 days', min: 31, max: 60 },
    { label: '61–90 days', min: 61, max: 90 },
    { label: '90+ days', min: 91, max: Infinity },
  ].map((b) => ({ ...b, amount: 0, invoices: 0 }))
  let receivables = 0
  let overdue = 0
  for (const o of open) {
    const amt = money(o.outstanding_amount)
    if (amt <= 0) continue
    receivables += amt
    const due = Date.parse(o.due_date ?? '')
    const days = Number.isNaN(due) ? 0 : Math.floor((now.getTime() - due) / DAY)
    if (days > 0) overdue += amt
    const bucket = buckets.find((b) => days >= b.min && days <= b.max)
    if (bucket) {
      bucket.amount += amt
      bucket.invoices++
    }
  }
  const recentInvoiced = sum(recent, (i) => money(i.total_amount))

  return {
    receivables: receivables as Paisa,
    overdueReceivables: overdue as Paisa,
    ageing: buckets.map((b) => ({ label: b.label, amount: b.amount as Paisa, invoices: b.invoices })),
    depositsHeld: sum(deposits, (d) => Math.max(0, money(d.received_amount) - money(d.refunded_amount) - money(d.applied_amount))),
    approvedUnpaidExpenses: sum(expenses, (e) => money(e.amount)),
    daysSalesOutstanding: recentInvoiced > 0 ? Math.round(receivables / (recentInvoiced / 90)) : null,
    cash: null,
    workingCapital: null,
    currentRatio: null,
  }
}
