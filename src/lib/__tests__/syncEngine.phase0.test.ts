import { beforeEach, describe, expect, it, vi } from 'vitest'
const mocks = vi.hoisted(() => ({ summary: { total: 1, held: 1, failed: 0 } }))
vi.mock('../offlineQueue', () => ({ drainQueue: vi.fn(), getOfflineQueueSummary: async () => mocks.summary }))
vi.mock('../localStore', () => ({ isIndexedDbAvailable: () => true, localStore: {} }))
vi.mock('../monitoring', () => ({ captureError: vi.fn() }))
vi.mock('../supabase', () => ({supabase:{from:()=>({select:()=>({limit:async()=>({data:[],error:null})})})}}))
import { syncEngine } from '../syncEngine'
beforeEach(() => { vi.stubGlobal('navigator',{onLine:true}); mocks.summary = { total:1,held:1,failed:0 } })
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
})
