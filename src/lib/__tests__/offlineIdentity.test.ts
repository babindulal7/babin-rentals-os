import { beforeEach, describe, expect, it, vi } from 'vitest'
const mocks = vi.hoisted(() => ({ getSession: vi.fn(), createClient: vi.fn(), isMock: false }))
vi.mock('../supabase', () => ({ get IS_MOCK() { return mocks.isMock }, supabase: { auth: { getSession: mocks.getSession } } }))
vi.mock('@supabase/supabase-js', () => ({ createClient: mocks.createClient }))
import { getOfflineSession, ownsOfflineWork } from '../offlineIdentity'
beforeEach(() => {
  vi.stubEnv('VITE_SUPABASE_URL','https://project-a.supabase.co')
  vi.stubEnv('VITE_SUPABASE_ANON_KEY','public-anon-key')
  vi.clearAllMocks()
  mocks.isMock = false
})
describe('offline replay credential boundary', () => {
  it('captures the submitting token rather than consulting the next session on request', async () => {
    const session = { user:{id:'operator-a'},access_token:'a-token' }
    mocks.getSession.mockResolvedValue({data:{session},error:null})
    mocks.createClient.mockReturnValue({from:vi.fn()})
    const result = await getOfflineSession()
    session.access_token = 'replaced-session-token'
    mocks.getSession.mockResolvedValue({data:{session:{user:{id:'operator-b'},access_token:'b-token'}},error:null})
    const options = mocks.createClient.mock.calls[0]?.[2] as {accessToken:()=>Promise<string>}
    expect(await options.accessToken()).toBe('a-token')
    expect(result).toMatchObject({actorId:'operator-a',environment:'https://project-a.supabase.co'})
    expect(ownsOfflineWork({actorId:'operator-b',environment:result!.environment},result!)).toBe(false)
  })
  it('refuses an absent session or session read failure', async () => {
    mocks.getSession.mockResolvedValue({data:{session:null},error:null})
    expect(await getOfflineSession()).toBeNull()
    mocks.getSession.mockResolvedValue({data:{session:{user:{id:'a'},access_token:'token'}},error:new Error('expired')})
    expect(await getOfflineSession()).toBeNull()
    expect(mocks.createClient).not.toHaveBeenCalled()
  })
  it('requires a captured access token for a live session', async () => {
    mocks.getSession.mockResolvedValue({data:{session:{user:{id:'a'}}},error:null})
    expect(await getOfflineSession()).toBeNull()
    expect(mocks.createClient).not.toHaveBeenCalled()
  })
  it('scopes explicit local mock sessions without inventing live credentials', async () => {
    mocks.isMock = true
    mocks.getSession.mockResolvedValue({data:{session:{user:{id:'mock-owner'}}},error:null})
    expect(await getOfflineSession()).toMatchObject({actorId:'mock-owner',environment:'mock'})
    expect(mocks.createClient).not.toHaveBeenCalled()
  })
})
