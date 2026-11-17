import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  enqueueMutation,
  getPendingMutations,
  markMutationSyncing,
  markMutationFailed,
  resolveMutation,
  getDeadLetterMutations,
  getUnresolvedConflicts,
  countUnresolvedConflicts,
  resolveConflict,
  OfflineQueueDB,
  calculateBackoffMs,
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

  it('declares and builds versions 1 through 5 cleanly on Dexie instance', () => {
    testDb = new OfflineQueueDB()
    expect(testDb.verno).toBe(5)
    expect(testDb.tables.some((t) => t.name === 'mutations')).toBe(true)
    expect(testDb.tables.some((t) => t.name === 'conflicts')).toBe(true)
  })

  it('safely handles missing IndexedDB in headless/storage-blocked environments without crashing', async () => {
    // When indexedDB is not available in node/headless environment without polyfill:
    const enqueued = await enqueueMutation('bookings', 'update', { status: 'Booked' }, 'test-uuid-1')
    expect(enqueued).toBe(false)

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

  it('calculates exponential backoff with jitter and respects 60s ceiling', () => {
    const delay0 = calculateBackoffMs(0)
    expect(delay0).toBeGreaterThanOrEqual(1000)
    expect(delay0).toBeLessThan(1600)

    const delay1 = calculateBackoffMs(1)
    expect(delay1).toBeGreaterThanOrEqual(2000)
    expect(delay1).toBeLessThan(2600)

    const delay2 = calculateBackoffMs(2)
    expect(delay2).toBeGreaterThanOrEqual(4000)
    expect(delay2).toBeLessThan(4600)

    const delayLarge = calculateBackoffMs(10)
    // 60,000 + up to 500ms jitter
    expect(delayLarge).toBeGreaterThanOrEqual(60000)
    expect(delayLarge).toBeLessThanOrEqual(60500)
  })
})
