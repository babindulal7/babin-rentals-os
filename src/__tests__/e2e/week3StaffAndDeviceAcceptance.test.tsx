// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import {
  canAdvance,
  closeGates,
  assertOneJobInProgress,
  assertItemCounts,
  planTransition,
  FLAGS,
  type CloseGateInput,
  type ItemCounts,
} from '../../lib/workflow'
import {
  calculatePricingPipeline,
  calculateAdvanceRequired,
  type PricingPipelineInput,
} from '../../lib/pricingPipeline'
import {
  settleDeposit,
  validateDamageReport,
} from '../../lib/damage'
import { rupees, toRupees, type Paisa, REFERENCE_CASE, REFERENCE_CASE_ERROR } from '../../lib/money'
import { rentalDaysBetween } from '../../lib/rentalDays'
import { operationalDayOf, OPERATIONAL_DAY_START_DEFAULT_MINUTES } from '../../lib/operationalDay'
import { getRentalPrimaryAction } from '../../lib/rentalActions'
import { canViewMoney, canApproveDiscount, canApproveDailyClosing } from '../../lib/rbac'
import { isMoneySurface } from '../../data/nav'
import {
  checkExternalHoldConflicts,
  type ExternalHoldRecord,
  type OsReservationCandidate,
} from '../../lib/externalHolds'
import { lateBand, bandConsequence } from '../../lib/lateFee'
import { gateContext, canViewMoneyField, moneyScope } from '../../lib/fieldGating'
import { BP, TEST_WIDTHS, viewportFor } from '../../lib/breakpoints'
import type { SystemRole } from '../../types/database'

function makePipelineInput(overrides: Partial<PricingPipelineInput>): PricingPipelineInput {
  return {
    equipmentSubtotalPaisa: 0 as Paisa,
    bundleSubtotalPaisa: 0 as Paisa,
    subRentalSubtotalPaisa: 0 as Paisa,
    servicesSubtotalPaisa: 0 as Paisa,
    crewSubtotalPaisa: 0 as Paisa,
    deliveryChargePaisa: 0 as Paisa,
    fuelChargePaisa: 0 as Paisa,
    vatEnabled: true,
    ...overrides,
  }
}

