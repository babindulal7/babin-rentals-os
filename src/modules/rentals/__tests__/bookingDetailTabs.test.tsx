// @vitest-environment jsdom
/**
 * # Booking Detail — 4 Tabs (Card E-3, R-10.6)
 *
 * Verifies R-10.6 (§3 in RULINGS-2026-11-10.md):
 * 1. 4 tabs: Items · Money · Client & Dates · History
 * 2. URL search param synchronization (?tab=...)
 * 3. Fallback and complete DOM omission of Money tab for money-blind roles (Law 6 & N-1)
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { ToastProvider } from '../../../components/ui/Toast'

let role: string = 'Owner'

vi.mock('../../../lib/moneyVisibility', () => ({
  useCanViewMoney: () => ['Owner', 'Admin', 'Manager', 'Coordinator'].includes(role),
}))

vi.mock('../../../lib/queries/bookingCrew', () => ({
  listBookingCrew: async () => [],
  listAssignableCrew: async () => [],
}))

vi.mock('../../../lib/auth', () => ({
  useAuth: () => ({
    user: { id: 'u-1', name: 'Test User', role, isSharedDevice: false },
    loading: false,
    isLocked: false,
  }),
}))

vi.mock('../../operations/OperationsWorkspaceContext', () => ({
  OperationsWorkspaceProvider: ({ children }: { children: unknown }) => children,
  useOperationsWorkspace: () => ({ openOperations: vi.fn(), closeOperations: vi.fn() }),
}))

vi.mock('../../../lib/queries/bookings', () => {
  const BOOKING_ROW = {
    id: '11111111-1111-4111-8111-111111111111',
    bookingNo: 'B-715',
    clientId: 'c-1',
    clientName: 'Himalayan Films Pvt. Ltd.',
    project: 'Film Shoot',
    stage: 'Booked',
    pickupAtAd: '2026-07-16T00:15:00.000Z',
    returnAtAd: '2026-07-19T00:15:00.000Z',
    actualReturnAtAd: null,
    deliveryType: 'Client Pickup',
    pickupLocation: 'Kathmandu Main',
    returnLocation: 'Kathmandu Main',
    quoteExpiresAtAd: null,
    createdAtAd: '2026-07-09T00:00:00.000Z',
    itemCount: 1,
    depositRequired: 5000000,
    isCancelled: false,
    isClosed: false,
  }
  return {
    listBookings: async (opts: { chips?: { booking_no?: readonly string[] } }) => ({
      rows: opts.chips?.booking_no?.includes('B-715') ? [BOOKING_ROW] : [],
      total: null,
    }),
    fetchFloorBooking: async () => ({
      id: BOOKING_ROW.id,
      bookingNo: 'B-715',
      stage: 'Booked',
      clientName: BOOKING_ROW.clientName,
      project: BOOKING_ROW.project,
      pickupAtAd: BOOKING_ROW.pickupAtAd,
      returnAtAd: BOOKING_ROW.returnAtAd,
      actualReturnAtAd: null,
      deliveryType: 'Client Pickup',
      isCancelled: false,
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
    isSubRentalBooking: () => false,
    isSubRentedLine: () => false,
    paymentGlance: () => [],
    paymentDetailGroups: () => [],
  }
})

vi.mock('../../../lib/queries/bookingNotes', () => ({
  notesForBooking: (bookingId: string) => ({
    chips: { booking_id: [bookingId] },
    sort: { column: 'created_at', ascending: false },
  }),
  listBookingNotes: async () => ({ rows: [] }),
}))

vi.mock('../../../lib/queries/finance', () => {
  const INVOICE = {
    id: 'inv-1',
    invoiceNo: 'INV-901',
    bookingId: '11111111-1111-4111-8111-111111111111',
    bookingNo: 'B-715',
    clientId: 'c-1',
    clientName: 'Himalayan Films Pvt. Ltd.',
    status: 'Sent',
    issueDateAd: '2026-07-16',
    dueDateAd: '2026-07-31',
    currency: 'NPR',
    subtotal: 13275000,
    discountAmount: 929300,
    discountPercent: 7,
    taxableAmount: 12345700,
    vatRate: 0.13,
    vatAmount: 1604900,
    totalAmount: 13950600,
    paidAmount: 1500000,
    outstandingAmount: 12450600,
    isVoid: false,
    voidedAtAd: null,
    voidReason: null,
    creditNoteNo: null,
    notes: null,
    createdAtAd: '2026-07-16T00:15:00.000Z',
  }
  return {
    listInvoices: async () => ({ rows: [INVOICE], total: null }),
    listPayments: async () => ({ rows: [], total: null }),
    invoicesForBooking: (bookingId: string) => ({ chips: { booking_id: [bookingId] } }),
    paymentsForBooking: (bookingId: string) => ({ chips: { booking_id: [bookingId] } }),
  }
})

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

async function mount(initialEntry = '/rentals/B-715', width = 1280) {
  Object.defineProperty(window, 'innerWidth', { value: width, configurable: true, writable: true })
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  await act(async () => {
    root.render(
      <MemoryRouter initialEntries={[initialEntry]}>
        <ToastProvider>
          <Routes>
            <Route path="/rentals/:bookingNo" element={<BookingDetail />} />
          </Routes>
        </ToastProvider>
      </MemoryRouter>,
    )
  })
  for (let i = 0; i < 4; i++) {
    await act(async () => {
      await Promise.resolve()
    })
  }
}

afterEach(async () => {
  if (root) await act(async () => root.unmount())
  container?.remove()
  role = 'Owner'
})

const text = () => container.textContent ?? ''

async function pickTab(tabName: string) {
  const tab = [...container.querySelectorAll('[role="tab"]')].find((t) => t.textContent?.trim() === tabName)
  if (tab) {
    await act(async () => {
      tab.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    for (let i = 0; i < 3; i++) {
      await act(async () => {
        await Promise.resolve()
      })
    }
  }
}

describe('R-10.6 — Booking Detail 4 tabs layout', () => {
  it('renders all 4 tabs on desktop for Owner role, defaulting to Items', async () => {
    role = 'Owner'
    await mount()
    const tabs = [...container.querySelectorAll('[role="tab"]')].map((t) => t.textContent?.trim())
    expect(tabs).toEqual(['Items', 'Money', 'Client & Dates', 'History'])
    // Items content visible by default
    expect(text()).toContain('Equipment, Bundles & Services')
    expect(text()).not.toContain('Pricing & Payments')
    expect(text()).not.toContain('Client & Schedule')
    expect(text()).not.toContain('Activity Timeline')
  })

  it('switches to Money tab and shows pricing and payment details', async () => {
    role = 'Owner'
    await mount()
    await pickTab('Money')
    expect(text()).toContain('Pricing & Payments')
    expect(text()).toContain('Deposit Required')
    expect(text()).not.toContain('Equipment, Bundles & Services')
  })

  it('switches to Client & Dates tab and shows schedule, crew, transport, documents', async () => {
    role = 'Owner'
    await mount()
    await pickTab('Client & Dates')
    expect(text()).toContain('Client & Schedule')
    expect(text()).toContain('Crew & Transport')
    expect(text()).toContain('Transport & Delivery')
    expect(text()).toContain('Documents')
    expect(text()).not.toContain('Equipment, Bundles & Services')
  })

  it('switches to History tab and shows activity timeline and notes', async () => {
    role = 'Owner'
    await mount()
    await pickTab('History')
    expect(text()).toContain('Activity Timeline')
    expect(text()).toContain('No activity recorded yet.')
    expect(text()).not.toContain('Equipment, Bundles & Services')
  })

  it('honors initial ?tab=money query parameter', async () => {
    role = 'Owner'
    await mount('/rentals/B-715?tab=money')
    expect(text()).toContain('Pricing & Payments')
    expect(text()).not.toContain('Equipment, Bundles & Services')
  })

  it('honors initial ?tab=client-dates query parameter', async () => {
    role = 'Owner'
    await mount('/rentals/B-715?tab=client-dates')
    expect(text()).toContain('Client & Schedule')
    expect(text()).not.toContain('Equipment, Bundles & Services')
  })

  it('honors initial ?tab=history query parameter', async () => {
    role = 'Owner'
    await mount('/rentals/B-715?tab=history')
    expect(text()).toContain('Activity Timeline')
    expect(text()).not.toContain('Equipment, Bundles & Services')
  })

  it('completely omits Money tab and top summary cards for Warehouse role (Law 6)', async () => {
    role = 'Warehouse'
    await mount()
    const tabs = [...container.querySelectorAll('[role="tab"]')].map((t) => t.textContent?.trim())
    expect(tabs).toEqual(['Items', 'Client & Dates', 'History'])
    expect(tabs).not.toContain('Money')
    // Booking Summary & Quick Actions absent
    expect(text()).not.toContain('Booking Summary')
    expect(text()).not.toContain('Quick Actions')
    expect(text()).not.toMatch(/Rs\s?[\d,]/)
  })

  it('falls back to Items if money-blind role hits ?tab=money', async () => {
    role = 'Warehouse'
    await mount('/rentals/B-715?tab=money')
    const tabs = [...container.querySelectorAll('[role="tab"]')].map((t) => t.textContent?.trim())
    expect(tabs).not.toContain('Money')
    // Safely falls back to Items
    expect(text()).toContain('Equipment, Bundles & Services')
    expect(text()).not.toContain('Pricing & Payments')
    expect(text()).not.toMatch(/Rs\s?[\d,]/)
  })
})
