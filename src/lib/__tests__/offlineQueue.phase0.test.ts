import 'fake-indexeddb/auto'
import Dexie from 'dexie'
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'

const api = vi.hoisted(() => ({
  actor: 'operator-a', environment: 'https://project-a.supabase.co', signedIn: true,
  updateRow: null as { id: string } | null,
  insertRow: { id: 'inserted-row' } as { id: string } | null,
  duplicate: false, duplicateRow: null as Record<string, unknown> | null,
  calls: [] as Array<{ actor: string; action: string }>, switchOnRead: false,
}))
vi.mock('../supabase', () => ({ supabase: { from: vi.fn() } }))
vi.mock('../monitoring', () => ({ captureError: vi.fn() }))
vi.mock('../offlineIdentity', async importOriginal => {
  const original = await importOriginal<typeof import('../offlineIdentity')>()
  return {
    ownsOfflineWork: original.ownsOfflineWork,
    getOfflineSession: async () => {
      if (!api.signedIn) return null
      const actor = api.actor
      const client = {
        from: () => ({
          select: (columns: string) => ({ eq: () => ({ maybeSingle: async () => {
            api.calls.push({ actor, action: 'read' })
            if (api.switchOnRead) api.actor = 'operator-b'
            return { data: columns.includes('updated_at') ? null : api.duplicateRow, error: null }
          } }) }),
          update: () => ({ eq: () => ({ select: () => ({ maybeSingle: async () => {
            api.calls.push({ actor, action: 'update' }); return { data: api.updateRow, error: null }
          } }) }) }),
          insert: () => ({ select: () => ({ maybeSingle: async () => {
            api.calls.push({ actor, action: 'insert' })
            return { data: api.insertRow, error: api.duplicate ? { code: '23505', message: 'scan_events_client_uuid_key' } : null }
          } }) }),
        }),
      } as unknown as SupabaseClient
      return { actorId: actor, environment: api.environment, client }
    },
  }
})
import { db, drainQueue, enqueueMutation, ensureMutationQueued, getPendingMutations, getOfflineQueueSummary, resolveConflict } from '../offlineQueue'

beforeEach(async () => {
  vi.stubGlobal('window', { addEventListener: vi.fn() })
  vi.stubGlobal('navigator', { onLine: true })
  await db.mutations.clear(); await db.conflicts.clear(); await db.heldMutations.clear()
  Object.assign(api, { actor: 'operator-a', environment: 'https://project-a.supabase.co', signedIn: true,
    updateRow: null, insertRow: { id: 'inserted-row' }, duplicate: false, duplicateRow: null, calls: [], switchOnRead: false })
})
afterAll(async () => { await db.delete(); vi.unstubAllGlobals() })

async function queueUpdate() {
  await ensureMutationQueued('clients', 'update', { id: 'client-1', name: 'Revised' }, 'action-1')
  return (await db.mutations.toArray())[0]!
}

