import { describe, it, expect } from 'vitest'
import {
  parseRebookCopyOptions,
  formatRebookCopyOptions,
  buildRebookPrefill,
  rebookTickSummary,
  REBOOK_UNAVAILABLE_REASON,
  type RebookSource,
  type RebookProductToday,
  type RebookBundleToday,
} from '../rebook'
import { rupees } from '../money'

const SOURCE: RebookSource = {
  bookingNo: 'BK-2026-0042',
  clientId: 'cli-1',
  clientName: 'Alpha Films',
  deliveryType: 'Babin Delivery',
  lines: [
    {
      id: 'src-l1',
      lineType: 'Equipment',
      productId: 'prod-1',
      bundleId: null,
      name: 'Sony FX6',
      qty: 1,
      isIncluded: false,
      parentLineId: null,
    },
    {
      id: 'src-l2',
      lineType: 'Equipment',
      productId: 'prod-archived',
      bundleId: null,
      name: 'Old Tripod',
      qty: 1,
      isIncluded: false,
      parentLineId: null,
    },
  ],
  crew: [
    {
      crewMemberId: 'cr-1',
      name: 'Sita',
      role: 'AC',
      phone: '9800000000',
      dayRatePaisa: rupees(3000),
      overtimePaisa: rupees(0),
      accommodationPaisa: rupees(0),
      mealsPaisa: rupees(0),
    },
  ],
  transport: {
    vehicle: 'Van',
    numberPlate: 'BA 1 CHA 1234',
    driverContact: '9811111111',
    deliveryChargePaisa: rupees(2000),
    fuelChargePaisa: rupees(0),
    specialInstructions: 'Call gate',
  },
  discountPct: 10,
}

describe('rebook engine', () => {
  it('parses and formats copy= query options while ignoring unknown keys', () => {
    const parsed = parseRebookCopyOptions('crew, unknown, discounts')
    expect(parsed).toEqual({ crew: true, delivery: false, discounts: true })
    expect(formatRebookCopyOptions(parsed)).toBe('crew,discounts')
    expect(formatRebookCopyOptions({ crew: false, delivery: false, discounts: false })).toBeNull()
  })

  it('copies active products at today rates and omits crew/delivery/discounts by default', () => {
    let seq = 0
    const products = new Map<string, RebookProductToday>([
      ['prod-1', { id: 'prod-1', name: 'Sony FX6', isActive: true, dailyRatePaisa: rupees(12000), categoryName: 'Cameras' }],
      ['prod-archived', { id: 'prod-archived', name: 'Old Tripod', isActive: false, dailyRatePaisa: rupees(1000), categoryName: 'Support' }],
    ])
    const bundles = new Map<string, RebookBundleToday>()

    const prefill = buildRebookPrefill(SOURCE, products, bundles, { crew: false, delivery: false, discounts: false }, () => `uuid-${++seq}`)
    expect(prefill.sourceBookingNo).toBe('BK-2026-0042')
    expect(prefill.lines).toHaveLength(1)
    expect(prefill.lines[0]?.ratePaisa).toBe(rupees(12000))
    expect(prefill.unavailable).toEqual([{ name: 'Old Tripod', reason: REBOOK_UNAVAILABLE_REASON }])
    expect(prefill.crew).toEqual([])
    expect(prefill.delivery).toBeNull()
    expect(prefill.discountPct).toBeNull()
  })

  it('copies crew, delivery, and discounts when ticked and produces tick summaries', () => {
    let seq = 0
    const products = new Map<string, RebookProductToday>([
      ['prod-1', { id: 'prod-1', name: 'Sony FX6', isActive: true, dailyRatePaisa: rupees(12000), categoryName: 'Cameras' }],
    ])
    const prefill = buildRebookPrefill(SOURCE, products, new Map(), { crew: true, delivery: true, discounts: true }, () => `uuid-${++seq}`)

    expect(prefill.crew).toHaveLength(1)
    expect(prefill.delivery?.deliveryChargePaisa).toBe(rupees(2000))
    expect(prefill.discountPct).toBe(10)
    expect(rebookTickSummary('crew', SOURCE)).toBe('1 member')
    expect(rebookTickSummary('discounts', SOURCE)).toBe('10%')
  })
})
