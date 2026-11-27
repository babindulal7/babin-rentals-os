import { describe, it, expect, vi, beforeEach } from 'vitest'

const { fromMock, logAuditEventMock } = vi.hoisted(() => ({
  fromMock: vi.fn(),
  logAuditEventMock: vi.fn(async () => ({ ok: true })),
}))

vi.mock('../../../lib/supabase', () => ({
  supabase: {
    from: fromMock,
  },
}))

vi.mock('../../../lib/dataAccess', () => ({
  generateClientUuid: () => 'uuid-col-1',
}))

vi.mock('../../../lib/audit', () => ({
  logAuditEvent: logAuditEventMock,
}))

import { createClientCollector } from '../manageCollector'

const ctx = { userId: 'usr-coord', role: 'Coordinator' as const }

describe('createClientCollector', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('rejects unauthorised roles and missing required fields', async () => {
    await expect(
      createClientCollector({ clientId: 'c1', name: 'Ram', phone: '9800000000' }, { userId: 'u-drv', role: 'Driver' }),
    ).rejects.toThrow(/not permitted/i)

    await expect(
      createClientCollector({ clientId: 'c1', name: '  ', phone: '9800000000' }, ctx),
    ).rejects.toThrow(/Collector name is required/i)

    await expect(
      createClientCollector({ clientId: 'c1', name: 'Ram', phone: '' }, ctx),
    ).rejects.toThrow(/Collector phone is required/i)
  })

  it('inserts collector row and logs audit event', async () => {
    fromMock.mockImplementation((table: string) => {
      if (table === 'clients') {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({ data: { id: 'c1', name: 'Alpha Films' }, error: null }),
            }),
          }),
        }
      }
      if (table === 'client_collectors') {
        return {
          insert: () => ({
            select: () => ({
              single: async () => ({ data: { id: 'col-1' }, error: null }),
            }),
          }),
        }
      }
      return {}
    })

    const res = await createClientCollector(
      { clientId: 'c1', name: '  Ram Bahadur  ', phone: ' 9800000000 ', roleTitle: 'Runner' },
      ctx,
    )

    expect(res).toEqual({
      success: true,
      collectorId: 'col-1',
      clientId: 'c1',
      name: 'Ram Bahadur',
    })
    expect(logAuditEventMock).toHaveBeenCalledTimes(1)
  })
})
