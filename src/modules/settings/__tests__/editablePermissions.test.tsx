// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import {
  resetPermissionCachesForTest,
  isCapabilityLockedForRole,
} from '../../../lib/permissionsStore'
import {
  canVoidInvoice,
  canViewMoney,
  canManageSettings,
  canBlockClient,
} from '../../../lib/rbac'
import {
  saveRolePermission,
  saveUserPermissionOverride,
  resetUserPermissionOverride,
} from '../../../actions/settings/permissions'

vi.mock('../../../lib/supabase', () => ({
  IS_MOCK: true,
  supabase: {
    from: () => ({ select: () => ({}) }),
    rpc: vi.fn().mockResolvedValue({ data: true, error: null }),
  },
}))

vi.mock('../../../lib/auth', () => ({
  useAuth: () => ({
    user: { id: 'owner-1', name: 'Babin', role: 'Owner' },
    session: null,
    loading: false,
  }),
}))

vi.mock('../sections/StaffDirectory', () => ({
  StaffDirectoryCard: () => <div data-testid="staff-dir-stub">Staff Directory</div>,
}))

import { UsersPane } from '../sections/UsersRoles'
import { ToastProvider } from '../../../components/ui/Toast'

describe('Editable Staff Permissions (0233 + Settings)', () => {
  beforeEach(() => {
    resetPermissionCachesForTest()
  })

  it('keeps Owner full-access and Law 6 money-blindness locked', async () => {
    expect(isCapabilityLockedForRole('Owner', 'settings.manage').locked).toBe(true)
    expect(isCapabilityLockedForRole('Warehouse', 'money.view').locked).toBe(true)
    expect(isCapabilityLockedForRole('Coordinator', 'invoice.void').locked).toBe(false)

    await expect(
      saveRolePermission({ role: 'Owner', capability: 'settings.manage', allowed: false }),
    ).rejects.toThrow(/Owner always retains full access/i)

    await expect(
      saveRolePermission({ role: 'Warehouse', capability: 'money.view', allowed: true }),
    ).rejects.toThrow(/money-blind/i)

    await expect(
      saveUserPermissionOverride({
        userId: 'wh-1',
        targetRole: 'Warehouse',
        capability: 'money.view',
        allowed: true,
      }),
    ).rejects.toThrow(/money-blind/i)

    expect(canManageSettings('Owner')).toBe(true)
    expect(canViewMoney('Warehouse')).toBe(false)
  })

  it('applies role overrides and per-staff overrides + reset', async () => {
    expect(canVoidInvoice('Coordinator')).toBe(false)
    await saveRolePermission({ role: 'Coordinator', capability: 'invoice.void', allowed: true })
    expect(canVoidInvoice('Coordinator')).toBe(true)

    expect(canBlockClient('Warehouse', 'wh-1')).toBe(false)
    await saveUserPermissionOverride({
      userId: 'wh-1',
      targetRole: 'Warehouse',
      capability: 'client.block',
      allowed: true,
    })
    expect(canBlockClient('Warehouse', 'wh-1')).toBe(true)
    // Other Warehouse users unaffected
    expect(canBlockClient('Warehouse', 'wh-2')).toBe(false)

    await resetUserPermissionOverride({ userId: 'wh-1', capability: 'client.block' })
    expect(canBlockClient('Warehouse', 'wh-1')).toBe(false)
  })
})

describe('UsersPane editable matrix UI', () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    resetPermissionCachesForTest()
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(async () => {
    await act(async () => {
      root.unmount()
    })
    container.remove()
  })

  it('lets Owner toggle an unlocked cell in the Permissions Matrix', async () => {
    await act(async () => {
      root.render(
        <MemoryRouter>
          <ToastProvider>
            <UsersPane />
          </ToastProvider>
        </MemoryRouter>,
      )
    })

    const toggleBtn = container.querySelector(
      'button[aria-label="Toggle Void invoice for Coordinator"]',
    ) as HTMLButtonElement | null
    expect(toggleBtn).toBeTruthy()
    expect(toggleBtn?.getAttribute('aria-pressed')).toBe('false')

    await act(async () => {
      toggleBtn?.click()
      await Promise.resolve()
    })

    expect(canVoidInvoice('Coordinator')).toBe(true)
    expect(toggleBtn?.getAttribute('aria-pressed')).toBe('true')
  })
})
