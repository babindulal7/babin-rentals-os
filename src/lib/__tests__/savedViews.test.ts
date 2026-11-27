import { describe, it, expect, vi, beforeEach } from 'vitest'

const { fromMock, rpcMock } = vi.hoisted(() => ({
  fromMock: vi.fn(),
  rpcMock: vi.fn(),
}))

vi.mock('../supabase', () => ({
  newClientUuid: () => 'uuid-view-1',
  supabase: {
    from: fromMock,
    rpc: rpcMock,
  },
}))

vi.mock('../safeStorage', () => ({
  readLocal: vi.fn(() => null),
  writeLocal: vi.fn(() => true),
}))

import { listSharedViews, saveSharedView, retireSharedView } from '../savedViews'

describe('savedViews', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('lists and maps valid shared views while filtering malformed rows', async () => {
    fromMock.mockReturnValue({
      select: () => ({
        eq: () => ({
          order: async () => ({
            data: [
              {
                id: 'v1',
                name: 'Active Rentals',
                query: 'stage=On+Rent',
                hidden_columns: ['notes'],
                visibility: 'team',
                is_system: false,
                owner_id: 'u1',
                created_at: '2026-11-01T00:00:00Z',
              },
              { id: null, name: 'Bad row' },
            ],
            error: null,
          }),
        }),
      }),
    })

    const views = await listSharedViews('rentals')
    expect(views).toHaveLength(1)
    expect(views[0]).toEqual({
      id: 'v1',
      name: 'Active Rentals',
      query: 'stage=On+Rent',
      hiddenColumns: ['notes'],
      visibility: 'team',
      isSystem: false,
      ownerId: 'u1',
      createdAt: '2026-11-01T00:00:00Z',
    })
  })

  it('saves and retires views via RPC and unwraps GATE errors', async () => {
    rpcMock.mockResolvedValueOnce({ data: 'v-new', error: null })
    const id = await saveSharedView({
      listKey: 'rentals',
      name: 'My View',
      query: 'q=1',
      hiddenColumns: [],
      visibility: 'private',
    })
    expect(id).toBe('v-new')

    rpcMock.mockResolvedValueOnce({ error: { message: 'GATE:SYSTEM|System views cannot be retired.' } })
    await expect(retireSharedView('v-sys')).rejects.toThrow('System views cannot be retired.')
  })
})
