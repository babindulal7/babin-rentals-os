// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { DeliveryWorkspace } from '../DeliveryWorkspace'

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

describe('DeliveryWorkspace — mock preview permission boundaries (T4-01)', () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    // The mock workspace reads getDeliveries() / localStorage, NOT
    // fetchDeliveries(). Never mock the wrong reader and claim the UI was tested.
    localStorage.removeItem('babin_rentals_deliveries_v1')
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => {
      root.unmount()
    })
    container.remove()
    vi.restoreAllMocks()
    localStorage.removeItem('babin_rentals_deliveries_v1')
  })

  it('Driver seat fails closed before verified assignment reads exist and hides all money/actions', async () => {
    mockCurrentUser = { id: 'usr-driver-1', name: 'Ramesh Thapa', role: 'Driver' }

    await act(async () => {
      root.render(
        <MemoryRouter>
          <DeliveryWorkspace />
        </MemoryRouter>,
      )
    })

    const text = container.textContent ?? ''
    expect(text).toContain('Assigned delivery records are unavailable until verified trip assignment access is connected.')
    // Never show unverified preview jobs as assigned deliveries.
    expect(text).not.toContain('DEL-2601')
    expect(text).not.toContain('DEL-2602')
    expect(text).not.toContain('Delivery Revenue')
    expect(text).not.toContain('Rs 3,500')
    expect(text).not.toContain('FEE')
    expect(text).not.toContain('+ New Dispatch')
    expect(text).not.toContain('Assign Driver')
    expect(text).not.toContain('Mark Failed')
    expect(text).not.toContain('Dispatch Now')
  })

  it('Coordinator sees clearly local preview data and money, but cannot mutate dispatches', async () => {
    mockCurrentUser = { id: 'usr-coord-1', name: 'Sita Coordinator', role: 'Coordinator' }

    await act(async () => {
      root.render(
        <MemoryRouter>
          <DeliveryWorkspace />
        </MemoryRouter>,
      )
    })

    const text = container.textContent ?? ''
    // The mock workspace reads getDeliveries(), whose bundled preview ids
    // are DEL-2601+, not the obsolete DEL-001 fake fetchDeliveries fixture.
    expect(text).toContain('DEL-2601')
    expect(text).toContain('DEL-2602')
    expect(text).toContain('DEL-2603')
    expect(text).toContain('Delivery Revenue')
    expect(text).toContain('FEE')
    // Coordinator has no conservative mock dispatch-write gate. A UI action
    // should not be shown until it can succeed through an authorized backend.
    expect(text).toContain('Your role cannot change delivery records.')
    expect(text).not.toContain('+ New Dispatch')
    expect(text).not.toContain('Assign Driver')
    expect(text).not.toContain('Mark Failed')
  })
})
