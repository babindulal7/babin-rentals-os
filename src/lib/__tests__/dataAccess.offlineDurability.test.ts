/**
 * Regression: offline/network fallback must never claim a durable queued write
 * unless the IndexedDB outbox has accepted or confirmed the same mutation.
 * No live database connections are made by these tests.
 */
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  ensureMutationQueued: vi.fn(),
  insertResult: { data: null as unknown, error: null as null | { code: string; message: string } },
  updateResult: { data: null as unknown, error: null as null | { code: string; message: string } },
  from: vi.fn(),
}))

vi.mock('../offlineQueue', () => ({
  ensureMutationQueued: mocks.ensureMutationQueued,
}))
vi.mock('../monitoring', () => ({ captureError: vi.fn() }))
vi.mock('../offlineIdentity', () => ({
  getOfflineSession: async () => ({ actorId: 'operator-a', environment: 'project-a' }),
}))
vi.mock('../supabase', () => ({
  IS_MOCK: false,
  supabase: {
    from: mocks.from,
  },
}))

import { idempotentInsert, safeUpdate } from '../dataAccess'

const unableToQueue = new Error('OFFLINE_STORAGE_UNAVAILABLE: nothing was saved')
const networkFailure = { code: '408', message: 'Failed to fetch' }

function insert() {
  return idempotentInsert('clients', { name: 'Example' } as never, { returnRow: false })
}
function update() {
  return safeUpdate('clients', 'client-1', { name: 'Revised' } as never, 'action-1', { returnRow: false })
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.insertResult = { data: null, error: null }
  mocks.updateResult = { data: null, error: null }
  mocks.ensureMutationQueued.mockResolvedValue('added')
  mocks.from.mockImplementation(() => ({
    insert: () => Promise.resolve(mocks.insertResult),
    update: () => ({ eq: () => Promise.resolve(mocks.updateResult) }),
  }))
})

afterEach(() => vi.unstubAllGlobals())

describe('dataAccess offline durability gate', () => {
  it('rejects offline insert when outbox storage is unavailable', async () => {
    vi.stubGlobal('navigator', { onLine: false })
    mocks.ensureMutationQueued.mockRejectedValueOnce(unableToQueue)
    await expect(insert()).rejects.toThrow('OFFLINE_STORAGE_UNAVAILABLE')
    expect(mocks.from).not.toHaveBeenCalled()
  })

  it('rejects offline update when outbox storage is unavailable', async () => {
    vi.stubGlobal('navigator', { onLine: false })
    mocks.ensureMutationQueued.mockRejectedValueOnce(unableToQueue)
    await expect(update()).rejects.toThrow('OFFLINE_STORAGE_UNAVAILABLE')
    expect(mocks.from).not.toHaveBeenCalled()
  })

  it('returns queued only after offline insert is accepted by the durable outbox', async () => {
    vi.stubGlobal('navigator', { onLine: false })
    expect(await insert()).toMatchObject({ queued: true, error: null })
    expect(mocks.ensureMutationQueued).toHaveBeenCalledWith('clients', 'insert', expect.any(Object), expect.any(String), { actorId: 'operator-a', environment: 'project-a' })
  })

  it('allows repeat update of the same action only when the queue confirmed a duplicate', async () => {
    vi.stubGlobal('navigator', { onLine: false })
    mocks.ensureMutationQueued.mockResolvedValueOnce('already_queued')
    expect(await update()).toMatchObject({ queued: true, error: null })
    expect(mocks.ensureMutationQueued).toHaveBeenCalledWith(
      'clients', 'update', { name: 'Revised', id: 'client-1' }, 'action-1:client-1', { actorId: 'operator-a', environment: 'project-a' },
    )
  })

  it('rejects network-failure insert fallback when durable outbox fails', async () => {
    vi.stubGlobal('navigator', { onLine: true })
    mocks.insertResult = { data: null, error: networkFailure }
    mocks.ensureMutationQueued.mockRejectedValueOnce(unableToQueue)
    await expect(insert()).rejects.toThrow('OFFLINE_STORAGE_UNAVAILABLE')
    expect(mocks.from).toHaveBeenCalledTimes(1)
  })

  it('rejects network-failure update fallback when durable outbox fails', async () => {
    vi.stubGlobal('navigator', { onLine: true })
    mocks.updateResult = { data: null, error: networkFailure }
    mocks.ensureMutationQueued.mockRejectedValueOnce(unableToQueue)
    await expect(update()).rejects.toThrow('OFFLINE_STORAGE_UNAVAILABLE')
    expect(mocks.from).toHaveBeenCalledTimes(1)
  })

  it('refuses custody writes while offline without even attempting to queue', async () => {
    vi.stubGlobal('navigator', { onLine: false })
    await expect(idempotentInsert('clients', { name: 'Test' } as never, { queueOnFailure: false }))
      .rejects.toThrow(/NOTHING was written/)
    await expect(safeUpdate('clients', 'client-1', { name: 'Test' } as never, 'a-2', { queueOnFailure: false }))
      .rejects.toThrow(/NOTHING was written/)
    expect(mocks.ensureMutationQueued).not.toHaveBeenCalled()
  })
})
