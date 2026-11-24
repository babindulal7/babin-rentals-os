/**
 * Babin Rentals OS — Morning Report & Operational Intelligence Engine (RI-03)
 *
 * Operational intelligence and daily risk reporting:
 * 1. Queue Aggregation: Pickups today, expected returns, overdue equipment, shift handovers.
 * 2. Maintenance & Quarantine Tracking: Active QC, optical repairs, monsoon dry-cabinet 24h bake.
 * 3. Operational Leakage Audit:
 *    - Unbilled late returns (> 30 mins overage without fee or authorized waiver).
 *    - Missing Caretaker line on flagship cinema packages.
 *    - Under-secured liability deposits on cinema camera bodies.
 *    - Unbilled wet gear decontamination charges (Rs 5,000).
 * 4. Dual Calendar Support: Bikram Sambat (BS) and Anno Domini (AD) display in Asia/Kathmandu.
 * 5. Field-Level Gating (HIS v2.1 §4): Financial leakage and amounts strictly stripped for floor roles.
 */

import { formatMoney, type Paisa } from '../money'
import { moneyScope, type Surface } from '../fieldGating'
import type { SystemRole } from '../../types/database'
import type {
  RentalAdvice,
  AdviceTarget,
  EvidenceState,
} from './types'

export interface BookingSummaryItem {
  id: string
  clientName: string
  bookingNo: string
  status: 'draft' | 'confirmed' | 'packed' | 'dispatched' | 'active' | 'returned' | 'cancelled'
  pickupTimeIso: string
  returnTimeIso: string
  items: Array<{ productId: string; displayName: string; quantity: number }>
  totalPaisa?: number | undefined
  depositHeldPaisa?: number | undefined
  discountPercent?: number | undefined
  discountReason?: string | undefined
  discountApprover?: string | undefined
  hasCaretaker?: boolean | undefined
  overdueMinutes?: number | undefined
  lateFeeBilledPaisa?: number | undefined
  lateFeeWaiverReason?: string | undefined
  lateFeeWaiverApprover?: string | undefined
  isWetOrDamp?: boolean | undefined
  wetDecontaminationBilledPaisa?: number | undefined
}

export interface UnitMaintenanceItem {
  unitId: string
  serialNumber: string
  productId: string
  productName: string
  holdReason: string
  holdStartedAtIso: string
  quarantineType: 'qc_inspection' | 'repair' | 'monsoon_dry_cabinet' | 'damage_investigation'
}

export interface MorningReportInput {
  currentDateIso: string
  nepaliDateBs?: string | undefined
  activeBookings: BookingSummaryItem[]
  maintenanceUnits?: UnitMaintenanceItem[] | undefined
  shiftNotes?: string[] | undefined
  dataFetchedAtIso?: string | undefined
  isStale?: boolean | undefined
}

export interface OperationalLeakageItem {
  bookingId: string
  bookingNo: string
  clientName: string
  code:
    | 'MISSING_CARETAKER'
    | 'UNDER_SECURED_DEPOSIT'
    | 'UNAUTHORIZED_DISCOUNT'
    | 'UNBILLED_LATE_RETURN'
    | 'UNBILLED_WET_DECONTAMINATION'
  severity: 'review' | 'urgent'
  message: string
  recoverablePaisa?: number | undefined
  recoverableFormatted?: string | undefined
  action: string
}

export interface MorningReportSummary {
  reportDateIso: string
  nepaliDateBs?: string | undefined
  pickupsTodayCount: number
  returnsTodayCount: number
  overdueCount: number
  maintenanceHoldCount: number
  leakageCount: number
  totalRecoverableLeakagePaisa?: number | undefined
  totalRecoverableLeakageFormatted?: string | undefined
  pickupsToday: BookingSummaryItem[]
  returnsToday: BookingSummaryItem[]
  overdueBookings: BookingSummaryItem[]
  maintenanceUnits: UnitMaintenanceItem[]
  leakageItems: OperationalLeakageItem[]
  isMoneyMasked: boolean
  advices: RentalAdvice[]
  evidenceState: EvidenceState
}

const CINE_KEYWORDS = ['red', 'komodo', 'ronin 4d', 'fx3', 'chiopt', 'great joy', 'nisi athena', 'cine']

/**
 * Evaluates active queue, maintenance, and booking states to generate
 * the daily morning operational intelligence report.
 */
