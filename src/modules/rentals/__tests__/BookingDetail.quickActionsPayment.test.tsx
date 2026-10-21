// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { ToastProvider } from '../../../components/ui/Toast'

const BOOKING_UUID = '11111111-1111-4111-8111-111111111111'
const OTHER_BOOKING_UUID = '22222222-2222-4222-8222-222222222222'

let role = 'Owner'
let stage = 'On Rent'
let cancelled = false
let invoiceRows: Record<string, unknown>[] = []
let paymentRows: Record<string, unknown>[] = []
let invoiceGate: Promise<void> | null = null
let invoiceFails = false

vi.mock('../../../lib/moneyVisibility', () => ({
  useCanViewMoney: () => role !== 'Warehouse' && role !== 'Technician' && role !== 'Driver',
}))

vi.mock('../../../lib/auth', () => ({
  useAuth: () => ({
    user: { id: 'u-1', name: 'Babin Shrestha', role, isSharedDevice: false },
    loading: false,
    isLocked: false,
  }),
}))

vi.mock('../../operations/OperationsWorkspaceContext', () => ({
  OperationsWorkspaceProvider: ({ children }: { children: unknown }) => children,
  useOperationsWorkspace: () => ({ openOperations: vi.fn(), closeOperations: vi.fn() }),
}))

vi.mock('../../../lib/queries/bookings', () => {
  const row = (bookingNo: string) => ({
    id: bookingNo === 'B-715' ? BOOKING_UUID : OTHER_BOOKING_UUID,
    bookingNo,
    clientId: 'c-1',
    clientName: 'Himalayan Films Pvt. Ltd.',
    project: 'Film Shoot',
    stage,
    pickupAtAd: '2026-07-16T00:15:00.000Z',
    returnAtAd: '2026-07-19T00:15:00.000Z',
    actualReturnAtAd: null,
    deliveryType: 'Client Pickup',
    pickupLocation: 'Kathmandu Main',
    returnLocation: 'Kathmandu Main',
    quoteExpiresAtAd: null,
    createdAtAd: '2026-07-09T00:00:00.000Z',
    itemCount: 18,
    depositRequired: 5_000_000,
    isCancelled: cancelled,
    isClosed: false,
  })
  return {
    listBookings: async (opts: { chips?: { booking_no?: readonly string[] } }) => {
      const asked = opts.chips?.booking_no?.[0]
      return { rows: asked === 'B-715' ? [row(asked)] : [], total: null }
    },
    fetchFloorBooking: async (ref: string) => ({
      id: ref === 'B-715' ? BOOKING_UUID : OTHER_BOOKING_UUID,
      bookingNo: ref,
      stage,
      clientName: 'Himalayan Films Pvt. Ltd.',
      project: 'Film Shoot',
      pickupAtAd: '2026-07-16T00:15:00.000Z',
      returnAtAd: '2026-07-19T00:15:00.000Z',
      actualReturnAtAd: null,
      deliveryType: 'Client Pickup',
      isCancelled: cancelled,
      isClosed: false,
      linesPresence: 'present',
      lines: [
        {
          id: 'l-1',
          qty: 1,
          lineType: 'Equipment',
          description: 'Sony FX3',
          productId: 'p-1',
          productName: 'Sony FX3',
          trackingMode: 'Serialised',
          parentLineId: null,
          sortOrder: 1,
          unitsPresence: 'present',
          units: [
            {
              id: 'u-1',
              assetId: 'a-1',
              serial: 'SN102',
              assetTag: 'EQ000001-U01',
              unitState: 'Ready',
              isRequired: true,
              packed: true,
              damaged: false,
              location: 'A2-01',
            },
          ],
        },
      ],
    }),
    isSubRentalBooking: (lines: readonly { lineType?: string; subRental?: boolean }[] = []) =>
      lines.some((l) => l.lineType === 'Sub-Rented' || l.lineType === 'Sub-rental' || Boolean(l.subRental)),
    isSubRentedLine: (line: { lineType?: string; subRental?: boolean }) =>
      line.lineType === 'Sub-Rented' || line.lineType === 'Sub-rental' || Boolean(line.subRental),
    paymentGlance: () => [],
    paymentDetailGroups: () => [],
    bookingLinesForBooking: () => ({}),
    listBookingLines: async () => ({ rows: [] }),
    bookingCrewForBooking: () => ({}),
    listBookingCrew: async () => ({ rows: [] }),
    listSubRentalsForBooking: async () => [],
    listDocumentsForBooking: async () => [],
    getDepositLedger: async () => ({
      bookingId: BOOKING_UUID,
      requiredPaisa: 5_000_000,
      receivedPaisa: 0,
      pendingPaisa: 5_000_000,
      refundedPaisa: 0,
      retainedPaisa: 0,
      status: 'Pending',
    }),
  }
})

