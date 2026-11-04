// @vitest-environment jsdom
// =============================================================================
// src/modules/today/__tests__/RoleTaskCockpit.test.tsx — UI Tests (T5-11, W61, W79)
// =============================================================================

import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import RoleTaskCockpit from '../RoleTaskCockpit'
import type { SystemRole } from '../../../types/database'

const mockAuthUser = vi.hoisted(() => ({
  id: 'usr-wh-1',
  name: 'Raju Floor',
  role: 'Warehouse' as SystemRole,
}))

const mockNavigate = vi.fn()

vi.mock('../../../lib/auth', () => ({
  useAuth: () => ({ user: mockAuthUser, logout: vi.fn() }),
}))

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom')
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  }
})

;(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true

describe('RoleTaskCockpit Component (T5-11, W61, W79, W31)', () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
    mockNavigate.mockClear()
  })

  afterEach(() => {
    act(() => {
      root.unmount()
    })
    container.remove()
    vi.restoreAllMocks()
  })

  it('renders Warehouse floor queues with 4 floor verbs and W31 early morning priority (Law 6)', async () => {
    mockAuthUser.role = 'Warehouse'

    await act(async () => {
      root.render(
        <MemoryRouter>
          <RoleTaskCockpit />
        </MemoryRouter>
      )
    })

    // Allow async state resolution
    await act(async () => {
      await new Promise((r) => setTimeout(r, 50))
    })

    // Verify 4 floor task cards rendered
    expect(container.textContent).toContain('Floor Work Queues')
    expect(container.textContent).toContain('Pack Queue')
    expect(container.textContent).toContain('Handover Queue')
    expect(container.textContent).toContain('Return Queue')
    expect(container.textContent).toContain('Reset & QC Queue')

    // W31: Verify early return badge rendered
    expect(container.textContent).toContain('Early (<6 AM)')

    // Law 6: Verify zero monetary figures (no Rs, NPR, Paisa)
    expect(container.textContent).not.toContain('Rs')
    expect(container.textContent).not.toContain('NPR')
    expect(container.textContent).not.toContain('paisa')

    // Verify floor verbs have ≥ 56px touch target
    const buttons = container.querySelectorAll<HTMLButtonElement>('button')
    expect(buttons.length).toBe(4)
    buttons.forEach((btn) => {
      expect(btn.style.minHeight).toBe('56px')
    })

    // Verify 1-tap navigation works
    const packBtn = Array.from(buttons).find((b) => b.textContent?.includes('Pack Gear'))
    expect(packBtn).toBeDefined()
    await act(async () => {
      packBtn?.click()
    })
    expect(mockNavigate).toHaveBeenCalledWith('/operations?tab=pack')
  })

  it('renders Coordinator booking desk tasks (online requests, quotes waiting, movements)', async () => {
    mockAuthUser.role = 'Coordinator'

    await act(async () => {
      root.render(
        <MemoryRouter>
          <RoleTaskCockpit />
        </MemoryRouter>
      )
    })

    await act(async () => {
      await new Promise((r) => setTimeout(r, 50))
    })

    expect(container.textContent).toContain('Booking Desk & Coordination')
    expect(container.textContent).toContain('Online Requests')
    expect(container.textContent).toContain('Quotes Waiting')
    expect(container.textContent).toContain('Late Returns')

    const reviewBtn = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Review Requests')
    )
    expect(reviewBtn).toBeDefined()
    await act(async () => {
      reviewBtn?.click()
    })
    expect(mockNavigate).toHaveBeenCalledWith('/rentals')
  })

  it('renders Accounts cockpit with financial cards and closing status', async () => {
    mockAuthUser.role = 'Accounts'

    await act(async () => {
      root.render(
        <MemoryRouter>
          <RoleTaskCockpit />
        </MemoryRouter>
      )
    })

    await act(async () => {
      await new Promise((r) => setTimeout(r, 50))
    })

    expect(container.textContent).toContain('Financial Settlement & Invoices')
    expect(container.textContent).toContain('Payments Due')
    expect(container.textContent).toContain('Who Owes')
    expect(container.textContent).toContain('Daily Closing')

    // Accounts has money permissions: check that formatted figures appear
    expect(container.textContent).toContain('Rs')
  })

  it('renders Manager cockpit with approvals waiting, blocked gear, and movements (W57)', async () => {
    mockAuthUser.role = 'Manager'

    await act(async () => {
      root.render(
        <MemoryRouter>
          <RoleTaskCockpit />
        </MemoryRouter>
      )
    })

    await act(async () => {
      await new Promise((r) => setTimeout(r, 50))
    })

    expect(container.textContent).toContain('Operations & Approvals Control')
    expect(container.textContent).toContain('Approvals Inbox')
    expect(container.textContent).toContain('Late & Blocked')
    expect(container.textContent).toContain("Today's Movements")

    const approvalsBtn = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Open Approvals')
    )
    expect(approvalsBtn).toBeDefined()
    await act(async () => {
      approvalsBtn?.click()
    })
    expect(mockNavigate).toHaveBeenCalledWith('/approvals')
  })

  it('renders Owner executive cockpit with all four W79 blocks', async () => {
    mockAuthUser.role = 'Owner'

    await act(async () => {
      root.render(
        <MemoryRouter>
          <RoleTaskCockpit />
        </MemoryRouter>
      )
    })

    await act(async () => {
      await new Promise((r) => setTimeout(r, 50))
    })

    expect(container.textContent).toContain('Executive Cockpit (W79)')
    // 1. Approvals waiting
    expect(container.textContent).toContain('Approvals Waiting')
    // 2. Today's money (collected, owed, deposits held)
    expect(container.textContent).toContain("Today's Money")
    // 3. Late / blocked / damaged
    expect(container.textContent).toContain('Fleet Alerts')
    // 4. Business pulse (revenue, utilisation)
    expect(container.textContent).toContain('Business Pulse')

    const pulseBtn = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Open Pulse Report')
    )
    expect(pulseBtn).toBeDefined()
    await act(async () => {
      pulseBtn?.click()
    })
    expect(mockNavigate).toHaveBeenCalledWith('/reports/pulse')
  })

  it('renders Technician with identical floor task queues and zero money (Law 6)', async () => {
    mockAuthUser.role = 'Technician'

    await act(async () => {
      root.render(
        <MemoryRouter>
          <RoleTaskCockpit />
        </MemoryRouter>
      )
    })

    await act(async () => {
      await new Promise((r) => setTimeout(r, 50))
    })

    expect(container.textContent).toContain('Floor Work Queues')
    expect(container.textContent).toContain('Pack Queue')
    expect(container.textContent).not.toContain('Rs')
  })

  it('renders Driver transport tasks with delivery and pickup counts and zero money (Law 6)', async () => {
    mockAuthUser.role = 'Driver'

    await act(async () => {
      root.render(
        <MemoryRouter>
          <RoleTaskCockpit />
        </MemoryRouter>
      )
    })

    await act(async () => {
      await new Promise((r) => setTimeout(r, 50))
    })

    expect(container.textContent).toContain('Delivery Dispatch Board')
    expect(container.textContent).toContain("Today's Deliveries")
    expect(container.textContent).toContain('Pending Pickups')
    expect(container.textContent).not.toContain('Rs')
  })

  it('renders Client portal deck with active rentals and zero money figures (Law 6)', async () => {
    mockAuthUser.role = 'Client'

    await act(async () => {
      root.render(
        <MemoryRouter>
          <RoleTaskCockpit />
        </MemoryRouter>
      )
    })

    await act(async () => {
      await new Promise((r) => setTimeout(r, 50))
    })

    expect(container.textContent).toContain('My Equipment & Bookings')
    expect(container.textContent).toContain('Active Rentals')
    expect(container.textContent).not.toContain('Rs')
  })
})
