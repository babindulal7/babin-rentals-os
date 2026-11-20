import { describe, it, expect, vi, beforeEach } from 'vitest'

type Result = { data: unknown; error: { message: string } | null }

const answers = vi.hoisted(() => ({
  bands: { data: [], error: null } as Result,
  rpcResult: { error: null } as { error: { message: string } | null },
  rpcCalls: [] as Array<{ name: string; args: Record<string, unknown> }>,
}))

vi.mock('../supabase', () => ({
  supabase: {
    from: () => ({ select: () => Promise.resolve(answers.bands) }),
    rpc: (name: string, args: Record<string, unknown>) => {
      answers.rpcCalls.push({ name, args })
      return Promise.resolve(answers.rpcResult)
    },
  },
}))

import { formatDistanceBand, parseBandInput, parseKmInput } from '../deliveryDistanceBand'
import { fetchDistanceBands, setDistanceBand } from '../queries/deliveryDistanceBands'

describe('parseKmInput (O-28b)', () => {
  it('reads a blank as no value, never zero', () => {
    expect(parseKmInput('')).toEqual({ ok: true, km: null })
    expect(parseKmInput('   ')).toEqual({ ok: true, km: null })
  })

  it('reads whole and one- or two-decimal distances', () => {
    expect(parseKmInput('7')).toEqual({ ok: true, km: 7 })
    expect(parseKmInput('12.5')).toEqual({ ok: true, km: 12.5 })
    expect(parseKmInput('0.25')).toEqual({ ok: true, km: 0.25 })
  })

  it('refuses text, negatives, three decimals and absurd values', () => {
    for (const bad of ['abc', '-3', '3.123', '1,5', '99999']) {
      expect(parseKmInput(bad).ok).toBe(false)
    }
  })
})

describe('parseBandInput (O-28b)', () => {
  it('builds a closed band', () => {
    expect(parseBandInput('3', '7')).toEqual({ ok: true, band: { minKm: 3, maxKm: 7 } })
  })

  it('builds an open-ended band when the upper box is blank', () => {
    expect(parseBandInput('25', '')).toEqual({ ok: true, band: { minKm: 25, maxKm: null } })
  })

  it('treats zero as a real lower bound (Z1 covers 0 to 3 km)', () => {
    expect(parseBandInput('0', '3')).toEqual({ ok: true, band: { minKm: 0, maxKm: 3 } })
  })

  it('clears the band when both boxes are blank', () => {
    expect(parseBandInput('', '')).toEqual({ ok: true, band: null })
  })

  it('refuses an upper distance without a lower one', () => {
    expect(parseBandInput('', '9').ok).toBe(false)
  })

  it('refuses an upper distance that is not above the lower one', () => {
    expect(parseBandInput('7', '7').ok).toBe(false)
    expect(parseBandInput('7', '3').ok).toBe(false)
  })
})

describe('formatDistanceBand (O-28b)', () => {
  it('words the draft bands the way the proposal does', () => {
    expect(formatDistanceBand({ minKm: 0, maxKm: 3 })).toBe('0–3 km')
    expect(formatDistanceBand({ minKm: 3, maxKm: 7 })).toBe('over 3–7 km')
    expect(formatDistanceBand({ minKm: 25, maxKm: null })).toBe('over 25 km')
  })

  it('says so when no band is set', () => {
    expect(formatDistanceBand(null)).toBe('Distance not set')
    expect(formatDistanceBand(undefined)).toBe('Distance not set')
  })
})

describe('fetchDistanceBands and setDistanceBand (O-28b)', () => {
  beforeEach(() => {
    answers.bands = { data: [], error: null }
    answers.rpcResult = { error: null }
    answers.rpcCalls = []
  })

  it('maps rows to bands and skips a zone whose lower bound is not set', async () => {
    answers.bands = {
      data: [
        { zone_id: 'z1', min_km: '0', max_km: '3.00' },
        { zone_id: 'z6', min_km: '25.00', max_km: null },
        { zone_id: 'z9', min_km: null, max_km: null },
      ],
      error: null,
    }
    const bands = await fetchDistanceBands()
    expect(bands.get('z1')).toEqual({ minKm: 0, maxKm: 3 })
    expect(bands.get('z6')).toEqual({ minKm: 25, maxKm: null })
    expect(bands.has('z9')).toBe(false)
  })

  it('throws a plain message when the read fails', async () => {
    answers.bands = { data: null, error: { message: 'boom' } }
    await expect(fetchDistanceBands()).rejects.toThrow('Could not read the zone distance bands: boom')
  })

  it('sends the band to the RPC', async () => {
    await setDistanceBand('z2', { minKm: 3, maxKm: 7 })
    expect(answers.rpcCalls).toEqual([
      { name: 'set_delivery_zone_distance_band', args: { p_zone_id: 'z2', p_min_km: 3, p_max_km: 7 } },
    ])
  })

  it('sends nulls to clear a band', async () => {
    await setDistanceBand('z2', null)
    expect(answers.rpcCalls[0]?.args).toEqual({ p_zone_id: 'z2', p_min_km: null, p_max_km: null })
  })

  it('throws when the database refuses the band', async () => {
    answers.rpcResult = { error: { message: 'Only the Owner, Admin or Manager can set a delivery zone distance band' } }
    await expect(setDistanceBand('z2', { minKm: 3, maxKm: 7 })).rejects.toThrow('The distance band was not saved:')
  })
})
