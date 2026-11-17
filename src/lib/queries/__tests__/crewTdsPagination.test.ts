import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getCrewTdsReport } from '../crewTdsReport'

const fixture = vi.hoisted(() => ({
  total: 401,
  failFrom: -1,
  duplicateAt: -1,
  paidAt: '2026-07-20T10:00:00Z' as string | null,
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
        paidAt: fixture.paidAt,
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
    fixture.paidAt = '2026-07-20T10:00:00Z'
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

  it('assigns paid TDS to Nepal payout month, not the shoot start month', async () => {
    fixture.total = 1
    // July 31 20:00 UTC is August 1 in Kathmandu.
    fixture.paidAt = '2026-07-31T20:00:00Z'
    const july = await getCrewTdsReport({
      from: '2026-07-01', to: '2026-07-31', requireComplete: true,
    })
    expect(july.payouts).toHaveLength(0)

    const august = await getCrewTdsReport({
      from: '2026-08-01', to: '2026-08-31', requireComplete: true,
    })
    expect(august.payouts).toHaveLength(1)
    expect(august.payouts[0]?.tdsIsRecorded).toBe(false)
  })

  it('refuses paid crew without a recorded payment date', async () => {
    fixture.total = 1
    fixture.paidAt = null
    await expect(getCrewTdsReport({ requireComplete: true })).rejects.toThrow(
      'Paid crew assignment has no payout timestamp',
    )
  })

  it('refuses duplicate assignments across pages', async () => {
    fixture.duplicateAt = 400
    await expect(getCrewTdsReport({ requireComplete: true })).rejects.toThrow(
      'Crew assignment ledger changed during pagination',
    )
  })
})
