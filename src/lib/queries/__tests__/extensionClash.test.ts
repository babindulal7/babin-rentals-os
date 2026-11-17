import { describe, it, expect, beforeEach, vi } from 'vitest'
import { checkExtensionClash, parseTsRange } from '../extensionClash'

const db = vi.hoisted(() => {
  const state = {
    reservations: [] as Array<Record<string, unknown>>,
    bookings: [] as Array<Record<string, unknown>>,
    bookingLines: [] as Array<Record<string, unknown>>,
    products: [] as Array<Record<string, unknown>>,
    holdsError: null as { message: string } | null,
    linesError: null as { message: string } | null,
    overlapError: null as { message: string } | null,
  }

  const queryChain = (table: string) => {
    let selected: Array<Record<string, unknown>> = []
    if (table === 'inventory_reservations') selected = [...state.reservations]
    else if (table === 'bookings') selected = [...state.bookings]
    else if (table === 'booking_lines') selected = [...state.bookingLines]
    else if (table === 'products') selected = [...state.products]

    let isSingle = false

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
        selected = selected.filter((r) => (val === null ? r[col] === null || r[col] === undefined : r[col] === val))
        return chain
      },
      in: (col: string, vals: unknown[]) => {
        selected = selected.filter((r) => vals.includes(r[col]))
        return chain
      },
      single: () => {
        isSingle = true
        return chain
      },
      then: (resolve: (value: { data: unknown; error: unknown }) => void) => {
        if (table === 'inventory_reservations' && state.holdsError) {
          return Promise.resolve({ data: null, error: state.holdsError }).then(resolve)
        }
        if (table === 'booking_lines' && state.linesError) {
          return Promise.resolve({ data: null, error: state.linesError }).then(resolve)
        }
        const resData = isSingle ? (selected[0] ?? null) : selected
        return Promise.resolve({ data: resData, error: null }).then(resolve)
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

describe('checkExtensionClash (P0 Issue #171 fail-closed verification)', () => {
  beforeEach(() => {
    db.state.reservations = []
    db.state.bookings = []
    db.state.bookingLines = []
    db.state.products = []
    db.state.holdsError = null
    db.state.linesError = null
    db.state.overlapError = null
  })

  describe('parseTsRange', () => {
    it('parses valid half-open tsrange bounds accurately', () => {
      const [start, end] = parseTsRange('[2026-09-14 10:00:00+00,2026-09-16 10:00:00+00)')
      expect(start.toISOString()).toBe('2026-09-14T10:00:00.000Z')
      expect(end.toISOString()).toBe('2026-09-16T10:00:00.000Z')
    })

    it('fails closed (throws) on malformed range string without comma', () => {
      expect(() => parseTsRange('[2026-09-14 10:00:00+00 2026-09-16]')).toThrow('missing comma')
    })

    it('fails closed (throws) on invalid date strings inside range', () => {
      expect(() => parseTsRange('[invalid-date,2026-09-16]')).toThrow('Malformed reservation range dates')
    })
  })

  describe('input validation (fail-closed)', () => {
    it('throws when bookingId is missing or empty', async () => {
      await expect(
        checkExtensionClash('', '2026-09-14T10:00:00Z', '2026-09-16T10:00:00Z'),
      ).rejects.toThrow('Valid booking ID is required')
    })

    it('throws when target return is before or equal to current return', async () => {
      await expect(
        checkExtensionClash('b-1', '2026-09-16T10:00:00Z', '2026-09-14T10:00:00Z'),
      ).rejects.toThrow('strictly after the current return date')

      await expect(
        checkExtensionClash('b-1', '2026-09-16T10:00:00Z', '2026-09-16T10:00:00Z'),
      ).rejects.toThrow('strictly after the current return date')
    })

    it('throws when date format is invalid', async () => {
      await expect(
        checkExtensionClash('b-1', 'not-a-date', '2026-09-16T10:00:00Z'),
      ).rejects.toThrow('Invalid date format')
    })
  })

  describe('database error handling (fail-closed)', () => {
    it('throws when current reservations query fails', async () => {
      db.state.holdsError = { message: 'connection timeout' }
      await expect(
        checkExtensionClash('b-1', '2026-09-14T10:00:00Z', '2026-09-16T10:00:00Z'),
      ).rejects.toThrow('Failed to query booking reservations: connection timeout')
    })

    it('throws when booking has lines but zero active reservations', async () => {
      db.state.reservations = []
      db.state.bookingLines = [{ id: 'line-1', product_id: 'p-1', quantity: 1, booking_id: 'b-1' }]
      await expect(
        checkExtensionClash('b-1', '2026-09-14T10:00:00Z', '2026-09-16T10:00:00Z'),
      ).rejects.toThrow('no active reservations found. Extension blocked until reservation status is reconciled')
    })
  })

  describe('availability checks', () => {
    it('returns clean status when there are no conflicting reservations', async () => {
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
      expect(result.status).toBe('clean')
      expect(result.clashes).toHaveLength(0)
    })

    it('detects a conflicting upcoming reservation on the same unit', async () => {
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
      expect(result.status).toBe('clash')
      expect(result.clashes).toHaveLength(1)
      expect(result.clashes[0]!.conflictingBookingNo).toBe('BK-101')
      expect(result.clashes[0]!.detail).toContain('Sub-rent or alternative item required (T3-13)')
    })

    it('detects quantity capacity clash on quantity-tracked items', async () => {
      db.state.products = [
        { id: 'prod-cables', name: 'HDMI Cable 10m', total_quantity: 3 },
      ]
      db.state.reservations = [
        // Our booking has 2 cables
        { id: 'r-1', asset_id: null, product_id: 'prod-cables', booking_id: 'b-current', released_at: null },
        { id: 'r-2', asset_id: null, product_id: 'prod-cables', booking_id: 'b-current', released_at: null },
        // Another booking holds 2 cables during the extension period
        {
          id: 'r-3',
          asset_id: null,
          product_id: 'prod-cables',
          booking_id: 'b-other',
          period: '[2105-06-03 04:00:00+00,2105-06-06 04:00:00+00)',
          released_at: null,
        },
        {
          id: 'r-4',
          asset_id: null,
          product_id: 'prod-cables',
          booking_id: 'b-other',
          period: '[2105-06-03 04:00:00+00,2105-06-06 04:00:00+00)',
          released_at: null,
        },
      ]

      const result = await checkExtensionClash(
        'b-current',
        '2105-06-03T04:00:00Z',
        '2105-06-05T04:00:00Z',
      )

      expect(result.hasClash).toBe(true)
      expect(result.status).toBe('clash')
      expect(result.clashes[0]!.lineDescription).toContain('HDMI Cable 10m capacity exceeded')
    })
  })
})
