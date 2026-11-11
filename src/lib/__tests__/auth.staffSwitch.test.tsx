// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'

const fake = vi.hoisted(() => {
  const a = { user: { id: 'owner-user', email: 'owner@example.invalid', user_metadata: {} } }
  const b = {
    user: { id: 'warehouse-user', email: 'warehouse@example.invalid', user_metadata: {} },
    access_token: 'B-verified-access',
    refresh_token: 'B-rotated-refresh',
    expires_at: 4_102_444_800,
  }
  const state = {
    listener: null as ((event: string, session: typeof b | typeof a | null) => void) | null,
    session: a as typeof b | typeof a | null,
    pinResult: { ok: true } as Record<string, unknown>,
    pinGate: null as Promise<void> | null,
    purgeFailures: [] as string[],
    pending: 0,
    auditError: null as { message: string } | null,
    events: [] as string[],
    ownerRow: { id: 'owner-user', full_name: 'Owner', primary_role: 'Owner', is_active: true },
    warehouseRow: { id: 'warehouse-user', full_name: 'Warehouse', primary_role: 'Warehouse', is_active: true },
  }
  const setSession = vi.fn(async (pair: { access_token: string; refresh_token: string }) => {
    state.events.push('GLOBAL-ACTIVATE')
    if (pair.access_token !== b.access_token || pair.refresh_token !== b.refresh_token) {
      return { data: { session: null }, error: { message: 'invalid tokens' } }
    }
    state.session = b
    state.listener?.('SIGNED_IN', b)
    return { data: { session: b }, error: null }
  })
  const signOut = vi.fn(async () => {
    state.events.push('LOCAL-SIGN-OUT')
    state.session = null
    state.listener?.('SIGNED_OUT', null)
    return { error: null }
  })
  const isolated = {
    auth: {
      refreshSession: vi.fn(async (_arg: { refresh_token: string }) => {
        state.events.push('ISOLATED-REFRESH')
        return { data: { session: b, user: b.user }, error: null }
      }),
    },
    rpc: vi.fn(async (_name: string, _payload: unknown) => {
      state.events.push('ISOLATED-PIN')
      if (state.pinGate) await state.pinGate
      return { data: state.pinResult, error: null }
    }),
    from: (table: string) => {
      if (table === 'users') return {
        select: () => ({ eq: () => ({ maybeSingle: async () => {
          state.events.push('ISOLATED-PROFILE')
          return { data: state.warehouseRow, error: null }
        } }) }),
      }
      if (table === 'audit_events') return {
        insert: async (_row: unknown) => {
          state.events.push('ISOLATED-AUDIT')
          return { error: state.auditError }
        },
      }
      throw new Error('unexpected table')
    },
  }
  const supabase = {
    auth: {
      getSession: async () => ({ data: { session: state.session } }),
      onAuthStateChange: (cb: typeof state.listener) => {
        state.listener = cb
        return { data: { subscription: { unsubscribe: () => { state.listener = null } } } }
      },
      setSession,
      signOut,
      signInWithPassword: async () => ({ error: null }),
    },
    rpc: async () => ({ data: { has_pin: true }, error: null }),
    from: (_table: string) => ({
      select: () => ({ eq: () => ({ maybeSingle: async () => ({
        data: state.ownerRow, error: null,
      }) }) }),
    }),
  }
  return { state, a, b, isolated, supabase, setSession, signOut }
})
vi.mock('../supabase', () => ({
  supabase: fake.supabase, IS_MOCK: false,
  newClientUuid: () => '00000000-0000-4000-8000-000000000001',
  createStaffSwitchClient: () => fake.isolated,
}))
vi.mock('../authAudit', () => ({ recordLogin: () => {}, recordLogout: async () => {} }))
vi.mock('../settingsStore', () => ({ getSetting: () => 0 }))
vi.mock('../settingsSync', () => ({ hydrateSharedSettings: async () => {} }))
vi.mock('../languagePreferences', () => ({ hydrateUserLanguage: () => {} }))
vi.mock('../useSharedGlossary', () => ({ useSharedGlossary: () => {} }))
vi.mock('../devicePurge', () => ({
  purgeDeviceReadCaches: async () => {
    fake.state.events.push('PURGE-CACHE')
    return { failures: fake.state.purgeFailures, pendingLeft: fake.state.pending, cachesDeleted: [], tablesCleared: [] }
  },
}))
vi.mock('../deviceSession', () => ({
  getRoster: async () => [],
  storeSession: async () => { fake.state.events.push('STORE-ROTATED') },
  getAndDecryptSession: async () => 'stored-target-token',
  removeSession: async () => {},
  removeRosterEntry: async () => {},
  clearAllSessions: async () => {},
  clearRoster: async () => {},
  touchRosterEntry: async () => {},
  updateRosterLockout: async () => {},
  updateRosterPinStatus: async () => {},
  createRosterEntryFromUser: async () => {},
  onTokenRefreshed: async () => {},
}))

