import { beforeEach, describe, expect, it, vi } from 'vitest'
const mocks = vi.hoisted(() => ({
  summary: { total: 1, held: 1, failed: 0 },
  token: 'test-token',
  signedIn: true,
  status: 200,
  from: vi.fn(),
  drain: vi.fn(),
}))
vi.mock('../offlineQueue', () => ({ drainQueue: mocks.drain, getOfflineQueueSummary: async () => mocks.summary, onQueueChange: vi.fn() }))
vi.mock('../localStore', () => ({ isIndexedDbAvailable: () => true, localStore: {} }))
vi.mock('../monitoring', () => ({ captureError: vi.fn() }))
vi.mock('../supabase', () => ({
  supabase: {
    auth: { getSession: async () => ({ data: { session: mocks.signedIn ? { user: { id: 'test-user' }, access_token: mocks.token } : null }, error: null }) },
    from: (table: string) => {
      mocks.from(table)
      const builder = {
        select: () => builder,
        order: () => builder,
        limit: async () => ({ data: [], error: mocks.status >= 400 ? { message: 'failed' } : null, status: mocks.status }),
      }
      return builder
    },
  },
}))
import { syncEngine } from '../syncEngine'
beforeEach(() => {
  vi.stubGlobal('navigator', { onLine: true })
  mocks.summary = { total: 1, held: 1, failed: 0 }
  mocks.signedIn = true
  mocks.status = 200
  mocks.token = 'test-token'
  mocks.from.mockClear()
  mocks.drain.mockClear()
})
describe('offline sync status never conceals preserved unsent work', () => {
  it('shows held work without exposing its contents or claiming sync completed', async () => {
    expect(await syncEngine.syncAll()).toMatchObject({success:false})
    expect(syncEngine.getState()).toMatchObject({status:'pending',pendingCount:1,error:expect.stringContaining('preserved')})
  })
  it('keeps dead-letter work visible', async () => {
    mocks.summary = {total:1,held:0,failed:1}
    expect(await syncEngine.syncAll()).toMatchObject({success:false})
    expect(syncEngine.getState()).toMatchObject({status:'pending',error:expect.stringContaining('review')})
  })
  it('reports synced only when no saved work remains', async () => {
    mocks.summary = {total:0,held:0,failed:0}
    expect(await syncEngine.syncAll()).toMatchObject({success:true})
    expect(syncEngine.getState()).toMatchObject({status:'synced',pendingCount:0,error:undefined})
  })
  it('does not read protected tables or drain the queue without a session', async () => {
    mocks.signedIn = false
    expect(await syncEngine.syncAll()).toMatchObject({success:false})
    expect(mocks.from).not.toHaveBeenCalled()
    expect(mocks.drain).not.toHaveBeenCalled()
  })
  it('stops on a rejected credential and resumes only with a different token', async () => {
    mocks.summary = { total:0, held:0, failed:0 }
    mocks.status = 401
    expect(await syncEngine.syncAll()).toMatchObject({success:false})
    expect(mocks.from).toHaveBeenCalledTimes(1)
    expect(syncEngine.getState().status).toBe('error')
    expect(await syncEngine.syncAll()).toMatchObject({success:false})
    expect(mocks.from).toHaveBeenCalledTimes(1)
    mocks.status = 200
    mocks.token = 'refreshed-token'
    expect(await syncEngine.syncAll()).toMatchObject({success:true})
    expect(mocks.from).toHaveBeenCalledTimes(4)
  })
  it('does not report success when a data query fails', async () => {
    mocks.summary = { total:0, held:0, failed:0 }
    mocks.status = 400
    expect(await syncEngine.syncAll()).toMatchObject({success:false})
    expect(syncEngine.getState().status).toBe('error')
  })
})
