// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import {
  canConfirmRental,
  canCreateBooking,
  canCreateClient,
  canWriteBookingDesk,
  type Role as StaffRole,
} from '../../../lib/rbac'
import { ActionPermissionError, createAction, type ActionContext } from '../../../actions/core'
import { CREATION_ACTIONS } from '../../../components/ui/creation/CreationActionRegistry'
import { QuickCreateMenu } from '../../../components/shell/QuickCreateMenu'

const ALL_ROLES: StaffRole[] = [
  'Owner',
  'Admin',
  'Manager',
  'Coordinator',
  'Accounts',
  'Warehouse',
  'Technician',
  'Driver',
  'Client',
]

function ctxFor(role: StaffRole): ActionContext {
  return {
    userId: '00000000-0000-4000-8000-00000000e007',
    role,
    isOnline: true,
  }
}

async function isCapabilityAllowed(ctx: ActionContext, capability: string): Promise<boolean> {
  const probe = createAction<void, boolean>({
    name: `probe:${capability}`,
    implemented: true,
    permissions: [capability],
    validate: async () => {},
    execute: async () => ({ result: true, events: [] }),
  })
  try {
    return await probe(undefined, ctx)
  } catch (err) {
    if (err instanceof ActionPermissionError) return false
    throw err
  }
}

vi.mock('../../../actions/rentals/saveDraft', () => ({
  saveDraft: vi.fn(),
  fetchRentalDraft: vi.fn(),
  convertDraft: vi.fn(),
  cancelDraft: vi.fn(),
}))
vi.mock('../../../lib/auth', () => ({
  useAuth: () => ({
    user: { id: '00000000-0000-4000-8000-00000000e007', name: 'Technician', role: 'Technician', isSharedDevice: false },
    loading: false,
    isLocked: false,
  }),
}))
vi.mock('../../../components/ui/Toast', () => ({ useToast: () => ({ showSuccessToast: vi.fn() }) }))
vi.mock('../../../lib/network', () => ({ useNetwork: () => true }))
vi.mock('../../../lib/device', () => ({
  useViewport: () => 'desktop',
  useCapability: () => ({ coarsePointer: false, hasHover: true, standalone: false, reducedMotion: false }),
}))
vi.mock('../../../lib/supabase', () => ({
  IS_MOCK: false,
  newClientUuid: () => '00000000-0000-4000-8000-000000000000',
  supabase: { from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }) }) },
}))
vi.mock('../../../lib/queries/clients', async (importOriginal) => {
  const real = await importOriginal<typeof import('../../../lib/queries/clients')>()
  return { ...real, listClientRecords: async () => [] }
})
vi.mock('../../../lib/queries/inventory', async (importOriginal) => {
  const real = await importOriginal<typeof import('../../../lib/queries/inventory')>()
  return { ...real, listInventory: async () => ({ rows: [], total: 0 }) }
})

window.matchMedia = ((query: string) => ({
  matches: false,
  media: query,
  onchange: null,
  addEventListener: () => {},
  removeEventListener: () => {},
  addListener: () => {},
  removeListener: () => {},
  dispatchEvent: () => false,
})) as unknown as typeof window.matchMedia

import NewRental from '../NewRental'

describe('Technician New Rental (Card 6: G-10, G-18)', () => {
  it('enforces the 9-role matrix for canCreateBooking, canConfirmRental, and desk capabilities', async () => {
    const createAllowed = new Set<StaffRole>(['Owner', 'Admin', 'Manager', 'Coordinator', 'Warehouse', 'Technician'])
    const deskAllowed = new Set<StaffRole>(['Owner', 'Admin', 'Manager', 'Coordinator', 'Warehouse'])

    for (const role of ALL_ROLES) {
      expect(canCreateBooking(role), `canCreateBooking(${role})`).toBe(createAllowed.has(role))
      expect(canConfirmRental(role), `canConfirmRental(${role})`).toBe(createAllowed.has(role))
      expect(canWriteBookingDesk(role), `canWriteBookingDesk(${role})`).toBe(deskAllowed.has(role))
    }

    const tech = ctxFor('Technician')
    expect(await isCapabilityAllowed(tech, 'rental.create')).toBe(true)
    expect(await isCapabilityAllowed(tech, 'rental.confirm')).toBe(true)
    expect(await isCapabilityAllowed(tech, 'rental.cancel')).toBe(false)
    expect(await isCapabilityAllowed(tech, 'rental.extend')).toBe(false)
    expect(await isCapabilityAllowed(tech, 'rental.draft')).toBe(false)
    expect(await isCapabilityAllowed(tech, 'client.create')).toBe(false)
    expect(await isCapabilityAllowed(tech, 'subrental.create')).toBe(false)
    expect(canCreateClient('Technician')).toBe(false)
  })

  it('exposes New Rental in CreationActionRegistry and QuickCreateMenu for Technician', async () => {
    const newRentalAction = CREATION_ACTIONS.find((a) => a.id === 'rental.new')
    expect(newRentalAction).toBeDefined()
    expect(newRentalAction?.isPermitted('Technician')).toBe(true)
    expect(newRentalAction?.isPermitted('Driver')).toBe(false)

    const container = document.createElement('div')
    document.body.appendChild(container)
    const root = createRoot(container)
    try {
      await act(async () => {
        root.render(
          <MemoryRouter>
            <QuickCreateMenu role="Technician" />
          </MemoryRouter>,
        )
      })
      const trigger = container.querySelector('button[aria-haspopup="menu"]') as HTMLButtonElement | null
      expect(trigger).not.toBeNull()
      await act(async () => {
        trigger?.click()
      })
      expect(container.textContent).toContain('New Rental')
      expect(container.textContent).not.toContain('Add Client')
    } finally {
      await act(async () => root.unmount())
      container.remove()
    }
  })

  it('renders NewRental for Technician without money, totals, discount, or deposit figures in DOM', async () => {
    const container = document.createElement('div')
    document.body.appendChild(container)
    const root = createRoot(container)
    try {
      await act(async () => {
        root.render(
          <MemoryRouter>
            <NewRental />
          </MemoryRouter>,
        )
      })

      const text = container.textContent ?? ''
      expect(text).toContain('Rental period')
      expect(text).toContain('Equipment, Bundles & Services')
      expect(text).toContain('Confirm Booking')

      // Law 6 money-blindness: prices hidden, no non-zero currency, totals, discount, or deposit amounts rendered
      expect(text).toContain('Prices are hidden for your role.')
      expect(text).not.toMatch(/\bRs\.?\s*[1-9]/i)
      expect(text).not.toMatch(/\bNPR\b/i)
      expect(text).not.toMatch(/Rental Total/i)
      expect(text).not.toMatch(/Subtotal/i)
      expect(text).not.toMatch(/Discount/i)
      expect(text).not.toMatch(/Security Deposit/i)
    } finally {
      await act(async () => root.unmount())
      container.remove()
    }
  })
})
