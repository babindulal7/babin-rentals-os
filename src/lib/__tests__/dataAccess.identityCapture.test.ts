import 'fake-indexeddb/auto'
import { beforeEach, afterAll, describe, expect, it, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'

const api = vi.hoisted(() => ({ actor: 'operator-a', environment: 'project-a', switchProject: false, signedIn: true }))
vi.mock('../supabase', () => ({
  IS_MOCK: false,
  supabase: { from: () => {
    const fail = async () => {
      if (api.switchProject) api.environment = 'project-b'
      else api.actor = 'operator-b'
      api.signedIn = true
      return { data: null, error: { code: '408', message: 'Failed to fetch' } }
    }
    return { insert: fail, update: () => ({ eq: fail }) }
  } },
}))
vi.mock('../monitoring', () => ({ captureError: vi.fn() }))
vi.mock('../offlineIdentity', async original => {
  const real = await original<typeof import('../offlineIdentity')>()
  return { ownsOfflineWork: real.ownsOfflineWork, getOfflineSession: async () => api.signedIn ? ({
    actorId: api.actor, environment: api.environment, client: {} as SupabaseClient,
  }) : null }
})
import { idempotentInsert, safeUpdate } from '../dataAccess'
import { db, getPendingMutations } from '../offlineQueue'

beforeEach(async () => {
  vi.stubGlobal('window', { addEventListener: vi.fn() })
  vi.stubGlobal('navigator', { onLine: true })
  Object.assign(api, { actor: 'operator-a', environment: 'project-a', switchProject: false, signedIn: true })
  await db.mutations.clear(); await db.conflicts.clear(); await db.heldMutations.clear()
})
afterAll(async () => { await db.delete(); vi.unstubAllGlobals() })

describe('network fallback keeps the submitting offline identity', () => {
  it.each(['insert', 'update'] as const)('%s never puts A payload into B queue after a network delay', async action => {
    if (action === 'insert') await idempotentInsert('clients', { name: 'Private A note' } as never, { returnRow: false })
    else await safeUpdate('clients', 'client-a', { name: 'Private A note' } as never, 'action-a', { returnRow: false })
    expect(api.actor).toBe('operator-b')
    expect((await db.mutations.toArray())[0]).toMatchObject({ actorId: 'operator-a', environment: 'project-a' })
    expect(await getPendingMutations()).toEqual([])
  })
  it('does not retag a delayed request for another project', async () => {
    api.switchProject = true
    await idempotentInsert('clients', { name: 'Private project A' } as never, { returnRow: false })
    expect(api.environment).toBe('project-b')
    expect((await db.mutations.toArray())[0]).toMatchObject({ actorId: 'operator-a', environment: 'project-a' })
    expect(await getPendingMutations()).toEqual([])
  })
  it('cannot borrow a later login when the submitting identity was unavailable', async () => {
    api.signedIn = false
    await expect(idempotentInsert('clients', { name: 'Unverified work' } as never, { returnRow: false }))
      .rejects.toThrow('OFFLINE_IDENTITY_REQUIRED')
    expect(api.signedIn).toBe(true)
    expect(await db.mutations.count()).toBe(0)
  })
})
