import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { toBs } from '../../lib/bs'

type PulseModule = typeof import('../pulse')

/*
 * pulse.ts reads "today" once, at import, through getBusinessToday(). The clock
 * is set first and the module registry is reset, so the module evaluates again
 * at that instant and the current-month preset is deterministic.
 */
async function loadPulseAt(iso: string): Promise<PulseModule> {
  vi.resetModules()
  vi.setSystemTime(new Date(iso))
  return import('../pulse')
}

beforeAll(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
})

afterAll(() => {
  vi.useRealTimers()
})

// 11:45 in Kathmandu on these days: 8 Mangsir 2083, then 5 Poush 2083.
const NOV_24_2026 = '2026-11-24T06:00:00Z'
const DEC_20_2026 = '2026-12-20T06:00:00Z'

const dayOf = (d: Date | undefined) => d?.toISOString().slice(0, 10)

describe('Reports period presets — BS month option', () => {
  it('names the current BS month and its year, computed from the clock', async () => {
    const { PERIODS } = await loadPulseAt(NOV_24_2026)
    const bsMonth = PERIODS.find((p) => p.key === 'bs-month')

    expect(bsMonth?.label).toBe('BS month · Mangsir 2083 to date')
    expect(bsMonth?.why).toBeNull()
    expect(dayOf(bsMonth?.range?.from)).toBe('2026-11-17')
    expect(dayOf(bsMonth?.range?.to)).toBe('2026-11-24')
    // The AD start is the table's own first day of that BS month.
    expect(toBs(bsMonth?.range?.from ?? new Date(NaN))).toEqual({ year: 2083, month: 8, day: 1 })
  })

  it('follows the clock into a later BS month instead of naming Shrawan', async () => {
    const { PERIODS } = await loadPulseAt(DEC_20_2026)
    const bsMonth = PERIODS.find((p) => p.key === 'bs-month')

    expect(bsMonth?.label).toBe('BS month · Poush 2083 to date')
    expect(bsMonth?.range).not.toBeNull()
    expect(dayOf(bsMonth?.range?.from)).toBe('2026-12-16')
    expect(dayOf(bsMonth?.range?.to)).toBe('2026-12-20')
    expect(PERIODS.some((p) => p.label.includes('Shrawan'))).toBe(false)
  })

  it('offers the BS month as one month, not the fiscal year to date', async () => {
    const { PERIODS } = await loadPulseAt(NOV_24_2026)
    const thisFy = PERIODS.find((p) => p.key === 'this-fy')
    const bsMonth = PERIODS.find((p) => p.key === 'bs-month')

    // The BS month is one month, not the whole fiscal year to date.
    expect(dayOf(thisFy?.range?.from)).toBe('2026-07-17')
    expect(dayOf(bsMonth?.range?.from)).not.toBe(dayOf(thisFy?.range?.from))
  })

  it('computes last fiscal year 2082/83 from the table, and says why the ledger cannot answer it', async () => {
    const { PERIODS } = await loadPulseAt(NOV_24_2026)
    const lastFy = PERIODS.find((p) => p.key === 'last-fy')

    expect(lastFy?.label).toBe('Last fiscal year (2082/83)')
    expect(lastFy?.range).toBeNull()
    // The reason is the seed ledger's coverage, not a claim about the BS table.
    expect(lastFy?.why).toMatch(/^Outside the seed ledger, which covers /)
    expect(lastFy?.why).not.toMatch(/Shrawan 2083|table covers/)
  })

  it('keeps both quarter presets unavailable, with a reason that names no table', async () => {
    const { PERIODS } = await loadPulseAt(NOV_24_2026)

    for (const key of ['this-quarter', 'last-quarter']) {
      const quarter = PERIODS.find((p) => p.key === key)
      expect(quarter?.range).toBeNull()
      expect(quarter?.why).toBe('Quarter periods are not defined for the Nepali calendar in this build.')
    }
  })

  it('keeps developer references out of every staff-facing string', async () => {
    const pulse = await loadPulseAt(NOV_24_2026)
    const outOfTable = pulse.rangeLabel(new Date(Date.UTC(2000, 0, 1)), new Date(Date.UTC(2000, 0, 1)))
    const copy: string[] = [
      ...pulse.PERIODS.flatMap((p) => [p.label, p.why ?? '']),
      ...Object.values(pulse.DEFINITIONS).flatMap((d) => [d.title, d.shows, d.formula, d.source, d.basis, d.excludes]),
      ...pulse.RECONCILIATION.flatMap((r) => [r.figure, r.engine]),
      pulse.PERIOD_BASIS,
      pulse.MODEL_DISCLOSURE,
      outOfTable.bsNote ?? '',
      ...pulse.LEDGER_ASSERTION_ERRORS,
      ...pulse.FLEET_RECONCILIATION_ERRORS,
    ]

    expect(outOfTable.bsNote).not.toBeNull()
    expect(copy.filter((s) => /lib\/|TODO|§/.test(s))).toEqual([])
  })
})
