// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { PlannedDowntimeCard } from '../PlannedDowntimeCard'
import type { DowntimeRow } from '../../../../lib/queries/downtime'

const role = { current: 'Technician' as string }

vi.mock('../../../../lib/auth', () => ({
  useAuth: () => ({
    user: { id: 'u-tech', name: 'Technician User', role: role.current, isSharedDevice: false },
    role: role.current,
    isStaff: true,
    loading: false,
    isLocked: false,
  }),
}))

const mockDowntimes: DowntimeRow[] = [
  {
    id: 'dt-01',
    assetId: 'unit-fx3-1',
    productId: 'prod-fx3',
    assetTag: 'CAM-01',
    productName: 'Sony FX3',
    qty: 1,
    startAt: '2026-11-20T09:00:00.000Z',
    endAt: '2026-11-23T18:00:00.000Z',
    reason: 'Repair',
    notes: 'Sensor repair',
    createdBy: 'u-tech',
    releasedAt: null,
    releasedReason: null,
    endedBy: null,
    createdAt: '2026-11-15T10:00:00.000Z',
    isActive: true,
  },
]

const mockListProductDowntimes = vi.fn()
vi.mock('../../../../lib/queries/downtime', () => ({
  listProductDowntimes: (...args: unknown[]) => mockListProductDowntimes(...args),
}))

const mockEndDowntime = vi.fn().mockResolvedValue({ success: true, alreadyEnded: false })
vi.mock('../../../../actions/inventory/endDowntime', () => ({
  endDowntime: (...args: unknown[]) => mockEndDowntime(...args),
}))

const mockShowSuccessToast = vi.fn()
vi.mock('../../../../components/ui/Toast', () => ({
  useToast: () => ({
    showSuccessToast: mockShowSuccessToast,
  }),
}))

;(globalThis as Record<string, unknown>)['IS_REACT_ACT_ENVIRONMENT'] = true

describe('PlannedDowntimeCard (T2-21)', () => {
  let container: HTMLDivElement | null = null
  let root: Root | null = null

  beforeEach(() => {
    vi.clearAllMocks()
    role.current = 'Technician'
    mockListProductDowntimes.mockResolvedValue(mockDowntimes)
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(async () => {
    if (root) {
      await act(async () => {
        root?.unmount()
      })
    }
    if (container && container.parentNode) {
      container.parentNode.removeChild(container)
    }
    container = null
    root = null
  })

  it('renders downtime list with reason badge, unit tag, and End now button', async () => {
    await act(async () => {
      root!.render(
        <PlannedDowntimeCard
          productId="prod-fx3"
          productName="Sony FX3"
          isSerialized={true}
          units={[{ id: 'unit-fx3-1', assetTag: 'CAM-01' }]}
        />,
      )
    })

    // Allow effects and state update
    await act(async () => {
      await new Promise((r) => setTimeout(r, 10))
    })

    expect(container!.textContent).toContain('Planned Downtime & Blocks')
    expect(container!.textContent).not.toContain('T2-21')
    expect(container!.textContent).not.toContain('(B10)')
    expect(container!.textContent).toContain('Unit CAM-01')
    expect(container!.textContent).toContain('Repair')
    expect(container!.textContent).toContain('Active Now')
    expect(container!.textContent).toContain('+ Plan Downtime')
    expect(container!.textContent).toContain('End now')
  })

  it('triggers endDowntime when End now is clicked', async () => {
    await act(async () => {
      root!.render(
        <PlannedDowntimeCard
          productId="prod-fx3"
          productName="Sony FX3"
          isSerialized={true}
          units={[{ id: 'unit-fx3-1', assetTag: 'CAM-01' }]}
        />,
      )
    })

    await act(async () => {
      await new Promise((r) => setTimeout(r, 10))
    })

    const buttons = Array.from(container!.querySelectorAll('button'))
    const endNowBtn = buttons.find((b) => b.textContent?.trim() === 'End now')
    expect(endNowBtn).toBeDefined()

    await act(async () => {
      endNowBtn!.click()
    })

    expect(mockEndDowntime).toHaveBeenCalledWith(
      { reservationId: 'dt-01' },
      { userId: 'u-tech', role: 'Technician' },
    )
    expect(mockShowSuccessToast).toHaveBeenCalledWith('Downtime ended immediately (dates freed).')
  })

  it('hides plan/end buttons for unauthorized roles (e.g. Driver)', async () => {
    role.current = 'Driver'

    await act(async () => {
      root!.render(
        <PlannedDowntimeCard
          productId="prod-fx3"
          productName="Sony FX3"
          isSerialized={true}
          units={[{ id: 'unit-fx3-1', assetTag: 'CAM-01' }]}
        />,
      )
    })

    await act(async () => {
      await new Promise((r) => setTimeout(r, 10))
    })

    expect(container!.textContent).not.toContain('+ Plan Downtime')
    expect(container!.textContent).not.toContain('End now')
  })
})