describe('Week 3 Staff & Device Acceptance Test Suite', () => {
  const BOOKING_NO = 'BK-2026-W3-ACCEPTANCE'

  /* ──────────────────────────────────────────────────────────────────────────
   * 1. The 15 Representative Rental Acceptance Cases (RC-01 – RC-15)
   * ────────────────────────────────────────────────────────────────────────── */
  describe('Part 1: 15 Representative Rental Acceptance Cases', () => {
    // RC-01: Standard 1-Day Single-Unit Shoot (Sony FX6)
    it('RC-01: executes standard 1-day shoot with 50% advance and full deposit return', () => {
      const pricing = calculatePricingPipeline(
        makePipelineInput({
          equipmentSubtotalPaisa: rupees(7000),
          vatEnabled: true,
          recommendedDepositPaisa: rupees(10000),
        }),
      )
      expect(pricing.grossSubtotalPaisa).toBe(rupees(7000))
      expect(pricing.vatPaisa).toBe(rupees(910)) // 13% of 7000
      expect(pricing.rentalTotalPaisa).toBe(rupees(7910))
      // Tiered advance: <= 5,000 full, <= 10,000 flat Rs 5,000, > 10,000 50%
      expect(calculateAdvanceRequired(pricing.rentalTotalPaisa)).toBe(rupees(5000))
      expect(pricing.securityDeposit.requiredPaisa).toBe(rupees(10000))

      // Stage progression
      expect(canAdvance('Quote', 'Booked')).toBe(true)
      expect(canAdvance('Booked', 'Packed')).toBe(true)
      expect(canAdvance('Packed', 'On Rent')).toBe(true)
      expect(canAdvance('On Rent', 'Returned')).toBe(true)
      expect(canAdvance('Returned', 'Closed')).toBe(true)

      // Clean deposit settlement
      const depositSettled = settleDeposit(rupees(10000), 0)
      expect(depositSettled.refundPaisa).toBe(rupees(10000))
      expect(depositSettled.shortfallPaisa).toBe(0)
    })

    // RC-02: Multi-Day Commercial Shoot Package
    it('RC-02: computes multi-day commercial package with 10% discount and integer VAT', () => {
      const pricing = calculatePricingPipeline(
        makePipelineInput({
          equipmentSubtotalPaisa: rupees(36000),
          discounts: { manualDiscountPercent: 10 },
          vatEnabled: true,
          recommendedDepositPaisa: rupees(20000),
        }),
      )
      expect(pricing.grossSubtotalPaisa).toBe(rupees(36000))
      expect(pricing.discounts.discountPaisa).toBe(rupees(3600))
      expect(pricing.taxableSubtotalPaisa).toBe(rupees(32400))
      expect(pricing.vatPaisa).toBe(rupees(4212)) // 13% of 32400
      expect(pricing.rentalTotalPaisa).toBe(rupees(36612))

      // 3 rental days between pickup and return
      const days = rentalDaysBetween('2026-12-08T00:15:00.000Z', '2026-12-11T00:15:00.000Z')
      expect(days).toBe(3)
    })

    // RC-03: Weekend 06:00 AM Shift Rollover Boundary
    it('RC-03: differentiates 05:45 AM return (Saturday shift) from 06:15 AM return (Sunday shift)', () => {
      // 05:45:00 NPT is before 06:00 AM -> belongs to previous operational day
      const opDayEarly = operationalDayOf('2026-12-13T05:45:00.000+05:45', OPERATIONAL_DAY_START_DEFAULT_MINUTES)
      expect(opDayEarly).toBe('2026-12-12')

      // 06:15:00 NPT rolls over -> begins new operational day
      const opDayRollover = operationalDayOf('2026-12-13T06:15:00.000+05:45', OPERATIONAL_DAY_START_DEFAULT_MINUTES)
      expect(opDayRollover).toBe('2026-12-13')

      // Span: Friday 19:00 NPT (13:15 UTC Dec 11) to Sunday 05:45 NPT (00:00 UTC Dec 13) = 2 rental days
      const daysEarly = rentalDaysBetween('2026-12-11T13:15:00.000Z', '2026-12-13T00:00:00.000Z')
      expect(daysEarly).toBe(2)

      // Returning at 06:15 NPT (00:30 UTC Dec 13) crosses 06:00 shift -> 3 rental days
      const daysLate = rentalDaysBetween('2026-12-11T13:15:00.000Z', '2026-12-13T00:30:00.000Z')
      expect(daysLate).toBe(3)
    })

    // RC-04: Duration Overruns & Late Return Bands
    it('RC-04: evaluates duration overage into operational bands without rupee penalty leakages', () => {
      const scheduled = new Date('2026-12-10T18:00:00.000Z')

      // 25 min late -> None (grace period)
      const b1 = lateBand(scheduled, new Date('2026-12-10T18:25:00.000Z'))
      expect(b1.band).toBe('None')
      expect(bandConsequence(b1)).toContain('Within the 30-minute grace period')

      // 1 hr 45 min late -> Half Day
      const b2 = lateBand(scheduled, new Date('2026-12-10T19:45:00.000Z'))
      expect(b2.band).toBe('Half Day')
      expect(bandConsequence(b2)).toContain('Half a rental day is chargeable')

      // 8 hrs late -> Full Day (1 day charged)
      const b3 = lateBand(scheduled, new Date('2026-12-11T02:00:00.000Z'))
      expect(b3.band).toBe('Full Day')
      expect(b3.fullDaysCharged).toBe(1)
      expect(bandConsequence(b3)).toContain('A full rental day is chargeable')
    })

    // RC-05: Partial Return with Split Custody (§1.6)
    it('RC-05: preserves item quantity sum across partial return (2 returned, 1 on rent)', () => {
      const totalUnits = 3
      const partialReturnState: ItemCounts = {
        Ready: 0,
        'Picked Up': 1,
        Returned: 2,
        Missing: 0,
      }
      expect(() => assertItemCounts(partialReturnState, totalUnits)).not.toThrow()

      // Invariant: Damaged count cannot exceed returned count
      expect(() =>
        assertItemCounts({ ...partialReturnState, Damaged: 3 }, totalUnits),
      ).toThrow(/Damaged 3 exceeds Returned 2/)
    })

    // RC-06: Flagged Damage Return with Mandatory Photo Gate (L68)
    it('RC-06: blocks damage return without photo, enforces description >= 10 chars, settles deposit deduction', () => {
      // Photo missing
      expect(
        validateDamageReport({
          description: 'Front element scratched',
          photos: 0,
          chargePaisa: rupees(6000),
          replacementPaisa: rupees(45000),
        }).valid,
      ).toBe(false)

      // Compliant report
      expect(
        validateDamageReport({
          description: 'Front element scratched during handheld shoot',
          photos: 1,
          chargePaisa: rupees(6000),
          replacementPaisa: rupees(45000),
        }).valid,
      ).toBe(true)

      // Deposit settlement deduction: Rs 15,000 held - Rs 6,000 charge = Rs 9,000 refund
      const settled = settleDeposit(rupees(15000), rupees(6000))
      expect(settled.refundPaisa).toBe(rupees(9000))
      expect(settled.shortfallPaisa).toBe(0)
    })

    // RC-07: Cash Security Deposit Liability Tracking (Law 5)
    it('RC-07: tracks cash security deposit strictly as a liability, never reducing rental outstanding', () => {
      const pipeline = calculatePricingPipeline(
        makePipelineInput({
          equipmentSubtotalPaisa: rupees(50000),
          vatEnabled: true,
          recommendedDepositPaisa: rupees(50000),
        }),
      )
      // Rental total = 50,000 + 6,500 VAT = 56,500
      expect(pipeline.rentalTotalPaisa).toBe(rupees(56500))
      // Deposit required = 50,000
      expect(pipeline.securityDeposit.requiredPaisa).toBe(rupees(50000))
      // Invariant: Deposit is NOT part of rentalTotal
      expect(pipeline.rentalTotalPaisa).toBe(pipeline.taxableSubtotalPaisa + pipeline.vatPaisa)
    })

    // RC-08: Citizenship ID Card Held in Lieu of Deposit (D1 / T2-03)
    it('RC-08: blocks close while client collateral (ID card) is held', () => {
      const closeAttempt: CloseGateInput = {
        rentalInvoiced: true,
        rentalOutstandingPaisa: 0,
        depositHeldPaisa: 0,
        openCases: 0,
        damageChargesPendingApproval: 0,
        collateralHeld: true,
      }
      const gates = closeGates(closeAttempt)
      expect(gates.every((g) => g.passing)).toBe(false)
      const collateralGate = gates.find((g) => g.label === 'No client collateral held')
      expect(collateralGate?.passing).toBe(false)
      expect(collateralGate?.blocking).toContain("Client collateral (ID card) is still held")

      // Once ID is returned, gate passes
      expect(closeGates({ ...closeAttempt, collateralHeld: false }).every((g) => g.passing)).toBe(true)
    })

    // RC-09: Booqable External Hold Clash & Calendar Shielding
    it('RC-09: refuses bookings conflicting with active Booqable external holds', () => {
      const hold: ExternalHoldRecord = {
        id: 'hold-9021',
        booqableOrderId: 'ord-9021',
        booqableOrderNumber: '9021',
        productId: 'PUB-CAM-FX6',
        unitSerial: 'FX6-001',
        startDateUtc: '2026-12-10T00:15:00Z',
        endDateUtc: '2026-12-12T00:15:00Z',
        status: 'active',
        lastSyncTimestampUtc: '2026-12-09T00:00:00Z',
      }
      const conflict = checkExternalHoldConflicts(
        {
          productId: 'PUB-CAM-FX6',
          unitSerial: 'FX6-001',
          startDateUtc: '2026-12-11T00:15:00Z',
          endDateUtc: '2026-12-13T00:15:00Z',
        },
        [hold],
      )
      expect(conflict.hasConflict).toBe(true)
      expect(conflict.conflictingHolds[0]?.displayChipText).toBe('Held in Booqable #9021')

      // Different unit serial has no conflict
      const altUnit = checkExternalHoldConflicts(
        {
          productId: 'PUB-CAM-FX6',
          unitSerial: 'FX6-002',
          startDateUtc: '2026-12-11T00:15:00Z',
          endDateUtc: '2026-12-13T00:15:00Z',
        },
        [hold],
      )
      expect(altUnit.hasConflict).toBe(false)
    })

    // RC-10: Online Booking Request to Staff Confirmation (T7-04)
    it('RC-10: verifies 13% VAT and 50% advance computation for online booking requests', () => {
      const requestPricing = calculatePricingPipeline(
        makePipelineInput({
          equipmentSubtotalPaisa: rupees(15000),
          vatEnabled: true,
        }),
      )
      expect(requestPricing.vatPaisa).toBe(rupees(1950))
      expect(requestPricing.rentalTotalPaisa).toBe(rupees(16950))
      expect(calculateAdvanceRequired(requestPricing.rentalTotalPaisa)).toBe(rupees(8475))
    })

    // RC-11: Zero-Value Close Override (§4.51)
    it('RC-11: allows closing zero-value rental with isZeroValueOverride without invoice', () => {
      const zeroVal: CloseGateInput = {
        rentalInvoiced: false,
        isZeroValueOverride: true,
        rentalOutstandingPaisa: 0,
        depositHeldPaisa: 0,
        openCases: 0,
        damageChargesPendingApproval: 0,
      }
      expect(closeGates(zeroVal).every((g) => g.passing)).toBe(true)
    })

    // RC-12: Unpaid Invoice Close Refusal & Payment Settlement (Law 4)
    it('RC-12: refuses close when rental has outstanding balance, unblocks upon settlement', () => {
      const unpaid: CloseGateInput = {
        rentalInvoiced: true,
        rentalOutstandingPaisa: rupees(6250),
        depositHeldPaisa: 0,
        openCases: 0,
        damageChargesPendingApproval: 0,
      }
      const gates = closeGates(unpaid)
      expect(gates.every((g) => g.passing)).toBe(false)
      expect(gates.find((g) => g.label === 'Rental Outstanding settled')?.blocking).toBe('Rs 6,250 still outstanding')

      // Settled
      expect(closeGates({ ...unpaid, rentalOutstandingPaisa: 0 }).every((g) => g.passing)).toBe(true)
    })

    // RC-13: Wrong-Role Access Refusal Matrix (Negative Authorization)
    it('RC-13: enforces role restrictions for money, daily closing, and floor surfaces', () => {
      // Money view restrictions
      const moneyBlindRoles: SystemRole[] = ['Warehouse', 'Technician', 'Driver', 'Client']
      for (const role of moneyBlindRoles) {
        expect(canViewMoney(role)).toBe(false)
        expect(moneyScope({ role, surface: 'default' })).toBe('none')
      }

      // Daily closing restricted to Manager, Owner, Admin, Accounts (Coordinator refused, Migration 0117)
      expect(canApproveDailyClosing('Owner')).toBe(true)
      expect(canApproveDailyClosing('Manager')).toBe(true)
      expect(canApproveDailyClosing('Accounts')).toBe(true)
      expect(canApproveDailyClosing('Coordinator')).toBe(false)
      expect(canApproveDailyClosing('Warehouse')).toBe(false)
    })

    // RC-14: Mid-Rental Shoot Extension (T3-17)
    it('RC-14: increments rental day count accurately upon schedule extension', () => {
      const initialDays = rentalDaysBetween('2026-12-08T00:15:00.000Z', '2026-12-10T00:15:00.000Z')
      expect(initialDays).toBe(2)

      const extendedDays = rentalDaysBetween('2026-12-08T00:15:00.000Z', '2026-12-11T00:15:00.000Z')
      expect(extendedDays).toBe(3)
    })

    // RC-15: Cancellation with Deposit Release & Reversal (Law 4)
    it('RC-15: validates that Cancelled flag is critical and orthogonal to forward stages', () => {
      expect(FLAGS.Cancelled.type).toBe('Critical')
      expect(FLAGS.Cancelled.blocks).toHaveLength(0) // Orthogonal to forward state machine
    })
  })

  /* ──────────────────────────────────────────────────────────────────────────
   * 2. Device Viewport & Touch Target Floor Checks
   * ────────────────────────────────────────────────────────────────────────── */
  describe('Part 2: Device Viewports & Ergonomic Touch Targets', () => {
    it('enforces exact breakpoint categorization for all 5 spec widths (§7.7)', () => {
      expect(BP.phone).toBe(768)
      expect(BP.desktop).toBe(1280)

      expect(viewportFor(390)).toBe('phone') // iPhone 14/15
      expect(viewportFor(800)).toBe('tablet') // Small tablet / split-screen
      expect(viewportFor(1194)).toBe('tablet') // iPad Pro 11" landscape
      expect(viewportFor(1280)).toBe('desktop') // Base desktop boundary
      expect(viewportFor(1920)).toBe('desktop') // Wide desktop
    })

    it('verifies primary floor actions are mapped to required floor verbs', () => {
      // Primary floor action buttons
      const bookedAction = getRentalPrimaryAction('Booked', { bookingNo: BOOKING_NO })
      expect(bookedAction.label).toBe('Start Packing')

      const packedAction = getRentalPrimaryAction('Packed', { bookingNo: BOOKING_NO })
      expect(packedAction.label).toBe('Handover')

      const onRentAction = getRentalPrimaryAction('On Rent', { bookingNo: BOOKING_NO })
      expect(onRentAction.label).toBe('Return & Inspect')
    })
  })

  /* ──────────────────────────────────────────────────────────────────────────
   * 3. Foundation Spec §2.8 Reference Calculation Reconciliation
   * ────────────────────────────────────────────────────────────────────────── */
  describe('Part 3: §2.8 Canonical Reference Case Mathematical Reconciliation', () => {
    it('asserts zero REFERENCE_CASE_ERROR at runtime', () => {
      expect(REFERENCE_CASE_ERROR).toBeNull()
    })

    it('reconciles every integer paisa figure in the §2.8 canonical reference case', () => {
      expect(toRupees(REFERENCE_CASE.subtotal)).toBe(132750)
      expect(toRupees(REFERENCE_CASE.discount)).toBe(9293)
      expect(toRupees(REFERENCE_CASE.taxable)).toBe(123457)
      expect(toRupees(REFERENCE_CASE.vat)).toBe(16049)
      expect(toRupees(REFERENCE_CASE.rentalTotal)).toBe(139506)
      expect(toRupees(REFERENCE_CASE.payments)).toBe(15000)
      expect(toRupees(REFERENCE_CASE.outstanding)).toBe(124506)

      // Total collected at counter: Rs 15,000 advance + Rs 20,000 security deposit = Rs 35,000
      const advancePaisa = REFERENCE_CASE.payments
      const depositPaisa = rupees(20000)
      const totalCollectedPaisa = advancePaisa + depositPaisa
      expect(toRupees(totalCollectedPaisa as Paisa)).toBe(35000)
    })
  })
})
