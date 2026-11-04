import { supabase } from '../supabase'
import { parseMoney, type Paisa } from '../money'
import { BS_MONTHS, formatAdMonth, toBs } from '../bs'
import { embeddedName, percentOf, rowsOf, type ReportFilterOptions } from './reportSupport'

export type { ReportFilterOptions } from './reportSupport'

export interface SalesReportMetrics {
  totalInvoiced: Paisa
  netSales: Paisa
  totalVat: Paisa
  totalDiscounts: Paisa
  totalCollected: Paisa
  totalOutstanding: Paisa
  invoiceCount: number
  collectionRate: number
}

export interface InvoiceStatusBreakdownItem {
  status: string
  count: number
  amount: Paisa
  percent: number
}

export interface SalesTrendPoint {
  period: string
  invoiced: Paisa
  collected: Paisa
}

export interface TopClientSalesItem {
  clientId: string
  clientName: string
  invoiceCount: number
  totalInvoiced: Paisa
  totalPaid: Paisa
  balance: Paisa
}

export interface SalesInvoiceItem {
  id: string
  invoiceNo: string
  bookingNo: string
  clientName: string
  clientPan?: string | undefined
  issueDate: string
  dueDate: string
  subtotal: Paisa
  taxAmount: Paisa
  grandTotal: Paisa
  paidAmount: Paisa
  status: string
  vatTreatment?: 'standard' | 'non_vat' | undefined
}

export interface SalesReportData {
  metrics: SalesReportMetrics
  statusBreakdown: InvoiceStatusBreakdownItem[]
  monthlyTrend: SalesTrendPoint[]
  topClients: TopClientSalesItem[]
  invoices: SalesInvoiceItem[]
}

export interface VatMonthlyRow {
  month: string
  bsMonth: string
  taxableSales: Paisa
  vatAmount: Paisa
  exemptSales: Paisa
  nonVatSales: Paisa
  grossSales: Paisa
}

export interface VatTaxReportData {
  metrics: {
    totalGrossTurnover: Paisa
    taxableTurnover: Paisa
    totalOutputVat: Paisa
    exemptTurnover: Paisa
    nonVatTurnover: Paisa
    effectiveVatRate: number
    invoicesCount: number
  }
  monthlySchedule: VatMonthlyRow[]
  taxRegister: SalesInvoiceItem[]
}

/*
 * RULING 2026-10-16 (R-P6-STATES, Law 16): this read returned MOCK_SALES /
 * MOCK_VAT on a failure and on an empty period, the monthly trend and VAT
 * schedule were always the mock blocks, and the effective rate was the literal
 * 13.0. It selected `tax_amount`, `grand_total` and `clients.pan_number`, none
 * of which exist (0006: `vat_amount`, `total_amount`; clients: `pan_vat`), so
 * on live it could ONLY ever show the mock figures. It now reads the real
 * columns, throws on failure, returns honest zeros, and builds the VAT
 * schedule per Bikram Sambat month from `issue_date` (BS rendered, never
 * stored). Draft and Void invoices are not sales and are left out.
 * Revert = restore MOCK_SALES/MOCK_VAT and the `catch`.
 */

type InvoiceRow = {
  id: string
  invoice_no: string
  client_id: string | null
  status: string
  issue_date: string | null
  due_date: string | null
  subtotal: number | string | null
  discount_amount: number | string | null
  taxable_amount: number | string | null
  vat_rate: number | string | null
  vat_amount: number | string | null
  total_amount: number | string | null
  paid_amount: number | string | null
  outstanding_amount: number | string | null
  voided_at: string | null
  vat_treatment?: string | null
  clients?: unknown
  bookings?: unknown
}

const money = (v: number | string | null | undefined): Paisa => {
  const raw = String(v ?? 0)
  const amount = /^\d+(?:\.\d{1,2})?$/.test(raw) ? parseMoney(raw) : null
  if (amount === null || !Number.isSafeInteger(amount)) throw new Error('Invalid or unsafe invoice amount')
  return amount
}

const PAGE_SIZE = 500
const MAX_ROWS = 50_000

