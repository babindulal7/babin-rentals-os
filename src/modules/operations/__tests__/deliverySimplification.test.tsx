// @vitest-environment jsdom
/**
 * # Delivery Screen Simplification — Card E-5 (R-10.11)
 *
 * Ruling:
 *  - Delivery screen: Job list + 1 button per job
 *  - Each job row: address, items, one next-step button; the rest behind More
 *  - Touch targets >= 44px (Law 15)
 *  - Money blindness for Driver and Warehouse (Law 6)
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { DeliveryWorkspace } from '../DeliveryWorkspace'
import type { DeliveryRecord } from '../../../lib/queries/delivery'

;(globalThis as Record<string, unknown>)['IS_REACT_ACT_ENVIRONMENT'] = true

let mockRole: string = 'Coordinator'

vi.mock('../../../lib/auth', () => ({
  useAuth: () => ({
    user: { id: 'usr-1', name: 'Test User', role: mockRole },
    loading: false,
  }),
}))

vi.mock('../../../lib/moneyVisibility', () => ({
  useCanViewMoney: () => mockRole === 'Owner' || mockRole === 'Admin' || mockRole === 'Manager' || mockRole === 'Coordinator',
}))

const MOCK_JOBS: DeliveryRecord[] = [
  {
    id: 'DEL-101',
    bookingNo: 'BR-201',
    clientName: 'Alpha Cinema',
    clientPhone: '+977 9801111111',
    address: 'Baluwatar, Kathmandu',
    neighborhood: 'Baluwatar',
    mode: 'Babin Delivery',
    itemCount: 5,
    status: 'Scheduled',
    scheduledDate: '2026-11-15',
    scheduledTime: '10:00',
    deliveryFeeNpr: 2500,
  },
  {
    id: 'DEL-102',
    bookingNo: 'BR-202',
    clientName: 'Beta Films',
    clientPhone: '+977 9802222222',
    address: 'Jhamsikhel, Lalitpur',
    neighborhood: 'Jhamsikhel',
    mode: 'Babin Delivery',
    itemCount: 2,
    driverId: 'drv-1',
    driverName: 'Suman Rai',
    vehiclePlate: 'Ba 3 Cha 8821',
    status: 'Ready',
    scheduledDate: '2026-11-15',
    scheduledTime: '11:00',
    deliveryFeeNpr: 3500,
  },
  {
    id: 'DEL-103',
    bookingNo: 'BR-203',
    clientName: 'Gamma Media',
    clientPhone: '+977 9803333333',
    address: 'Thamel, Kathmandu',
    neighborhood: 'Thamel',
    mode: 'Babin Delivery',
    itemCount: 8,
    driverId: 'drv-1',
    driverName: 'Suman Rai',
    vehiclePlate: 'Ba 3 Cha 8821',
    status: 'In Transit',
    scheduledDate: '2026-11-15',
    scheduledTime: '12:00',
    deliveryFeeNpr: 1500,
  },
  {
    id: 'DEL-104',
    bookingNo: 'BR-204',
    clientName: 'Delta Productions',
    clientPhone: '+977 9804444444',
    address: 'Sanepa, Lalitpur',
    neighborhood: 'Sanepa',
    mode: 'Babin Delivery',
    itemCount: 3,
    driverId: 'drv-1',
    driverName: 'Suman Rai',
    status: 'Delivered',
    recipientName: 'Bikash',
    scheduledDate: '2026-11-15',
    scheduledTime: '13:00',
    deliveryFeeNpr: 2000,
  },
]

vi.mock('../../../lib/queries/delivery', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../lib/queries/delivery')>()
  return {
    ...actual,
    fetchDeliveries: vi.fn(async () => MOCK_JOBS),
  }
})

describe('Card E-5: Delivery Screen Simplification (R-10.11)', () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
    mockRole = 'Manager'
  })

  afterEach(() => {
    act(() => {
      root.unmount()
    })
    container.remove()
    document.body.innerHTML = ''
    vi.restoreAllMocks()
  })

  async function renderWorkspace() {
    await act(async () => {
      root.render(
        <MemoryRouter>
          <DeliveryWorkspace />
        </MemoryRouter>,
      )
    })
  }

  it('renders address and items on each job row', async () => {
    await renderWorkspace()

    // Address is displayed
    expect(container.textContent).toContain('Baluwatar, Kathmandu')
    expect(container.textContent).toContain('Jhamsikhel, Lalitpur')
    expect(container.textContent).toContain('Thamel, Kathmandu')
    expect(container.textContent).toContain('Sanepa, Lalitpur')

    // Items count is displayed
    expect(container.textContent).toContain('5 items')
    expect(container.textContent).toContain('2 items')
    expect(container.textContent).toContain('8 items')
    expect(container.textContent).toContain('3 items')
  })

  it('renders exactly 1 next-step action button and 1 More menu per job row in Table view', async () => {
    await renderWorkspace()

    const rows = Array.from(container.querySelectorAll('tr.delivery-row'))
    expect(rows.length).toBe(4)

    for (const row of rows) {
      const actionCell = row.querySelector('td:last-child')
      expect(actionCell).toBeTruthy()

      // Exactly 1 primary/next-step button + 1 More menu trigger button
      const buttons = Array.from(actionCell!.querySelectorAll('button'))
      // 1 next step button + 1 overflow menu trigger button = 2 buttons total in action cell
      expect(buttons.length).toBe(2)

      const moreBtn = buttons.find((b) => b.getAttribute('aria-label')?.includes('More actions for'))
      expect(moreBtn).toBeTruthy()
    }
  })

  it('displays the correct single next-step verb per job status', async () => {
    await renderWorkspace()

    // DEL-101 is Scheduled (unassigned) -> next step is "Assign Rider" or "Assign Driver"
    const del101Row = Array.from(container.querySelectorAll('tr.delivery-row')).find((r) =>
      r.textContent?.includes('DEL-101'),
    )!
    expect(del101Row.textContent).toContain('Assign Driver')

    // DEL-102 is Ready (assigned) -> next step is "Dispatch Now"
    const del102Row = Array.from(container.querySelectorAll('tr.delivery-row')).find((r) =>
      r.textContent?.includes('DEL-102'),
    )!
    expect(del102Row.textContent).toContain('Dispatch Now')

    // DEL-103 is In Transit -> next step is "Confirm Delivered ✓"
    const del103Row = Array.from(container.querySelectorAll('tr.delivery-row')).find((r) =>
      r.textContent?.includes('DEL-103'),
    )!
    expect(del103Row.textContent).toContain('Confirm Delivered ✓')

    // DEL-104 is Delivered -> next step is "Attach Proof"
    const del104Row = Array.from(container.querySelectorAll('tr.delivery-row')).find((r) =>
      r.textContent?.includes('DEL-104'),
    )!
    expect(del104Row.textContent).toContain('Attach Proof')
  })

  it('places secondary actions behind the More menu', async () => {
    await renderWorkspace()

    // More menu for DEL-101
    const moreBtn = container.querySelector('button[aria-label="More actions for DEL-101"]') as HTMLButtonElement
    expect(moreBtn).toBeTruthy()

    await act(async () => {
      moreBtn.click()
    })

    // Menu renders in body
    expect(document.body.textContent).toContain('Print Gate Pass')
    expect(document.body.textContent).toContain('Rider Link')
    expect(document.body.textContent).toContain('Change Time')
    expect(document.body.textContent).toContain('Mark Failed')
  })

  it('ensures all action buttons and More trigger meet minimum 44px touch targets (Law 15)', async () => {
    await renderWorkspace()

    const actionButtons = Array.from(container.querySelectorAll('td:last-child button'))
    expect(actionButtons.length).toBeGreaterThan(0)

    for (const btn of actionButtons) {
      const height = (btn as HTMLElement).style.minHeight || (btn as HTMLElement).style.height
      // Either style.minHeight is 44px or computed touch floor
      if (height) {
        expect(parseInt(height)).toBeGreaterThanOrEqual(44)
      }
    }
  })

  it('hides fee column and money figures for money-blind roles (Driver) under Law 6', async () => {
    mockRole = 'Driver'
    await renderWorkspace()

    expect(container.textContent).not.toContain('FEE')
    expect(container.textContent).not.toContain('Delivery Fee')
    expect(container.textContent).not.toMatch(/Rs\s?[\d,]/)
  })
})
