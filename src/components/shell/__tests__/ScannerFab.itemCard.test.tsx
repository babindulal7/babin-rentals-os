// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import type { ItemCardData } from '../../../lib/queries/inventory'

const mockLookupItemCard = vi.fn()

vi.mock('../../../lib/scannerLookup', () => ({
  lookupItemCard: (...args: unknown[]) => mockLookupItemCard(...args),
  lookupItemBarcode: vi.fn(),
  lookupClientBarcode: vi.fn(),
}))

vi.mock('@zxing/browser', () => ({
  BrowserMultiFormatReader: class {
    decodeFromVideoDevice = vi.fn().mockReturnValue(new Promise(() => {}))
  },
}))

vi.mock('../../../lib/device', () => ({
  useViewport: () => 'desktop',
}))

vi.mock('../../../lib/auth', () => ({
  useAuth: () => ({
    user: { id: 'u-1', role: 'Owner', email: 'owner@example.com' },
    loading: false,
  }),
}))

vi.mock('../../../lib/moneyVisibility', () => ({
  useCanViewMoney: () => true,
}))

vi.mock('../../../lib/supabase', () => ({
  supabase: {
    from: () => ({
      select: () => ({
        or: () => ({
          maybeSingle: async () => ({ data: null }),
        }),
      }),
    }),
  },
}))

;(globalThis as Record<string, unknown>)['IS_REACT_ACT_ENVIRONMENT'] = true

const { default: ScannerFab, openItemCard } = await import('../ScannerFab')

describe('ScannerFab — Item Card Triggering (T2-14, W91)', () => {
  let host: HTMLDivElement
  let root: Root

  beforeEach(() => {
    vi.clearAllMocks()
    window.history.pushState({}, '', '/inventory')
    host = document.createElement('div')
    document.body.appendChild(host)
    root = createRoot(host)
  })

  afterEach(async () => {
    if (root) {
      await act(async () => {
        root.unmount()
      })
    }
    host?.remove()
    document.body.innerHTML = ''
  })

  const sampleCard: ItemCardData = {
    unitId: 'u1',
    productId: 'p1',
    name: 'FX3 Cinema Camera',
    brand: 'Sony',
    model: 'FX3',
    assetCode: 'EQ000001',
    assetTag: 'EQ000001-U01',
    serialNo: 'SN-FX3-0001',
    barcode: 'EQ000001-U01',
    status: 'On Rent',
    condition: 'Good',
    categoryName: 'Cameras',
    location: {
      warehouseName: 'Main Warehouse',
      rack: 'A',
      shelf: '2',
      bin: '04',
      formatted: 'Rack A · Shelf 2 · Bin 04',
    },
    custody: {
      bookingId: 'b1',
      bookingNo: 'BK-2026-0001',
      clientId: 'c1',
      clientName: 'Kathmandu Cine Arts',
      clientPhone: '9841000000',
      clientEmail: 'info@kca.com.np',
      stage: 'On Rent',
      pickupAt: '2026-10-25T10:00:00Z',
      returnAt: '2026-10-27T18:00:00Z',
      isOverdue: false,
      countdownText: 'Due in 2h 15m',
    },
    nextBooking: null,
    lastReset: null,
    openDamage: {
      hasDamage: false,
      condition: 'Good',
    },
    financials: null,
  }

  it('opens item card sheet when openItemCard is triggered outside floor workspaces', async () => {
    mockLookupItemCard.mockResolvedValueOnce(sampleCard)

    await act(async () => {
      root.render(
        <MemoryRouter>
          <ScannerFab />
        </MemoryRouter>,
      )
    })

    // Dispatch external openItemCard
    await act(async () => {
      openItemCard('EQ000001-U01')
    })

    expect(mockLookupItemCard).toHaveBeenCalledWith('EQ000001-U01', { withMoney: true })

    // Modal dialog for item card should now be rendered
    const dialog = document.body.querySelector('[role="dialog"]')
    expect(dialog).not.toBeNull()
    expect(document.body.textContent).toContain('Sony FX3')
    expect(document.body.textContent).toContain('Kathmandu Cine Arts')
    expect(document.body.textContent).toContain('Who Has It Now (W91)')
  })

  it('opens item card sheet via global keyboard wedge outside floor workspaces', async () => {
    mockLookupItemCard.mockResolvedValueOnce(sampleCard)

    await act(async () => {
      root.render(
        <MemoryRouter>
          <ScannerFab />
        </MemoryRouter>,
      )
    })

    // Simulate Bluetooth scanner wedge typing "EQ000001-U01" followed by Enter
    await act(async () => {
      const code = 'EQ000001-U01'
      for (const char of code) {
        window.dispatchEvent(new KeyboardEvent('keydown', { key: char, bubbles: true }))
      }
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
    })

    expect(mockLookupItemCard).toHaveBeenCalledWith('EQ000001-U01', { withMoney: true })
    expect(document.body.textContent).toContain('Kathmandu Cine Arts')
  })

  it('does not open item card sheet when wedge scans inside a floor workspace (/packing)', async () => {
    // Navigate to a floor workspace
    window.history.pushState({}, '', '/rentals/b1/packing')

    await act(async () => {
      root.render(
        <MemoryRouter>
          <ScannerFab />
        </MemoryRouter>,
      )
    })

    // Simulate Bluetooth scanner wedge
    await act(async () => {
      const code = 'EQ000001-U01'
      for (const char of code) {
        window.dispatchEvent(new KeyboardEvent('keydown', { key: char, bubbles: true }))
      }
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
    })

    // Must NOT look up or open item card
    expect(mockLookupItemCard).not.toHaveBeenCalled()
    expect(document.body.querySelector('[role="dialog"]')).toBeNull()
  })
})
