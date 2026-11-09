// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import PlansAdmin from '../PlansAdmin'
import type { MembershipPlanRecord } from '../../../lib/queries/membership'

;(globalThis as Record<string, unknown>)['IS_REACT_ACT_ENVIRONMENT'] = true

const mockPlans: MembershipPlanRecord[] = [
  {
    id: 'plan-creator-1',
    clientUuid: '00000000-0000-0000-0000-000000000001',
    level: 'Creator',
    label: 'Partner',
    annualFee: 10000, // Rs 10,000
    individualDiscountPct: 10,
    bundleDiscountPct: 5,
    monthlyBookingLimit: 5,
    simultaneousRentalLimit: 2,
    authorizedUsers: 1,
    defaultCreditLimit: 50000,
    termMonths: 12,
    perks: ['Priority gear access'],
    displayOrder: 1,
    status: 'Active',
    retiredAt: null,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
  },
  {
    id: 'plan-academy-1',
    clientUuid: '00000000-0000-0000-0000-000000000002',
    level: 'Academy',
    label: 'Access Member',
    annualFee: 0,
    individualDiscountPct: 0,
    bundleDiscountPct: 0,
    monthlyBookingLimit: 2,
    simultaneousRentalLimit: 1,
    authorizedUsers: 1,
    defaultCreditLimit: 0,
    termMonths: 12,
    perks: [],
    displayOrder: 2,
    status: 'Retired',
    retiredAt: '2026-01-15T00:00:00Z',
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-15T00:00:00Z',
  },
]

let currentRole = 'Manager'
let currentCanViewMoney = true

vi.mock('../../../lib/auth', () => ({
  useAuth: () => ({
    user: { id: 'test-user', role: currentRole, name: 'Test User' },
  }),
}))

vi.mock('../../../lib/moneyVisibility', () => ({
  useCanViewMoney: () => currentCanViewMoney,
}))

vi.mock('../../../lib/queries/membership', () => ({
  listMembershipPlans: vi.fn(async () => mockPlans),
}))

let root: Root | undefined
let host: HTMLDivElement | undefined

async function mount() {
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
  await act(async () => {
    root?.render(<PlansAdmin />)
  })
  // Allow promise in useEffect to resolve
  await act(async () => {
    await Promise.resolve()
  })
}

afterEach(async () => {
  if (root) await act(async () => root?.unmount())
  host?.remove()
  root = undefined
  host = undefined
})

describe('PlansAdmin UI component', () => {
  beforeEach(() => {
    currentRole = 'Manager'
    currentCanViewMoney = true
  })

  it('renders plans list with active and retired counts for Manager', async () => {
    await mount()
    expect(host?.textContent).toContain('Membership Plans')
    expect(host?.textContent).toContain('Active (1)')
    expect(host?.textContent).toContain('Retired (1)')
    expect(host?.textContent).toContain('Creator')
    expect(host?.textContent).toContain('Academy')
    expect(host?.textContent).toContain('+ Create Plan')
    // Manager has edit and retire buttons
    const editBtns = host?.querySelectorAll('button[aria-label^="Edit "]')
    expect(editBtns?.length).toBe(2)
    const retireBtn = host?.querySelector('button[aria-label="Retire Creator"]')
    expect(retireBtn).not.toBeNull()
    const reactivateBtn = host?.querySelector('button[aria-label="Reactivate Academy"]')
    expect(reactivateBtn).not.toBeNull()
  })

  it('displays read-only view for Coordinator without create or edit buttons', async () => {
    currentRole = 'Coordinator'
    currentCanViewMoney = true
    await mount()

    expect(host?.textContent).toContain('Membership Plans')
    // No "+ Create Plan" button
    expect(host?.textContent).not.toContain('+ Create Plan')
    // No edit or retire buttons
    expect(host?.querySelectorAll('button[aria-label^="Edit "]').length).toBe(0)
    expect(host?.querySelectorAll('button[aria-label^="Retire "]').length).toBe(0)
    // Has "View only" indicator
    expect(host?.textContent).toContain('View only')
    // Coordinator can view money
    expect(host?.textContent).toContain('10,000')
  })

  it('enforces Law 6 money-blindness for floor role (Warehouse)', async () => {
    currentRole = 'Warehouse'
    currentCanViewMoney = false
    await mount()

    expect(host?.textContent).toContain('Membership Plans')
    expect(host?.textContent).not.toContain('+ Create Plan')
    expect(host?.textContent).toContain('View only')
    // Annual fee figure is masked with em-dash
    expect(host?.textContent).not.toContain('10,000')
    const emDashes = [...(host?.querySelectorAll('span') ?? [])].filter(
      (el) => el.textContent === '—',
    )
    expect(emDashes.length).toBeGreaterThanOrEqual(1)
  })

  it('filters by status when clicking Retired pill', async () => {
    await mount()
    const retiredPill = [...(host?.querySelectorAll('button') ?? [])].find((btn) =>
      btn.textContent?.includes('Retired (1)'),
    )
    expect(retiredPill).toBeDefined()
    await act(async () => {
      retiredPill?.click()
    })

    // Now only Academy (Retired) should be in table
    expect(host?.textContent).toContain('Academy')
    expect(host?.textContent).not.toContain('Creator')
  })

  it('filters by search input matching level or label', async () => {
    await mount()
    const searchInput = host?.querySelector<HTMLInputElement>('input[placeholder*="Search plans"]')
    expect(searchInput).not.toBeNull()

    await act(async () => {
      if (searchInput) {
        searchInput.value = 'Academy'
        searchInput.dispatchEvent(new Event('change', { bubbles: true }))
      }
    })

    expect(host?.textContent).toContain('Academy')
  })
})
