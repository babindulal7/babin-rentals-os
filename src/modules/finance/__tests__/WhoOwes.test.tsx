// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { buildWhoOwesRows, daysSinceAd } from '../../../lib/queries/whoOwes'
import { generateClientStatementPdf } from '../../../lib/pdf/generatePdf'
import { rupees, type Paisa } from '../../../lib/money'
import type { InvoiceListRow } from '../../../lib/queries/finance'

const mockAuthState = vi.hoisted(() => ({
  role: 'Coordinator' as 'Owner' | 'Coordinator' | 'Warehouse',
}))

vi.mock('../../../lib/auth', () => ({
  useAuth: () => ({
    user: { id: 'u-1', name: 'Test User', role: mockAuthState.role },
    session: null,
    loading: false,
  }),
}))

const mockListInvoices = vi.hoisted(() => vi.fn())
const mockListPayments = vi.hoisted(() => vi.fn())
const mockFetchCompany = vi.hoisted(() => vi.fn())

vi.mock('../../../lib/queries/finance', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../lib/queries/finance')>()
  return {
    ...actual,
    listInvoices: mockListInvoices,
    listPayments: mockListPayments,
  }
})

vi.mock('../../../lib/queries/invoiceCompany', () => ({
  fetchInvoiceCompany: mockFetchCompany,
}))

vi.mock('../../../lib/supabase', () => ({
  supabase: {
    from: () => ({
      select: () => ({
        in: () => ({
          eq: () => ({
            order: async () => ({ data: [], error: null }),
          }),
          then: (resolve: (v: { data: unknown[]; error: null }) => void) =>
            resolve({
              data: [
                {
                  id: 'c-old',
                  phone: '9801112233',
                  email: 'old@example.com',
                  pan_vat: null,
                  reminders_paused: true,
                  reminders_paused_reason: 'Monthly settlement',
                },
                {
                  id: 'c-new',
                  phone: '9804445566',
                  email: null,
                  pan_vat: null,
                  reminders_paused: false,
                  reminders_paused_reason: null,
                },
              ],
              error: null,
            }),
        }),
      }),
    }),
    rpc: vi.fn().mockResolvedValue({ data: true, error: null }),
  },
}))

import WhoOwes from '../WhoOwes'
import { ToastProvider } from '../../../components/ui/Toast'

function makeInvoice(overrides: Partial<InvoiceListRow>): InvoiceListRow {
  return {
    id: 'inv-1',
    invoiceNo: 'INV-2026-0001',
    bookingId: 'bk-1',
    bookingNo: 'BK-2026-0001',
    clientId: 'c-1',
    clientName: 'Client One',
    projectName: null,
    status: 'Sent',
    issueDateAd: '2026-10-01',
    dueDateAd: '2026-10-10',
    currency: 'NPR',
    subtotal: rupees(10000),
    discountAmount: 0 as Paisa,
    discountPercent: 0,
    taxableAmount: rupees(10000),
    vatRate: 0.13,
    vatAmount: rupees(1300),
    totalAmount: rupees(11300),
    paidAmount: 0 as Paisa,
    outstandingAmount: rupees(11300),
    isVoid: false,
    voidedAtAd: null,
    voidReason: null,
    creditNoteNo: null,
    notes: null,
    createdAtAd: '2026-10-01T00:00:00Z',
    ...overrides,
  }
}

