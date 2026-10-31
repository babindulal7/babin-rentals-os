// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import type { MaintenanceRecord } from '../Maintenance'
import type { Paisa } from '../../../lib/money'

const role = { current: 'Technician' as string }
const canSeeMoney = { current: true }

vi.mock('../../../lib/moneyVisibility', () => ({
  useCanViewMoney: () => canSeeMoney.current,
}))

vi.mock('../../../lib/auth', () => ({
  useAuth: () => ({
    user: { id: 'u-tech', name: 'Technician User', role: role.current, isSharedDevice: false },
    role: role.current,
    isStaff: true,
    loading: false,
    isLocked: false,
  }),
}))

const mockCompleteMaintenance = vi.fn().mockResolvedValue({ success: true, id: 'MNT-2026-0001' })
vi.mock('../../../actions/maintenance/completeMaintenance', () => ({
  completeMaintenance: (...args: unknown[]) => mockCompleteMaintenance(...args),
}))

;(globalThis as Record<string, unknown>)['IS_REACT_ACT_ENVIRONMENT'] = true

const { MaintenanceJobDetail } = await import('../MaintenanceJobDetail')

const mockJob: MaintenanceRecord = {
  id: 'MNT-2026-0001',
  equipmentName: 'Sony FX3 Cinema Camera',
  serialNumber: 'SN-FX3-9988',
  type: 'Repair',
  priority: 'High',
  status: 'In Progress',
  flags: [],
  conditions: ['Holding a Booking'],
  technician: 'Suresh Tech',
  costEstPaisa: 1500000 as Paisa,
  costActualPaisa: 1800000 as Paisa,
}

describe('MaintenanceJobDetail component', () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    vi.clearAllMocks()
    role.current = 'Technician'
    canSeeMoney.current = true
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
  })

  async function mount(props: Partial<Parameters<typeof MaintenanceJobDetail>[0]> = {}) {
    await act(async () => {
      root.render(
        <MemoryRouter>
          <MaintenanceJobDetail
            job={mockJob}
            isOpen={true}
            onClose={() => {}}
            {...props}
          />
        </MemoryRouter>
      )
    })
  }

  it('renders equipment details, serial number, and status', async () => {
    await mount()
    expect(container.textContent).toContain('Sony FX3 Cinema Camera')
    expect(container.textContent).toContain('SN-FX3-9988')
    expect(container.textContent).toContain('Repair')
    expect(container.textContent).toContain('In Progress')
  })

  it('Law 6: displays costs when role has money visibility', async () => {
    canSeeMoney.current = true
    await mount()
    expect(container.textContent).toContain('Repair Cost')
    expect(container.textContent).toMatch(/18,000|15,000/)
  })

  it('Law 6: completely hides cost information for money-blind floor seats (Warehouse)', async () => {
    canSeeMoney.current = false
    role.current = 'Warehouse'
    await mount()
    expect(container.textContent).not.toContain('Repair Cost')
    expect(container.textContent).not.toContain('18,000')
    expect(container.textContent).not.toContain('15,000')
  })

  it('Ruling D4: restricts close job to Technician / Manager and disallows Warehouse', async () => {
    role.current = 'Warehouse'
    canSeeMoney.current = false
    await mount()
    expect(container.textContent).toContain('Warehouse seats cannot close repair jobs')
    const textarea = container.querySelector('textarea')
    expect(textarea).toBeNull()
  })

  it('Ruling D4: permits Technician to close repair job with a valid note', async () => {
    role.current = 'Technician'
    const onJobClosed = vi.fn()
    await mount({ onJobClosed })

    const textarea = container.querySelector('textarea')
    expect(textarea).not.toBeNull()

    // Enter completion note (min 3 chars)
    await act(async () => {
      if (textarea) {
        Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!.call(
          textarea,
          'Replaced sensor ribbon cable and tested calibration.',
        )
        textarea.dispatchEvent(new Event('input', { bubbles: true }))
        textarea.dispatchEvent(new Event('change', { bubbles: true }))
      }
    })

    // Find and click the close button
    const closeBtn = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Close Job')
    )
    expect(closeBtn).toBeDefined()

    await act(async () => {
      closeBtn?.click()
    })

    expect(mockCompleteMaintenance).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'MNT-2026-0001',
        actionsTaken: 'Replaced sensor ribbon cable and tested calibration.',
        status: 'Completed',
      }),
      expect.objectContaining({
        role: 'Technician',
      }),
    )
  })
})
