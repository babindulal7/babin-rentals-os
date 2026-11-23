// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import {
  calculatePricingPipeline,
  calculateAdvanceRequired,
  type PricingPipelineInput,
} from '../../lib/pricingPipeline'
import {
  canAdvance,
  closeGates,
  assertOneJobInProgress,
  assertItemCounts,
  type CloseGateInput,
  type ItemCounts,
} from '../../lib/workflow'
import {
  settleDeposit,
  validateDamageReport,
} from '../../lib/damage'
import { rupees, type Paisa } from '../../lib/money'
import { rentalDaysBetween } from '../../lib/rentalDays'
import { operationalDayOf, OPERATIONAL_DAY_START_DEFAULT_MINUTES } from '../../lib/operationalDay'
import { getRentalPrimaryAction } from '../../lib/rentalActions'
import { canViewMoney } from '../../lib/rbac'
import { isMoneySurface } from '../../data/nav'
import { lateBand } from '../../lib/lateFee'

describe('Week 1 Action 3: Counter Dual-Entry Trial & Law 6 Verification', () => {
  const TRIAL_BOOKING_NO = 'BK-2026-W1-TRIAL'

  /* ──────────────────────────────────────────────────────────────────────────
   * Phase 1: Coordinator Quote Creation, Rates & 06:00 Boundaries
   * ────────────────────────────────────────────────────────────────────────── */
  describe('Phase 1: Coordinator Pricing & Confirmation (Quote -> Booked)', () => {
    it('Coordinator is money-sighted and calculates 13% VAT and 50% advance in integer paisa', () => {
      // Coordinator is a money-sighted role
      expect(canViewMoney('Coordinator')).toBe(true)

      // Operational day rollover at 06:00 NPT
      const morningAtSix = '2026-11-25T06:00:00.000+05:45'
      expect(operationalDayOf(morningAtSix, OPERATIONAL_DAY_START_DEFAULT_MINUTES)).toBe('2026-11-25')

      // 2-day hire: 25 Nov 06:00 to 27 Nov 06:00 NPT
      const start = '2026-11-25T06:00:00.000+05:45'
      const end = '2026-11-27T06:00:00.000+05:45'
      const days = rentalDaysBetween(start, end)
      expect(days).toBe(2)

      // 1x Sony FX6 Cinema Kit at Rs 8,500/day * 2 days = Rs 17,000 subtotal
      const pipelineInput: PricingPipelineInput = {
        equipmentSubtotalPaisa: rupees(17000),
        bundleSubtotalPaisa: 0 as Paisa,
        subRentalSubtotalPaisa: 0 as Paisa,
        servicesSubtotalPaisa: 0 as Paisa,
        crewSubtotalPaisa: 0 as Paisa,
        deliveryChargePaisa: 0 as Paisa,
        fuelChargePaisa: 0 as Paisa,
        discounts: {},
        vatEnabled: true,
        recommendedDepositPaisa: rupees(10000), // Rs 10,000 deposit liability
      }

      const pricing = calculatePricingPipeline(pipelineInput)

      // Subtotal: Rs 17,000 = 1,700,000 Paisa
      expect(pricing.taxableSubtotalPaisa).toBe(rupees(17000))
      // 13% Nepal VAT: Rs 2,210 = 221,000 Paisa
      expect(pricing.vatPaisa).toBe(rupees(2210))
      // Rental Total: Rs 19,210 = 1,921,000 Paisa
      expect(pricing.rentalTotalPaisa).toBe(rupees(19210))

      // Law 5 Invariant: Deposit is a balance sheet liability, never added to rental total
      expect(pricing.securityDeposit.requiredPaisa).toBe(rupees(10000))
      expect(pricing.rentalTotalPaisa).toBe(pricing.taxableSubtotalPaisa + pricing.vatPaisa)

      // Tiered Advance: > Rs 10,000 requires 50% advance
      const advanceDue = calculateAdvanceRequired(pricing.rentalTotalPaisa)
      expect(advanceDue).toBe(rupees(9605)) // 50% of 19,210 = 9,605
    })

    it('Coordinator confirms booking, legally advancing stage from Quote to Booked', () => {
      expect(canAdvance('Quote', 'Booked')).toBe(true)

      const primaryAction = getRentalPrimaryAction('Quote', { bookingNo: TRIAL_BOOKING_NO })
      expect(primaryAction.label).toBe('Confirm Booking')
      expect(primaryAction.actionType).toBe('confirm')
      expect(primaryAction.disabled).toBe(false)
    })
  })

  /* ──────────────────────────────────────────────────────────────────────────
   * Phase 2: Warehouse Packing Workspace & Law 6 Blindness
   * ────────────────────────────────────────────────────────────────────────── */
  describe('Phase 2: Warehouse Packing Workspace & Law 6 Enforcement', () => {
    it('Warehouse operator is strictly money-blind and cannot access financial surfaces', () => {
      expect(canViewMoney('Warehouse')).toBe(false)
      expect(canViewMoney('Technician')).toBe(false)
      expect(canViewMoney('Driver')).toBe(false)

      // Operations routes are not money surfaces; finance routes are money surfaces
      expect(isMoneySurface('/operations')).toBe(false)
      expect(isMoneySurface('/finance')).toBe(true)
    })

    it('routes primary action to /rentals/:bookingNo/packing when stage is Booked', () => {
      const packAction = getRentalPrimaryAction('Booked', { bookingNo: TRIAL_BOOKING_NO })
      expect(packAction.label).toBe('Start Packing')
      expect(packAction.job).toBe('Pack')
      expect(packAction.route).toBe(`/rentals/${TRIAL_BOOKING_NO}/packing`)
    })

    it('conserves item quantities during packing and validates completion transition', () => {
      const itemCounts: ItemCounts = {
        Ready: 1, // 1 unit packed and verified
        'Picked Up': 0,
        Returned: 0,
        Missing: 0,
      }
      expect(() => assertItemCounts(itemCounts, 1)).not.toThrow()
      expect(canAdvance('Booked', 'Packed')).toBe(true)
    })
  })

  /* ──────────────────────────────────────────────────────────────────────────
   * Phase 3: Warehouse Handover Workspace & Financial Gate Invariants
   * ────────────────────────────────────────────────────────────────────────── */
  describe('Phase 3: Warehouse Handover Workspace & Financial Gate Invariants', () => {
    it('routes primary action to /rentals/:bookingNo/handover when stage is Packed', () => {
      const handoverAction = getRentalPrimaryAction('Packed', { bookingNo: TRIAL_BOOKING_NO })
      expect(handoverAction.label).toBe('Handover')
      expect(handoverAction.job).toBe('Handover')
      expect(handoverAction.route).toBe(`/rentals/${TRIAL_BOOKING_NO}/handover`)
    })

    it('enforces single job in progress invariant during physical handover', () => {
      // Exactly 1 job In Progress is valid
      expect(() => {
        assertOneJobInProgress({
          Pack: 'Complete',
          Handover: 'In Progress',
          Return: 'Not Started',
          Reset: 'Not Started',
        })
      }).not.toThrow()

      // Simultaneous Handover and Return throws invariant error
      expect(() => {
        assertOneJobInProgress({
          Pack: 'Complete',
          Handover: 'In Progress',
          Return: 'In Progress',
          Reset: 'Not Started',
        })
      }).toThrow(/§1\.5 violated: 2 jobs In Progress/i)
    })

    it('advances stage from Packed to On Rent upon successful handover', () => {
      expect(canAdvance('Packed', 'On Rent')).toBe(true)
      // Skips and backwards transitions are rejected
      expect(canAdvance('Packed', 'Returned')).toBe(false)
      expect(canAdvance('Packed', 'Booked')).toBe(false)
    })
  })

  /* ──────────────────────────────────────────────────────────────────────────
   * Phase 4: Warehouse Return Workspace, Overrun Bands & Damage Photo Gate
   * ────────────────────────────────────────────────────────────────────────── */
  describe('Phase 4: Return Workspace, Overruns & Damage Evidence Gate', () => {
    it('routes primary action to /rentals/:bookingNo/return when stage is On Rent', () => {
      const returnAction = getRentalPrimaryAction('On Rent', { bookingNo: TRIAL_BOOKING_NO })
      expect(returnAction.label).toBe('Return & Inspect')
      expect(returnAction.job).toBe('Return')
      expect(returnAction.route).toBe(`/rentals/${TRIAL_BOOKING_NO}/return`)
    })

    it('renders return overrun as duration bands, never as rupee penalties (Law 6)', () => {
      const scheduled = new Date('2026-11-27T18:00:00.000Z')

      // Exact on-time return (within 30-min grace)
      const onTimeBand = lateBand(scheduled, new Date('2026-11-27T18:15:00.000Z'))
      expect(onTimeBand.band).toBe('None')
      expect(onTimeBand.overageMinutes).toBe(15)

      // 45 minutes late -> Half Day band (no rupee figure)
      const halfDayBand = lateBand(scheduled, new Date('2026-11-27T18:45:00.000Z'))
      expect(halfDayBand.band).toBe('Half Day')
      expect(halfDayBand.overageMinutes).toBe(45)

      // 4 hours late -> Full Day band (no rupee figure)
      const fullDayBand = lateBand(scheduled, new Date('2026-11-27T22:00:00.000Z'))
      expect(fullDayBand.band).toBe('Full Day')
      expect(fullDayBand.fullDaysCharged).toBe(1)
      expect(fullDayBand.overageMinutes).toBe(240)
    })

    it('enforces mandatory photo evidence and min 10-char description for damaged items (L68)', () => {
      // Flagged damage: missing photo is REJECTED
      const missingPhoto = validateDamageReport({
        description: 'Deep dent and cracked LCD on camera body',
        photos: 0,
        chargePaisa: rupees(25000),
        replacementPaisa: rupees(350000),
      })
      expect(missingPhoto.valid).toBe(false)
      expect(missingPhoto.errors.photos).toBeDefined()

      // Flagged damage: short description (< 10 chars) is REJECTED
      const shortDesc = validateDamageReport({
        description: 'Cracked',
        photos: 2,
        chargePaisa: rupees(25000),
        replacementPaisa: rupees(350000),
      })
      expect(shortDesc.valid).toBe(false)
      expect(shortDesc.errors.description).toBeDefined()

      // Flagged damage: compliant report with photo and description is ACCEPTED
      const compliantReport = validateDamageReport({
        description: 'Deep dent and cracked LCD on camera body',
        photos: 2,
        chargePaisa: rupees(25000),
        replacementPaisa: rupees(350000),
      })
      expect(compliantReport.valid).toBe(true)
      expect(Object.keys(compliantReport.errors)).toHaveLength(0)
    })

    it('advances stage from On Rent to Returned upon return completion', () => {
      expect(canAdvance('On Rent', 'Returned')).toBe(true)
      expect(canAdvance('On Rent', 'Closed')).toBe(false)
    })
  })

  /* ──────────────────────────────────────────────────────────────────────────
   * Phase 5: Cleaning & Reset Workspace (Warehouse)
   * ────────────────────────────────────────────────────────────────────────── */
  describe('Phase 5: Cleaning & Reset Workspace (Turnaround)', () => {
    it('routes primary action to /rentals/:bookingNo/reset when stage is Returned and unreset', () => {
      const resetAction = getRentalPrimaryAction('Returned', {
        bookingNo: TRIAL_BOOKING_NO,
        isResetComplete: false,
        canCloseRental: false,
      })
      expect(resetAction.label).toBe('Cleaning & Reset')
      expect(resetAction.job).toBe('Reset')
      expect(resetAction.route).toBe(`/rentals/${TRIAL_BOOKING_NO}/reset`)
    })
  })

  /* ──────────────────────────────────────────────────────────────────────────
   * Phase 6: Final Settle & Four Closing Gates (Accounts)
   * ────────────────────────────────────────────────────────────────────────── */
  describe('Phase 6: Final Settlement & Mandatory Closing Gates', () => {
    it('settles security deposit correctly, strictly separating refund from revenue shortfall', () => {
      const depositHeld = rupees(10000)

      // Clean return: full refund
      const fullRefund = settleDeposit(depositHeld, 0 as Paisa)
      expect(fullRefund.refundPaisa).toBe(rupees(10000))
      expect(fullRefund.shortfallPaisa).toBe(0)

      // Damage deduction: Rs 4,000 damage deducted, Rs 6,000 refunded
      const partialDeduction = settleDeposit(depositHeld, rupees(4000))
      expect(partialDeduction.refundPaisa).toBe(rupees(6000))
      expect(partialDeduction.shortfallPaisa).toBe(0)
      expect(partialDeduction.fullyConsumed).toBe(false)
    })

    it('enforces all four mandatory closing gates before admitting stage transition to Closed', () => {
      // Incomplete state: Uninvoiced or Unpaid
      const unpaidGates: CloseGateInput = {
        rentalInvoiced: true,
        rentalOutstandingPaisa: rupees(5000), // Rs 5,000 outstanding
        depositHeldPaisa: 0,
        openCases: 0,
        damageChargesPendingApproval: 0,
      }
      expect(closeGates(unpaidGates).every((g) => g.passing)).toBe(false)

      // Incomplete state: Unsettled deposit
      const heldDepositGates: CloseGateInput = {
        rentalInvoiced: true,
        rentalOutstandingPaisa: 0,
        depositHeldPaisa: rupees(10000), // Rs 10,000 deposit held
        openCases: 0,
        damageChargesPendingApproval: 0,
      }
      expect(closeGates(heldDepositGates).every((g) => g.passing)).toBe(false)

      // Complete state: All 4 gates satisfied
      const fullySettledGates: CloseGateInput = {
        rentalInvoiced: true,
        rentalOutstandingPaisa: 0,
        depositHeldPaisa: 0,
        openCases: 0,
        damageChargesPendingApproval: 0,
      }
      const gateResults = closeGates(fullySettledGates)
      expect(gateResults.every((g) => g.passing)).toBe(true)

      // Transition to Closed admitted
      const closeAction = getRentalPrimaryAction('Returned', {
        bookingNo: TRIAL_BOOKING_NO,
        isResetComplete: true,
        canCloseRental: true,
      })
      expect(closeAction.label).toBe('Close Rental')
      expect(closeAction.disabled).toBe(false)
      expect(canAdvance('Returned', 'Closed')).toBe(true)
    })
  })
})
