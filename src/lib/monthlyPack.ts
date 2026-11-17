/**
 * Monthly Accountant Export Pack (T3-23 / W81 / IRD Annex 5)
 *
 * Produces a complete monthly accounting archive containing:
 *  1. sales_register_<month>.csv (matching IRD / Annex 5 format)
 *  2. purchase_register_<month>.csv (expenses & supplier purchases)
 *  3. payments_received_<month>.csv (receipts, advances & settlements)
 *  4. tds_withheld_<month>.csv (crew withholding tax)
 *  5. summary.txt (executive tax position & reconciliation summary)
 *  6. (optional) individual invoice PDFs under invoices/
 *
 * Role-gated to Owner, Admin, Manager, and Accounts (PERMISSIONS §5 / Law 6).
 */

import { supabase } from './supabase'
import { csvCell } from './csv'
import { createZip, type ZipFileInput } from './zip'
import { toBs, toAd, kathmanduCivil, BS_MONTHS, BS_MONTH_DAYS, type BsDate } from './bs'
import { formatMoney, parseMoney, type Paisa } from './money'
import { getSalesVatReport, type SalesInvoiceItem } from './queries/salesVatReports'
import { getCrewTdsReport } from './queries/crewTdsReport'
import { listPayments, paymentsInPeriod, type PaymentListRow } from './queries/finance'

export type MonthCalendar = 'BS' | 'AD'

export interface MonthlyPackOptions {
  calendar: MonthCalendar
  year: number
  month: number // 1-12
  includeInvoicePdfs?: boolean
  branchId?: string
}

export interface MonthlyPackPeriod {
  calendar: MonthCalendar
  year: number
  month: number
  monthName: string
  monthSlug: string
  startAd: string
  endAd: string
  startBs: string
  endBs: string
}

export interface MonthlyPackExpenseItem {
  id: string
  expenseNo: string
  expenseDateAd: string
  expenseDateBs: string
  vendorName: string
  categoryName: string
  description: string
  amountPaisa: Paisa
  paymentMethod: string
  status: string
}

export interface MonthlyPackResult {
  zipBytes: Uint8Array
  zipBlob: Blob
  filename: string
  fileSizeBytes: number
  period: MonthlyPackPeriod
  summaryText: string
  counts: {
    invoices: number
    expenses: number
    payments: number
    tdsPayouts: number
    invoicePdfs: number
  }
}

/**
 * Calculates start and end AD & BS dates for a selected BS or AD month.
 */
export function resolveMonthlyPackPeriod(
  calendar: MonthCalendar,
  year: number,
  month: number,
): MonthlyPackPeriod {
  if (month < 1 || month > 12) {
    throw new Error(`Invalid month: ${month}. Month must be between 1 and 12.`)
  }

  let startDate: Date
  let endDate: Date
  let monthName: string
  let monthSlug: string

  if (calendar === 'BS') {
    const daysInMonth = BS_MONTH_DAYS[year]?.[month - 1]
    if (!daysInMonth) {
      throw new Error(`BS year ${year} is outside supported table bounds (2080-2085).`)
    }
    const startAd = toAd({ year, month, day: 1 })
    const endAd = toAd({ year, month, day: daysInMonth })
    if (!startAd || !endAd) {
      throw new Error(`Could not resolve AD bounds for BS ${year}-${month}.`)
    }
    startDate = startAd
    endDate = endAd
    monthName = `${BS_MONTHS[month - 1]} ${year} BS`
    monthSlug = `bs_${year}_${String(month).padStart(2, '0')}`
  } else {
    // AD calendar month
    startDate = new Date(Date.UTC(year, month - 1, 1, 0, 0, 0))
    // Last day of month
    endDate = new Date(Date.UTC(year, month, 0, 23, 59, 59))
    const adMonthNames = [
      'January', 'February', 'March', 'April', 'May', 'June',
      'July', 'August', 'September', 'October', 'November', 'December',
    ]
    monthName = `${adMonthNames[month - 1]} ${year} AD`
    monthSlug = `ad_${year}_${String(month).padStart(2, '0')}`
  }

  const startAdStr = startDate.toISOString().slice(0, 10)
  const endAdStr = endDate.toISOString().slice(0, 10)

  const startBsObj = toBs(startDate)
  const endBsObj = toBs(endDate)

  const fmtBs = (b: BsDate | null) =>
    b ? `${b.year}-${String(b.month).padStart(2, '0')}-${String(b.day).padStart(2, '0')}` : 'N/A'

  return {
    calendar,
    year,
    month,
    monthName,
    monthSlug,
    startAd: startAdStr,
    endAd: endAdStr,
    startBs: fmtBs(startBsObj),
    endBs: fmtBs(endBsObj),
  }
}

