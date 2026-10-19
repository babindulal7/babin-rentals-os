// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import LiveTransportPlans from '../LiveTransportPlans'
import type { DeliveryTransportItem } from '../../../lib/queries/deliveryTransport'

;(globalThis as Record<string, unknown>)['IS_REACT_ACT_ENVIRONMENT'] = true

const mockAuth = vi.hoisted(() => ({
  user: { id: 'usr-owner', role: 'Owner', name: 'Babin' } as { id: string; role: string; name: string } | null,
}))

const mockData = vi.hoisted(() => ({
  rows: [] as DeliveryTransportItem[],
  staff: [
    { id: 'usr-driver-1', fullName: 'Suman Rai', primaryRole: 'Driver', isActive: true },
    { id: 'usr-driver-2', fullName: 'Ramesh Thapa', primaryRole: 'Driver', isActive: true },
  ],
}))

vi.mock('../../../lib/auth', () => ({
  useAuth: () => ({ user: mockAuth.user }),
}))

vi.mock('../../../lib/moneyVisibility', () => ({
  useCanViewMoney: () => mockAuth.user?.role === 'Owner' || mockAuth.user?.role === 'Admin',
}))

vi.mock('../../../lib/queries/deliveryTransport', () => ({
  deliveryTransportReadRefusal: (role: string | null) =>
    role === 'Client' ? 'Transport records not available' : null,
  fetchDeliveryTransportList: () => Promise.resolve(mockData.rows),
}))

vi.mock('../../../lib/queries/staff', () => ({
  fetchStaffDirectory: () =>
    Promise.resolve({
      kind: 'ok',
      rows: mockData.staff,
    }),
}))

vi.mock('../../../actions/operations', () => ({
  mutateBookingTransport: vi.fn().mockResolvedValue({ id: 'trip-1', revision: 2 }),
}))

vi.mock('../../../components/ui/Toast', () => ({
  useToast: () => ({ showSuccessToast: vi.fn() }),
}))

vi.mock('react-router-dom', () => ({
  Link: ({ children, to }: { children: React.ReactNode; to: string }) => <a href={to}>{children}</a>,
}))

import { rupees } from '../../../lib/money'

const sampleTripScheduled: DeliveryTransportItem = {
  id: 'trip-1',
  bookingId: 'bk-1',
  bookingNo: 'BK-1001',
  bookingStage: 'Booked',
  branchId: 'br-1',
  clientName: 'Alpha Cinema',
  clientPhone: '+977-9811111111',
  destination: 'Bakhundole, Lalitpur',
  deliveryType: 'Babin Delivery',
  driverId: null,
  driverName: null,
  vehicle: 'Scorpio Van',
  numberPlate: 'BA 3 CHA 8821',
  deliveryStatus: 'Scheduled',
  scheduledAt: '2026-10-19T06:00:00Z',
  dispatchedAt: null,
  deliveredAt: null,
  recipientName: null,
  deliveryRevision: 1,
  deliveryUpdatedAt: '2026-10-19T06:00:00Z',
  deliveryNote: null,
  deliveryChargePaisa: rupees(3500),
}

const sampleTripReady: DeliveryTransportItem = {
  ...sampleTripScheduled,
  id: 'trip-2',
  bookingNo: 'BK-1002',
  bookingStage: 'On Rent',
  driverId: 'usr-driver-1',
  driverName: 'Suman Rai',
  deliveryStatus: 'Ready',
  deliveryRevision: 2,
}

const sampleTripTransit: DeliveryTransportItem = {
  ...sampleTripReady,
  id: 'trip-3',
  bookingNo: 'BK-1003',
  deliveryStatus: 'In Transit',
  dispatchedAt: '2026-10-19T07:00:00Z',
  deliveryRevision: 3,
}

let host: HTMLDivElement | null = null
let root: Root | null = null

beforeEach(() => {
  mockAuth.user = { id: 'usr-owner', role: 'Owner', name: 'Babin' }
  mockData.rows = [sampleTripScheduled, sampleTripReady, sampleTripTransit]
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
})

afterEach(() => {
  if (root) {
    act(() => {
      root?.unmount()
    })
  }
  host?.remove()
  host = null
  root = null
})

describe('LiveTransportPlans', () => {
  it('renders KPI counters correctly', async () => {
    await act(async () => {
      root!.render(<LiveTransportPlans />)
    })

    expect(host!.textContent).toContain('Transport Dispatches (3)')
    expect(host!.textContent).toContain('En route on road')
    expect(host!.textContent).toContain('Driver assigned, ready to roll')
    expect(host!.textContent).toContain('Awaiting driver assignment')
  })

  it('renders delivery fee for Owner', async () => {
    await act(async () => {
      root!.render(<LiveTransportPlans />)
    })

    expect(host!.textContent).toContain('Fee')
    expect(host!.textContent).toContain('Rs 3,500')
  })

  it('hides delivery fee for Warehouse', async () => {
    mockAuth.user = { id: 'usr-wh', role: 'Warehouse', name: 'Warehouse Staff' }
    await act(async () => {
      root!.render(<LiveTransportPlans />)
    })

    expect(host!.textContent).not.toContain('Fee')
    expect(host!.textContent).not.toContain('Rs 3,500')
  })

  it('shows Assign Driver for Scheduled and Dispatch for Ready trips to Owner', async () => {
    await act(async () => {
      root!.render(<LiveTransportPlans />)
    })

    expect(host!.querySelector('button[aria-label="Assign driver for BK-1001"]')).not.toBeNull()
    expect(host!.querySelector('button[aria-label="Dispatch trip for BK-1002"]')).not.toBeNull()
    expect(host!.querySelector('button[aria-label="Confirm delivered for BK-1003"]')).not.toBeNull()
  })

  it('hides mutation action buttons for Coordinator', async () => {
    mockAuth.user = { id: 'usr-coord', role: 'Coordinator', name: 'Coordinator Staff' }
    await act(async () => {
      root!.render(<LiveTransportPlans />)
    })

    expect(host!.textContent).toContain('BK-1001')
    expect(host!.querySelector('button[aria-label="Assign driver for BK-1001"]')).toBeNull()
    expect(host!.querySelector('button[aria-label="Dispatch trip for BK-1002"]')).toBeNull()
    expect(host!.querySelector('button[aria-label="Confirm delivered for BK-1003"]')).toBeNull()
  })
})