function bsMonthOf(isoDate: string): { key: string; label: string } | null {
  const bs = toBs(new Date(`${isoDate.slice(0, 10)}T12:00:00Z`))
  if (!bs) return null
  return { key: `${bs.year}-${String(bs.month).padStart(2, '0')}`, label: `${BS_MONTHS[bs.month - 1] ?? ''} ${bs.year}` }
}

export async function getSalesVatReport(options?: ReportFilterOptions): Promise<{ sales: SalesReportData; vat: VatTaxReportData }> {
  const invoiceQuery = () => {
    let query = supabase
    .from('invoices')
    .select(
      'id, invoice_no, client_id, status, issue_date, due_date, subtotal, discount_amount, taxable_amount, vat_rate, vat_amount, total_amount, paid_amount, outstanding_amount, voided_at, vat_treatment, clients!client_id(name, pan_vat), bookings!booking_id(booking_no)',
    )
    .neq('status', 'Draft')
    .neq('status', 'Void')
    .is('voided_at', null)
    .order('issue_date', { ascending: false })
    .order('id', { ascending: false })
    if (options?.from) query = query.gte('issue_date', options.from)
    if (options?.to) query = query.lte('issue_date', options.to)
    if (options?.branchId) query = query.eq('branch_id', options.branchId)
    return query
  }

  // A register/export must contain the same invoices as its headline totals.
  // Continue until an empty confirmed page, including servers with a lower
  // page cap. A failed page or repeated row refuses the whole partial report.
  const rows: InvoiceRow[] = []
  const seen = new Set<string>()
  while (true) {
    const result = await invoiceQuery().range(rows.length, rows.length + PAGE_SIZE - 1)
    if (!Array.isArray(result.data) && !result.error) throw new Error('Invoices read returned no confirmed dataset')
    const page = rowsOf<InvoiceRow>(result, 'Invoices read failed')
    if (page.length === 0) break
    for (const row of page) {
      if (!row.id || seen.has(row.id)) throw new Error('Invoice register changed during pagination; retry the report')
      seen.add(row.id)
      rows.push(row)
    }
    if (rows.length > MAX_ROWS) throw new Error('Invoice register exceeds safe report limit; narrow the period')
  }

  let invoiced = 0
  let net = 0
  let vatTotal = 0
  let discounts = 0
  let paidTotal = 0
  let outstanding = 0
  let taxable = 0
  let exempt = 0
  let nonVat = 0
  const statusMap = new Map<string, { count: number; amount: number }>()
  const clientMap = new Map<string, { name: string; count: number; invoiced: number; paid: number }>()
  const monthMap = new Map<string, VatMonthlyRow & { invoicedTotal: number; collectedTotal: number }>()
  const invoices: SalesInvoiceItem[] = []

  for (const r of rows) {
    const total = money(r.total_amount)
    const sub = money(r.subtotal)
    const vat = money(r.vat_amount)
    const taxableAmt = money(r.taxable_amount)
    const paid = money(r.paid_amount)
    const discount = money(r.discount_amount)
    if (discount > sub) throw new Error('Invalid invoice amount: discount exceeds subtotal')
    invoiced += total
    net += sub - discount
    vatTotal += vat
    discounts += discount
    paidTotal += paid
    outstanding += money(r.outstanding_amount)
    // An invoice with no VAT charged is exempt (or zero-rated) turnover.
    // Non-VAT bills (D13) are tracked separately — they are not exempt sales.
    const isNonVat = r.vat_treatment === 'non_vat'
    const isExempt = vat === 0 && !isNonVat
    if (isExempt) exempt += taxableAmt
    else if (!isNonVat) taxable += taxableAmt
    // Non-VAT bills: tracked in their own total, not mixed into exempt/zero-rated
    if (isNonVat) nonVat += taxableAmt
    if (![invoiced, net, vatTotal, discounts, paidTotal, outstanding, taxable, exempt, taxable + exempt].every(Number.isSafeInteger)) {
      throw new Error('Invoice report exceeds safe paisa range; narrow the period')
    }

    const st = statusMap.get(r.status) ?? { count: 0, amount: 0 }
    st.count++
    st.amount += total
    statusMap.set(r.status, st)

    const client = (Array.isArray(r.clients) ? r.clients[0] : r.clients) as { name?: string; pan_vat?: string | null } | null | undefined
    const clientName = embeddedName(r.clients)
    const cKey = r.client_id ?? clientName
    const cl = clientMap.get(cKey) ?? { name: clientName, count: 0, invoiced: 0, paid: 0 }
    cl.count++
    cl.invoiced += total
    cl.paid += paid
    clientMap.set(cKey, cl)

    if (r.issue_date) {
      const bm = bsMonthOf(r.issue_date)
      if (bm) {
        const row =
          monthMap.get(bm.key) ??
          ({ month: formatAdMonth(new Date(`${r.issue_date.slice(0, 10)}T12:00:00Z`)), bsMonth: bm.label, taxableSales: 0 as Paisa, vatAmount: 0 as Paisa, exemptSales: 0 as Paisa, nonVatSales: 0 as Paisa, grossSales: 0 as Paisa, invoicedTotal: 0, collectedTotal: 0 } as VatMonthlyRow & {
            invoicedTotal: number
            collectedTotal: number
          })
        row.taxableSales = (row.taxableSales + (isExempt ? 0 : taxableAmt)) as Paisa
        row.exemptSales = (row.exemptSales + (isExempt ? taxableAmt : 0)) as Paisa
        row.nonVatSales = (row.nonVatSales + (isNonVat ? taxableAmt : 0)) as Paisa
        row.vatAmount = (row.vatAmount + vat) as Paisa
        row.grossSales = (row.grossSales + total) as Paisa
        row.invoicedTotal += total
        row.collectedTotal += paid
        monthMap.set(bm.key, row)
      }
    }

    const booking = (Array.isArray(r.bookings) ? r.bookings[0] : r.bookings) as { booking_no?: string } | null | undefined
    invoices.push({
      id: r.id,
      invoiceNo: r.invoice_no,
      bookingNo: booking?.booking_no ?? '—',
      clientName,
      clientPan: client?.pan_vat?.trim() || undefined,
      issueDate: r.issue_date ?? '',
      dueDate: r.due_date ?? '',
      subtotal: sub,
      taxAmount: vat,
      grandTotal: total,
      paidAmount: paid,
      status: r.status,
      vatTreatment: r.vat_treatment === 'non_vat' ? 'non_vat' : 'standard',
    })
  }

  const count = rows.length
  const months = [...monthMap.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([, v]) => v)
  const vatBase = taxable + exempt

  const sales: SalesReportData = {
    metrics: {
      totalInvoiced: invoiced as Paisa,
      netSales: net as Paisa,
      totalVat: vatTotal as Paisa,
      totalDiscounts: discounts as Paisa,
      totalCollected: paidTotal as Paisa,
      totalOutstanding: outstanding as Paisa,
      invoiceCount: count,
      collectionRate: invoiced > 0 ? Number(((paidTotal / invoiced) * 100).toFixed(1)) : 0,
    },
    statusBreakdown: [...statusMap.entries()]
      .sort((a, b) => b[1].count - a[1].count)
      .map(([status, v]) => ({ status, count: v.count, amount: v.amount as Paisa, percent: percentOf(v.count, count) })),
    monthlyTrend: months.map((m) => ({ period: m.bsMonth, invoiced: m.invoicedTotal as Paisa, collected: m.collectedTotal as Paisa })),
    topClients: [...clientMap.entries()]
      .map(([clientId, v]) => ({
        clientId,
        clientName: v.name,
        invoiceCount: v.count,
        totalInvoiced: v.invoiced as Paisa,
        totalPaid: v.paid as Paisa,
        balance: Math.max(0, v.invoiced - v.paid) as Paisa,
      }))
      .sort((a, b) => b.totalInvoiced - a.totalInvoiced)
      .slice(0, 5),
    invoices,
  }

  const vat: VatTaxReportData = {
    metrics: {
      totalGrossTurnover: invoiced as Paisa,
      taxableTurnover: taxable as Paisa,
      totalOutputVat: vatTotal as Paisa,
      exemptTurnover: exempt as Paisa,
      nonVatTurnover: nonVat as Paisa,
      effectiveVatRate: vatBase > 0 ? Number(((vatTotal / vatBase) * 100).toFixed(1)) : 0,
      invoicesCount: count,
    },
    monthlySchedule: months.map(({ invoicedTotal: _i, collectedTotal: _c, ...row }) => row),
    taxRegister: invoices,
  }

  return { sales, vat }
}
