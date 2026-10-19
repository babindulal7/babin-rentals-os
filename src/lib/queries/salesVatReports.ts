import { IS_MOCK, supabase } from '../supabase'
import { rupees, type Paisa } from '../money'
import { databaseMoney, reportPaisa } from '../reportMoney'
import { BS_MONTHS, formatAd, toBs } from '../bs'

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
  taxableAmount: Paisa
  taxAmount: Paisa
  grandTotal: Paisa
  paidAmount: Paisa
  status: string
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
  grossSales: Paisa
}

export interface VatTaxReportData {
  metrics: {
    totalGrossTurnover: Paisa
    taxableTurnover: Paisa
    totalOutputVat: Paisa
    exemptTurnover: Paisa
    effectiveVatRate: number
    invoicesCount: number
  }
  monthlySchedule: VatMonthlyRow[]
  taxRegister: SalesInvoiceItem[]
}

export interface ReportFilterOptions {
  from?: string | undefined
  to?: string | undefined
  branchId?: string | undefined
}

/* ── Existing explicit mock-mode fixtures; never returned by live reads ──────── */

const MOCK_SALES: SalesReportData = {
  metrics: {
    totalInvoiced: rupees(5452250),
    netSales: rupees(4825000),
    totalVat: rupees(627250),
    totalDiscounts: rupees(337750),
    totalCollected: rupees(4210000),
    totalOutstanding: rupees(1242250),
    invoiceCount: 42,
    collectionRate: 77.2,
  },
  statusBreakdown: [
    { status: 'Paid', count: 28, amount: rupees(3650000), percent: 67 },
    { status: 'Partially Paid', count: 6, amount: rupees(925000), percent: 17 },
    { status: 'Issued / Unpaid', count: 6, amount: rupees(685000), percent: 12 },
    { status: 'Overdue', count: 2, amount: rupees(192250), percent: 4 },
  ],
  monthlyTrend: [
    { period: 'Baisakh', invoiced: rupees(780000), collected: rupees(750000) },
    { period: 'Jestha', invoiced: rupees(920000), collected: rupees(860000) },
    { period: 'Ashadh', invoiced: rupees(895000), collected: rupees(820000) },
    { period: 'Shrawan', invoiced: rupees(1150000), collected: rupees(980000) },
    { period: 'Bhadra', invoiced: rupees(1050000), collected: rupees(800000) },
    { period: 'Ashwin', invoiced: rupees(657250), collected: rupees(0) },
  ],
  topClients: [
    { clientId: 'cl-01', clientName: 'Highland Pictures', invoiceCount: 6, totalInvoiced: rupees(1250000), totalPaid: rupees(1150000), balance: rupees(100000) },
    { clientId: 'cl-02', clientName: 'KTM Motion Arts', invoiceCount: 5, totalInvoiced: rupees(980000), totalPaid: rupees(850000), balance: rupees(130000) },
    { clientId: 'cl-03', clientName: 'Aura Media Studio', invoiceCount: 7, totalInvoiced: rupees(850000), totalPaid: rupees(720000), balance: rupees(130000) },
    { clientId: 'cl-04', clientName: 'Red Panda Creative', invoiceCount: 4, totalInvoiced: rupees(680000), totalPaid: rupees(680000), balance: rupees(0) },
    { clientId: 'cl-05', clientName: 'Mountain Trail Films', invoiceCount: 5, totalInvoiced: rupees(590000), totalPaid: rupees(450000), balance: rupees(140000) },
  ],
  invoices: [
    { id: 'inv-01', invoiceNo: 'INV-2026-0041', bookingNo: 'BK-2026-0071', clientName: 'Highland Pictures', clientPan: '302488192', issueDate: '2026-09-15', dueDate: '2026-09-30', subtotal: rupees(245000), taxableAmount: rupees(245000), taxAmount: rupees(31850), grandTotal: rupees(276850), paidAmount: rupees(276850), status: 'Paid' },
    { id: 'inv-02', invoiceNo: 'INV-2026-0042', bookingNo: 'BK-2026-0072', clientName: 'KTM Motion Arts', clientPan: '601299441', issueDate: '2026-09-18', dueDate: '2026-10-03', subtotal: rupees(195000), taxableAmount: rupees(195000), taxAmount: rupees(25350), grandTotal: rupees(220350), paidAmount: rupees(150000), status: 'Partially Paid' },
    { id: 'inv-03', invoiceNo: 'INV-2026-0043', bookingNo: 'BK-2026-0073', clientName: 'Aura Media Studio', clientPan: '604811209', issueDate: '2026-09-20', dueDate: '2026-10-05', subtotal: rupees(165000), taxableAmount: rupees(165000), taxAmount: rupees(21450), grandTotal: rupees(186450), paidAmount: rupees(186450), status: 'Paid' },
    { id: 'inv-04', invoiceNo: 'INV-2026-0044', bookingNo: 'BK-2026-0074', clientName: 'Red Panda Creative', clientPan: '301129883', issueDate: '2026-09-22', dueDate: '2026-10-07', subtotal: rupees(140000), taxableAmount: rupees(140000), taxAmount: rupees(18200), grandTotal: rupees(158200), paidAmount: rupees(0), status: 'Issued' },
    { id: 'inv-05', invoiceNo: 'INV-2026-0045', bookingNo: 'BK-2026-0075', clientName: 'Mountain Trail Films', clientPan: '605991024', issueDate: '2026-09-24', dueDate: '2026-10-09', subtotal: rupees(185000), taxableAmount: rupees(185000), taxAmount: rupees(24050), grandTotal: rupees(209050), paidAmount: rupees(100000), status: 'Partially Paid' },
  ],
}