export function generateMorningReport(
  input: MorningReportInput,
  userRole: SystemRole = 'Coordinator',
  surface: Surface = 'default',
): MorningReportSummary {
  const target: AdviceTarget = { type: 'report', id: 'TODAY_QUEUE' }
  const nowIso = new Date().toISOString()
  const scope = moneyScope({ role: userRole, surface })
  const isMoneyMasked = scope === 'none'
  const advices: RentalAdvice[] = []

  const isStale = input.isStale === true
  if (isStale) {
    advices.push({
      id: 'adv-morning-stale',
      module: 'operations',
      target,
      evidenceState: 'needs_verification',
      severity: 'review',
      explanation: 'STALE OPERATIONAL DATA: Morning queue records have not been synced in the last 30 minutes. Refresh Today queue before staging bookings.',
      sourceRefs: ['src/modules/today/'],
      sourceKinds: ['live_os'],
      snapshotAt: nowIso,
      requiredChecks: ['Sync live bookings queue from database'],
    })
  }

  const currentDatePrefix = input.currentDateIso.slice(0, 10)
  const pickupsToday: BookingSummaryItem[] = []
  const returnsToday: BookingSummaryItem[] = []
  const overdueBookings: BookingSummaryItem[] = []
  const leakageItems: OperationalLeakageItem[] = []
  let totalRecoverablePaisa = 0

  for (const b of input.activeBookings) {
    const pickupDatePrefix = b.pickupTimeIso.slice(0, 10)
    const returnDatePrefix = b.returnTimeIso.slice(0, 10)

    if (pickupDatePrefix === currentDatePrefix && b.status !== 'cancelled' && b.status !== 'returned') {
      pickupsToday.push(b)
    }

    if (returnDatePrefix === currentDatePrefix && b.status !== 'cancelled' && b.status !== 'returned') {
      returnsToday.push(b)
    }

    const isOverdue =
      (b.overdueMinutes !== undefined && b.overdueMinutes > 0) ||
      (b.returnTimeIso < input.currentDateIso && (b.status === 'active' || b.status === 'dispatched'))

    if (isOverdue) {
      overdueBookings.push(b)
    }

    // ── Financial Leakage Audits (Omitted for Money-Blind Roles) ──────────
    if (!isMoneyMasked) {
      const itemNames = b.items.map((i) => i.displayName.toLowerCase())
      const hasCineGear = itemNames.some((name) => CINE_KEYWORDS.some((kw) => name.includes(kw)))

      // 1. Missing Caretaker Check
      if (hasCineGear && b.hasCaretaker !== true && b.status !== 'cancelled') {
        const recoverablePaisa = 200_000 // Rs 2,000 per day in paisa
        totalRecoverablePaisa += recoverablePaisa
        leakageItems.push({
          bookingId: b.id,
          bookingNo: b.bookingNo,
          clientName: b.clientName,
          code: 'MISSING_CARETAKER',
          severity: 'review',
          message: `Booking #${b.bookingNo} (${b.clientName}) includes cinema camera package but Caretaker attendance is omitted.`,
          recoverablePaisa,
          recoverableFormatted: formatMoney(recoverablePaisa as Paisa),
          action: 'Add Camera Caretaker line or verify authorized owner exemption.',
        })
      }

      // 2. Under-Secured Deposit Check
      const depositHeld = b.depositHeldPaisa ?? 0
      if (itemNames.some((n) => n.includes('komodo')) && depositHeld < 15_000_000) {
        // 15,000,000 paisa = Rs 150,000
        const shortfallPaisa = 15_000_000 - depositHeld
        totalRecoverablePaisa += shortfallPaisa
        leakageItems.push({
          bookingId: b.id,
          bookingNo: b.bookingNo,
          clientName: b.clientName,
          code: 'UNDER_SECURED_DEPOSIT',
          severity: 'urgent',
          message: `Booking #${b.bookingNo} has RED Komodo package with deposit of ${formatMoney(depositHeld as Paisa)} (Standard liability: Rs 1,50,000).`,
          recoverablePaisa: shortfallPaisa,
          recoverableFormatted: formatMoney(shortfallPaisa as Paisa),
          action: 'Collect required security deposit balance before equipment leaves warehouse.',
        })
      }

      // 3. Unbilled Late Return Check
      if ((b.overdueMinutes ?? 0) > 30 && (b.lateFeeBilledPaisa ?? 0) <= 0) {
        const hasValidWaiver =
          b.lateFeeWaiverReason !== undefined &&
          b.lateFeeWaiverReason.trim().length >= 10 &&
          b.lateFeeWaiverApprover !== undefined

        if (!hasValidWaiver) {
          const estimatedLateFeePaisa = 150_000 // Rs 1,500 baseline late fee in paisa
          totalRecoverablePaisa += estimatedLateFeePaisa
          leakageItems.push({
            bookingId: b.id,
            bookingNo: b.bookingNo,
            clientName: b.clientName,
            code: 'UNBILLED_LATE_RETURN',
            severity: 'urgent',
            message: `Booking #${b.bookingNo} returned ${b.overdueMinutes} mins late without billed late fee or verified waiver.`,
            recoverablePaisa: estimatedLateFeePaisa,
            recoverableFormatted: formatMoney(estimatedLateFeePaisa as Paisa),
            action: 'Bill standard late return fee or submit authorized manager waiver with justification.',
          })
        }
      }

      // 4. Unbilled Wet Decontamination Check
      if (b.isWetOrDamp === true && (b.wetDecontaminationBilledPaisa ?? 0) <= 0) {
        const decontamPaisa = 500_000 // Rs 5,000 in paisa
        totalRecoverablePaisa += decontamPaisa
        leakageItems.push({
          bookingId: b.id,
          bookingNo: b.bookingNo,
          clientName: b.clientName,
          code: 'UNBILLED_WET_DECONTAMINATION',
          severity: 'urgent',
          message: `Booking #${b.bookingNo} gear returned damp from shoot without decontamination charge.`,
          recoverablePaisa: decontamPaisa,
          recoverableFormatted: formatMoney(decontamPaisa as Paisa),
          action: 'Bill Rs 5,000 dry-cabinet decontamination fee and quarantine units for 24 hours.',
        })
      }
    }
  }

  // Generate Operational Advices
  if (overdueBookings.length > 0) {
    advices.push({
      id: 'adv-morning-overdue',
      module: 'operations',
      target,
      evidenceState: 'supported',
      severity: 'urgent',
      explanation: `OVERDUE ASSETS: ${overdueBookings.length} booking(s) currently past scheduled return deadline. Follow up with production crew to prevent downstream turnaround conflicts.`,
      sourceRefs: ['src/modules/today/'],
      sourceKinds: ['live_os'],
      snapshotAt: nowIso,
      requiredChecks: ['Contact DP or production coordinator', 'Assess downstream reservation impacts'],
    })
  }

  const maintenanceUnits = input.maintenanceUnits ?? []
  const dryCabinetUnits = maintenanceUnits.filter((u) => u.quarantineType === 'monsoon_dry_cabinet')
  if (dryCabinetUnits.length > 0) {
    advices.push({
      id: 'adv-morning-dry-cabinet',
      module: 'operations',
      target,
      evidenceState: 'supported',
      severity: 'info',
      explanation: `MONSOON QUARANTINE: ${dryCabinetUnits.length} optical asset(s) currently in 24-hour dry-cabinet bake. Do not dispatch until hygrometer reads <= 40% RH.`,
      sourceRefs: ['references/monsoon_sop.md'],
      sourceKinds: ['approved_knowledge'],
      snapshotAt: nowIso,
      requiredChecks: ['Inspect electronic dry cabinet humidity gauge (target <= 40% RH)'],
    })
  }

  if (leakageItems.length > 0 && !isMoneyMasked) {
    advices.push({
      id: 'adv-morning-leakage',
      module: 'operations',
      target,
      evidenceState: 'supported',
      severity: 'review',
      explanation: `OPERATIONAL LEAKAGE AUDIT: Detected ${leakageItems.length} potential revenue leakage item(s) totalling ${formatMoney(totalRecoverablePaisa as Paisa)} across today's bookings.`,
      sourceRefs: ['scripts/detect_profit_leakage.py'],
      sourceKinds: ['live_os'],
      snapshotAt: nowIso,
      requiredChecks: ['Review caretaker fees, deposit shortfalls, and late return billing'],
    })
  }

  const overallState: EvidenceState = isStale ? 'needs_verification' : 'supported'

  return {
    reportDateIso: input.currentDateIso,
    nepaliDateBs: input.nepaliDateBs,
    pickupsTodayCount: pickupsToday.length,
    returnsTodayCount: returnsToday.length,
    overdueCount: overdueBookings.length,
    maintenanceHoldCount: maintenanceUnits.length,
    leakageCount: leakageItems.length,
    totalRecoverableLeakagePaisa: isMoneyMasked ? undefined : totalRecoverablePaisa,
    totalRecoverableLeakageFormatted: isMoneyMasked
      ? undefined
      : formatMoney(totalRecoverablePaisa as Paisa),
    pickupsToday,
    returnsToday,
    overdueBookings,
    maintenanceUnits,
    leakageItems,
    isMoneyMasked,
    advices,
    evidenceState: overallState,
  }
}
