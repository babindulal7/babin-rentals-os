// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { ToastProvider } from '../../../components/ui/Toast'
import MonthlyPack, { canAccountantExport } from '../MonthlyPack'
import { generateMonthlyPack, resolveMonthlyPackPeriod } from '../../../lib/monthlyPack'
import { rupees, type Paisa } from '../../../lib/money'
import { execSync } from 'child_process'
import fs from 'fs'
import path from 'path'
import os from 'os'

;(globalThis as Record<string, unknown>)['IS_REACT_ACT_ENVIRONMENT'] = true

vi.mock('../../../lib/supabase', () => ({
  supabase: {
    from: () => ({
      select: () => {
        const queryChain: any = {
          eq: () => queryChain,
          neq: () => queryChain,
          gte: () => queryChain,
          lte: () => queryChain,
          order: () => Promise.resolve({ data: [], error: null }),
          then: (resolve: any) => Promise.resolve({ data: [], error: null }).then(resolve),
        }
        return queryChain
      },
    }),
  },
  IS_MOCK: true,
}))

const mockAuthState = vi.hoisted(() => ({
  role: 'Accounts' as 'Owner' | 'Admin' | 'Manager' | 'Accounts' | 'Warehouse' | 'Coordinator' | 'Client',
}))

vi.mock('../../../lib/auth', () => ({
  useAuth: () => ({
    user: { id: 'u-1', name: 'Accounts Officer', role: mockAuthState.role },
    session: null,
    loading: false,
  }),
}))

vi.mock('../../../lib/queries/salesVatReports', () => ({
  getSalesVatReport: async () => ({
    sales: {
      metrics: {
        totalInvoiced: rupees(56500),
        netSales: rupees(50000),
        totalVat: rupees(6500),
        totalDiscounts: 0 as Paisa,
        totalCollected: rupees(30000),
        totalOutstanding: rupees(26500),
        invoiceCount: 2,
        collectionRate: 53,
      },
      statusBreakdown: [],
      monthlyTrend: [],
      topClients: [],
      invoices: [
        {
          id: 'inv-1',
          invoiceNo: 'INV-2083-001',
          bookingNo: 'BK-2083-001',
          clientName: 'Production House A',
          clientPan: '123456789',
          issueDate: '2026-07-20',
          dueDate: '2026-07-30',
          subtotal: rupees(30000),
          taxableAmount: rupees(30000),
          discountAmount: 0 as Paisa,
          taxAmount: rupees(3900),
          grandTotal: rupees(33900),
          paidAmount: rupees(33900),
          status: 'Paid',
        },
        {
          id: 'inv-2',
          invoiceNo: 'INV-2083-002',
          bookingNo: 'BK-2083-002',
          clientName: 'Studio B',
          clientPan: '987654321',
          issueDate: '2026-07-25',
          dueDate: '2026-08-05',
          subtotal: rupees(20000),
          taxableAmount: rupees(20000),
          discountAmount: 0 as Paisa,
          taxAmount: rupees(2600),
          grandTotal: rupees(22600),
          paidAmount: 0 as Paisa,
          status: 'Sent',
        },
      ],
    },
    vat: {
      metrics: {
        totalGrossTurnover: rupees(56500),
        taxableTurnover: rupees(50000),
        totalOutputVat: rupees(6500),
        exemptTurnover: 0 as Paisa,
        nonVatTurnover: 0 as Paisa,
        effectiveVatRate: 13,
        invoicesCount: 2,
      },
      monthlySchedule: [],
      taxRegister: [],
    },
  }),
}))

vi.mock('../../../lib/queries/crewTdsReport', () => ({
  getCrewTdsReport: async () => ({
    metrics: {
      totalGross: rupees(10000),
      totalTds: rupees(1500),
      totalNet: rupees(8500),
      configuredRate: 15,
      payoutCount: 1,
      paidCount: 1,
      pendingCount: 0,
    },
    monthlySchedule: [],
    payouts: [
      {
        id: 'crew-1',
        crewBookingNo: 'CRW-2083-001',
        crewMemberName: 'Bikash Tamang',
        position: 'Gaffer',
        phone: '9801122334',
        panNumber: '601234567',
        startDateAd: '2026-07-20',
        endDateAd: '2026-07-22',
        startDateBs: '2083-04-05',
        endDateBs: '2083-04-07',
        days: 2,
        grossPayout: rupees(10000),
        tdsRatePercent: 15,
        tdsAmount: rupees(1500),
        netPayout: rupees(8500),
        payoutStatus: 'Paid',
        paidAt: '2026-07-23',
        notes: null,
      },
    ],
  }),
}))

vi.mock('../../../lib/queries/finance', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../lib/queries/finance')>()
  return {
    ...actual,
    listPayments: async () => ({
      rows: [
        {
          id: 'pay-1',
          paymentNo: 'PAY-2083-001',
          bookingId: 'bk-1',
          bookingNo: 'BK-2083-001',
          invoiceId: 'inv-1',
          invoiceNo: 'INV-2083-001',
          clientId: 'cl-1',
          clientName: 'Production House A',
          amount: rupees(33900),
          paymentType: 'Advance Payment',
          status: 'Received',
          paymentDateAd: '2026-07-20T10:00:00Z',
          channelGroup: 'Bank',
        },
      ],
      total: 1,
    }),
  }
})