;(globalThis as Record<string, unknown>)['IS_REACT_ACT_ENVIRONMENT'] = true
const { AuthProvider, useAuth } = await import('../auth')
let root: Root
let container: HTMLDivElement
let latest: ReturnType<typeof useAuth> | null = null
function Probe() { latest = useAuth(); return null }

async function mount() {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  await act(async () => { root.render(<AuthProvider><Probe /></AuthProvider>) })
  expect(latest?.user?.id).toBe('owner-user')
}

beforeEach(() => {
  fake.state.listener = null
  fake.state.session = fake.a
  fake.state.pinResult = { ok: true }
  fake.state.pinGate = null
  fake.state.purgeFailures = []
  fake.state.pending = 0
  fake.state.auditError = null
  fake.state.events = []
  fake.setSession.mockClear()
  fake.signOut.mockClear()
})
afterEach(async () => {
  if (root) await act(async () => { root.unmount() })
  container?.remove()
})

describe('AuthProvider staff switch — global activation is last', () => {
  it('activates Warehouse only after PIN, cache purge and target-side audit', async () => {
    await mount()
    let resolvePin!: () => void
    fake.state.pinGate = new Promise<void>((r) => { resolvePin = r })
    let pending!: ReturnType<NonNullable<typeof latest>['switchUser']>
    await act(async () => { pending = latest!.switchUser('warehouse-user', '1234'); await Promise.resolve() })
    expect(fake.setSession).not.toHaveBeenCalled()
    expect(latest?.user).toBeNull()
    expect(latest?.limboState).not.toBe('idle')
    await act(async () => { resolvePin(); await pending })
    expect(fake.setSession).toHaveBeenCalledExactlyOnceWith({
      access_token: 'B-verified-access', refresh_token: 'B-rotated-refresh',
    })
    expect(latest?.user?.role).toBe('Warehouse')
    expect(latest?.user?.id).toBe('warehouse-user')
    expect(fake.state.events.indexOf('PURGE-CACHE')).toBeLessThan(fake.state.events.indexOf('GLOBAL-ACTIVATE'))
    expect(fake.state.events.indexOf('ISOLATED-AUDIT')).toBeLessThan(fake.state.events.indexOf('GLOBAL-ACTIVATE'))
  })

  it('bad PIN never activates target and signs out old Owner locally', async () => {
    await mount()
    fake.state.pinResult = { ok: false, reason: 'incorrect' }
    await act(async () => {
      expect((await latest!.switchUser('warehouse-user', '0000')).success).toBe(false)
    })
    expect(fake.setSession).not.toHaveBeenCalled()
    expect(fake.signOut).toHaveBeenCalledWith({ scope: 'local' })
    expect(latest?.user).toBeNull()
  })

  it('refuses to activate B while the old Owner has queued offline writes', async () => {
    await mount()
    fake.state.pending = 2
    await act(async () => {
      expect((await latest!.switchUser('warehouse-user', '1234')).success).toBe(false)
    })
    expect(fake.setSession).not.toHaveBeenCalled()
    expect(fake.signOut).toHaveBeenCalledWith({ scope: 'local' })
  })

  it('refuses to activate B if server audit denies attribution', async () => {
    await mount()
    fake.state.auditError = { message: 'permission denied' }
    await act(async () => {
      expect((await latest!.switchUser('warehouse-user', '1234')).success).toBe(false)
    })
    expect(fake.setSession).not.toHaveBeenCalled()
    expect(fake.signOut).toHaveBeenCalledWith({ scope: 'local' })
  })
})
