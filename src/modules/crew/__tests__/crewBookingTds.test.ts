import { describe, it, expect } from 'vitest'
import { payoutLedger, type CrewAssignment } from '../../../data/crew'
import { rupees } from '../../../lib/money'

describe('Crew Payout Ledger & TDS (Ruling D25 / Task T8-08 / O-5)', () => {
  const sampleAssignments: CrewAssignment[] = [
    {
      id: 'CB-2026-0001',
      crewId: 'CR-001',
      name: 'Aayush Shrestha',
      role: 'Grip',
      phone: '9841000001',
      production: 'Feature Film',
      linkedBooking: 'BK-001',
      location: 'Kathmandu',
      startDateBs: '2083-07-01',
      endDateBs: '2083-07-02',
      startDateAd: '2026-10-18',
      endDateAd: '2026-10-19',
      days: 2,
      dayRatePaisa: rupees(5000),
      totalCostPaisa: rupees(10000),
      status: 'Confirmed',
      cancelled: false,
      payoutStatus: 'Due',
      isInternalStaff: false,
    },
    {
      id: 'CB-2026-0002',
      crewId: 'CR-002',
      name: 'Bikash Thapa',
      role: '1st AC',
      phone: '9841000002',
      production: 'Feature Film',
      linkedBooking: 'BK-001',
      location: 'Pokhara',
      startDateBs: '2083-07-01',
      endDateBs: '2083-07-03',
      startDateAd: '2026-10-18',
      endDateAd: '2026-10-20',
      days: 3,
      dayRatePaisa: rupees(6000),
      totalCostPaisa: rupees(18000),
      status: 'Confirmed',
      cancelled: false,
      payoutStatus: 'Paid',
      isInternalStaff: false,
      // Stored snapshot figures from when it was paid with a 15% rate
      tdsRatePercent: 15,
      tdsAmountPaisa: rupees(2700),
      netPayoutPaisa: rupees(15300),
      paidAt: '2026-10-21T10:00:00Z',
      paidBy: '00000000-0000-4000-8000-00000000e006',
    },
    {
      id: 'CB-2026-0003',
      crewId: 'CR-003',
      name: 'Cancelled Crew',
      role: 'Gaffer',
      phone: '9841000003',
      production: 'Cancelled Shoot',
      linkedBooking: 'BK-002',
      location: 'Patan',
      startDateBs: '2083-07-05',
      endDateBs: '2083-07-05',
      startDateAd: '2026-10-22',
      endDateAd: '2026-10-22',
      days: 1,
      dayRatePaisa: rupees(8000),
      totalCostPaisa: rupees(8000),
      status: 'Draft',
      cancelled: true, // Law 3: cancelled rows kept on file, but owe nothing
      payoutStatus: 'Not due',
      isInternalStaff: false,
    },
  ]

  it('when rate is unconfigured (null), gross is real, TDS and net are null ("TDS: rate not set")', () => {
    const ledger = payoutLedger(sampleAssignments, null)
    // 2 live assignments (10,000 + 18,000 = 28,000). Cancelled row excluded.
    expect(ledger.count).toBe(2)
    expect(ledger.grossPaisa).toBe(rupees(28000))
    expect(ledger.tdsRatePercent).toBeNull()
    expect(ledger.tdsPaisa).toBeNull()
    expect(ledger.netPaisa).toBeNull()
  })

  it('when rate is set by accountant (e.g. 15%), TDS and net are calculated in integer paisa', () => {
    const ledger = payoutLedger(sampleAssignments, 15)
    expect(ledger.count).toBe(2)
    expect(ledger.grossPaisa).toBe(rupees(28000))
    expect(ledger.tdsRatePercent).toBe(15)
    // 15% of 28,000 = 4,200 Rs = 420,000 paisa
    expect(ledger.tdsPaisa).toBe(rupees(4200))
    // Net = 28,000 - 4,200 = 23,800 Rs
    expect(ledger.netPaisa).toBe(rupees(23800))
  })

  it('half-up integer paisa rounding holds for non-round TDS percentages', () => {
    // 1.5% TDS on Rs 28,000 = Rs 420
    const ledger1 = payoutLedger(sampleAssignments, 1.5)
    expect(ledger1.tdsPaisa).toBe(rupees(420))
    expect(ledger1.netPaisa).toBe(rupees(27580))

    // Single assignment of Rs 1,005 with 15% TDS:
    // 1005 * 0.15 = 150.75 Rs = 15075 paisa
    const single: CrewAssignment[] = [
      {
        ...sampleAssignments[0]!,
        totalCostPaisa: rupees(1005),
      },
    ]
    const ledger2 = payoutLedger(single, 15)
    expect(ledger2.grossPaisa).toBe(rupees(1005))
    expect(ledger2.tdsPaisa).toBe(rupees(150.75))
    expect(ledger2.netPaisa).toBe(rupees(854.25))
    expect(Number(ledger2.tdsPaisa) + Number(ledger2.netPaisa)).toBe(Number(ledger2.grossPaisa))
  })

  it('stored snapshot on historical paid assignment remains intact even when rate changes', () => {
    const paidRow = sampleAssignments.find((a) => a.id === 'CB-2026-0002')!
    expect(paidRow.tdsRatePercent).toBe(15)
    expect(paidRow.tdsAmountPaisa).toBe(rupees(2700))
    expect(paidRow.netPayoutPaisa).toBe(rupees(15300))

    // Changing the ledger calculation rate to 20% does not rewrite the assignment snapshot
    const ledgerAt20 = payoutLedger(sampleAssignments, 20)
    expect(ledgerAt20.tdsRatePercent).toBe(20)
    expect(paidRow.tdsAmountPaisa).toBe(rupees(2700))
  })
})