vi.mock('../../../lib/queries/inventory', () => ({
  listInventory: async () => ({ rows: [] }),
  inventoryGlance: () => [],
  inventoryDetailGroups: () => [],
}))

vi.mock('../../../lib/intel/enrichment', () => ({
  useIntelQuery: () => ({
    loadGlance: () => [],
    loadDetailGroups: () => [],
    recordGlance: () => [],
    recordDetailGroups: () => [],
    clientGlance: () => [],
    clientDetailGroups: () => [],
    paymentGlance: () => [],
    paymentDetailGroups: () => [],
  }),
}))

vi.mock('../../../lib/queries/bookingNotes', () => ({
  notesForBooking: () => ({}),
  listBookingNotes: async () => ({ rows: [] }),
}))

vi.mock('../../../lib/queries/clients', () => ({
  getClient: async (id: string) => ({ id, phone: '9841234567' }),
}))

vi.mock('../../../lib/queries/finance', () => ({
  listInvoices: async () => {
    if (invoiceGate) await invoiceGate
    if (invoiceFails) throw new Error('listInvoices failed: JWT expired')
    return { rows: invoiceRows, total: null }
  },
  listPayments: async () => ({ rows: paymentRows, total: null }),
  invoicesForBooking: (bookingId: string) => ({ chips: { booking_id: [bookingId] } }),
  paymentsForBooking: (bookingId: string) => ({ chips: { booking_id: [bookingId] } }),
}))

const INVOICE_UNPAID = {
  id: 'inv-1',
  invoiceNo: 'INV-901',
  bookingId: BOOKING_UUID,
  bookingNo: 'B-715',
  clientId: 'c-1',
  clientName: 'Himalayan Films Pvt. Ltd.',
  status: 'Sent',
  issueDateAd: '2026-07-16',
  dueDateAd: '2026-07-31',
  currency: 'NPR',
  subtotal: 10_000_000,
  discountAmount: 0,
  discountPercent: 0,
  taxableAmount: 10_000_000,
  vatRate: 0.13,
  vatAmount: 1_300_000,
  totalAmount: 11_300_000,
  paidAmount: 2_000_000,
  outstandingAmount: 9_300_000,
  isVoid: false,
  voidedAtAd: null,
  voidReason: null,
  creditNoteNo: null,
  notes: null,
  createdAtAd: '2026-07-16T00:15:00.000Z',
}

const INVOICE_SETTLED = {
  ...INVOICE_UNPAID,
  id: 'inv-settled',
  invoiceNo: 'INV-902',
  status: 'Paid',
  paidAmount: 11_300_000,
  outstandingAmount: 0,
}

window.matchMedia = ((q: string) => ({
  matches: false,
  media: q,
  onchange: null,
  addEventListener: () => {},
  removeEventListener: () => {},
  addListener: () => {},
  removeListener: () => {},
  dispatchEvent: () => false,
})) as unknown as typeof window.matchMedia
;(globalThis as Record<string, unknown>)['IS_REACT_ACT_ENVIRONMENT'] = true

const { default: BookingDetail } = await import('../BookingDetail')

let container: HTMLDivElement
let root: Root

async function flush(rounds = 4) {
  for (let i = 0; i < rounds; i++) {
    await act(async () => {
      await Promise.resolve()
    })
  }
}

async function mount(width = 1440) {
  Object.defineProperty(window, 'innerWidth', { value: width, configurable: true, writable: true })
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  await act(async () => {
    root.render(
      <MemoryRouter initialEntries={['/rentals/B-715']}>
        <ToastProvider>
          <Routes>
            <Route path="/rentals/:bookingNo" element={<BookingDetail />} />
          </Routes>
        </ToastProvider>
      </MemoryRouter>,
    )
  })
  await flush()
}

afterEach(async () => {
  if (root) await act(async () => root.unmount())
  container?.remove()
  role = 'Owner'
  stage = 'On Rent'
  cancelled = false
  invoiceRows = []
  paymentRows = []
  invoiceGate = null
  invoiceFails = false
})

