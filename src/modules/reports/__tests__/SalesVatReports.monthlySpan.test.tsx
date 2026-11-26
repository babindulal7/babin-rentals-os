// @vitest-environment jsdom
import type { ReactNode } from 'react'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Paisa } from '../../../lib/money'
import type { SalesReportData, VatTaxReportData } from '../../../lib/queries/salesVatReports'

type CsvSpec = { build: () => ReadonlyArray<ReadonlyArray<string | number>> }

const fixture = vi.hoisted(() => ({ load: vi.fn(), csv: null as CsvSpec | null }))

vi.mock('../../../lib/moneyVisibility', () => ({ useCanViewMoney: () => true }))
vi.mock('../../../lib/device', () => ({ useViewport: () => 'desktop' }))
vi.mock('../../../lib/queries/salesVatReports', () => ({ getSalesVatReport: fixture.load }))
// The toolbar only hands its CSV spec to the page; capture it so the export rows can be read back.
vi.mock('../../../components/ui/ReportToolbar', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../components/ui/ReportToolbar')>()
  return {
    ...actual,
    ReportToolbar: ({ children, csv }: { children?: ReactNode; csv?: CsvSpec }) => {
      fixture.csv = csv ?? null
      return <div>{children}</div>
    },
  }
})

const { default: SalesVatReports } = await import('../SalesVatReports')

const P = (rupees: number) => Math.round(rupees * 100) as Paisa

const sales: SalesReportData = {
  metrics: {
    totalInvoiced: P(169500),
    netSales: P(150000),
    totalVat: P(19500),
    totalDiscounts: P(0),
    totalCollected: P(0),
    totalOutstanding: P(169500),
    invoiceCount: 2,
    collectionRate: 0,
  },
  statusBreakdown: [],
  monthlyTrend: [],
  topClients: [],
  invoices: [],
}

// Each BS filing month carries the AD months it runs across, as the query derives them.
const vat: VatTaxReportData = {
  metrics: {
    totalGrossTurnover: P(169500),
    taxableTurnover: P(150000),
    totalOutputVat: P(19500),
    exemptTurnover: P(0),
    nonVatTurnover: P(0),
    effectiveVatRate: 13,
    invoicesCount: 2,
  },
  monthlySchedule: [
    { monthAd: 'July 2026 – August 2026', bsMonth: 'Shrawan 2083', taxableSales: P(100000), vatAmount: P(13000), exemptSales: P(0), nonVatSales: P(0), grossSales: P(113000) },
    { monthAd: 'August 2026 – September 2026', bsMonth: 'Bhadra 2083', taxableSales: P(50000), vatAmount: P(6500), exemptSales: P(0), nonVatSales: P(0), grossSales: P(56500) },
  ],
  taxRegister: [],
}

let container: HTMLDivElement
let root: Root

async function flush() {
  await act(async () => {
    await new Promise((r) => setTimeout(r, 0))
  })
}

async function renderVatRegister() {
  await act(async () => {
    root.render(
      <MemoryRouter>
        <SalesVatReports defaultTab="vat" />
      </MemoryRouter>,
    )
  })
  await flush()
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  fixture.load.mockReset()
  fixture.load.mockResolvedValue({ sales, vat })
  fixture.csv = null
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

describe('Monthly VAT Filing Schedule: AD span beside each BS filing month', () => {
  it('shows the AD months next to the BS month, in their own column', async () => {
    await renderVatRegister()

    const headers = [...container.querySelectorAll('th')].map((th) => (th.textContent ?? '').trim())
    expect(headers.indexOf('Month (AD)')).toBe(headers.indexOf('Tax Period (BS)') + 1)

    const row = [...container.querySelectorAll('tbody tr')].find((tr) => (tr.textContent ?? '').includes('Shrawan 2083'))
    const cells = [...(row?.querySelectorAll('td') ?? [])].map((td) => (td.textContent ?? '').trim())
    expect(cells[0]).toBe('Shrawan 2083')
    expect(cells[1]).toBe('July 2026 – August 2026')
  })

  it('writes the same span into the CSV export, next to the BS month', async () => {
    await renderVatRegister()

    const rows = fixture.csv?.build() ?? []
    expect(rows).toContainEqual(['Tax Period (BS)', 'Month (AD)', 'Taxable Sales', '13% Output VAT', 'Exempt Sales', 'Gross Sales'])
    expect(rows.find((r) => r[0] === 'Shrawan 2083')?.[1]).toBe('July 2026 – August 2026')
    expect(rows.find((r) => r[0] === 'Bhadra 2083')?.[1]).toBe('August 2026 – September 2026')
  })
})
