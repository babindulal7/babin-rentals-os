import { describe, expect, it, vi } from 'vitest'
import { createScanRepeatGuard, resolveScanAdd, SCAN_REPEAT_WINDOW_MS, type ScanAddEquipment } from '../scanAdd'
import type { ItemCardData } from '../queries/inventory'

const item = (over: Partial<ScanAddEquipment> = {}): ScanAddEquipment => ({
  id: 'prod-1',
  name: 'ARRI Alexa Mini',
  unavailable: false,
  ...over,
})

const card = (over: Partial<ItemCardData> = {}): ItemCardData => ({
  unitId: 'unit-1',
  productId: 'prod-1',
  name: 'ARRI Alexa Mini',
  brand: null,
  model: null,
  assetCode: 'AX-1',
  assetTag: 'AX-1',
  serialNo: null,
  barcode: null,
  status: 'available',
  condition: 'good',
  categoryName: null,
  location: null,
  custody: null,
  nextBooking: null,
  lastReset: null,
  openDamage: { hasOpen: false } as unknown as ItemCardData['openDamage'],
  financials: null,
  ...over,
} as ItemCardData)

describe('createScanRepeatGuard', () => {
  it('ignores the same code inside the window and accepts it after', () => {
    let t = 1_000
    const guard = createScanRepeatGuard(() => t)
    expect(guard('AX-1')).toBe(false)
    t += SCAN_REPEAT_WINDOW_MS - 1
    expect(guard('AX-1')).toBe(true)
    t += SCAN_REPEAT_WINDOW_MS
    expect(guard('AX-1')).toBe(false)
  })

  it('never ignores a different code — no debounce between distinct scans', () => {
    let t = 1_000
    const guard = createScanRepeatGuard(() => t)
    expect(guard('AX-1')).toBe(false)
    t += 10
    expect(guard('AX-2')).toBe(false)
    t += 10
    expect(guard('AX-1')).toBe(false)
  })

  it('is case- and whitespace-insensitive about "the same code"', () => {
    const guard = createScanRepeatGuard(() => 5)
    expect(guard('ax-1')).toBe(false)
    expect(guard('  AX-1 ')).toBe(true)
  })
})

describe('resolveScanAdd', () => {
  const base = { code: 'AX-1', days: 2, existingLineIds: [] as string[] }

  it('adds the matched product when it is free', async () => {
    const lookup = vi.fn().mockResolvedValue(card())
    const out = await resolveScanAdd({ ...base, equipment: [item()], lookup })
    expect(out).toEqual({
      status: 'added',
      id: 'prod-1',
      unitId: 'unit-1',
      mode: 'new_line',
      message: 'ARRI Alexa Mini AX-1 added to this booking.',
    })
    expect(lookup).toHaveBeenCalledWith('AX-1')
  })

  it('a product-level code (no unit) adds the product with no unit to reserve', async () => {
    const out = await resolveScanAdd({ ...base, equipment: [item()], lookup: async () => card({ unitId: null }) })
    expect(out).toEqual({
      status: 'added',
      id: 'prod-1',
      unitId: null,
      mode: 'new_line',
      message: 'ARRI Alexa Mini added to this booking.',
    })
  })

  it('a second different unit of a product already on the booking is one more of it', async () => {
    const out = await resolveScanAdd({
      ...base,
      equipment: [item()],
      existingLineIds: ['prod-1'],
      existingUnitIds: ['unit-0'],
      lookup: async () => card({ unitId: 'unit-1' }),
    })
    expect(out).toMatchObject({ status: 'added', mode: 'more_units', unitId: 'unit-1' })
  })

  it('refuses the same unit scanned onto the booking twice', async () => {
    const out = await resolveScanAdd({
      ...base,
      equipment: [item()],
      existingLineIds: ['prod-1'],
      existingUnitIds: ['unit-1'],
      lookup: async () => card({ unitId: 'unit-1' }),
    })
    expect(out).toMatchObject({ status: 'blocked', reason: 'already_on_booking' })
    expect(out.status === 'blocked' && out.message).toContain('AX-1')
  })

  it('refuses a unit that is held for these dates, with the checker sentence, never swapping', async () => {
    const checkUnit = vi.fn().mockResolvedValue('ARRI Alexa Mini: unit AX-1 is held by BK-204 for these dates.')
    const out = await resolveScanAdd({ ...base, equipment: [item()], lookup: async () => card(), checkUnit })
    expect(checkUnit).toHaveBeenCalledWith('unit-1', 'prod-1', 'ARRI Alexa Mini')
    expect(out).toMatchObject({ status: 'blocked', reason: 'unavailable', message: 'ARRI Alexa Mini: unit AX-1 is held by BK-204 for these dates.' })
  })

  it('does not run the unit check for a product-level code', async () => {
    const checkUnit = vi.fn().mockResolvedValue('nope')
    const out = await resolveScanAdd({ ...base, equipment: [item()], lookup: async () => card({ unitId: null }), checkUnit })
    expect(checkUnit).not.toHaveBeenCalled()
    expect(out.status).toBe('added')
  })

  it('says so when the code matches nothing', async () => {
    const out = await resolveScanAdd({ ...base, equipment: [item()], lookup: async () => null })
    expect(out).toMatchObject({ status: 'blocked', reason: 'unknown_code' })
    expect(out.status === 'blocked' && out.message).toContain('AX-1')
  })

  it('says so when the product is not in the rentable catalogue', async () => {
    const out = await resolveScanAdd({ ...base, equipment: [item({ id: 'other' })], lookup: async () => card() })
    expect(out).toMatchObject({ status: 'blocked', reason: 'not_rentable' })
  })

  it('does not add a product-level code for a product already on the booking', async () => {
    const out = await resolveScanAdd({ ...base, equipment: [item()], existingLineIds: ['prod-1'], lookup: async () => card({ unitId: null }) })
    expect(out).toMatchObject({ status: 'blocked', reason: 'already_on_booking' })
  })

  it('names who has a booked unit and the booking number', async () => {
    const custody = { bookingNo: 'BK-204', clientName: 'Sunrise Films', returnAt: '2026-11-15T10:00:00Z', isOverdue: false } as ItemCardData['custody']
    const out = await resolveScanAdd({
      ...base,
      equipment: [item({ unavailable: true })],
      lookup: async () => card({ custody }),
    })
    expect(out).toMatchObject({ status: 'blocked', reason: 'unavailable' })
    expect(out.status === 'blocked' && out.message).toContain('Sunrise Films')
    expect(out.status === 'blocked' && out.message).toContain('BK-204')
  })

  it('falls back to a dates message when no holder is known', async () => {
    const out = await resolveScanAdd({ ...base, equipment: [item({ unavailable: true })], lookup: async () => card() })
    expect(out).toMatchObject({ status: 'blocked', reason: 'unavailable' })
    expect(out.status === 'blocked' && out.message).toContain('not free for these dates')
  })

  it('reports a failed lookup inline instead of throwing', async () => {
    const out = await resolveScanAdd({
      ...base,
      equipment: [item()],
      lookup: async () => {
        throw new Error('network down')
      },
    })
    expect(out).toMatchObject({ status: 'blocked', reason: 'lookup_failed' })
  })

  it('refuses honestly while the live catalogue has not loaded', async () => {
    const out = await resolveScanAdd({ ...base, equipment: null, lookup: async () => card() })
    expect(out).toMatchObject({ status: 'blocked', reason: 'catalogue_not_loaded' })
  })
})