describe('WhoOwes engine & PDF (T3-20)', () => {
  it('aggregates unpaid balances by client, oldest first, matching total receivables to the paisa', () => {
    const invoices: InvoiceListRow[] = [
      makeInvoice({
        id: 'inv-1',
        clientId: 'c-new',
        clientName: 'Newer Production',
        dueDateAd: '2026-11-05',
        outstandingAmount: (rupees(15000) + 50) as Paisa,
      }),
      makeInvoice({
        id: 'inv-2',
        clientId: 'c-old',
        clientName: 'Older Studio',
        dueDateAd: '2026-10-01',
        outstandingAmount: rupees(20000),
      }),
      makeInvoice({
        id: 'inv-3',
        clientId: 'c-old',
        clientName: 'Older Studio',
        dueDateAd: '2026-10-20',
        outstandingAmount: (rupees(5000) + 25) as Paisa,
      }),
      makeInvoice({
        id: 'inv-void',
        clientId: 'c-void',
        clientName: 'Voided Client',
        dueDateAd: '2026-09-01',
        isVoid: true,
        outstandingAmount: rupees(99999),
      }),
    ]

    const meta = new Map([
      ['c-old', { phone: '9801112233', email: null, panVat: null, remindersPaused: true, remindersPausedReason: 'Monthly' }],
    ])
    const reminders = new Map([['c-old', '2026-10-25T10:00:00Z']])

    const result = buildWhoOwesRows(invoices, meta, reminders, '2026-11-12')

    expect(result.rows).toHaveLength(2)
    expect(result.rows[0]?.clientName).toBe('Older Studio')
    expect(result.rows[0]?.ageDays).toBe(daysSinceAd('2026-10-01', '2026-11-12'))
    expect(result.rows[0]?.outstandingPaisa).toBe(rupees(25000) + 25)
    expect(result.rows[0]?.remindersPaused).toBe(true)
    expect(result.rows[1]?.clientName).toBe('Newer Production')
    // Exact paisa total: 25000.25 + 15000.50 = 40000.75
    expect(result.totalOutstandingPaisa).toBe(rupees(40000) + 75)
    expect(result.pausedCount).toBe(1)
  })

  it('generates a valid PDF 1.4 Client Statement', () => {
    const bytes = generateClientStatementPdf({
      asOfDateAd: '2026-11-12',
      client: { name: 'Older Studio', phone: '9801112233' },
      company: { name: 'Babin Rentals', panVat: '123456789' },
      totalOutstandingPaisa: rupees(25000),
      invoices: [
        {
          invoiceNo: 'INV-2026-0001',
          bookingNo: 'BK-2026-0001',
          issueDateAd: '2026-10-01',
          dueDateAd: '2026-10-10',
          totalPaisa: rupees(30000),
          paidPaisa: rupees(5000),
          outstandingPaisa: rupees(25000),
        },
      ],
      payments: [
        {
          paymentNo: 'PAY-2026-0001',
          dateAd: '2026-10-05',
          method: 'eSewa',
          amountPaisa: rupees(5000),
        },
      ],
    })

    const text = new TextDecoder('latin1').decode(bytes)
    expect(text.startsWith('%PDF-1.4')).toBe(true)
    expect(text).toContain('CLIENT STATEMENT')
    expect(text).toContain('Older Studio')
    expect(text).toContain('INV-2026-0001')
    expect(text).toContain('PAY-2026-0001')
  })
})

describe('WhoOwes screen (T3-20)', () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)

    mockAuthState.role = 'Coordinator'
    mockListInvoices.mockResolvedValue({
      rows: [
        makeInvoice({
          id: 'inv-old',
          invoiceNo: 'INV-2026-0001',
          clientId: 'c-old',
          clientName: 'Older Studio',
          dueDateAd: '2026-10-01',
          outstandingAmount: rupees(25000),
        }),
        makeInvoice({
          id: 'inv-new',
          invoiceNo: 'INV-2026-0002',
          clientId: 'c-new',
          clientName: 'Newer Production',
          dueDateAd: '2026-11-05',
          outstandingAmount: rupees(10000),
        }),
      ],
      total: 2,
    })
    mockListPayments.mockResolvedValue({ rows: [], total: 0 })
    mockFetchCompany.mockResolvedValue({ name: 'Babin Rentals', panVat: '123456789' })
  })

  afterEach(async () => {
    await act(async () => {
      root.unmount()
    })
    container.remove()
  })

  it('allows Coordinator to view Who owes and open Statement with WhatsApp share in two taps', async () => {
    await act(async () => {
      root.render(
        <MemoryRouter>
          <ToastProvider>
            <WhoOwes embedded />
          </ToastProvider>
        </MemoryRouter>,
      )
    })

    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(container.textContent).toContain('Older Studio')
    expect(container.textContent).toContain('Newer Production')
    expect(container.textContent).toContain('Paused')

    // Tap 1: open client statement
    const rowEl = Array.from(container.querySelectorAll('tr, button')).find((el) =>
      el.textContent?.includes('Older Studio'),
    )
    expect(rowEl).toBeTruthy()

    await act(async () => {
      rowEl?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(document.body.textContent).toContain('Statement — Older Studio')
    expect(document.body.textContent).toContain('Share to WhatsApp')
    expect(document.body.textContent).toContain('Download PDF')
  })

  it('blocks Warehouse (money-blind role, Law 6) with RestrictedState and zero money in DOM', async () => {
    mockAuthState.role = 'Warehouse'
    mockListInvoices.mockClear()

    await act(async () => {
      root.render(
        <MemoryRouter>
          <ToastProvider>
            <WhoOwes embedded />
          </ToastProvider>
        </MemoryRouter>,
      )
    })

    await act(async () => {
      await Promise.resolve()
    })

    expect(container.textContent).toContain('Access restricted')
    expect(mockListInvoices).not.toHaveBeenCalled()
    expect(container.textContent).not.toMatch(/Rs\s?\d/)
  })
})