describe('MonthlyPack generator & verification (T3-23)', () => {
  it('correctly resolves period dates for BS and AD months', () => {
    const bsPeriod = resolveMonthlyPackPeriod('BS', 2083, 4) // Shrawan 2083
    expect(bsPeriod.monthName).toBe('Shrawan 2083 BS')
    expect(bsPeriod.monthSlug).toBe('bs_2083_04')
    expect(bsPeriod.startAd).toBe('2026-07-17')
    expect(bsPeriod.startBs).toBe('2083-04-01')

    const adPeriod = resolveMonthlyPackPeriod('AD', 2026, 7) // July 2026
    expect(adPeriod.monthName).toBe('July 2026 AD')
    expect(adPeriod.monthSlug).toBe('ad_2026_07')
    expect(adPeriod.startAd).toBe('2026-07-01')
    expect(adPeriod.endAd).toBe('2026-07-31')
  })

  it('generates a valid ZIP pack containing all 5 required files and unpacks cleanly with unzip -t', async () => {
    const pack = await generateMonthlyPack({
      calendar: 'BS',
      year: 2083,
      month: 4,
      includeInvoicePdfs: false,
    })

    expect(pack.counts.invoices).toBe(2)
    expect(pack.counts.payments).toBe(1)
    expect(pack.counts.tdsPayouts).toBe(1)
    expect(pack.counts.invoicePdfs).toBe(0)
    expect(pack.fileSizeBytes).toBeGreaterThan(1000)

    // Write to a temporary file and run system unzip -t to verify ZIP archive structure
    const tmpPath = path.join(os.tmpdir(), `test-monthly-pack-${Date.now()}.zip`)
    try {
      fs.writeFileSync(tmpPath, Buffer.from(pack.zipBytes))
      const res = execSync(`unzip -t "${tmpPath}"`, { encoding: 'utf-8' })
      expect(res).toContain('No errors detected')
      expect(res).toContain('sales_register_bs_2083_04.csv')
      expect(res).toContain('purchase_register_bs_2083_04.csv')
      expect(res).toContain('payments_received_bs_2083_04.csv')
      expect(res).toContain('tds_withheld_bs_2083_04.csv')
      expect(res).toContain('summary.txt')
      expect(res).not.toContain('invoices/INV-2083-001.pdf')
      expect(res).not.toContain('invoices/INV-2083-002.pdf')
    } finally {
      if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath)
    }

    // Verify summary.txt content integrity
    expect(pack.summaryText).toContain('BABIN RENTALS — ACCOUNTANT MONTHLY EXPORT PACK')
    expect(pack.summaryText).toContain('Shrawan 2083 BS')
    expect(pack.summaryText).toContain('STATUTORY SALES & VAT (NEPAL IRD ANNEX 5)')
    expect(pack.summaryText).toContain('Gross Invoiced Turnover:')
    expect(pack.summaryText).toContain('WITHHOLDING TAX (CREW TDS)')
    expect(pack.summaryText).toContain('STATUTORY TAX POSITION (FILING RECONCILIATION)')
  })

  it('refuses tax invoice copies without verified issuer and invoice-line data', async () => {
    await expect(generateMonthlyPack({
      calendar: 'BS', year: 2083, month: 4, includeInvoicePdfs: true,
    })).rejects.toThrow('verified issuer data and persisted invoice lines')
  })

  it('evaluates role access predicate canAccountantExport strictly for financial roles only', () => {
    expect(canAccountantExport('Owner')).toBe(true)
    expect(canAccountantExport('Admin')).toBe(true)
    expect(canAccountantExport('Manager')).toBe(true)
    expect(canAccountantExport('Accounts')).toBe(true)

    // Forbidden roles under Law 6
    expect(canAccountantExport('Warehouse')).toBe(false)
    expect(canAccountantExport('Technician')).toBe(false)
    expect(canAccountantExport('Driver')).toBe(false)
    expect(canAccountantExport('Coordinator')).toBe(false)
    expect(canAccountantExport(undefined)).toBe(false)
    expect(canAccountantExport(null)).toBe(false)
  })
})

describe('MonthlyPack UI Component (T3-23)', () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
    mockAuthState.role = 'Accounts'
  })

  afterEach(async () => {
    await act(async () => {
      root.unmount()
    })
    container.remove()
  })

  it('renders export interface and triggers ZIP download for Accounts role', async () => {
    await act(async () => {
      root.render(
        <MemoryRouter>
          <ToastProvider>
            <MonthlyPack />
          </ToastProvider>
        </MemoryRouter>,
      )
    })

    expect(container.textContent).toContain('Accountant Monthly Export Pack')
    expect(container.textContent).toContain('Download Monthly Pack (ZIP)')
    expect(container.textContent).toContain('sales_register_')
    expect(container.textContent).toContain('purchase_register_')
    expect(container.textContent).toContain('payments_received_')
    expect(container.textContent).toContain('tds_withheld_')
    expect(container.textContent).toContain('summary.txt')

    const downloadBtn = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Download Monthly Pack'),
    )
    expect(downloadBtn).toBeTruthy()

    await act(async () => {
      downloadBtn?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
      await Promise.resolve()
    })

    expect(container.textContent).toContain('Download Monthly Pack (ZIP)')
  })

  it('blocks Warehouse (money-blind role) with RestrictedState and hides controls', async () => {
    mockAuthState.role = 'Warehouse'

    await act(async () => {
      root.render(
        <MemoryRouter>
          <ToastProvider>
            <MonthlyPack />
          </ToastProvider>
        </MemoryRouter>,
      )
    })

    expect(container.textContent).toContain('Access restricted')
    expect(container.textContent).toContain('Only Owner, Admin, Manager, and Accounts')
    expect(container.textContent).not.toContain('Download Monthly Pack (ZIP)')
  })
})
