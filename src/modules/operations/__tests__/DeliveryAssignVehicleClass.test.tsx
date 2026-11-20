// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { DeliveryWorkspace } from '../DeliveryWorkspace'
import type { DeliveryRecord } from '../../../lib/queries/delivery'
import { assignDeliveryDriver } from '../../../actions/delivery'
import { setDeliveryJobVehicleClass } from '../../../lib/queries/bookingDeliveryZone'

;(globalThis as Record<string, unknown>)['IS_REACT_ACT_ENVIRONMENT'] = true

/* O-28: the assign sheet saves the job's grid vehicle class, and only when it changed. */

let jobs: DeliveryRecord[] = []

vi.mock('../../../lib/auth', () => ({
  useAuth: () => ({
    user: { id: 'usr-coord-1', name: 'Sita Coordinator', role: 'Coordinator' },
    loading: false,
  }),
}))

vi.mock('../../../lib/queries/delivery', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../lib/queries/delivery')>()
  return { ...actual, fetchDeliveries: vi.fn(async () => jobs) }
})

vi.mock('../../../actions/delivery', () => ({
  createDeliveryJob: vi.fn().mockResolvedValue({ jobId: 'DEL-NEW' }),
  assignDeliveryDriver: vi.fn().mockResolvedValue({ jobId: 'DEL-001' }),
  transitionDeliveryJob: vi.fn().mockResolvedValue({ jobId: 'DEL-001' }),
  rescheduleDeliveryJob: vi.fn().mockResolvedValue({ jobId: 'DEL-001', newScheduledAt: '2026-10-31T15:00:00.000Z' }),
}))

vi.mock('../../../lib/queries/bookingDeliveryZone', () => ({
  setBookingDeliveryZone: vi.fn().mockResolvedValue(undefined),
  setDeliveryJobVehicleClass: vi.fn().mockResolvedValue(undefined),
}))

function job(overrides: Partial<DeliveryRecord> = {}): DeliveryRecord {
  return {
    id: 'DEL-001',
    bookingNo: 'BR-1001',
    clientName: 'Alpha Cinema',
    clientPhone: '+977 9801111111',
    address: 'Baluwatar, Kathmandu',
    neighborhood: 'Baluwatar',
    mode: 'Babin Delivery',
    driverId: 'usr-driver-1',
    driverName: 'Ramesh Thapa',
    status: 'Scheduled',
    scheduledDate: '2026-10-31',
    scheduledTime: '10:00',
    deliveryFeeNpr: 2500,
    ...overrides,
  }
}

function buttonByText(container: HTMLElement, text: string): HTMLButtonElement | undefined {
  return Array.from(container.querySelectorAll('button')).find((b) => b.textContent?.includes(text)) as
    | HTMLButtonElement
    | undefined
}

function vehicleClassSelect(container: HTMLElement): HTMLSelectElement | undefined {
  return Array.from(container.querySelectorAll('select')).find((s) =>
    Array.from(s.options).some((o) => o.value === 'Van / larger vehicle'),
  ) as HTMLSelectElement | undefined
}

function chooseOption(select: HTMLSelectElement, value: string): void {
  const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')?.set
  setter?.call(select, value)
  select.dispatchEvent(new Event('change', { bubbles: true }))
}

describe('DeliveryWorkspace assign sheet: vehicle class (O-28)', () => {
  let container: HTMLDivElement
  let root: Root

  async function mountAndOpenAssign(): Promise<void> {
    await act(async () => {
      root.render(
        <MemoryRouter>
          <DeliveryWorkspace />
        </MemoryRouter>,
      )
    })
    // The dispatch table loads its rows after the first tick, so wait for the button to appear.
    let assignButton: HTMLButtonElement | undefined
    for (let attempt = 0; attempt < 50 && !assignButton; attempt++) {
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 20))
      })
      assignButton = Array.from(container.querySelectorAll('button')).find(
        (b) => b.textContent?.trim() === 'Assign',
      ) as HTMLButtonElement | undefined
    }
    expect(assignButton).toBeDefined()
    await act(async () => {
      assignButton?.click()
    })
  }

  beforeEach(() => {
    vi.clearAllMocks()
    jobs = [job()]
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
  })

  it('shows the vehicle class picker on the assign sheet, not chosen by default', async () => {
    await mountAndOpenAssign()
    expect(document.body.textContent).toContain('Assign Driver / Rider — DEL-001')
    const select = vehicleClassSelect(document.body)
    expect(select).toBeDefined()
    expect(select?.value).toBe('')
    expect(Array.from(select!.options).map((o) => o.value)).toEqual([
      '',
      'Motorbike',
      'Car / pickup',
      'Van / larger vehicle',
    ])
  })

  it('saves a newly chosen vehicle class after the driver is assigned', async () => {
    await mountAndOpenAssign()
    await act(async () => {
      chooseOption(vehicleClassSelect(document.body)!, 'Van / larger vehicle')
    })
    await act(async () => {
      buttonByText(document.body, 'Save & Assign')?.click()
      await new Promise((resolve) => setTimeout(resolve, 0))
    })
    expect(assignDeliveryDriver).toHaveBeenCalledTimes(1)
    expect(setDeliveryJobVehicleClass).toHaveBeenCalledWith('DEL-001', 'Van / larger vehicle')
  })

  it('does not write the vehicle class again when it has not changed', async () => {
    jobs = [job({ vehicleClass: 'Motorbike' })]
    await mountAndOpenAssign()
    expect(vehicleClassSelect(document.body)?.value).toBe('Motorbike')
    await act(async () => {
      buttonByText(document.body, 'Save & Assign')?.click()
      await new Promise((resolve) => setTimeout(resolve, 0))
    })
    expect(assignDeliveryDriver).toHaveBeenCalledTimes(1)
    expect(setDeliveryJobVehicleClass).not.toHaveBeenCalled()
  })

  it('reports a failed class save after the driver is assigned and keeps the sheet open', async () => {
    vi.mocked(setDeliveryJobVehicleClass).mockRejectedValueOnce(new Error('A finished delivery job keeps its vehicle class'))
    await mountAndOpenAssign()
    await act(async () => {
      chooseOption(vehicleClassSelect(document.body)!, 'Car / pickup')
    })
    await act(async () => {
      buttonByText(document.body, 'Save & Assign')?.click()
      await new Promise((resolve) => setTimeout(resolve, 0))
    })
    expect(assignDeliveryDriver).toHaveBeenCalledTimes(1)
    const alert = document.body.querySelector('[role="alert"]')
    expect(alert?.textContent).toContain('Driver assigned, but the vehicle class was not saved')
    expect(document.body.textContent).toContain('Assign Driver / Rider — DEL-001')
  })
})
