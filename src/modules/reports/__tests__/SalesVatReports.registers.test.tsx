// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Paisa } from '../../../lib/money'
import type { SalesInvoiceItem, SalesReportData, VatTaxReportData } from '../../../lib/queries/salesVatReports'

const fixture = vi.hoisted(() => ({ money: true, load: vi.fn() }))

vi.mock('../../../lib/moneyVisibility', () => ({ useCanViewMoney: () => fixture.money }))
vi.mock('../../../lib/device', () => ({ useViewport: () => 'desktop' }))
vi.mock('../../../lib/queries/salesVatReports', () => ({ getSalesVatReport: fixture.load }))

const { default: SalesVatReports } = await import('../SalesVatReports')

const P = (rupees: number) => Math.round(rupees * 100) as Paisa

// One invoice with a 10% discount: subtotal 1,29,500, discount 12,950, taxable 1,16,550,
// 13% VAT 15,152 (1,16,550 x 13% = 15,151.50, half up), grand total 1,31,702.
const invoice: SalesInvoiceItem = {
  id: 'inv-38',
  invoiceNo: 'INV-38',
  bookingNo: 'BK-38',
  clientName: 'Bagmati Films Pvt. Ltd.',
  issueDate: '2026-08-24',
  dueDate: '2026-09-08',
  subtotal: P(129500),
  taxableAmount: P(116550),
  discountAmount: P(12950),
  taxAmount: P(15152),
  grandTotal: P(131702),
  paidAmount: P(0),
  status: 'Partially Paid',
  vatTreatment: 'standard',
}

const sales: SalesReportData = {
  metrics: {
    totalInvoiced: P(131702),
    netSales: P(116550),
    totalVat: P(15152),
    totalDiscounts: P(12950),
    totalCollected: P(0),
    totalOutstanding: P(131702),
    invoiceCount: 1,
    collectionRate: 0,
  },
  statusBreakdown: [{ status: 'Partially Paid', count: 1, amount: P(131702), percent: 100 }],
  monthlyTrend: [],
  topClients: [],
  invoices: [invoice],
}

// Two BS months that both touch August 2026: they must stay two rows, each with its own AD span.
const vat: VatTaxReportData = {
  metrics: {
    totalGrossTurnover: P(131702),
    taxableTurnover: P(116550),
    totalOutputVat: P(15152),
    exemptTurnover: P(0),
    nonVatTurnover: P(0),
    effectiveVatRate: 13,
    invoicesCount: 1,
  },
  monthlySchedule: [
    { monthAd: 'July 2026 – August 2026', bsMonth: 'Shrawan 2083', taxableSales: P(100000), vatAmount: P(13000), exemptSales: P(0), nonVatSales: P(0), grossSales: P(113000) },
    { monthAd: 'August 2026 – September 2026', bsMonth: 'Bhadra 2083', taxableSales: P(50000), vatAmount: P(6500), exemptSales: P(0), nonVatSales: P(0), grossSales: P(56500) },
  ],
  taxRegister: [invoice],
}

let container: HTMLDivElement
let root: Root

async function flush() {
  await act(async () => {
    await new Promise((r) => setTimeout(r, 0))
  })
}

function rowWith(text: string): HTMLTableRowElement | undefined {
  return [...container.querySelectorAll('tr')].find((tr) => (tr.textContent ?? '').includes(text))
}

function cellsOf(row: HTMLTableRowElement | undefined): string[] {
  return [...(row?.querySelectorAll('td') ?? [])].map((td) => (td.textContent ?? '').trim())
}

async function renderReport() {
  await act(async () => {
    root.render(
      <MemoryRouter>
        <SalesVatReports />
      </MemoryRouter>,
    )
  })
  await flush()
}

async function openVatRegister() {
  const button = [...container.querySelectorAll('button')].find((b) =>
    (b.textContent ?? '').includes('Nepal 13% VAT Register'),
  )
  if (!button) throw new Error('VAT register toggle not found')
  await act(async () => {
    button.click()
  })
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  fixture.money = true
  fixture.load.mockReset()
  fixture.load.mockResolvedValue({ sales, vat })
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
})

afterEach(async () => {
  await act(async () => root.unmount())
  container.remove()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('Invoiced Sales register', () => {
  it('has a Discount column between Subtotal and 13% VAT, so each row reconciles on screen', async () => {
    await renderReport()

    const headers = [...container.querySelectorAll('th')].map((th) => (th.textContent ?? '').trim())
    const subtotalAt = headers.indexOf('Subtotal')
    expect(headers.indexOf('Discount')).toBe(subtotalAt + 1)
    expect(headers.indexOf('13% VAT')).toBe(subtotalAt + 2)

    // Cells: invoice, client, PAN, issue date, subtotal, discount, 13% VAT, grand total, status.
    const cells = cellsOf(rowWith('INV-38'))
    expect(cells[4]).toBe('Rs 1,29,500')
    expect(cells[5]).toBe('Rs 12,950')
    expect(cells[6]).toBe('Rs 15,152')
    expect(cells[7]).toBe('Rs 1,31,702')
  })
})

describe('Nepal 13% VAT register', () => {
  it('shows the discounted taxable base, so 13% of Taxable Amount is the VAT on the row', async () => {
    await renderReport()
    await openVatRegister()

    // Cells: invoice, issue date, client, PAN, taxable amount, 13% VAT amount, total.
    const cells = cellsOf(rowWith('INV-38'))
    expect(cells[4]).toBe('Rs 1,16,550')
    expect(cells[5]).toBe('Rs 15,152')
    expect(cells[6]).toBe('Rs 1,31,702')
  })

  it('keeps both BS months that touch August 2026 as rows, with no duplicate-key warning', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    await renderReport()
    await openVatRegister()

    const firstCells = [...container.querySelectorAll('tbody tr td:first-child')].map((td) => (td.textContent ?? '').trim())
    expect(firstCells).toContain('Shrawan 2083')
    expect(firstCells).toContain('Bhadra 2083')
    expect(firstCells).not.toContain('August 2026')

    const duplicateKeyWarnings = consoleError.mock.calls.filter((args) => String(args[0]).includes('same key'))
    expect(duplicateKeyWarnings).toHaveLength(0)
  })
})
