// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { DeliveryWorkspace } from '../DeliveryWorkspace'
import type { DeliveryRecord } from '../../../lib/queries/delivery'

;(globalThis as Record<string, unknown>)['IS_REACT_ACT_ENVIRONMENT'] = true

let mockCurrentUser: { id: string; name: string; role: string } | null = {
  id: 'usr-driver-1',
  name: 'Ramesh Thapa',
  role: 'Driver',
}

vi.mock('../../../lib/auth', () => ({
  useAuth: () => ({
    user: mockCurrentUser,
    loading: false,
  }),
}))

const MOCK_JOBS: DeliveryRecord[] = [
  {
    id: 'DEL-001',
    bookingNo: 'BR-1001',
    clientName: 'Alpha Cinema',
    clientPhone: '+977 9801111111',
    address: 'Baluwatar, Kathmandu',
    neighborhood: 'Baluwatar',
    mode: 'Babin Delivery',
    driverId: 'usr-driver-1',
    driverName: 'Ramesh Thapa',
    status: 'Ready',
    scheduledDate: '2026-10-31',
    scheduledTime: '10:00',
    deliveryFeeNpr: 2500,
  },
  {
    id: 'DEL-002',
    bookingNo: 'BR-1002',
    clientName: 'Beta Films',
    clientPhone: '+977 9802222222',
    address: 'Jhamsikhel, Lalitpur',
    neighborhood: 'Jhamsikhel',
    mode: 'Babin Delivery',
    driverId: 'usr-other-driver',
    driverName: 'Hari Sharma',
    status: 'In Transit',
    scheduledDate: '2026-10-31',
    scheduledTime: '11:00',
    deliveryFeeNpr: 3500,
  },
  {
    id: 'DEL-003',
    bookingNo: 'BR-1003',
    clientName: 'Gamma Media',
    clientPhone: '+977 9803333333',
    address: 'Thamel, Kathmandu',
    neighborhood: 'Thamel',
    mode: 'Courier / Rider',
    status: 'Scheduled',
    scheduledDate: '2026-10-31',
    scheduledTime: '14:00',
    deliveryFeeNpr: 1500,
  },
]

vi.mock('../../../lib/queries/delivery', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../lib/queries/delivery')>()
  return {
    ...actual,
    fetchDeliveries: vi.fn(async (role: string | null) => {
      if (role === 'Driver') {
        return MOCK_JOBS.filter((j) => j.driverId === mockCurrentUser?.id)
      }
      return MOCK_JOBS
    }),
  }
})

vi.mock('../../../actions/delivery', () => ({
  createDeliveryJob: vi.fn().mockResolvedValue({ jobId: 'DEL-NEW' }),
  assignDeliveryDriver: vi.fn().mockResolvedValue({ jobId: 'DEL-003' }),
  transitionDeliveryJob: vi.fn().mockResolvedValue({ jobId: 'DEL-001' }),
  rescheduleDeliveryJob: vi.fn().mockResolvedValue({ jobId: 'DEL-003', newScheduledAt: '2026-10-31T15:00:00.000Z' }),
}))

// Stand-in for the real modal so the test can see which job id the workspace hands it.
vi.mock('../SendToRiderModal', () => ({
  SendToRiderModal: (props: { jobId: string; bookingNo: string }) => (
    <div data-testid="rider-modal" data-job-id={props.jobId} data-booking-no={props.bookingNo} />
  ),
}))

