import { beforeEach, describe, expect, it, vi } from 'vitest'

import { createRentalConfig, type CreateRentalInput } from '../createRental'

/**
 * # CREATE_RENTAL line totals (0168 / G3) — what this suite pins
 *
 * A structure/fixed-price quote does not divide into a per-day rate without a
 * paisa discrepancy, so the caller may state the line total with its breakdown
 * snapshot and the server stores both. The flat-rate path is unchanged: absent
 * a stated total the server computes qty × days × rate − discount.
 *
 * 1. A stated `lineTotal` + `priceBreakdown` rides the `create_booking`
 *    payload as `line_total` + `price_breakdown`.
 * 2. Neither key rides when the caller states no total (flat-rate path).
 * 3. A negative total is refused by name before anything is sent.
 * 4. A breakdown with no total is refused — a snapshot never travels
 *    without its figure (0168 coherence constraint).
 *
 * The RPC re-checks all of it (a second caller may not come through this
 * file); these are the refusals an operator reads.
 */

const rpc = vi.hoisted(() => {
  const state = {
    calls: [] as Array<{ fn: string; args: unknown }>,
  }
  async function fn(name: string, args: unknown) {
    state.calls.push({ fn: name, args })
    return {
      data: {
        booking_id: 'b-0168',
        booking_no: 'BK-0168',
        stage: 'Quote',
        line_count: 1,
        replayed: false,
      },
      error: null,
    }
  }
  return { state, fn }
})

vi.mock('../../../lib/supabase', () => ({
  supabase: { rpc: rpc.fn },
  newClientUuid: () => 'test-action-key',
}))

const CLIENT_ID = '11111111-1111-4111-8111-111111111111'
const BRANCH_ID = '22222222-2222-4222-8222-222222222222'

function baseInput(): CreateRentalInput {
  return {
    clientId: CLIENT_ID,
    branchId: BRANCH_ID,
    pickupAt: '2026-10-20T09:00:00+05:45',
    returnAt: '2026-10-22T09:00:00+05:45',
    deliveryType: 'Babin Delivery',
    lines: [
      {
        lineType: 'Equipment',
        description: 'Aputure Amaran 200x',
        qty: 1,
        days: 2,
        rate: 500,
      },
    ],
  }
}

const ctx = { userId: 'user-0168', role: 'Owner' as const, isOnline: true }

function payloadLine() {
  const call = rpc.state.calls.find((c) => c.fn === 'create_booking')
  if (!call) throw new Error('create_booking was not called')
  const payload = call.args as { p_payload: { lines: Array<Record<string, unknown>> } }
  return payload.p_payload.lines[0] as Record<string, unknown>
}

beforeEach(() => {
  rpc.state.calls = []
})

describe('createRental line totals (0168)', () => {
  it('passes a stated total and breakdown through to create_booking', async () => {
    const input = baseInput()
    input.lines[0]!.lineTotal = 2700
    input.lines[0]!.priceBreakdown = { method: 'structure', chargedDays: 2 }
    createRentalConfig.validate(input)
    await createRentalConfig.execute(input, ctx)
    const line = payloadLine()
    expect(line['line_total']).toBe(2700)
    expect(line['price_breakdown']).toEqual({ method: 'structure', chargedDays: 2 })
  })

  it('sends neither key on the flat-rate path', async () => {
    const input = baseInput()
    createRentalConfig.validate(input)
    await createRentalConfig.execute(input, ctx)
    const line = payloadLine()
    expect('line_total' in line).toBe(false)
    expect('price_breakdown' in line).toBe(false)
  })

  it('refuses a negative line total before anything is sent', () => {
    const input = baseInput()
    input.lines[0]!.lineTotal = -50
    expect(() => createRentalConfig.validate(input)).toThrow(/line total of -50/)
    expect(rpc.state.calls).toHaveLength(0)
  })

  it('refuses a breakdown with no line total', () => {
    const input = baseInput()
    input.lines[0]!.priceBreakdown = { method: 'structure' }
    expect(() => createRentalConfig.validate(input)).toThrow(/no line total/)
    expect(rpc.state.calls).toHaveLength(0)
  })
})
