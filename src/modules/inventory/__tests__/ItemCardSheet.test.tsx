// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import { rupees } from '../../../lib/money'
import type { ItemCardData } from '../../../lib/queries/inventory'
import { ItemCardSheet } from '../ItemCardSheet'

let mockCanViewMoney = false

vi.mock('../../../lib/moneyVisibility', () => ({
  useCanViewMoney: () => mockCanViewMoney,
}))

let mockViewport = 'desktop'
vi.mock('../../../lib/device', () => ({
  useViewport: () => mockViewport,
}))

;(globalThis as Record<string, unknown>)['IS_REACT_ACT_ENVIRONMENT'] = true

describe('ItemCardSheet (T2-14, W91)', () => {
  let host: HTMLDivElement
  let root: Root

  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-10-27T10:00:00.000Z'))
    mockCanViewMoney = false
    mockViewport = 'desktop'
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
    vi.useRealTimers()
    host?.remove()
    document.body.innerHTML = ''
  })

  const sampleCardOnRent: ItemCardData = {
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
      pickupAt: '2026-10-25T10:00:00.000Z',
      returnAt: '2026-10-27T12:15:00.000Z',
      isOverdue: false,
      countdownText: 'Due in 2h 15m',
    },
    nextBooking: {
      bookingId: 'b2',
      bookingNo: 'BK-2026-0004',
      clientId: 'c2',
      clientName: 'Mountain Films',
      stage: 'Confirmed',
      pickupAt: '2026-10-29T10:00:00Z',
      returnAt: '2026-10-31T18:00:00Z',
      relativeText: 'Starts in 2 days',
    },
    lastReset: {
      completedAt: '2026-10-24T15:30:00Z',
      cleanedBy: 'Roshan Shrestha',
      qcBy: 'Roshan Shrestha',
      qcSelfChecked: true,
      qcSkipped: false,
      qcSkipReason: null,
      problemState: 'No Problems',
      summary: 'Cleaned & self-checked by Roshan Shrestha (alone on shift, W43)',
    },
    openDamage: {
      hasDamage: false,
      condition: 'Good',
    },
    financials: {
      dailyRate: rupees(4500),
      replacementValue: rupees(280000),
    },
  }

  it('renders complete item card with who has it now, countdown, location, reset, and next booking', async () => {
    const handleClose = vi.fn()

    await act(async () => {
      root.render(
        <MemoryRouter>
          <ItemCardSheet isOpen={true} onClose={handleClose} item={sampleCardOnRent} />
        </MemoryRouter>,
      )
    })

    // Title & identity
    expect(host.textContent).toContain('Sony FX3')
    expect(host.textContent).toContain('EQ000001-U01')
    expect(host.textContent).toContain('SN-FX3-0001')
    expect(host.textContent).toContain('On Rent')

    // Who has it now (W91)
    expect(host.textContent).toContain('Who Has It Now (W91)')
    expect(host.textContent).toContain('Kathmandu Cine Arts')
    expect(host.textContent).toContain('9841000000')
    expect(host.textContent).toContain('#BK-2026-0001')
    expect(host.textContent).toContain('Due in 2h 15m')

    // Location
    expect(host.textContent).toContain('Rack A · Shelf 2 · Bin 04')

    // Next booking
    expect(host.textContent).toContain('Mountain Films')
    expect(host.textContent).toContain('#BK-2026-0004')
    expect(host.textContent).toContain('Starts in 2 days')

    // Last reset
    expect(host.textContent).toContain('Cleaned & self-checked by Roshan Shrestha (alone on shift, W43)')

    // Open damage
    expect(host.textContent).toContain('No open damage')
  })

  it('hides all money from floor seats (Law 6)', async () => {
    mockCanViewMoney = false // e.g. Warehouse / Technician

    await act(async () => {
      root.render(
        <MemoryRouter>
          <ItemCardSheet isOpen={true} onClose={vi.fn()} item={sampleCardOnRent} />
        </MemoryRouter>,
      )
    })

    // Must not show financial rates or rupee symbols
    expect(host.textContent).not.toContain('Financial Rates')
    expect(host.textContent).not.toContain('Daily:')
    expect(host.textContent).not.toContain('Replacement:')
    expect(host.textContent).not.toContain('Rs')
    expect(host.textContent).not.toContain('4,500')
  })

  it('shows financials to authorized money seats (Owner/Manager/Admin)', async () => {
    mockCanViewMoney = true // Authorized money viewer

    await act(async () => {
      root.render(
        <MemoryRouter>
          <ItemCardSheet isOpen={true} onClose={vi.fn()} item={sampleCardOnRent} />
        </MemoryRouter>,
      )
    })

    expect(host.textContent).toContain('Financial Rates (Staff Only)')
    expect(host.textContent).toContain('Daily:')
    expect(host.textContent).toContain('Replacement:')
  })

  it('renders overdue return alert when item is overdue', async () => {
    const overdueCard: ItemCardData = {
      ...sampleCardOnRent,
      custody: {
        ...sampleCardOnRent.custody!,
        returnAt: '2026-10-27T06:50:00.000Z',
        isOverdue: true,
        countdownText: 'Overdue by 3h 10m',
      },
    }

    await act(async () => {
      root.render(
        <MemoryRouter>
          <ItemCardSheet isOpen={true} onClose={vi.fn()} item={overdueCard} />
        </MemoryRouter>,
      )
    })

    expect(host.textContent).toContain('Overdue by 3h 10m')
  })

  it('renders open damage warning when damage is recorded', async () => {
    const damagedCard: ItemCardData = {
      ...sampleCardOnRent,
      condition: 'Damaged',
      openDamage: {
        hasDamage: true,
        condition: 'Damaged',
        damageType: 'Physical',
        description: 'Cracked EVF glass and bent bracket',
        severity: 'Major',
      },
    }

    await act(async () => {
      root.render(
        <MemoryRouter>
          <ItemCardSheet isOpen={true} onClose={vi.fn()} item={damagedCard} />
        </MemoryRouter>,
      )
    })

    expect(host.textContent).toContain('Cracked EVF glass and bent bracket')
    expect(host.textContent).toContain('Severity: Major')
  })
})