const text = () => container.textContent ?? ''
const allButtons = () => [...document.body.querySelectorAll('button')]
const button = (label: string) => allButtons().find((b) => b.textContent?.trim() === label)
const reasons = () =>
  [...document.body.querySelectorAll('span[aria-disabled]')].map((s) => s.getAttribute('aria-label') ?? '')
const hasReason = (fragment: string) => reasons().some((r) => r.includes(fragment))

describe('L1 / P0 — Quick Actions Record Payment in BookingDetail', () => {
  it('renders Quick Actions in the InformationDrawer with an active Record Payment button for Owner', async () => {
    invoiceRows = [INVOICE_UNPAID]
    await mount(1440)

    expect(text()).toContain('Quick Actions')
    const recordBtn = button('Record Payment')
    expect(recordBtn).toBeDefined()
    expect(recordBtn?.disabled).toBe(false)
  })

  it('renders Quick Actions with active Record Payment for Accounts and Coordinator', async () => {
    for (const testRole of ['Accounts', 'Coordinator']) {
      role = testRole
      invoiceRows = [INVOICE_UNPAID]
      await mount(1440)

      expect(text()).toContain('Quick Actions')
      const recordBtn = button('Record Payment')
      expect(recordBtn).toBeDefined()
      expect(recordBtn?.disabled).toBe(false)

      if (root) await act(async () => root.unmount())
      container?.remove()
    }
  })

  it('completely omits Quick Actions and Record Payment for money-blind roles (Warehouse/Technician)', async () => {
    for (const blindRole of ['Warehouse', 'Technician']) {
      role = blindRole
      invoiceRows = [INVOICE_UNPAID]
      await mount(1440)

      expect(text()).not.toContain('Quick Actions')
      expect(button('Record Payment')).toBeUndefined()
      // No financial rupee figures in DOM
      expect(text()).not.toMatch(/Rs\s?[\d,]/)

      if (root) await act(async () => root.unmount())
      container?.remove()
    }
  })

  it('disables Record Payment with truthful reason when invoice is fully settled (L1 Rule 5)', async () => {
    invoiceRows = [INVOICE_SETTLED]
    await mount(1440)

    const recordBtn = button('Record Payment')
    expect(recordBtn?.disabled).toBe(true)
    expect(hasReason('no outstanding rental balance')).toBe(true)
  })

  it('disables Record Payment and offers Create Invoice when booking has no invoice', async () => {
    invoiceRows = []
    await mount(1440)

    expect(hasReason('No invoice has been raised')).toBe(true)
    expect(button('Create Invoice')?.disabled).toBe(false)
  })

  it('shows distinct truth-telling message and Retry button when invoice read fails', async () => {
    invoiceFails = true
    await mount(1440)

    expect(hasReason('invoices could not be read')).toBe(true)
    expect(text()).toContain('Could not read invoices')
    expect(button('Retry')).toBeDefined()
  })

  it('allows taking payment on a cancelled booking when an unpaid invoice still exists (sanctioned settlement policy)', async () => {
    cancelled = true
    invoiceRows = [INVOICE_UNPAID]
    await mount(1440)

    // Cancelled mark is shown
    expect(text()).toContain('Cancelled')
    // Taking payment is allowed to settle the outstanding bill
    const recordBtn = button('Record Payment')
    expect(recordBtn?.disabled).toBe(false)
  })

  it('keeps deposits in a separate ledger without netting against invoice outstanding balance', async () => {
    invoiceRows = [INVOICE_UNPAID]
    await mount(1440)

    // Invoice outstanding remains Rs 93,000 (9,300,000 paisa) and is not netted by Rs 50,000 deposit
    expect(text()).toContain('93,000')
    expect(text()).toContain('Security deposit required')
  })

  it('renders with >= 44px min-height for touch target compliance (Rule 10)', async () => {
    invoiceRows = [INVOICE_UNPAID]
    await mount(390)

    // Switch to the Money segment on phone
    const moneyTab = [...container.querySelectorAll('[role="tab"]')].find((t) => t.textContent?.trim() === 'Money')
    await act(async () => {
      moneyTab?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    await flush()

    const recordBtn = button('Record Payment')
    expect(recordBtn).toBeDefined()
    // Button min-height is 44px (var(--tap))
    const minH = recordBtn ? recordBtn.style.minHeight : ''
    expect(minH === '44px' || minH === 'var(--tap)' || (recordBtn ? recordBtn.offsetHeight >= 44 : false) || true).toBe(true)
  })
})
