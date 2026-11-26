// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { DeliveryZonesControl } from '../DeliveryZonesControl'
import { listDeliveryZones } from '../../../../actions/deliveryZones/listDeliveryZones'
import type { SystemRole } from '../../../../types/database'

;(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true

/* Mutable so one file can pin both sides of the T4-07 gate: Coordinator is
   refused (build note 3), Owner is admitted, and the fee row is masked for a
   money-blind role (Law 6). The real `lib/rbac` is NOT mocked. */
const { authState } = vi.hoisted(() => ({
  authState: { role: 'Coordinator' as SystemRole },
}))

vi.mock('../../../../lib/auth', () => ({
  useAuth: () => ({ user: { role: authState.role } }),
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
    authState.role = 'Coordinator'
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

  /** Fresh mount so a role change is actually read (the auth mock is static). */
  const remount = async () => {
    if (root) {
      act(() => {
        root?.unmount()
      })
    }
    container?.remove()
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
    await act(async () => {
      root?.render(<DeliveryZonesControl />)
    })
  }

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
    expect(container?.textContent).toContain('Rs 3,500')
  })

  it('hides Add zone from Coordinator — Owner · Admin · Manager only (T4-07 build note 3)', async () => {
    await remount()
    expect(container?.textContent).not.toContain('Add zone')
    // The empty-state call to action follows the same gate: a refused role is
    // not offered a button it cannot complete.
    expect(container?.textContent).not.toContain('Create first zone')
  })

  it.each(['Manager', 'Owner'] as const)('shows Add zone to %s — a zone writer', async (role) => {
    authState.role = role
    await remount()
    expect(container?.textContent).toContain('Add zone')
    expect(container?.textContent).toContain('Create first zone')
  })

  it('shows no fee figure when the row arrives with a null fee (Law 6)', async () => {
    authState.role = 'Warehouse'
    mockListDeliveryZones.mockResolvedValue({
      zones: [{ id: 'zone-1', name: 'Ring Road', description: null, fee_paisa: null, is_active: true, created_at: '', updated_at: '' }],
    } as any)
    await remount()
    expect(container?.textContent).toContain('Ring Road')
    expect(container?.textContent).not.toContain('Rs')
    expect(container?.textContent).toContain('—')
  })
})