describe('DeliveryWorkspace (T4-01)', () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => {
      root.unmount()
    })
    container.remove()
    document.body.innerHTML = ''
    vi.restoreAllMocks()
  })

  it('Driver seat view enforces RLS isolation and Law 6 money blindness', async () => {
    mockCurrentUser = { id: 'usr-driver-1', name: 'Ramesh Thapa', role: 'Driver' }

    await act(async () => {
      root.render(
        <MemoryRouter>
          <DeliveryWorkspace />
        </MemoryRouter>,
      )
    })

    // Driver only sees assigned jobs (DEL-001)
    expect(container.textContent).toContain('DEL-001')
    expect(container.textContent).not.toContain('DEL-002')
    expect(container.textContent).not.toContain('DEL-003')

    // Law 6: Zero money or fee displays on Driver screen
    expect(container.textContent).not.toContain('Delivery Revenue')
    expect(container.textContent).not.toContain('2,500')
    expect(container.textContent).not.toContain('3,500')
    expect(container.textContent).not.toContain('FEE')

    // Driver cannot create new dispatches, assign driver, mark failed, or reschedule
    expect(container.textContent).not.toContain('+ New Dispatch')
    expect(container.textContent).not.toContain('Assign Driver')
    expect(container.textContent).not.toContain('Mark Failed')
    expect(container.textContent).not.toContain('Change Time')

    // Driver can see primary verb Dispatch Now for their Ready job
    const dispatchBtn = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent?.includes('Dispatch'),
    )
    expect(dispatchBtn).toBeTruthy()
  })

  it('Coordinator seat view sees all jobs, revenue KPI, and dispatch management actions', async () => {
    mockCurrentUser = { id: 'usr-coord-1', name: 'Sita Coordinator', role: 'Coordinator' }

    await act(async () => {
      root.render(
        <MemoryRouter>
          <DeliveryWorkspace />
        </MemoryRouter>,
      )
    })

    // Coordinator sees all jobs
    expect(container.textContent).toContain('DEL-001')
    expect(container.textContent).toContain('DEL-002')
    expect(container.textContent).toContain('DEL-003')

    // Money allowed for Coordinator
    expect(container.textContent).toContain('Delivery Revenue')
    expect(container.textContent).toContain('FEE')

    // Management actions present
    expect(container.textContent).toContain('+ New Dispatch')
    expect(container.textContent).toContain('Assign')
    expect(container.textContent).toContain('Fail')
    expect(container.textContent).toContain('Change Time')
  })

  it('Rescheduling a delivery moves scheduled time only, enforces Ruling D8, and prepares WhatsApp draft', async () => {
    mockCurrentUser = { id: 'usr-coord-1', name: 'Sita Coordinator', role: 'Coordinator' }

    await act(async () => {
      root.render(
        <MemoryRouter>
          <DeliveryWorkspace />
        </MemoryRouter>,
      )
    })

    // Find and click the first "Change Time" button
    const changeTimeBtns = Array.from(container.querySelectorAll('button')).filter(
      (b) => b.textContent?.includes('Change Time'),
    )
    expect(changeTimeBtns.length).toBeGreaterThan(0)

    await act(async () => {
      changeTimeBtns[0]?.click()
    })

    // Modal is opened
    expect(container.textContent).toContain('Reschedule Dispatch')
    expect(container.textContent).toContain('Ruling D8')
    expect(container.textContent).toContain('Rescheduling changes the dispatch departure time only. Booking rental dates and billing remain strictly unchanged.')

    // Fill in date, time, and confirm
    const confirmBtn = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent?.includes('Confirm Reschedule'),
    )
    expect(confirmBtn).toBeTruthy()

    await act(async () => {
      confirmBtn?.click()
    })

    // Shows success state and WhatsApp draft link
    expect(container.textContent).toContain('Successfully rescheduled')
    expect(container.textContent).toContain('Open WhatsApp Draft')

    const waDraftLink = container.querySelector('a[href^="https://wa.me/"]')
    expect(waDraftLink).toBeTruthy()
    expect(waDraftLink?.getAttribute('href')).toContain('https://wa.me/977980')
  })

  // T4-08 / INT-1: rider links belong to delivery jobs; the id handed to the modal must be the job id.
  it('Rider Link (dispatch board view) hands the real delivery job id to the modal', async () => {
    mockCurrentUser = { id: 'usr-coord-1', name: 'Sita Coordinator', role: 'Coordinator' }

    await act(async () => {
      root.render(
        <MemoryRouter>
          <DeliveryWorkspace />
        </MemoryRouter>,
      )
    })

    // The rider entry exists in the dispatch board (card) view only; the table view is the default.
    const boardToggle = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Dispatch Board'),
    )
    await act(async () => {
      boardToggle?.click()
    })

    const riderButtons = Array.from(container.querySelectorAll('button')).filter((b) =>
      b.textContent?.includes('Rider Link'),
    )
    expect(riderButtons.length).toBeGreaterThan(0)
    expect(container.querySelector('[data-testid="rider-modal"]')).toBeNull()

    await act(async () => {
      riderButtons[0]?.click()
    })

    const modal = container.querySelector('[data-testid="rider-modal"]')
    expect(modal).not.toBeNull()
    expect(MOCK_JOBS.map((j) => j.id)).toContain(modal?.getAttribute('data-job-id'))
    expect(MOCK_JOBS.map((j) => j.bookingNo)).toContain(modal?.getAttribute('data-booking-no'))
  })

  it('does not offer a Rider Link to a Driver', async () => {
    mockCurrentUser = { id: 'usr-driver-1', name: 'Ramesh Thapa', role: 'Driver' }

    await act(async () => {
      root.render(
        <MemoryRouter>
          <DeliveryWorkspace />
        </MemoryRouter>,
      )
    })

    expect(container.textContent).not.toContain('Rider Link')
    expect(container.textContent).not.toContain('Send to Rider')
  })
})