const MOCK_VAT: VatTaxReportData = {
  metrics: {
    totalGrossTurnover: rupees(5452250),
    taxableTurnover: rupees(4825000),
    totalOutputVat: rupees(627250),
    exemptTurnover: rupees(0),
    effectiveVatRate: 13.0,
    invoicesCount: 42,
  },
  monthlySchedule: [
    { month: '2026-04 (April/May)', bsMonth: 'Baisakh 2083', taxableSales: rupees(690265), vatAmount: rupees(89735), exemptSales: rupees(0), grossSales: rupees(780000) },
    { month: '2026-05 (May/June)', bsMonth: 'Jestha 2083', taxableSales: rupees(814160), vatAmount: rupees(105840), exemptSales: rupees(0), grossSales: rupees(920000) },
    { month: '2026-06 (June/July)', bsMonth: 'Ashadh 2083', taxableSales: rupees(792035), vatAmount: rupees(102965), exemptSales: rupees(0), grossSales: rupees(895000) },
    { month: '2026-07 (July/Aug)', bsMonth: 'Shrawan 2083', taxableSales: rupees(1017699), vatAmount: rupees(132301), exemptSales: rupees(0), grossSales: rupees(1150000) },
    { month: '2026-08 (Aug/Sept)', bsMonth: 'Bhadra 2083', taxableSales: rupees(929204), vatAmount: rupees(120796), exemptSales: rupees(0), grossSales: rupees(1050000) },
    { month: '2026-09 (Sept/Oct)', bsMonth: 'Ashwin 2083', taxableSales: rupees(581637), vatAmount: rupees(75613), exemptSales: rupees(0), grossSales: rupees(657250) },
  ],
  taxRegister: MOCK_SALES.invoices,
}

const EMPTY_SALES: SalesReportData = {
  metrics: {
    totalInvoiced: rupees(0),
    netSales: rupees(0),
    totalVat: rupees(0),
    totalDiscounts: rupees(0),
    totalCollected: rupees(0),
    totalOutstanding: rupees(0),
    invoiceCount: 0,
    collectionRate: 0,
  },
  statusBreakdown: [],
  monthlyTrend: [],
  topClients: [],
  invoices: [],
}

const EMPTY_VAT: VatTaxReportData = {
  metrics: {
    totalGrossTurnover: rupees(0),
    taxableTurnover: rupees(0),
    totalOutputVat: rupees(0),
    exemptTurnover: rupees(0),
    effectiveVatRate: 0,
    invoicesCount: 0,
  },
  monthlySchedule: [],
  taxRegister: [],
}

/* ── Query Aggregations from PostgreSQL ─────────────────────────────────── */


interface RecordedInvoice {
  id: string
  invoice_no: string
  booking_id: string | null
  client_id: string
  issue_date: string
  due_date: string
  subtotal: number | string
  discount_amount: number | string
  taxable_amount: number | string
  vat_amount: number | string
  total_amount: number | string
  paid_amount: number | string
  outstanding_amount: number | string
  status: string
  clients: { name: string; pan_vat: string | null } | null
  bookings: { booking_no: string } | null
}

const PAGE_SIZE = 500

