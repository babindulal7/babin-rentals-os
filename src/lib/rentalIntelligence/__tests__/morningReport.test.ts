import { describe, it, expect } from 'vitest'
import {
  generateMorningReport,
  type MorningReportInput,
  type BookingSummaryItem,
  type UnitMaintenanceItem,
} from '../morningReport'
import { rupees } from '../../money'

describe('Rental Intelligence RI-03: Morning Report Engine', () => {
  const sampleBookings: BookingSummaryItem[] = [
    {
      id: 'B-01',
      bookingNo: '2026-1001',
      clientName: 'Sunrise Productions',
      status: 'confirmed',
      pickupTimeIso: '2026-11-24T08:00:00Z',
      returnTimeIso: '2026-11-26T18:00:00Z',
      items: [
        { productId: 'BRPI-CAM-FX3', displayName: 'Sony FX3A Cinema Line Body', quantity: 1 },
      ],
      hasCaretaker: false,
    },
    {
      id: 'B-02',
      bookingNo: '2026-1002',
      clientName: 'Kathmandu Films',
      status: 'active',
      pickupTimeIso: '2026-11-20T08:00:00Z',
      returnTimeIso: '2026-11-24T18:00:00Z', // Today
      items: [
        { productId: 'BRPI-CAM-KOMODO-X', displayName: 'RED Komodo-X 6K Cinema Package', quantity: 1 },
      ],
      depositHeldPaisa: rupees(50000), // Shortfall against 150,000 required
      hasCaretaker: true,
    },
    {
      id: 'B-03',
      bookingNo: '2026-1003',
      clientName: 'Delayed Music Video',
      status: 'active',
      pickupTimeIso: '2026-11-22T08:00:00Z',
      returnTimeIso: '2026-11-23T18:00:00Z', // Yesterday (Overdue)
      items: [
        { productId: 'BRPI-LGT-600X', displayName: 'Aputure LS 600x Pro', quantity: 1 },
      ],
      overdueMinutes: 120, // 2 hours late
      lateFeeBilledPaisa: 0,
      isWetOrDamp: true,
      wetDecontaminationBilledPaisa: 0,
    },
  ]

  const sampleMaintenance: UnitMaintenanceItem[] = [
    {
      unitId: 'U-CHIOPT-01',
      serialNumber: 'SN-CH-9921',
      productId: 'BRPI-LNS-CHIOPT',
      productName: 'CHIOPT 28-85mm Cinema Zoom',
      holdReason: 'Monsoon high-humidity exposure during Pokhara outdoor shoot',
      holdStartedAtIso: '2026-11-23T16:00:00Z',
      quarantineType: 'monsoon_dry_cabinet',
    },
  ]

  const baseInput: MorningReportInput = {
    currentDateIso: '2026-11-24T06:00:00Z',
    nepaliDateBs: '2083-08-09',
    activeBookings: sampleBookings,
    maintenanceUnits: sampleMaintenance,
    dataFetchedAtIso: '2026-11-24T05:55:00Z',
  }

  it('aggregates operational counts for today and surfaces dual calendar date', () => {
    const report = generateMorningReport(baseInput, 'Coordinator')

    expect(report.reportDateIso).toBe('2026-11-24T06:00:00Z')
    expect(report.nepaliDateBs).toBe('2083-08-09')
    expect(report.pickupsTodayCount).toBe(1) // B-01
    expect(report.returnsTodayCount).toBe(1) // B-02
    expect(report.overdueCount).toBe(1) // B-03
    expect(report.maintenanceHoldCount).toBe(1) // CHIOPT in dry cabinet
    expect(report.evidenceState).toBe('supported')
  })

  it('detects operational revenue leakages for authorized Manager/Owner roles', () => {
    const report = generateMorningReport(baseInput, 'Manager')

    expect(report.isMoneyMasked).toBe(false)
    expect(report.leakageCount).toBeGreaterThanOrEqual(3)

    // 1. Missing Caretaker on Sony FX3 cinema package
    const caretakerLeak = report.leakageItems.find((l) => l.code === 'MISSING_CARETAKER')
    expect(caretakerLeak).toBeDefined()
    expect(caretakerLeak?.bookingNo).toBe('2026-1001')

    // 2. Under-Secured Deposit on RED Komodo
    const depositLeak = report.leakageItems.find((l) => l.code === 'UNDER_SECURED_DEPOSIT')
    expect(depositLeak).toBeDefined()
    expect(depositLeak?.bookingNo).toBe('2026-1002')

    // 3. Unbilled Late Return on B-03
    const lateLeak = report.leakageItems.find((l) => l.code === 'UNBILLED_LATE_RETURN')
    expect(lateLeak).toBeDefined()
    expect(lateLeak?.bookingNo).toBe('2026-1003')

    // 4. Wet Decontamination charge
    const wetLeak = report.leakageItems.find((l) => l.code === 'UNBILLED_WET_DECONTAMINATION')
    expect(wetLeak).toBeDefined()

    expect(report.totalRecoverableLeakagePaisa).toBeGreaterThan(0)
    expect(report.totalRecoverableLeakageFormatted).toContain('Rs')
  })

  it('flags stale operational data with needs_verification gate', () => {
    const staleInput: MorningReportInput = {
      ...baseInput,
      isStale: true,
    }

    const report = generateMorningReport(staleInput, 'Coordinator')
    expect(report.evidenceState).toBe('needs_verification')

    const staleAdv = report.advices.find((a) => a.id === 'adv-morning-stale')
    expect(staleAdv).toBeDefined()
    expect(staleAdv?.explanation).toContain('STALE OPERATIONAL DATA')
  })

  describe('Field-Level Gating & Role Isolation (HIS v2.1 §4)', () => {
    it('strips all financial leakage calculations and sums when user is Warehouse role', () => {
      const report = generateMorningReport(baseInput, 'Warehouse')

      expect(report.isMoneyMasked).toBe(true)
      expect(report.leakageCount).toBe(0)
      expect(report.leakageItems.length).toBe(0)
      expect(report.totalRecoverableLeakagePaisa).toBeUndefined()
      expect(report.totalRecoverableLeakageFormatted).toBeUndefined()

      // Operational equipment queues must remain accessible to Warehouse
      expect(report.pickupsTodayCount).toBe(1)
      expect(report.returnsTodayCount).toBe(1)
      expect(report.overdueCount).toBe(1)
      expect(report.maintenanceHoldCount).toBe(1)

      // Advices must not leak money to warehouse
      const leakageAdvice = report.advices.find((a) => a.id === 'adv-morning-leakage')
      expect(leakageAdvice).toBeUndefined()
    })

    it('strips financial leakage calculations when surface is floor', () => {
      const report = generateMorningReport(baseInput, 'Owner', 'floor')

      expect(report.isMoneyMasked).toBe(true)
      expect(report.totalRecoverableLeakagePaisa).toBeUndefined()
      expect(report.totalRecoverableLeakageFormatted).toBeUndefined()
      expect(report.leakageItems.length).toBe(0)
    })
  })
})
