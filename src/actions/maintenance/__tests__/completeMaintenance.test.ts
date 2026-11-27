import { describe, it, expect, vi, beforeEach } from 'vitest'

const { safeUpdateMock, rpcMock, fromMock } = vi.hoisted(() => ({
  safeUpdateMock: vi.fn(),
  rpcMock: vi.fn(),
  fromMock: vi.fn(),
}))

vi.mock('../../../lib/dataAccess', () => ({
  safeUpdate: safeUpdateMock,
  generateClientUuid: () => 'uuid-cmp-1',
}))

vi.mock('../../../lib/supabase', () => ({
  supabase: {
    rpc: rpcMock,
    from: fromMock,
  },
}))

import { completeMaintenance } from '../completeMaintenance'

const ctx = { userId: 'usr-tech', role: 'Technician' as const }

describe('completeMaintenance', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    fromMock.mockReturnValue({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({
            data: { id: 'mnt-uuid-1', record_no: 'MNT-2026-0001', status: 'In Progress' },
            error: null,
          }),
        }),
      }),
    })
  })

  it('calls close_maintenance_job RPC when available and returns completion result', async () => {
    rpcMock.mockResolvedValueOnce({ data: { ok: true }, error: null })

    const res = await completeMaintenance(
      { id: 'MNT-2026-0001', actionsTaken: 'Replaced mount', clientUuid: 'uuid-1' },
      ctx,
    )

    expect(rpcMock).toHaveBeenCalledWith(
      'close_maintenance_job',
      expect.objectContaining({
        p_maintenance_id: 'mnt-uuid-1',
        p_actions_taken: 'Replaced mount',
        p_client_uuid: 'uuid-1',
      }),
    )
    expect(res).toEqual({
      success: true,
      id: 'mnt-uuid-1',
      recordNo: 'MNT-2026-0001',
      status: 'Completed',
    })
  })
})
