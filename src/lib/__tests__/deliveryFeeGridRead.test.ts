import { describe, it, expect, vi, beforeEach } from 'vitest'

type Result = { data: unknown; error: { message: string } | null }

const answers = vi.hoisted(() => ({
  fee: { data: null, error: null } as Result,
  quoted: { data: null, error: null } as Result,
  rpcResult: { error: null } as { error: { message: string } | null },
  rpcCalls: [] as Array<{ name: string; args: Record<string, unknown> }>,
}))

vi.mock('../supabase', () => {
  const feeBuilder = () => {
    const builder: Record<string, unknown> = {}
    for (const method of ['select', 'eq']) builder[method] = () => builder
    builder.maybeSingle = () => Promise.resolve(answers.fee)
    return builder
  }
  const quotedBuilder = () => {
    const builder: Record<string, unknown> = {}
    for (const method of ['select', 'eq']) builder[method] = () => builder
    builder.maybeSingle = () => Promise.resolve(answers.quoted)
    return builder
  }
  return {
    supabase: {
      from: (table: string) => (table === 'delivery_zone_quoted' ? quotedBuilder() : feeBuilder()),
      rpc: (name: string, args: Record<string, unknown>) => {
        answers.rpcCalls.push({ name, args })
        return Promise.resolve(answers.rpcResult)
      },
    },
  }
})

import { fetchGridFeeState } from '../queries/deliveryFeeGridRead'
import { setBookingDeliveryZone, setDeliveryJobVehicleClass } from '../queries/bookingDeliveryZone'

describe('fetchGridFeeState (O-28, R-9.18, R-9.20)', () => {
  beforeEach(() => {
    answers.fee = { data: null, error: null }
    answers.quoted = { data: null, error: null }
    answers.rpcCalls = []
  })

  it('returns the amount in paisa when the grid cell holds one', async () => {
    answers.fee = { data: { fee_paisa: '300000' }, error: null }
    await expect(fetchGridFeeState('z-in', 'Motorbike')).resolves.toEqual({ status: 'set', feePaisa: 300000 })
  })

  it('returns not set when the cell is blank, never a free delivery', async () => {
    answers.fee = { data: { fee_paisa: null }, error: null }
    await expect(fetchGridFeeState('z-in', 'Motorbike')).resolves.toEqual({ status: 'not-set' })
  })

  it('returns not set when no grid row exists for the cell', async () => {
    await expect(fetchGridFeeState('z-in', 'Van / larger vehicle')).resolves.toEqual({ status: 'not-set' })
  })

  it('returns quoted per trip for a quoted zone even if an amount were stored', async () => {
    answers.quoted = { data: { quoted: true }, error: null }
    answers.fee = { data: { fee_paisa: '90000' }, error: null }
    await expect(fetchGridFeeState('z-out', 'Car / pickup')).resolves.toEqual({ status: 'quoted-per-trip' })
  })

  it('throws with the read error instead of showing an empty grid', async () => {
    answers.fee = { data: null, error: { message: 'permission denied' } }
    await expect(fetchGridFeeState('z-in', 'Motorbike')).rejects.toThrow('permission denied')
  })
})

describe('booking zone and job vehicle class writes (O-28, O-30)', () => {
  beforeEach(() => {
    answers.rpcResult = { error: null }
    answers.rpcCalls = []
  })

  it('saves the zone through the database function with the booking and zone ids', async () => {
    await setBookingDeliveryZone('bk-1', 'z-in')
    expect(answers.rpcCalls).toEqual([
      { name: 'set_booking_delivery_zone', args: { p_booking_id: 'bk-1', p_zone_id: 'z-in' } },
    ])
  })

  it('surfaces a refused zone save instead of dropping it silently', async () => {
    answers.rpcResult = { error: { message: 'Delivery zone branch access denied' } }
    await expect(setBookingDeliveryZone('bk-1', 'z-in')).rejects.toThrow('The delivery zone was not saved')
  })

  it('clears a job vehicle class when given null', async () => {
    await setDeliveryJobVehicleClass('job-1', null)
    expect(answers.rpcCalls).toEqual([
      { name: 'set_delivery_job_vehicle_class', args: { p_job_id: 'job-1', p_vehicle_class: null } },
    ])
  })

  it('surfaces a refused vehicle class save', async () => {
    answers.rpcResult = { error: { message: 'A finished delivery job keeps its vehicle class' } }
    await expect(setDeliveryJobVehicleClass('job-1', 'Van / larger vehicle')).rejects.toThrow(
      'The vehicle class was not saved',
    )
  })
})
