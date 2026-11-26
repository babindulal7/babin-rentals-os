import { describe, expect, it, vi } from 'vitest'
import { getCrewTdsReport } from '../crewTdsReport'

const fixture = vi.hoisted(() => ({ rows: [] as Array<Record<string, unknown>> }))

vi.mock('../../settingsStore', () => ({
  getCrewPayoutTdsPercent: () => null,
}))

vi.mock('../crew', () => ({
  listCrewAssignments: async () => ({ rows: fixture.rows, total: null }),
}))

function assignment(id: string, startDateAd: string, totalCostPaisa: number) {
  return {
    id,
    name: 'Test Crew',
    role: 'Grip',
    phone: '',
    startDateAd,
    endDateAd: startDateAd,
    startDateBs: '',
    endDateBs: '',
    days: 1,
    totalCostPaisa,
    cancelled: false,
    payoutStatus: 'Paid',
    tdsAmountPaisa: null,
    tdsRatePercent: null,
    netPayoutPaisa: null,
    paidAt: '2026-08-30T10:00:00Z',
    payoutNotes: null,
  }
}

describe('crew TDS monthly schedule — Bikram Sambat buckets', () => {
  it('buckets each payout by its own BS month, not by the AD month of its start date', async () => {
    fixture.rows = [
      assignment('CB-0001', '2026-07-25', 1_000_000), // Shrawan 2083
      assignment('CB-0004', '2026-07-09', 3_600_000), // Ashadh 2083 (the 9 Jul payout)
      assignment('CB-0005', '2026-08-10', 2_000_000), // Shrawan 2083
      assignment('CB-0006', '2026-08-20', 500_000), // Bhadra 2083
    ]

    const report = await getCrewTdsReport()

    // Newest BS month first, one row per BS month. Both July 2026 payouts that
    // fall in different BS months must not share a row.
    expect(
      report.monthlySchedule.map((row) => [row.monthBs, row.payoutCount, Number(row.grossPayouts), row.monthAd]),
    ).toEqual([
      ['Bhadra 2083', 1, 500_000, 'August 2026 – September 2026'],
      ['Shrawan 2083', 2, 3_000_000, 'July 2026 – August 2026'],
      ['Ashadh 2083', 1, 3_600_000, 'June 2026 – July 2026'],
    ])
    expect(report.monthlySchedule.reduce((sum, row) => sum + row.payoutCount, 0)).toBe(report.payouts.length)
  })
})