/** Recorded issued invoices only: no repricing, sample fallback or row-cap truncation. */
export async function getSalesVatReport(options?: ReportFilterOptions): Promise<{ sales: SalesReportData; vat: VatTaxReportData }> {
  try {
    const rows: RecordedInvoice[] = []
    const seen = new Set<string>()
    let expectedCount: number | null = null
    for (;;) {
      let query = supabase.from('invoices').select(
        'id,invoice_no,booking_id,client_id,branch_id,issue_date,due_date,subtotal,discount_amount,taxable_amount,vat_amount,total_amount,paid_amount,outstanding_amount,status,voided_at,created_at,clients!client_id(name,pan_vat),bookings!booking_id(booking_no)',
        { count: 'exact' },
      ).is('voided_at', null)
        .in('status', ['Sent', 'Partially Paid', 'Paid', 'Overdue'])
        .order('issue_date', { ascending: false }).order('id', { ascending: true })
      if (options?.from) query = query.gte('issue_date', options.from)
      if (options?.to) query = query.lte('issue_date', options.to)
      if (options?.branchId) query = query.eq('branch_id', options.branchId)
      const { data, error, count } = await query.range(rows.length, rows.length + PAGE_SIZE - 1)
      if (error) throw new Error('Sales and VAT records could not be read.', { cause: error })
      if (!data || count === null || !Number.isSafeInteger(count) || count < 0) {
        throw new Error('The complete financial register could not be confirmed.')
      }
      if (expectedCount !== null && count !== expectedCount) {
        throw new Error('The financial register changed while loading. Retry the report.')
      }
      expectedCount = count
      if (data.length === 0 && rows.length < count) throw new Error('The financial register was truncated. Retry the report.')
      for (const row of data as unknown as RecordedInvoice[]) {
        if (!row.id || seen.has(row.id)) throw new Error('The financial register changed while loading. Retry the report.')
        seen.add(row.id)
        rows.push(row)
      }
      if (rows.length > count) throw new Error('The financial register count did not reconcile.')
      if (rows.length === count) break
      // Advance by actual returned rows, even when the server caps below PAGE_SIZE.
    }
    if (!rows.length) return IS_MOCK ? { sales: MOCK_SALES, vat: MOCK_VAT } : { sales: EMPTY_SALES, vat: EMPTY_VAT }

    let totalInvoiced = 0, netSales = 0, totalTaxable = 0, totalExempt = 0, totalTax = 0
    let totalDiscounts = 0, totalPaid = 0, totalOutstanding = 0
    const statusCounts = new Map<string, { count: number; amount: number }>()
    const clients = new Map<string, { name: string; count: number; invoiced: number; paid: number; balance: number }>()
    const salesMonths = new Map<string, { invoiced: number; collected: number }>()
    const vatMonths = new Map<string, { label: string; first: string; last: string; taxable: number; vat: number; exempt: number; gross: number }>()
    const invoices: SalesInvoiceItem[] = []

    for (const row of rows) {
      const gross = databaseMoney(row.total_amount), subtotal = databaseMoney(row.subtotal)
      const taxable = databaseMoney(row.taxable_amount), tax = databaseMoney(row.vat_amount)
      const discount = databaseMoney(row.discount_amount), paid = databaseMoney(row.paid_amount)
      const outstanding = databaseMoney(row.outstanding_amount)
      const net = reportPaisa(subtotal - discount)
      const exempt = reportPaisa(net - taxable)
      if (net < 0 || exempt < 0) throw new Error('Recorded taxable and discount amounts do not reconcile.')
      totalInvoiced = reportPaisa(totalInvoiced + gross)
      netSales = reportPaisa(netSales + net)
      totalTaxable = reportPaisa(totalTaxable + taxable)
      totalExempt = reportPaisa(totalExempt + exempt)
      totalTax = reportPaisa(totalTax + tax)
      totalDiscounts = reportPaisa(totalDiscounts + discount)
      totalPaid = reportPaisa(totalPaid + paid)
      totalOutstanding = reportPaisa(totalOutstanding + outstanding)

      const status = statusCounts.get(row.status) ?? { count: 0, amount: 0 }
      status.count++
      status.amount = reportPaisa(status.amount + gross)
      statusCounts.set(row.status, status)
      const client = clients.get(row.client_id) ?? { name: row.clients?.name ?? 'Client unavailable', count: 0, invoiced: 0, paid: 0, balance: 0 }
      client.count++
      client.invoiced = reportPaisa(client.invoiced + gross)
      client.paid = reportPaisa(client.paid + paid)
      client.balance = reportPaisa(client.balance + outstanding)
      clients.set(row.client_id, client)

      if (!/^\d{4}-\d{2}-\d{2}$/.test(row.issue_date)) throw new Error('An issued invoice has no valid issue date.')
      const instant = new Date(row.issue_date + 'T00:00:00+05:45')
      if (!Number.isFinite(instant.getTime())) throw new Error('An issued invoice has an invalid issue date.')
      const adMonth = row.issue_date.slice(0, 7)
      const salesMonth = salesMonths.get(adMonth) ?? { invoiced: 0, collected: 0 }
      salesMonth.invoiced = reportPaisa(salesMonth.invoiced + gross)
      salesMonth.collected = reportPaisa(salesMonth.collected + paid)
      salesMonths.set(adMonth, salesMonth)
      const bs = toBs(instant)
      const bsKey = bs ? String(bs.year) + '-' + String(bs.month).padStart(2, '0') : 'AD-' + adMonth
      const bsLabel = bs ? String(BS_MONTHS[bs.month - 1]) + ' ' + bs.year : 'BS period unavailable'
      const vatMonth = vatMonths.get(bsKey) ?? { label: bsLabel, first: row.issue_date, last: row.issue_date, taxable: 0, vat: 0, exempt: 0, gross: 0 }
      if (row.issue_date < vatMonth.first) vatMonth.first = row.issue_date
      if (row.issue_date > vatMonth.last) vatMonth.last = row.issue_date
      vatMonth.taxable = reportPaisa(vatMonth.taxable + taxable)
      vatMonth.vat = reportPaisa(vatMonth.vat + tax)
      vatMonth.exempt = reportPaisa(vatMonth.exempt + exempt)
      vatMonth.gross = reportPaisa(vatMonth.gross + gross)
      vatMonths.set(bsKey, vatMonth)

      invoices.push({
        id: row.id, invoiceNo: row.invoice_no, bookingNo: row.bookings?.booking_no ?? '—',
        clientName: client.name, clientPan: row.clients?.pan_vat ?? undefined,
        issueDate: row.issue_date, dueDate: row.due_date,
        subtotal, taxableAmount: taxable, taxAmount: tax, grandTotal: gross, paidAmount: paid, status: row.status,
      })
    }
    const totalCount = rows.length
    const sales: SalesReportData = {
      metrics: {
        totalInvoiced: reportPaisa(totalInvoiced), netSales: reportPaisa(netSales), totalVat: reportPaisa(totalTax),
        totalDiscounts: reportPaisa(totalDiscounts), totalCollected: reportPaisa(totalPaid),
        totalOutstanding: reportPaisa(totalOutstanding), invoiceCount: totalCount,
        collectionRate: totalInvoiced ? Math.round(totalPaid / totalInvoiced * 1000) / 10 : 0,
      },
      statusBreakdown: [...statusCounts].map(([status, value]) => ({status, count: value.count, amount: reportPaisa(value.amount), percent: Math.round(value.count / totalCount * 100)})),
      monthlyTrend: [...salesMonths].sort(([a], [b]) => a.localeCompare(b)).map(([period, value]) => ({period, invoiced: reportPaisa(value.invoiced), collected: reportPaisa(value.collected)})),
      topClients: [...clients].map(([id, value]) => ({clientId: id, clientName: value.name, invoiceCount: value.count, totalInvoiced: reportPaisa(value.invoiced), totalPaid: reportPaisa(value.paid), balance: reportPaisa(value.balance)}))
        .sort((a,b) => b.totalInvoiced - a.totalInvoiced).slice(0,5),
      invoices,
    }
    const vat: VatTaxReportData = {
      metrics: {
        totalGrossTurnover: reportPaisa(totalInvoiced), taxableTurnover: reportPaisa(totalTaxable),
        totalOutputVat: reportPaisa(totalTax), exemptTurnover: reportPaisa(totalExempt),
        effectiveVatRate: totalTaxable ? Math.round(totalTax / totalTaxable * 1000) / 10 : 0,
        invoicesCount: totalCount,
      },
      monthlySchedule: [...vatMonths].sort(([a],[b]) => a.localeCompare(b)).map(([,value]) => ({
        month: formatAd(new Date(value.first + 'T00:00:00+05:45')) + (value.last === value.first ? '' : ' – ' + formatAd(new Date(value.last + 'T00:00:00+05:45'))),
        bsMonth: value.label, taxableSales: reportPaisa(value.taxable), vatAmount: reportPaisa(value.vat),
        exemptSales: reportPaisa(value.exempt), grossSales: reportPaisa(value.gross),
      })),
      taxRegister: invoices,
    }
    return { sales, vat }
  } catch (error) {
    if (!IS_MOCK) throw error
    return { sales: MOCK_SALES, vat: MOCK_VAT }
  }
}
