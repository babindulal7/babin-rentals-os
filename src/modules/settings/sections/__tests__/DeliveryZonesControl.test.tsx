// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { DeliveryZonesControl } from '../DeliveryZonesControl'
import { listDeliveryZones } from '../../../../actions/deliveryZones/listDeliveryZones'

;(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true

vi.mock('../../../../lib/auth', () => ({
  useAuth: () => ({ user: { role: 'Coordinator' } }),
}))

vi.mock('../../../../lib/rbac', () => ({
  canManageSettings: () => true,
}))

vi.mock('../../../../actions/deliveryZones/listDeliveryZones', () => ({
  listDeliveryZones: vi.fn(),
}))

vi.mock('../../../../components/ui/Toast', () => ({
  useToast: () => ({
    showSuccessToast: vi.fn(),
  }),
}))

const mockListDeliveryZones = vi.mocked(listDeliveryZones)

describe('DeliveryZonesControl', () => {
  let container: HTMLDivElement | null = null
  let root: Root | null = null

  beforeEach(() => {
    vi.clearAllMocks()
    mockListDeliveryZones.mockResolvedValue({ zones: [] } as any)
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(() => {
    if (root) {
      act(() => {
        root?.unmount()
      })
    }
    container?.remove()
    container = null
    root = null
  })

  it('renders loading state initially', async () => {
    mockListDeliveryZones.mockImplementation(() => new Promise(() => {}))
    await act(async () => {
      root?.render(<DeliveryZonesControl />)
    })
    expect(container?.textContent).toContain('Loading delivery zones…')
  })

  it('shows empty state when no zones exist', async () => {
    mockListDeliveryZones.mockResolvedValue({ zones: [] } as any)
    await act(async () => {
      root?.render(<DeliveryZonesControl />)
    })
    expect(container?.textContent).toContain('No delivery zones yet')
  })

  it('displays zones in a list', async () => {
    const mockZones = [
      { id: 'zone-1', name: 'Ring Road', description: 'Inside Ring Road', fee_paisa: 350000, is_active: true, created_at: '', updated_at: '' },
      { id: 'zone-2', name: 'Outside Valley', description: 'Outside Kathmandu Valley', fee_paisa: 0, is_active: true, created_at: '', updated_at: '' },
    ]
    mockListDeliveryZones.mockResolvedValue({ zones: mockZones } as any)
    await act(async () => {
      root?.render(<DeliveryZonesControl />)
    })
    expect(container?.textContent).toContain('Ring Road')
    expect(container?.textContent).toContain('Outside Valley')
  })
})