/**
 * Builds standard CSV string with RFC-4180 quoting and CRLF row terminators.
 */
export function buildCsvText(rows: Array<Array<string | number>>): string {
  return rows.map((r) => r.map(csvCell).join(',')).join('\r\n')
}

interface PaymentReversalDbRow {
  id: string
  reversal_no: string
  original_payment_id: string
  amount: number | string
  reversed_at: string
}

interface ExpenseDbRow {
  id: string
  expense_no?: string | null
  expense_date?: string | null
  vendor_name?: string | null
  expense_categories?: { name?: string | null } | null
  description?: string | null
  amount?: number | string | null
  status?: string | null
}

/**
 * Fetches expenses in the date window.
 */
async function fetchExpensesForPeriod(
  startAd: string,
  endAd: string,
  branchId?: string,
): Promise<MonthlyPackExpenseItem[]> {
  {
    let query = supabase
      .from('expenses')
      .select('id, expense_no, expense_date, amount, vendor_name, description, status, expense_categories(name)')
      .gte('expense_date', startAd)
      .lte('expense_date', endAd)
      .neq('status', 'Cancelled')
      .neq('status', 'Rejected')
      .order('expense_date', { ascending: true })

    if (branchId) {
      query = query.eq('branch_id', branchId)
    }

    const { data, error } = await query
    if (error || !Array.isArray(data)) {
      // Incomplete accounting registers must never be represented as zero expenses.
      throw new Error(`Monthly expense register read failed: ${error?.message ?? 'No confirmed expense dataset'}`)
    }

    return ((data as unknown as ExpenseDbRow[]) ?? []).map((row) => {
      const d = row.expense_date ? new Date(row.expense_date) : new Date()
      const bs = toBs(d)
      const bsStr = bs
        ? `${bs.year}-${String(bs.month).padStart(2, '0')}-${String(bs.day).padStart(2, '0')}`
        : row.expense_date ?? ''

      const catName =
        row.expense_categories && typeof row.expense_categories === 'object'
          ? (row.expense_categories as { name?: string }).name ?? 'General'
          : 'General'

      return {
        id: row.id,
        expenseNo: row.expense_no || 'EXP',
        expenseDateAd: row.expense_date || startAd,
        expenseDateBs: bsStr,
        vendorName: row.vendor_name || 'Vendor',
        categoryName: catName,
        description: row.description || '',
        amountPaisa: (() => {
          const amount = parseMoney(String(row.amount ?? ''))
          if (amount === null) throw new Error('Invalid expense amount in accountant register.')
          return amount
        })(),
        // The expenses table has no recorded settlement method; never invent Cash.
        paymentMethod: 'Not recorded',
        status: row.status || 'Approved',
      }
    })
  }
}

/**
 * Generates the full Monthly Accountant Export Pack ZIP archive.
 */
