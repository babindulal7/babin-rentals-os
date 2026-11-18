import { describe, it, expect, beforeEach, vi } from 'vitest'
import { changeBookingConfig, prepareBookingChange, type ChangeBookingInput } from '../changeBooking'
import type { QuoteSnapshot } from '../../../lib/queries/quoteEditor'
import type { RentalDraftData } from '../saveDraft'
import { rupees } from '../../../lib/money'

const db = vi.hoisted(() => {
  const state = {
    rpcResult: null as Record<string, unknown> | null,
    rpcError: null as { message: string } | null,
    rpcCalls: [] as Array<{ fn: string; args: Record<string, unknown> }>,
  }

  return {
    state,
    supabase: {
      rpc: async (fn: string, args: Record<string, unknown>) => {
        state.rpcCalls.push({ fn, args })
        if (state.rpcError) {
          return { data: null, error: state.rpcError }
        }
        return { data: state.rpcResult, error: null }
      },
    },
  }
})

vi.mock('../../../lib/supabase', () => ({
  supabase: db.supabase,
  newClientUuid: () => 'm-uuid-' + Math.random().toString(36).slice(2, 9),
}))

describe('CHANGE_BOOKING action (T3-18)', () => {
  const sampleSnapshot: QuoteSnapshot = {
    id: 'b-1',
    code: 'B-001',
    revision: 'rev-1',
    values: {
      client_id: 'c-1',
      pickup_at: '2026-11-20T06:00:00.000Z',
      return_at: '2026-11-22T06:00:00.000Z',
      delivery_type: 'Client Pickup',
      deposit_required: 1000,
    },
    lines: [],
    crew: [],
    transport: null,
    discounts: [],
  }

  const sampleDraft: RentalDraftData = {
    version: 1,
    bookingNo: 'B-001',
    selectedClientId: 'c-1',
    clientDbId: 'c-1',
    project: 'Commercial',
    kind: 'Commercial / Ad',
    kindOther: '',
    govId: '',
    pickup: '2026-11-20',
    pickupTime: '06:00',
    returnDate: '2026-11-22',
    returnTime: '06:00',
    deliveryType: 'Client Pickup',
    pickupLocation: '',
    returnLocation: '',
    specialInstructions: '',
    returnPickupType: 'Client Return',
    deliveryChargePaisa: rupees(0),
    lines: [],
    crew: [],
    fuelChargePaisa: rupees(0),
    vehicle: '',
    numberPlate: '',
    driverContact: '',
    discountPct: 0,
    vatOn: true,
    vatRatePercent: 13,
    advancePaisa: rupees(0),
  }

  beforeEach(() => {
    db.state.rpcResult = {
      id: 'b-1',
      code: 'B-001',
      revision: 'rev-2',
      stage: 'Booked',
      values: sampleSnapshot.values,
      lines: [],
      crew: [],
      transport: null,
      discounts: [],
    }
    db.state.rpcError = null
    db.state.rpcCalls = []
  })

  it('declares implemented: true and permissions: [rental.change]', () => {
    expect(changeBookingConfig.implemented).toBe(true)
    expect(changeBookingConfig.permissions).toEqual(['rental.change'])
  })

  it('validates bookingId, expectedRevision, clientUuid, and matching snapshot', () => {
    const valid: ChangeBookingInput = {
      bookingId: 'b-1',
      expectedRevision: 'rev-1',
      clientUuid: 'k-1',
      draft: sampleDraft,
      snapshot: sampleSnapshot,
      depositPaisa: rupees(1000),
    }

    expect(() => changeBookingConfig.validate(valid)).not.toThrow()
    expect(() => changeBookingConfig.validate({ ...valid, bookingId: '' })).toThrow(/Reload the booking/)
    expect(() => changeBookingConfig.validate({ ...valid, expectedRevision: '' })).toThrow(/Reload the booking/)
    expect(() => changeBookingConfig.validate({ ...valid, clientUuid: '' })).toThrow(/Reload the booking/)
    expect(() => changeBookingConfig.validate({ ...valid, snapshot: { ...sampleSnapshot, id: 'b-other' } })).toThrow(
      /Reload the booking/,
    )
  })

  it('executes change_booking RPC and returns snapshot and event', async () => {
    const input: ChangeBookingInput = {
      bookingId: 'b-1',
      expectedRevision: 'rev-1',
      clientUuid: 'k-1',
      draft: sampleDraft,
      snapshot: sampleSnapshot,
      depositPaisa: rupees(1000),
    }

    const { result, events } = await changeBookingConfig.execute(input, {
      userId: 'u-coordinator',
      role: 'Coordinator',
      isOnline: true,
    })

    expect(db.state.rpcCalls.length).toBe(1)
    const call = db.state.rpcCalls[0]
    expect(call?.fn).toBe('change_booking')
    expect(call?.args.p_id).toBe('b-1')
    expect(call?.args.p_revision).toBe('rev-1')
    expect(call?.args.p_key).toBe('k-1')
    expect(result.revision).toBe('rev-2')
    expect(events).toEqual([
      expect.objectContaining({
        type: 'booking.changed',
        payload: expect.objectContaining({
          bookingId: 'b-1',
          revision: 'rev-2',
          changedBy: 'u-coordinator',
        }),
      }),
    ])
  })

  it('refuses when offline', async () => {
    const input: ChangeBookingInput = {
      bookingId: 'b-1',
      expectedRevision: 'rev-1',
      clientUuid: 'k-1',
      draft: sampleDraft,
      snapshot: sampleSnapshot,
      depositPaisa: rupees(1000),
    }

    await expect(
      changeBookingConfig.execute(input, {
        userId: 'u-coordinator',
        role: 'Coordinator',
        isOnline: false,
      }),
    ).rejects.toThrow(/Connect to save this booking/)
  })

  it('prepareBookingChange maintains fingerprint on repeat call', () => {
    const inputOmit = {
      bookingId: 'b-1',
      expectedRevision: 'rev-1',
      draft: sampleDraft,
      snapshot: sampleSnapshot,
      depositPaisa: rupees(1000),
    }

    const attempt1 = prepareBookingChange(inputOmit, null)
    const attempt2 = prepareBookingChange(inputOmit, attempt1)

    expect(attempt2).toBe(attempt1)
    expect(attempt2.input.clientUuid).toBe(attempt1.input.clientUuid)
  })
})
