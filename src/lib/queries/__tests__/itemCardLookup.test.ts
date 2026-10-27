import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockFrom = vi.fn()

vi.mock('../../supabase', () => ({
  supabase: {
    from: (table: string) => mockFrom(table),
  },
  IS_MOCK: true,
  loadMockClient: vi.fn(),
}))

import { getItemCardData } from '../inventory'
import { lookupItemCard } from '../../scannerLookup'

function createQueryBuilder(rows: any[], count: number | null = rows.length) {
  const b: any = {
    select: vi.fn(() => b),
    eq: vi.fn(() => b),
    or: vi.fn(() => b),
    in: vi.fn(() => b),
    gt: vi.fn(() => b),
    gte: vi.fn(() => b),
    lt: vi.fn(() => b),
    lte: vi.fn(() => b),
    is: vi.fn(() => b),
    order: vi.fn(() => b),
    range: vi.fn(() => b),
    limit: vi.fn(() => b),
    maybeSingle: vi.fn(() => Promise.resolve({ data: rows[0] ?? null, error: null })),
    then: (resolve: any) => resolve({ data: rows, count, error: null }),
  }
  return b
}

describe('getItemCardData & lookupItemCard (T2-14, W91)', () => {
  beforeEach(() => {
    mockFrom.mockReset()
  })

  it('returns null for empty barcode', async () => {
    const res = await getItemCardData('')
    expect(res).toBeNull()
  })

  it('resolves item card with custody, countdown, location, reset, and damage', async () => {
    const mockUnitId = '11111111-1111-1111-1111-111111111111'
    const mockProductId = '22222222-2222-2222-2222-222222222222'
    const mockBookingId = '33333333-3333-3333-3333-333333333333'
    const mockClientId = '44444444-4444-4444-4444-444444444444'

    const returnAt = new Date(Date.now() + 7200 * 1000).toISOString() // 2 hours from now

    const productRow = {
      id: mockProductId,
      name: 'Sony FX3 Cinema Camera',
      brand: 'Sony',
      model: 'FX3',
      asset_code: 'EQ000001',
      category: { name: 'Cameras' },
      tracking_mode: 'Serialised',
      daily_rate: 450000,
    }

    const unitRow = {
      id: mockUnitId,
      product_id: mockProductId,
      asset_tag: 'EQ000001-U01',
      serial_no: 'SN-FX3-0001',
      barcode: 'EQ000001-U01',
      qr_code: 'EQ000001-U01',
      status: 'On Rent',
      condition: 'Good',
      branch_id: 'b1',
      warehouse_id: 'w1',
      storage_zone_id: null,
      rack: 'A',
      shelf: '2',
      bin: '04',
      running_hours: 120,
      replacement_value: 28000000,
    }

    mockFrom.mockImplementation((table: string) => {
      if (table === 'product_units_v') {
        const b = createQueryBuilder([unitRow])
        return b
      }
      if (table === 'products_v') {
        return createQueryBuilder([productRow])
      }
      if (table === 'booking_line_units') {
        return createQueryBuilder([
          {
            id: 'blu-1',
            booking_id: mockBookingId,
            asset_id: mockUnitId,
            unit_state: 'Picked Up',
            returned_at: null,
            released_at: null,
          },
        ])
      }
      if (table === 'bookings') {
        return createQueryBuilder([
          {
            id: mockBookingId,
            booking_no: 'BK-2026-0001',
            client_id: mockClientId,
            stage: 'On Rent',
            pickup_at: '2026-10-25T10:00:00Z',
            return_at: returnAt,
            actual_return_at: null,
            cancelled_at: null,
          },
        ])
      }
      if (table === 'clients') {
        return createQueryBuilder([
          {
            id: mockClientId,
            name: 'Kathmandu Cine Arts',
            phone: '9841000000',
            email: 'info@kca.com.np',
          },
        ])
      }
      if (table === 'cleaning_queue_entries') {
        return createQueryBuilder([
          {
            id: 'cq-1',
            unit_id: mockUnitId,
            state: 'Done',
            clean_completed_at: '2026-10-24T15:00:00Z',
            reset_completed_at: '2026-10-24T15:30:00Z',
            completed_at: '2026-10-24T15:30:00Z',
            cleaned_by: 'u-1',
            qc_by: 'u-1',
            qc_self_checked: true,
            qc_skipped: false,
            qc_skip_reason: null,
            problem_state: 'No Problems',
          },
        ])
      }
      if (table === 'users') {
        return createQueryBuilder([{ id: 'u-1', full_name: 'Roshan Shrestha' }])
      }
      if (table === 'damage_findings') {
        return createQueryBuilder([])
      }
      if (table === 'inventory_reservations') {
        return createQueryBuilder([])
      }
      if (table === 'booking_lines') {
        return createQueryBuilder([])
      }

      return createQueryBuilder([])
    })

    const card = await getItemCardData('EQ000001', { withMoney: false })
    expect(card).not.toBeNull()
    expect(card?.name).toBe('Sony FX3 Cinema Camera')
    expect(card?.assetTag).toBe('EQ000001-U01')
    expect(card?.serialNo).toBe('SN-FX3-0001')
    expect(card?.status).toBe('On Rent')

    // Location
    expect(card?.location?.formatted).toBe('Rack A · Shelf 2 · Bin 04')

    // Custody (W91)
    expect(card?.custody).not.toBeNull()
    expect(card?.custody?.clientName).toBe('Kathmandu Cine Arts')
    expect(card?.custody?.clientPhone).toBe('9841000000')
    expect(card?.custody?.bookingNo).toBe('BK-2026-0001')
    expect(card?.custody?.stage).toBe('On Rent')
    expect(card?.custody?.isOverdue).toBe(false)
    expect(card?.custody?.countdownText).toContain('Due in')

    // Reset (W43 self-checked)
    expect(card?.lastReset).not.toBeNull()
    expect(card?.lastReset?.qcSelfChecked).toBe(true)
    expect(card?.lastReset?.summary).toContain('alone on shift, W43')

    // Open damage
    expect(card?.openDamage.hasDamage).toBe(false)

    // Money hidden (Law 6)
    expect(card?.financials).toBeNull()

    // Test withMoney = true
    const cardWithMoney = await lookupItemCard('EQ000001', { withMoney: true })
    expect(cardWithMoney?.financials).not.toBeNull()
    expect(cardWithMoney?.financials?.dailyRate).toBe(45000000)
    expect(cardWithMoney?.financials?.replacementValue).toBe(2800000000)
  })
})
