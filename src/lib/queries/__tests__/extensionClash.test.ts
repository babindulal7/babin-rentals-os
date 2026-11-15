import { describe, it, expect, beforeEach, vi } from 'vitest'
import { checkExtensionClash } from '../extensionClash'

const db = vi.hoisted(() => {
  const state = {
    reservations: [] as Array<Record<string, unknown>>,
    bookings: [] as Array<Record<string, unknown>>,
  }

  const queryChain = (table: string) => {
    let selected = [...(table === 'inventory_reservations' ? state.reservations : state.bookings)]
    const chain: Record<string, unknown> = {
      select: () => chain,
      eq: (col: string, val: unknown) => {
        selected = selected.filter((r) => r[col] === val)
        return chain
      },
      neq: (col: string, val: unknown) => {
        selected = selected.filter((r) => r[col] !== val)
        return chain
      },
      is: (col: string, val: unknown) => {
        selected = selected.filter((r) => r[col] === val)
        return chain
      },
      in: (col: string, vals: unknown[]) => {
        selected = selected.filter((r) => vals.includes(r[col]))
        return chain
      },
      then: (resolve: (value: { data: unknown[]; error: null }) => void) => {
        return Promise.resolve({ data: selected, error: null }).then(resolve)
      },
    }
    return chain
  }

  return {
    state,
    supabase: {
      from: (table: string) => queryChain(table),
    },
  }
})

vi.mock('../../supabase', () => ({
  supabase: db.supabase,
}))

describe('checkExtensionClash', () => {
  beforeEach(() => {
    db.state.reservations = []
    db.state.bookings = []
  })

  it('returns hasClash: false when there are no conflicting reservations', async () => {
    db.state.reservations = [
      {
        id: 'r-1',
        asset_id: 'unit-cam-1',
        booking_id: 'b-current',
        period: '[2105-06-01 04:00:00+00,2105-06-03 04:00:00+00)',
        released_at: null,
      },
    ]

    const result = await checkExtensionClash(
      'b-current',
      '2105-06-03T04:00:00Z',
      '2105-06-05T04:00:00Z',
    )

    expect(result.hasClash).toBe(false)
    expect(result.clashes).toHaveLength(0)
  })

  it('detects a conflicting upcoming reservation on the same unit', async () => {
    db.state.reservations = [
      // Current booking hold
      {
        id: 'r-1',
        asset_id: 'unit-cam-1',
        booking_id: 'b-current',
        period: '[2105-06-01 04:00:00+00,2105-06-03 04:00:00+00)',
        released_at: null,
      },
      // Upcoming booking hold on the same unit
      {
        id: 'r-2',
        asset_id: 'unit-cam-1',
        booking_id: 'b-upcoming-101',
        period: '[2105-06-04 04:00:00+00,2105-06-07 04:00:00+00)',
        released_at: null,
      },
    ]

    db.state.bookings = [
      {
        id: 'b-upcoming-101',
        booking_no: 'BK-101',
      },
    ]

    const result = await checkExtensionClash(
      'b-current',
      '2105-06-03T04:00:00Z',
      '2105-06-05T04:00:00Z',
    )

    expect(result.hasClash).toBe(true)
    expect(result.clashes).toHaveLength(1)
    expect(result.clashes[0]!.conflictingBookingNo).toBe('BK-101')
    expect(result.clashes[0]!.detail).toContain('Sub-rent or alternative item required (T3-13)')
  })

  it('ignores reservations that were already released', async () => {
    db.state.reservations = [
      {
        id: 'r-1',
        asset_id: 'unit-cam-1',
        booking_id: 'b-current',
        period: '[2105-06-01 04:00:00+00,2105-06-03 04:00:00+00)',
        released_at: null,
      },
      {
        id: 'r-2',
        asset_id: 'unit-cam-1',
        booking_id: 'b-upcoming-102',
        period: '[2105-06-04 04:00:00+00,2105-06-07 04:00:00+00)',
        released_at: '2105-06-02T10:00:00Z', // Released / cancelled hold
      },
    ]

    const result = await checkExtensionClash(
      'b-current',
      '2105-06-03T04:00:00Z',
      '2105-06-05T04:00:00Z',
    )

    expect(result.hasClash).toBe(false)
  })
})
