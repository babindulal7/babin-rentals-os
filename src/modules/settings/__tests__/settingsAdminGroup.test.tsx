// @vitest-environment jsdom
/**
 * Card 10 — Settings: 4 sections + Admin group (G-17).
 *
 * Verifies:
 * 1. Settings navigation shows: Business & Tax · Staff · Branches · Preferences.
 * 2. Admin group (Audit Trail, Activity Log, Numbering, Backup & Restore) renders
 *    only for Owner and Admin (ruling G-17, PERMISSIONS.md §2.1, §3).
 * 3. Non-admin roles (Manager, Coordinator, Accounts, Warehouse, Technician, Driver, Client)
 *    never see an Admin entry in navigation, header actions, or Preferences sections.
 * 4. Personal settings (language, text size, theme, density) remain reachable for every role (Q5).
 * 5. Deep links (?tab=business, ?tab=people, ?tab=branches, ?tab=system, ?tab=preferences, ?tab=staff)
 *    resolve properly without breaking.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { ToastProvider } from '../../../components/ui/Toast'
import type { SystemRole } from '../../../types/database'
import { ADMIN_GROUP_ITEMS, canAccessAdminGroup } from '../../../data/settings'

const navigateMock = vi.fn()
vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>()
  return {
    ...actual,
    useNavigate: () => navigateMock,
  }
})

const state = vi.hoisted(() => ({
  role: 'Owner' as SystemRole,
  viewport: 'desktop' as 'desktop' | 'tablet' | 'phone',
}))

vi.mock('../../../lib/device', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../lib/device')>()
  return {
    ...actual,
    useViewport: () => state.viewport,
  }
})

vi.mock('../../../lib/settingsSync', async () => {
  const store = await import('../../../lib/settingsStore')
  return {
    hydrateSharedSettings: () => Promise.resolve(),
    saveSettings: async (p: Parameters<typeof store.writeSettings>[0]) => store.writeSettings(p),
    resetSharedSettings: () => Promise.resolve(),
  }
})

vi.mock('../../../lib/moneyVisibility', async () => {
  const rbac = await import('../../../lib/rbac')
  return { useCanViewMoney: () => rbac.canViewMoney(state.role) }
})

vi.mock('../../../lib/auth', () => ({
  useAuth: () => ({
    user: { id: 'u-1', name: 'Babin Shrestha', role: state.role, isSharedDevice: false },
    loading: false,
    isLocked: false,
    staffPinStatus: () => Promise.resolve({ hasPin: false }),
    setStaffPin: () => Promise.resolve({ error: null }),
    revokeOwnStaffPin: () => Promise.resolve({ error: null }),
    verifyStaffPin: () => Promise.resolve({ ok: false, reason: 'no_pin' }),
    requestPasswordReset: () => Promise.resolve({ error: null }),
  }),
}))

vi.mock('../../../lib/queries/staff', () => ({
  fetchStaffDirectory: () => Promise.resolve({ kind: 'ok', rows: [] }),
  revokeStaffPinFor: () => Promise.resolve({ error: null }),
  recordPasswordResetRequest: () => Promise.resolve({ error: null }),
  setStaffRole: () => Promise.resolve({ error: null }),
  setStaffActive: () => Promise.resolve({ error: null }),
}))

window.matchMedia = ((q: string) => ({
  matches: false,
  media: q,
  onchange: null,
  addEventListener: () => {},
  removeEventListener: () => {},
  addListener: () => {},
  removeListener: () => {},
  dispatchEvent: () => false,
})) as unknown as typeof window.matchMedia

;(globalThis as Record<string, unknown>)['IS_REACT_ACT_ENVIRONMENT'] = true

const { default: Settings } = await import('../Settings')

let container: HTMLDivElement
let root: Root

async function mount(search = '') {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  await act(async () => {
    root.render(
      <MemoryRouter initialEntries={[`/settings${search}`]}>
        <ToastProvider>
          <Settings />
        </ToastProvider>
      </MemoryRouter>,
    )
  })
}

async function unmount() {
  if (root) {
    await act(async () => {
      root.unmount()
    })
  }
  container?.remove()
}

const navText = () => {
  const nav = container.querySelector('nav[aria-label="Settings sections"], [role="tablist"][aria-label="Settings sections"], .app-settings-mobile-list')
  return nav?.textContent ?? ''
}

describe('Card 10 / G-17: Settings sections and Admin group gating', () => {
  beforeEach(() => {
    navigateMock.mockClear()
    state.role = 'Owner'
    state.viewport = 'desktop'
  })

  afterEach(async () => {
    await unmount()
  })

  const ALL_ROLES: SystemRole[] = [
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

  it('canAccessAdminGroup helper correctly gates Owner and Admin only', () => {
    expect(canAccessAdminGroup('Owner')).toBe(true)
    expect(canAccessAdminGroup('Admin')).toBe(true)
    expect(canAccessAdminGroup('Manager')).toBe(false)
    expect(canAccessAdminGroup('Coordinator')).toBe(false)
    expect(canAccessAdminGroup('Accounts')).toBe(false)
    expect(canAccessAdminGroup('Warehouse')).toBe(false)
    expect(canAccessAdminGroup('Technician')).toBe(false)
    expect(canAccessAdminGroup('Driver')).toBe(false)
    expect(canAccessAdminGroup('Client')).toBe(false)
    expect(canAccessAdminGroup(null)).toBe(false)
    expect(canAccessAdminGroup(undefined)).toBe(false)
  })

  it('shows the 4 primary sections (Business & Tax, Staff, Branches, Preferences) to all staff roles', async () => {
    for (const role of ALL_ROLES) {
      state.role = role
      await mount()
      const t = navText()
      expect(t, `${role} sees Business & Tax`).toContain('Business & Tax')
      expect(t, `${role} sees Staff`).toContain('Staff')
      expect(t, `${role} sees Branches`).toContain('Branches')
      expect(t, `${role} sees Preferences`).toContain('Preferences')
      await unmount()
    }
  })

  it('Owner and Admin see the ADMIN group with all 4 items on desktop', async () => {
    for (const role of ['Owner', 'Admin'] as const) {
      state.role = role
      state.viewport = 'desktop'
      await mount()

      const t = navText()
      expect(t, `${role} sees ADMIN header`).toContain('ADMIN')
      for (const item of ADMIN_GROUP_ITEMS) {
        expect(t, `${role} sees ${item.label}`).toContain(item.label)
      }

      // Check header action link for audit log is present
      const auditLogHeaderLink = container.querySelector('a[href="/admin/audit"]')
      expect(auditLogHeaderLink, `${role} sees View audit log in header`).not.toBeNull()

      await unmount()
    }
  })

  it('Owner and Admin see the ADMIN group on phone and tablet', async () => {
    // Phone
    state.role = 'Owner'
    state.viewport = 'phone'
    await mount()
    let t = navText()
    expect(t).toContain('ADMIN')
    expect(t).toContain('Audit Trail')
    expect(t).toContain('Activity Log')
    expect(t).toContain('Numbering')
    expect(t).toContain('Backup & Restore')
    await unmount()

    // Tablet
    state.role = 'Admin'
    state.viewport = 'tablet'
    await mount()
    t = navText()
    expect(t).toContain('Audit Trail')
    expect(t).toContain('Activity Log')
    expect(t).toContain('Numbering')
    expect(t).toContain('Backup & Restore')
    await unmount()
  })

  it('Non-admin roles (Manager, Coordinator, Accounts, Warehouse, Technician, Driver, Client) see ZERO admin entries', async () => {
    const nonAdminRoles: SystemRole[] = [
      'Manager',
      'Coordinator',
      'Accounts',
      'Warehouse',
      'Technician',
      'Driver',
      'Client',
    ]

    for (const role of nonAdminRoles) {
      state.role = role
      state.viewport = 'desktop'
      await mount()

      const t = navText()
      expect(t, `${role} must not see ADMIN header`).not.toContain('ADMIN')
      expect(t, `${role} must not see Audit Trail`).not.toContain('Audit Trail')
      expect(t, `${role} must not see Activity Log`).not.toContain('Activity Log')
      expect(t, `${role} must not see Numbering`).not.toContain('Numbering')
      expect(t, `${role} must not see Backup & Restore`).not.toContain('Backup & Restore')

      // Must not see header audit link
      const auditLogHeaderLink = container.querySelector('a[href="/admin/audit"]')
      expect(auditLogHeaderLink, `${role} must not see View audit log in header`).toBeNull()

      await unmount()
    }
  })

  it('clicking an Admin group button navigates to the expected /admin/... route', async () => {
    state.role = 'Owner'
    state.viewport = 'desktop'
    await mount()

    const nav = container.querySelector('nav[aria-label="Settings sections"]')
    expect(nav).not.toBeNull()

    const buttons = Array.from(nav?.querySelectorAll('button') ?? [])
    for (const item of ADMIN_GROUP_ITEMS) {
      const btn = buttons.find((b) => b.textContent?.includes(item.label))
      expect(btn, `found button for ${item.label}`).toBeDefined()
      await act(async () => {
        btn?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
      })
      expect(navigateMock).toHaveBeenCalledWith(item.to)
    }
  })

  it('Preferences pane (?tab=system) conceals Administration section from non-admin roles', async () => {
    // For non-admin role
    state.role = 'Warehouse'
    await mount('?tab=system')
    expect(container.textContent).not.toContain('Administration')
    expect(container.textContent).not.toContain('Audit Log')
    expect(container.textContent).not.toContain('Numbering Sequences')
    await unmount()

    // For Owner
    state.role = 'Owner'
    await mount('?tab=system')
    expect(container.textContent).toContain('Administration')
    expect(container.textContent).toContain('Audit Log')
    expect(container.textContent).toContain('Numbering Sequences')
    await unmount()
  })

  it('personal settings (theme, density) remain reachable for all roles', async () => {
    for (const role of ALL_ROLES) {
      state.role = role
      await mount()

      const themeGroup = container.querySelector('[aria-label="Theme preference"]')
      expect(themeGroup, `${role} can reach theme preference`).not.toBeNull()

      const densityGroup = container.querySelector('[aria-label="Display density"]')
      expect(densityGroup, `${role} can reach display density`).not.toBeNull()

      await unmount()
    }
  })

  it('deep links resolve to appropriate tabs including preferences and staff aliases', async () => {
    state.role = 'Owner'

    await mount('?tab=business')
    expect(container.querySelector('.app-settings-pane-title')?.textContent).toBe('Business & Tax')
    await unmount()

    await mount('?tab=people')
    expect(container.querySelector('.app-settings-pane-title')?.textContent).toBe('Staff')
    await unmount()

    await mount('?tab=staff')
    expect(container.querySelector('.app-settings-pane-title')?.textContent).toBe('Staff')
    await unmount()

    await mount('?tab=branches')
    expect(container.querySelector('.app-settings-pane-title')?.textContent).toBe('Branches')
    await unmount()

    await mount('?tab=system')
    expect(container.querySelector('.app-settings-pane-title')?.textContent).toBe('Preferences')
    await unmount()

    await mount('?tab=preferences')
    expect(container.querySelector('.app-settings-pane-title')?.textContent).toBe('Preferences')
    await unmount()
  })
})
