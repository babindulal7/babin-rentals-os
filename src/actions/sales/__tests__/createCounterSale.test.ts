import { describe, it, expect, vi, beforeEach } from 'vitest'

const { rpcMock } = vi.hoisted(() => ({
  rpcMock: vi.fn(),
}))

vi.mock('../../../lib/supabase', () => ({
  newClientUuid: () => '33333333-3333-4333-8333-333333333333',
  supabase: { rpc: rpcMock },
}))

import { createCounterSale } from '../createCounterSale'

const ctx = { userId: 'usr-coord', role: 'Coordinator' as const }
const PROD_UUID = '44444444-4444-4444-8444-444444444444'

describe('createCounterSale', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('validates non-empty lines, UUIDs, and positive integer quantities', async () => {
    await expect(createCounterSale({ lines: [] }, ctx)).rejects.toThrow(/At least one consumable item/i)
    await expect(createCounterSale({ lines: [{ productId: 'bad', qty: 1 }] }, ctx)).rejects.toThrow(/valid product UUID/i)
    await expect(createCounterSale({ lines: [{ productId: PROD_UUID, qty: 0 }] }, ctx)).rejects.toThrow(/positive integer/i)
  })

  it('calls create_counter_sale RPC and maps result', async () => {
    rpcMock.mockResolvedValueOnce({
      data: {
        booking_id: 'bk-cs-1',
        booking_no: '999',
        stage: 'Closed',
        line_count: 1,
        invoice_id: 'inv-1',
        total_amount_paisa: 150000,
        status: 'created',
      },
      error: null,
    })

    const res = await createCounterSale(
      {
        clientUuid: '33333333-3333-4333-8333-333333333333',
        lines: [{ productId: PROD_UUID, qty: 2 }],
        notes: ' Gaffer tape ',
      },
      ctx,
    )

    expect(rpcMock).toHaveBeenCalledWith('create_counter_sale', {
      p_payload: expect.objectContaining({
        client_uuid: '33333333-3333-4333-8333-333333333333',
        actor_id: 'usr-coord',
        notes: 'Gaffer tape',
      }),
    })
    expect(res).toMatchObject({
      success: true,
      bookingId: 'bk-cs-1',
      bookingNo: '999',
      bookingKind: 'counter_sale',
      lineCount: 1,
      status: 'created',
    })
  })
})