describe('Phase 0 offline ownership and authoritative replay receipts', () => {
  it('persists submitting account/project without credentials', async () => {
    const work = await queueUpdate()
    expect(work).toMatchObject({ actorId: 'operator-a', environment: 'https://project-a.supabase.co' })
    expect(JSON.stringify(work)).not.toMatch(/access_token|refresh_token/)
  })
  it('requires an identity before accepting offline work', async () => {
    api.signedIn = false
    await expect(queueUpdate()).rejects.toMatchObject({ code: 'OFFLINE_IDENTITY_REQUIRED' })
    expect(await db.mutations.count()).toBe(0)
  })
  it('does not replay A work or expose its payload to signed-in B', async () => {
    await queueUpdate(); api.actor = 'operator-b'
    expect(await getPendingMutations()).toEqual([])
    await drainQueue()
    expect(api.calls).toEqual([]); expect(await db.mutations.count()).toBe(1)
    await expect(ensureMutationQueued('clients','update',{id:'client-1',name:'Revised'},'action-1'))
      .rejects.toMatchObject({code:'OFFLINE_MUTATION_CONFLICT'})
  })
  it('does not replay same user work against a different project', async () => {
    await queueUpdate(); api.environment = 'https://project-b.supabase.co'
    await drainQueue(); expect(api.calls).toEqual([]); expect(await db.mutations.count()).toBe(1)
  })
  it('preserves unattributed legacy work without assigning it to the next login', async () => {
    await db.mutations.add({ clientUuid:'legacy', table:'clients', action:'update', payload:{id:'legacy'}, timestamp:new Date().toISOString(), status:'pending' })
    await drainQueue(); expect(api.calls).toEqual([])
    expect(await getOfflineQueueSummary()).toEqual({total:1,held:1,failed:0})
    expect((await db.mutations.toArray())[0]).not.toHaveProperty('actorId')
  })
  it('retains zero-row updates for review/retry', async () => {
    await queueUpdate(); await drainQueue()
    expect(await db.mutations.count()).toBe(1)
    expect((await db.mutations.toArray())[0]).toMatchObject({status:'pending',retryCount:1,error:expect.stringContaining('did not confirm')})
  })
  it('removes only a positively confirmed matching update', async () => {
    await queueUpdate(); api.updateRow={id:'client-1'}; await drainQueue()
    expect(await db.mutations.count()).toBe(0)
  })
  it('keeps the original account credentials when the UI account switches during a read', async () => {
    await queueUpdate(); api.updateRow={id:'client-1'}; api.switchOnRead=true; await drainQueue()
    expect(api.actor).toBe('operator-b')
    expect(api.calls.filter(c=>c.action==='update')).toEqual([{actor:'operator-a',action:'update'}])
  })
  it('does not acknowledge an insert with an empty receipt', async () => {
    await enqueueMutation('scan_events','insert',{client_uuid:'insert-1'},'insert-1'); api.insertRow=null
    await drainQueue(); expect(await db.mutations.count()).toBe(1)
  })
  it('does not discard a duplicate insert that cannot be read back', async () => {
    await enqueueMutation('scan_events','insert',{client_uuid:'insert-1'},'insert-1'); api.duplicate=true
    await drainQueue(); expect(await db.mutations.count()).toBe(1)
  })
  it('resolves only a duplicate whose returned data matches the same write', async () => {
    await enqueueMutation('scan_events','insert',{client_uuid:'insert-1'},'insert-1'); api.duplicate=true
    api.duplicateRow={id:'inserted-row',client_uuid:'insert-1'}
    await drainQueue(); expect(await db.mutations.count()).toBe(0)
  })
  it('retains conflict and work when force-local updates zero rows', async () => {
    const work=await queueUpdate()
    const id=await db.conflicts.add({mutationId:work.id!,clientUuid:work.clientUuid,table:'clients',recordId:'client-1',localChanges:{name:'Revised'},remoteState:{name:'Server'},detectedAt:new Date().toISOString(),status:'unresolved'})
    await expect(resolveConflict(id,'force_local','spoofed-user')).rejects.toThrow('did not confirm')
    expect(await db.mutations.count()).toBe(1); expect((await db.conflicts.get(id))?.status).toBe('unresolved')
    api.actor='operator-b'
    await expect(resolveConflict(id,'keep_server')).rejects.toThrow('another or an unverified identity')
    expect(await db.mutations.count()).toBe(1)
  })
  it('upgrades a v1 queue without losing duplicate pending payloads', async () => {
    await db.delete()
    const legacy = new Dexie('BabinOfflineQueue')
    legacy.version(1).stores({mutations:'++id, clientUuid, table, status, timestamp'})
    const original={clientUuid:'duplicate-key',table:'clients',action:'update',timestamp:new Date().toISOString(),status:'pending'}
    await legacy.table('mutations').bulkAdd([
      {...original,payload:{id:'c1',name:'First saved text'}},
      {...original,payload:{id:'c1',name:'Second saved text'}},
    ])
    legacy.close()
    await db.open()
    const replay=await db.mutations.toArray(), preserved=await db.heldMutations.toArray()
    expect(replay).toHaveLength(1); expect(preserved).toHaveLength(1)
    expect(replay[0]?.payload.name).toBe('First saved text')
    expect(preserved[0]).toMatchObject({clientUuid:'duplicate-key',payload:{id:'c1',name:'Second saved text'}})
    expect(await getOfflineQueueSummary()).toEqual({total:2,held:2,failed:0})
    await drainQueue(); expect(api.calls).toEqual([])
    expect(await db.heldMutations.count()).toBe(1)
  })

})
