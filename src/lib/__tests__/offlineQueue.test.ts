import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  enqueueMutation,
  ensureMutationQueued,
  OfflineQueueWriteError,
  getPendingMutations,
  markMutationSyncing,
  markMutationFailed,
  resolveMutation,
  getDeadLetterMutations,
  getUnresolvedConflicts,
  countUnresolvedConflicts,
  resolveConflict,
  OfflineQueueDB,
} from '../offlineQueue'

vi.mock('../supabase', () => ({
  supabase: {
    from: vi.fn(),
  },
}))

describe('offlineQueue — Phase 9 & Law 8 Guard Rails', () => {
  let testDb: OfflineQueueDB

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('declares and builds versions 1 through 4 cleanly on Dexie instance', () => {
    testDb = new OfflineQueueDB()
    expect(testDb.verno).toBe(4)
    expect(testDb.tables.some((t) => t.name === 'mutations')).toBe(true)
    expect(testDb.tables.some((t) => t.name === 'conflicts')).toBe(true)
  })

  it('safely handles missing IndexedDB in headless/storage-blocked environments without crashing', async () => {
    // When indexedDB is not available in node/headless environment without polyfill:
    const enqueued = await enqueueMutation('bookings', 'update', { status: 'Booked' }, 'test-uuid-1')
    expect(enqueued).toBe(false)

    // Unlike noncritical event callers, dataAccess must never see this as a
    // successfully queued mutation.
    await expect(ensureMutationQueued('bookings', 'update', { status: 'Booked' }, 'test-uuid-1'))
      .rejects.toMatchObject({ name: 'OfflineQueueWriteError', code: 'OFFLINE_STORAGE_UNAVAILABLE' })
    expect(new OfflineQueueWriteError('OFFLINE_STORAGE_UNAVAILABLE', 'unavailable').code)
      .toBe('OFFLINE_STORAGE_UNAVAILABLE')

    const pending = await getPendingMutations()
    expect(pending).toEqual([])

    const conflicts = await getUnresolvedConflicts()
    expect(conflicts).toEqual([])

    const count = await countUnresolvedConflicts()
    expect(count).toBe(0)

    const deadLetters = await getDeadLetterMutations()
    expect(deadLetters).toEqual([])

    // Mutation mutations do not throw
    await expect(markMutationSyncing(1)).resolves.not.toThrow()
    await expect(markMutationFailed(1, 'Network error')).resolves.not.toThrow()
    await expect(resolveMutation(1)).resolves.not.toThrow()
    await expect(resolveConflict(1, 'keep_server')).resolves.not.toThrow()
  })
})
