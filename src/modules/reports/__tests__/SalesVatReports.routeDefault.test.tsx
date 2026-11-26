// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
// Vite `?raw` import, not node:fs: the project has no @types/node (see breakpoints.test.ts).
import appSource from '../../../App.tsx?raw'
import type { Paisa } from '../../../lib/money'
import type { SalesReportData, VatTaxReportData } from '../../../lib/queries/salesVatReports'

const fixture = vi.hoisted(() => ({ load: vi.fn() }))

vi.mock('../../../lib/moneyVisibility', () => ({ useCanViewMoney: () => true }))
vi.mock('../../../lib/device', () => ({ useViewport: () => 'desktop' }))
vi.mock('../../../lib/queries/salesVatReports', () => ({ getSalesVatReport: fixture.load }))

const { default: SalesVatReports } = await import('../SalesVatReports')

const P = (rupees: number) => Math.round(rupees * 100) as Paisa

const sales: SalesReportData = {
  metrics: {
    totalInvoiced: P(113000),
    netSales: P(100000),
    totalVat: P(13000),
    totalDiscounts: P(0),
    totalCollected: P(0),
    totalOutstanding: P(113000),
    invoiceCount: 1,
    collectionRate: 0,
  },
  statusBreakdown: [],
  monthlyTrend: [],
  topClients: [],
  invoices: [],
}

const vat: VatTaxReportData = {
  metrics: {
    totalGrossTurnover: P(113000),
    taxableTurnover: P(100000),
    totalOutputVat: P(13000),
    exemptTurnover: P(0),
    nonVatTurnover: P(0),
    effectiveVatRate: 13,
    invoicesCount: 1,
  },
  monthlySchedule: [
    { monthAd: 'July 2026 – August 2026', bsMonth: 'Shrawan 2083', taxableSales: P(100000), vatAmount: P(13000), exemptSales: P(0), nonVatSales: P(0), grossSales: P(113000) },
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

async function renderPage(props: { defaultTab?: 'sales' | 'vat' }) {
  await act(async () => {
    root.render(
      <MemoryRouter>
        <SalesVatReports {...props} />
      </MemoryRouter>,
    )
  })
  await flush()
}

function toggle(label: string): HTMLButtonElement | undefined {
  return [...container.querySelectorAll('button')].find((b) => (b.textContent ?? '').includes(label))
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
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

describe('SalesVatReports default tab', () => {
  it('opens on Invoiced Sales when no tab is given', async () => {
    await renderPage({})
    expect(toggle('Invoiced Sales')?.getAttribute('aria-pressed')).toBe('true')
    expect(toggle('Nepal 13% VAT Register')?.getAttribute('aria-pressed')).toBe('false')
  })

  it('opens on the VAT register when defaultTab is vat, without a click', async () => {
    await renderPage({ defaultTab: 'vat' })
    expect(toggle('Nepal 13% VAT Register')?.getAttribute('aria-pressed')).toBe('true')
    expect(toggle('Invoiced Sales')?.getAttribute('aria-pressed')).toBe('false')
    expect(container.textContent).toContain('Monthly VAT Filing Schedule')
  })
})

describe('the VAT route passes the VAT register as its default tab', () => {
  // The App route block for a path, up to the Shell that wraps its element.
  function routeBlock(path: string): string {
    const start = appSource.indexOf(`path="${path}"`)
    expect(start, `route ${path}`).toBeGreaterThan(-1)
    return appSource.slice(start, appSource.indexOf('</Shell>', start))
  }

  it('renders the VAT register on /reports/vat-tax', () => {
    expect(routeBlock('/reports/vat-tax')).toContain('<SalesVatReports defaultTab="vat" />')
  })

  it('leaves /reports/sales on the Invoiced Sales default', () => {
    const block = routeBlock('/reports/sales')
    expect(block).toContain('<SalesVatReports />')
    expect(block).not.toContain('defaultTab')
  })
})
