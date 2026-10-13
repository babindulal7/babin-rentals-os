/**
 * New Rental offers no made-up crew and no made-up delivery rate.
 *
 * Ported 8–13 Oct 2026 from OpenCode's `33de1a0`. On the live project New Rental
 * fell back to `CREW_ROSTER`, the seeded people in `data/crew.ts`, whenever the
 * live roster read came back empty or failed. Its delivery row carried a fixed
 * "Rs 5,000 base" that no rate table stands behind (Law 16).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const env = vi.hoisted(() => ({ mock: false }))

vi.mock('../../../../lib/supabase', () => ({
  get IS_MOCK() {
    return env.mock
  },
  supabase: {},
}))

import { crewPool, CREW_ROSTER, type CrewMember } from '../../../../lib/queries/crew'
import { defaultTransportOptions } from '../itemCatalogue'
import type { Paisa } from '../../../../lib/money'

const WINDOW = { pickupAd: '2026-10-13T03:15:00.000Z', returnAd: '2026-10-15T03:15:00.000Z' } as never
const LIVE: CrewMember[] = [{ ...CREW_ROSTER[0]!, id: 'live-1', name: 'Live Person' }]

beforeEach(() => {
  env.mock = false
})

describe('crewPool — the live roster, or nobody', () => {
  it('returns the live roster when it has people', () => {
    expect(crewPool(LIVE)).toEqual(LIVE)
  })

  it('offers no seed crew on the live project when the read is empty or failed', () => {
    expect(crewPool([])).toEqual([])
    expect(crewPool(null)).toEqual([])
    expect(crewPool(undefined)).toEqual([])
  })

  it('keeps the seed roster for mock mode, where it is the data', () => {
    env.mock = true
    expect(crewPool(null)).toBe(CREW_ROSTER)
    expect(crewPool(LIVE)).toEqual(LIVE)
  })
})

describe('defaultTransportOptions — each mode carries THIS booking’s charge', () => {
  it('shows no delivery charge until one is on the form, never a default figure', () => {
    const [pickup, delivery] = defaultTransportOptions(WINDOW)
    expect(pickup).toMatchObject({ type: 'Client Pickup', ratePaisa: 0 })
    expect(delivery).toMatchObject({ type: 'Babin Delivery', ratePaisa: null })
    expect(defaultTransportOptions(WINDOW, 0 as Paisa)[1]!.ratePaisa).toBeNull()
  })

  it('carries the delivery charge typed on the form', () => {
    expect(defaultTransportOptions(WINDOW, 350000 as Paisa)[1]!.ratePaisa).toBe(350000)
  })

  it('no longer invents Rs 5,000', () => {
    const rates = defaultTransportOptions(WINDOW).map((o) => o.ratePaisa)
    expect(rates).not.toContain(500000)
  })
})
