import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getCrewTdsReport } from '../crewTdsReport'

const fixture = vi.hoisted(() => ({
  total: 401,
  failFrom: -1,
  duplicateAt: -1,
  offsets: [] as number[],
}))

vi.mock('../../settingsStore', () => ({
  getCrewPayoutTdsPercent: () => null,
}))

vi.mock('../crew', () => ({
  listCrewAssignments: async (filters?: { range?: { from: number; to: number } }) => {
    const from = filters?.range?.from ?? 0
    const to = filters?.range?.to ?? fixture.total - 1
    fixture.offsets.push(from)
    if (from === fixture.failFrom) throw new Error('Crew page read failed')

    const count = Math.max(0, Math.min(to + 1, fixture.total) - from)
    const rows = Array.from({ length: count }, (_, i) => {
      const index = from + i
      return {
        id: index === fixture.duplicateAt ? 'CREW-0' : `CREW-${index}`,
        name: 'Test Crew',
        role: 'Grip',
        phone: '',
        startDateAd: '2026-07-20',
        endDateAd: '2026-07-20',
        startDateBs: '2083-04-05',
        endDateBs: '2083-04-05',
        days: 1,
        totalCostPaisa: 10000,
        cancelled: false,
        payoutStatus: 'Paid',
        tdsAmountPaisa: null,
        tdsRatePercent: null,
        netPayoutPaisa: null,
        paidAt: null,
        payoutNotes: null,
      }
    })
    return { rows, total: null }
  },
}))

describe('accountant crew TDS source pagination', () => {
  beforeEach(() => {
    fixture.total = 401
    fixture.failFrom = -1
    fixture.duplicateAt = -1
    fixture.offsets = []
  })

  it('exports the 401st assignment rather than stopping at the first 400', async () => {
    const result = await getCrewTdsReport({
      from: '2026-07-01',
      to: '2026-07-31',
      requireComplete: true,
    })
    expect(result.payouts).toHaveLength(401)
    expect(result.metrics.payoutCount).toBe(401)
    expect(result.payouts[400]?.crewBookingNo).toBe('CREW-400')
    expect(fixture.offsets).toEqual([0, 400])
  })

  it('refuses a partial report when a subsequent page fails', async () => {
    fixture.failFrom = 400
    await expect(getCrewTdsReport({ requireComplete: true })).rejects.toThrow('Crew page read failed')
    expect(fixture.offsets).toEqual([0, 400])
  })

  it('refuses duplicate assignments across pages', async () => {
    fixture.duplicateAt = 400
    await expect(getCrewTdsReport({ requireComplete: true })).rejects.toThrow(
      'Crew assignment ledger changed during pagination',
    )
  })
})
