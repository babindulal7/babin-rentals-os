// @vitest-environment jsdom
import 'fake-indexeddb/auto'
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'

const api = vi.hoisted(() => ({
  actor: 'warehouse-staff-1',
  environment: 'live',
  insertedRows: [] as Array<Record<string, unknown>>,
  insertError: null as { code: string; message: string } | null,
  existingReceiptRow: null as Record<string, unknown> | null,
  lockHeld: false,
}))

vi.mock('../supabase', () => ({
  IS_MOCK: false,
  newClientUuid: () => crypto.randomUUID(),
  supabase: {
    from: vi.fn((table: string) => ({
      insert: (payload: Record<string, unknown>) => {
        if (api.insertError) {
          return Promise.resolve({ data: null, error: api.insertError })
        }
        api.insertedRows.push({ ...payload, _table: table })
        return {
          select: () => ({
            maybeSingle: async () => ({
              data: { id: `row-${api.insertedRows.length}`, ...payload },
              error: null,
            }),
          }),
        }
      },
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({ data: null, error: null }),
        }),
      }),
    })),
  },
}))

vi.mock('../monitoring', () => ({ captureError: vi.fn() }))

vi.mock('../offlineIdentity', () => ({
  ownsOfflineWork: (m: { actorId?: string; environment?: string }) =>
    m.actorId === api.actor && m.environment === api.environment,
  getOfflineSession: async () => {
    const client = {
      from: (table: string) => ({
        insert: (payload: Record<string, unknown>) => {
          if (api.insertError) {
            return {
              select: () => ({
                maybeSingle: async () => ({
                  data: null,
                  error: api.insertError,
                }),
              }),
            }
          }
          api.insertedRows.push({ ...payload, _table: table })
          return {
            select: () => ({
              maybeSingle: async () => ({
                data: { id: `row-${api.insertedRows.length}`, ...payload },
                error: null,
              }),
            }),
          }
        },
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({
              data: api.existingReceiptRow ?? { id: 'existing-id' },
              error: null,
            }),
          }),
        }),
      }),
    } as unknown as SupabaseClient
    return {
      actorId: api.actor,
      environment: api.environment,
      client,
    }
  },
}))

import { db, drainQueue, getPendingMutations } from '../offlineQueue'
import { recordFloorScanEvent } from '../floorScanStorage'
import { syncEngine } from '../syncEngine'

describe('T2-10 Floor Offline Outbox — Scans & Ticks Durability', () => {
  beforeEach(async () => {
    vi.stubGlobal('navigator', {
      onLine: false,
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
      locks: {
        request: vi.fn(async (_name, _options, run) => {
          if (api.lockHeld) return run(null)
          api.lockHeld = true
          try {
            return await run({ name: 'babin-offline-replay' })
          } finally {
            api.lockHeld = false
          }
        }),
      },
    })
    await db.mutations.clear()
    await db.conflicts.clear()
    await db.heldMutations.clear()
    api.insertedRows = []
    api.insertError = null
    api.lockHeld = false
  })

  afterAll(async () => {
    await db.delete()
    vi.unstubAllGlobals()
  })

  it('queues exactly 20 scans and manual checklist ticks in airplane mode without dropping or duplicating', async () => {
    // 1. In airplane mode (navigator.onLine === false)
    expect(navigator.onLine).toBe(false)

    // Enqueue 10 barcode scans and 10 manual checklist ticks across floor operations
    const contexts = ['packing', 'handover', 'return', 'reset'] as const
    for (let i = 1; i <= 20; i++) {
      const isManual = i > 10
      const ctx = contexts[i % contexts.length]!
      const res = await recordFloorScanEvent({
        barcode: `UNIT-${1000 + i}`,
        codeType: isManual ? 'manual_entry' : 'barcode',
        context: ctx,
        bookingId: '00000000-0000-0000-0000-000000000001',
        actorId: 'warehouse-staff-1',
        result: 'accepted',
      })
      expect(res).toBe(true)
    }

    // 2. Verify all 20 are queued in Dexie outbox
    const pending = await getPendingMutations()
    expect(pending).toHaveLength(20)
    const countBeforeFlush = await syncEngine.refreshPendingCount()
    expect(countBeforeFlush).toBe(20)
    expect(syncEngine.getState().pendingCount).toBe(20)

    // Verify properties of queued mutations
    for (let i = 0; i < 20; i++) {
      const mutation = pending[i]!
      expect(mutation.table).toBe('scan_events')
      expect(mutation.action).toBe('insert')
      expect(mutation.status).toBe('pending')
      expect(mutation.actorId).toBe('warehouse-staff-1')
      expect(mutation.clientUuid).toMatch(/^[0-9a-f-]{36}$/)

      const payload = mutation.payload as Record<string, unknown>
      expect(payload.booking_id).toBe('00000000-0000-0000-0000-000000000001')
      expect(payload.result).toBe('Accepted')
      expect(payload.client_uuid).toBe(mutation.clientUuid)
      if (i >= 10) {
        expect(payload.code_type).toBe('Manual entry')
      } else {
        expect(payload.code_type).toBe('Barcode 1D')
      }
    }

    // Server must have received 0 rows while offline
    expect(api.insertedRows).toHaveLength(0)

    // 3. Switch back online (airplane mode turned off)
    vi.stubGlobal('navigator', {
      onLine: true,
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
      locks: {
        request: vi.fn(async (_name, _options, run) => {
          if (api.lockHeld) return run(null)
          api.lockHeld = true
          try {
            return await run({ name: 'babin-offline-replay' })
          } finally {
            api.lockHeld = false
          }
        }),
      },
    })
    expect(navigator.onLine).toBe(true)

    // 4. Flush the outbox via drainQueue / syncEngine
    await drainQueue()

    // Verify 20 server rows were inserted
    expect(api.insertedRows).toHaveLength(20)

    // Verify pending queue in Dexie is now empty
    const remainingPending = await getPendingMutations()
    expect(remainingPending).toHaveLength(0)
    const countAfterFlush = await syncEngine.refreshPendingCount()
    expect(countAfterFlush).toBe(0)
    expect(syncEngine.getState().pendingCount).toBe(0)

    // 5. Replay idempotency: flushing again when queue is empty does nothing
    await drainQueue()
    expect(api.insertedRows).toHaveLength(20)
  })

  it('handles unique conflict (23505) on client_uuid idempotency key cleanly with zero duplicate rows', async () => {
    // Queue a single scan event
    await recordFloorScanEvent({
      barcode: 'UNIT-DUPLICATE-CHECK',
      codeType: 'barcode',
      context: 'packing',
      bookingId: '00000000-0000-0000-0000-000000000001',
      actorId: 'warehouse-staff-1',
      result: 'accepted',
    })

    const pendingList = await getPendingMutations()
    expect(pendingList).toHaveLength(1)
    api.existingReceiptRow = { ...pendingList[0]!.payload }

    // Simulate backend reporting that this client_uuid already exists (HTTP/Postgres 23505)
    api.insertError = { code: '23505', message: 'duplicate key value violates unique constraint "scan_events_client_uuid_key"' }

    vi.stubGlobal('navigator', {
      onLine: true,
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
      locks: {
        request: vi.fn(async (_name, _options, run) => {
          return run({ name: 'babin-offline-replay' })
        }),
      },
    })

    await drainQueue()

    const remaining = await getPendingMutations()
    expect(remaining).toHaveLength(0)
  })
})