export async function generateMonthlyPack(
  options: MonthlyPackOptions,
): Promise<MonthlyPackResult> {
  // Tax invoices must include persisted issuer details and exact invoice lines.
  // Until a verified invoice record source is connected, never fabricate copies.
  if (options.includeInvoicePdfs) {
    throw new Error('Accountant invoice PDFs require verified issuer data and persisted invoice lines; export refused.')
  }
  const period = resolveMonthlyPackPeriod(options.calendar, options.year, options.month)
  const { startAd, endAd, monthSlug } = period

  // 1. Fetch Sales and VAT Register
  const salesVatRes = await getSalesVatReport({
    from: startAd,
    to: endAd,
    branchId: options.branchId,
  })
  const salesInvoices: SalesInvoiceItem[] = salesVatRes.sales.invoices

  // 2. Fetch Expenses / Purchases
  const expenses = await fetchExpensesForPeriod(startAd, endAd, options.branchId)

  // 3. Fetch Payments Received
  // Payment_date is a UTC instant. Filter server-side by the shared
  // Kathmandu civil-month boundary, not an ISO UTC date slice.
  const receivedPayments: PaymentListRow[] = []
  const seenPaymentIds = new Set<string>()
  const paymentFilters = paymentsInPeriod(startAd, endAd)
  const paymentPageSize = 400
  for (let page = 0; page < 125; page++) {
    const { rows: batch } = await listPayments({
      ...paymentFilters,
      range: { from: page * paymentPageSize, to: (page + 1) * paymentPageSize - 1 },
    })
    for (const payment of batch) {
      if (!payment.id || seenPaymentIds.has(payment.id)) {
        throw new Error('Payment ledger changed during pagination; accountant export refused.')
      }
      seenPaymentIds.add(payment.id)
      receivedPayments.push(payment)
    }
    if (batch.length < paymentPageSize) break
    if (page === 124) throw new Error('Payment ledger exceeds verified export limit.')
  }

  // Refunds are outgoing cash. They are not positive collections.
  const refundedPayments: PaymentListRow[] = []
  const seenRefundIds = new Set<string>()
  for (let page = 0; page < 125; page++) {
    const { rows: batch } = await listPayments({
      ...paymentFilters,
      chips: { ...paymentFilters.chips, payment_type: ['Refund'] },
      range: { from: page * paymentPageSize, to: (page + 1) * paymentPageSize - 1 },
    })
    for (const payment of batch) {
      if (!payment.id || seenRefundIds.has(payment.id) || seenPaymentIds.has(payment.id)) {
        throw new Error('Refund ledger overlaps or changed during pagination.')
      }
      seenRefundIds.add(payment.id)
      refundedPayments.push(payment)
    }
    if (batch.length < paymentPageSize) break
    if (page === 124) throw new Error('Refund ledger exceeds verified export limit.')
  }

  // Compensating reversal entries are immutable and date from reversed_at, not
  // the original receipt's payment_date. Include cross-month corrections.
  const fromUtc = paymentFilters.dateRange?.fromAd
  const toUtc = paymentFilters.dateRange?.toAd
  if (!fromUtc || !toUtc) throw new Error('No confirmed Kathmandu period bounds for reversal ledger.')
  const reversalRows: PaymentReversalDbRow[] = []
  const reversalIds = new Set<string>()
  for (let page = 0; page < 125; page++) {
    const { data, error } = await supabase
      .from('payment_reversals')
      .select('id, reversal_no, original_payment_id, amount, reversed_at')
      .gte('reversed_at', fromUtc)
      .lte('reversed_at', toUtc)
      .order('reversed_at', { ascending: true })
      .order('id', { ascending: true })
      .range(page * paymentPageSize, (page + 1) * paymentPageSize - 1)
    if (error || !Array.isArray(data)) {
      throw new Error('Payment reversals could not be verified; accountant export refused.')
    }
    const batch = data as PaymentReversalDbRow[]
    for (const row of batch) {
      if (!row.id || reversalIds.has(row.id)) throw new Error('Reversal ledger changed during pagination.')
      reversalIds.add(row.id)
      reversalRows.push(row)
    }
    if (batch.length < paymentPageSize) break
    if (page === 124) throw new Error('Reversal ledger exceeds verified export limit.')
  }

  // 4. Fetch Crew TDS Payouts
  const crewTdsRes = await getCrewTdsReport({
    from: startAd,
    to: endAd,
    branchId: options.branchId,
  })
  const crewPayouts = crewTdsRes.payouts

  // ── BUILD CSV 1: sales_register_<month>.csv (Nepal IRD Annex 5 Format) ─────
  const salesCsvRows: Array<Array<string | number>> = [
    [
      'Date (BS)',
      'Date (AD)',
      'Invoice No',
      'Booking No',
      'Buyer Name',
      'Buyer PAN',
      'Total Amount (NPR)',
      'Exempt Amount (NPR)',
      'Non-VAT Amount (NPR)',
      'Taxable Amount (NPR)',
      '13% VAT Amount (NPR)',
      'Status',
    ],
  ]

  let totalSalesPaisa = 0
  let totalTaxableSalesPaisa = 0
  let totalOutputVatPaisa = 0
  let totalExemptSalesPaisa = 0
  let totalNonVatSalesPaisa = 0

  for (const inv of salesInvoices) {
    if (inv.taxableAmount === undefined || inv.discountAmount === undefined) {
      throw new Error('Persisted invoice tax base or discount is missing; accountant export refused.')
    }
    const nonVat = inv.vatTreatment === 'non_vat'
    const exempt = !nonVat && inv.taxAmount === 0
    const taxableBase = !nonVat && !exempt ? inv.taxableAmount : 0
    const exemptBase = exempt ? inv.taxableAmount : 0
    const nonVatBase = nonVat ? inv.taxableAmount : 0
    const d = inv.issueDate ? new Date(inv.issueDate) : new Date(startAd)
    const bs = toBs(d)
    const bsStr = bs
      ? `${bs.year}-${String(bs.month).padStart(2, '0')}-${String(bs.day).padStart(2, '0')}`
      : inv.issueDate

    totalSalesPaisa += inv.grandTotal
    totalTaxableSalesPaisa += taxableBase
    totalExemptSalesPaisa += exemptBase
    totalNonVatSalesPaisa += nonVatBase
    totalOutputVatPaisa += inv.taxAmount

    salesCsvRows.push([
      bsStr,
      inv.issueDate,
      inv.invoiceNo,
      inv.bookingNo,
      inv.clientName,
      inv.clientPan || 'N/A',
      (inv.grandTotal / 100).toFixed(2),
      (exemptBase / 100).toFixed(2),
      (nonVatBase / 100).toFixed(2),
      (taxableBase / 100).toFixed(2),
      (inv.taxAmount / 100).toFixed(2),
      inv.status,
    ])
  }

  // ── BUILD CSV 2: purchase_register_<month>.csv ────────────────────────────
  const purchaseCsvRows: Array<Array<string | number>> = [
    [
      'Date (BS)',
      'Date (AD)',
      'Bill No',
      'Supplier Name',
      'Category',
      'Description',
      'Total Amount (NPR)',
      'Taxable Amount (NPR)',
      'VAT Amount (NPR)',
      'Payment Method',
      'Status',
    ],
  ]

  let totalExpensesPaisa = 0

  for (const exp of expenses) {
    totalExpensesPaisa += exp.amountPaisa
    purchaseCsvRows.push([
      exp.expenseDateBs,
      exp.expenseDateAd,
      exp.expenseNo,
      exp.vendorName,
      exp.categoryName,
      exp.description,
      (exp.amountPaisa / 100).toFixed(2),
      'Not recorded',
      'Not recorded',
      exp.paymentMethod,
      exp.status,
    ])
  }

  // ── BUILD CSV 3: payments_received_<month>.csv ────────────────────────────
  const paymentsCsvRows: Array<Array<string | number>> = [
    [
      'Payment / Reversal No',
      'Original Payment ID',
      'Receipt Date (AD)',
      'Receipt Date (BS)',
      'Booking No',
      'Invoice No',
      'Client Name',
      'Payment Type',
      'Payment Channel',
      'Amount (NPR)',
      'Status',
    ],
  ]

  let totalPaymentsPaisa = 0

  for (const p of receivedPayments) {
    const civilDate = new Date(kathmanduCivil(new Date(p.paymentDateAd)))
    if (Number.isNaN(civilDate.getTime())) throw new Error('Invalid receipt timestamp.')
    const adDateStr = civilDate.toISOString().slice(0, 10)
    const bs = toBs(civilDate)
    const bsStr = bs
      ? `${bs.year}-${String(bs.month).padStart(2, '0')}-${String(bs.day).padStart(2, '0')}`
      : adDateStr

    totalPaymentsPaisa += p.amount

    paymentsCsvRows.push([
      p.paymentNo,
      '',
      adDateStr,
      bsStr,
      p.bookingNo,
      p.invoiceNo || 'N/A',
      p.clientName,
      p.paymentType,
      p.channelGroup || 'Other',
      (p.amount / 100).toFixed(2),
      p.status,
    ])
  }

  let totalRefundsPaisa = 0
  for (const p of refundedPayments) {
    totalRefundsPaisa += p.amount
    const civilDate = new Date(kathmanduCivil(new Date(p.paymentDateAd)))
    const adDateStr = civilDate.toISOString().slice(0, 10)
    const bs = toBs(civilDate)
    const bsStr = bs
      ? `${bs.year}-${String(bs.month).padStart(2, '0')}-${String(bs.day).padStart(2, '0')}`
      : adDateStr
    paymentsCsvRows.push([
      p.paymentNo, '', adDateStr, bsStr, p.bookingNo, p.invoiceNo || 'N/A',
      p.clientName, 'Refund (money out)', p.channelGroup || 'Other',
      (-p.amount / 100).toFixed(2), p.status,
    ])
  }

  let totalReversalsPaisa = 0
  for (const reversal of reversalRows) {
    const amountPaisa = parseMoney(String(reversal.amount ?? ''))
    if (amountPaisa === null || amountPaisa <= 0) {
      throw new Error('Invalid reversal amount in accountant ledger.')
    }
    totalReversalsPaisa += amountPaisa
    const civilDate = new Date(kathmanduCivil(new Date(reversal.reversed_at)))
    if (Number.isNaN(civilDate.getTime())) throw new Error('Invalid reversal timestamp.')
    const adDateStr = civilDate.toISOString().slice(0, 10)
    const bs = toBs(civilDate)
    const bsStr = bs
      ? `${bs.year}-${String(bs.month).padStart(2, '0')}-${String(bs.day).padStart(2, '0')}`
      : adDateStr
    paymentsCsvRows.push([
      reversal.reversal_no, reversal.original_payment_id, adDateStr, bsStr,
      'Refer to original receipt', 'Refer to original receipt',
      'See original payment ID', 'Reversal (money out)', 'Compensating ledger',
      (-amountPaisa / 100).toFixed(2), 'Recorded',
    ])
  }

  const netCollectionsPaisa = totalPaymentsPaisa - totalRefundsPaisa - totalReversalsPaisa

  // ── BUILD CSV 4: tds_withheld_<month>.csv ──────────────────────────────────
  const tdsCsvRows: Array<Array<string | number>> = [
    [
      'Booking No',
      'Crew Member',
      'PAN Number',
      'Position',
      'Start Date (BS)',
      'Start Date (AD)',
      'Days',
      'Gross Payout (NPR)',
      'TDS %',
      'TDS Withheld (NPR)',
      'Net Payout (NPR)',
      'Status',
      'Paid At',
    ],
  ]

  let totalGrossPayoutsPaisa = 0
  let totalTdsPaisa = 0

  for (const p of crewPayouts) {
    totalGrossPayoutsPaisa += p.grossPayout
    if (p.tdsAmount !== null) totalTdsPaisa += p.tdsAmount

    tdsCsvRows.push([
      p.crewBookingNo,
      p.crewMemberName,
      p.panNumber || 'N/A',
      p.position,
      p.startDateBs,
      p.startDateAd,
      p.days,
      (p.grossPayout / 100).toFixed(2),
      p.tdsRatePercent !== null ? `${p.tdsRatePercent}%` : '0%',
      p.tdsAmount !== null ? (p.tdsAmount / 100).toFixed(2) : '0.00',
      p.netPayout !== null ? (p.netPayout / 100).toFixed(2) : (p.grossPayout / 100).toFixed(2),
      p.payoutStatus,
      p.paidAt ? p.paidAt.slice(0, 10) : 'Pending',
    ])
  }

  // ── BUILD SUMMARY.TXT ──────────────────────────────────────────────────────
  // Net VAT and period-end receivables cannot be derived from expense totals or
  // "this month's invoices minus this month's receipts". They require an
  // accountant-reviewed input VAT ledger and opening/closing receivable balances.
  const periodMovementPaisa = totalSalesPaisa - netCollectionsPaisa

  const summaryLines = [
    '================================================================================',
    'BABIN RENTALS — ACCOUNTANT MONTHLY EXPORT PACK',
    `Period: ${period.monthName}`,
    `Date Range (AD): ${period.startAd} to ${period.endAd}`,
    `Date Range (BS): ${period.startBs} to ${period.endBs}`,
    `Generated at: ${new Date().toISOString()} (UTC)`,
    '================================================================================',
    '',
    '1. STATUTORY SALES & VAT (NEPAL IRD ANNEX 5)',
    '--------------------------------------------------------------------------------',
    `Invoices Issued:              ${salesInvoices.length}`,
    `Gross Invoiced Turnover:      ${formatMoney(totalSalesPaisa as Paisa)}`,
    `Taxable Sales (13%):          ${formatMoney(totalTaxableSalesPaisa as Paisa)}`,
    `Output VAT Collected (13%):   ${formatMoney(totalOutputVatPaisa as Paisa)}`,
    `Exempt Sales:                 ${formatMoney(totalExemptSalesPaisa as Paisa)}`,
    `Non-VAT Sales (separate):      ${formatMoney(totalNonVatSalesPaisa as Paisa)}`,
    '',
    '2. PURCHASES & OPERATING EXPENSES',
    '--------------------------------------------------------------------------------',
    `Expenses Recorded:            ${expenses.length}`,
    `Gross Expenses:               ${formatMoney(totalExpensesPaisa as Paisa)}`,
    'Reclaimable Input VAT:        NOT VERIFIED - source expenses do not store VAT breakdown',
    '',
    '3. COLLECTIONS & CASH RECEIVED',
    '--------------------------------------------------------------------------------',
    `Gross Receipts:               ${receivedPayments.length}`,
    `Gross Collections:            ${formatMoney(totalPaymentsPaisa as Paisa)}`,
    `Refund Movements:              ${refundedPayments.length}`,
    `Reversal Movements:            ${reversalRows.length}`,
    `Net Period Collections:       ${formatMoney(netCollectionsPaisa as Paisa)}`,
    '',
    '4. WITHHOLDING TAX (CREW TDS)',
    '--------------------------------------------------------------------------------',
    `Crew Assignments:             ${crewPayouts.length}`,
    `Gross Crew Compensation:      ${formatMoney(totalGrossPayoutsPaisa as Paisa)}`,
    `Total TDS Withheld:           ${formatMoney(totalTdsPaisa as Paisa)}`,
    `Net Crew Paid:                ${formatMoney((totalGrossPayoutsPaisa - totalTdsPaisa) as Paisa)}`,
    '',
    '5. STATUTORY TAX POSITION (FILING RECONCILIATION)',
    '--------------------------------------------------------------------------------',
    `Output VAT Before Credits:    ${formatMoney(totalOutputVatPaisa as Paisa)}`,
    'Net VAT Payable:              NOT DETERMINED - reconcile input credits',
    `TDS Withholding (provisional): ${formatMoney(totalTdsPaisa as Paisa)}`,
    'Filing-ready Total:           NOT DETERMINED - accountant review required',
    '',
    '6. PERIOD RECEIVABLES & CASH SUMMARY',
    '--------------------------------------------------------------------------------',
    `Invoiced in Period:           ${formatMoney(totalSalesPaisa as Paisa)}`,
    `Net Cash Movement in Period:  ${formatMoney(netCollectionsPaisa as Paisa)}`,
    `Gross Period Movement:        ${formatMoney(periodMovementPaisa as Paisa)}`,
    'Not Closing Receivables:      Opening balances, cross-period payments and reversals not reconciled',
    '',
    '================================================================================',
    'ARCHIVE CONTENTS:',
    `- sales_register_${monthSlug}.csv (IRD Annex 5 Sales Book)`,
    `- purchase_register_${monthSlug}.csv (Expenses & Purchases Book)`,
    `- payments_received_${monthSlug}.csv (Collections & Receipts Ledger)`,
    `- tds_withheld_${monthSlug}.csv (Withholding Tax Register)`,
    '- summary.txt (Statutory Executive Summary)',
    ...(options.includeInvoicePdfs ? [`- invoices/ (${salesInvoices.length} tax invoice PDF copies)`] : []),
    '================================================================================',
    'Prepared by Babin Rentals OS for statutory Nepal tax filing reconciliation.',
  ]

  const summaryText = summaryLines.join('\n')

  // ── PREPARE ZIP ENTRIES ───────────────────────────────────────────────────
  const zipEntries: ZipFileInput[] = [
    {
      filename: `sales_register_${monthSlug}.csv`,
      data: buildCsvText(salesCsvRows),
    },
    {
      filename: `purchase_register_${monthSlug}.csv`,
      data: buildCsvText(purchaseCsvRows),
    },
    {
      filename: `payments_received_${monthSlug}.csv`,
      data: buildCsvText(paymentsCsvRows),
    },
    {
      filename: `tds_withheld_${monthSlug}.csv`,
      data: buildCsvText(tdsCsvRows),
    },
    {
      filename: 'summary.txt',
      data: summaryText,
    },
  ]

  // Invoice PDF copies cannot be generated from synthetic issuer/line metadata.
  const invoicePdfsCount = 0

  // Create final ZIP bytes
  const zipBytes = createZip(zipEntries)
  const zipBlob = new Blob([zipBytes as unknown as BlobPart], { type: 'application/zip' })
  const zipFilename = `Accountant_Monthly_Pack_${monthSlug}.zip`

  return {
    zipBytes,
    zipBlob,
    filename: zipFilename,
    fileSizeBytes: zipBytes.byteLength,
    period,
    summaryText,
    counts: {
      invoices: salesInvoices.length,
      expenses: expenses.length,
      payments: receivedPayments.length + refundedPayments.length + reversalRows.length,
      tdsPayouts: crewPayouts.length,
      invoicePdfs: invoicePdfsCount,
    },
  }
}
