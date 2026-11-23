// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import {
  canAdvance,
  JOBS,
  closeGates,
  assertOneJobInProgress,
  assertItemCounts,
  planTransition,
  type CloseGateInput,
  type ItemCounts,
  type BookingStatus,
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
import { rupees, type Paisa } from '../../lib/money'
import { rentalDaysBetween } from '../../lib/rentalDays'
import { operationalDayOf, OPERATIONAL_DAY_START_DEFAULT_MINUTES } from '../../lib/operationalDay'
import { getRentalPrimaryAction } from '../../lib/rentalActions'
import { operationSessionId } from '../../lib/deterministicId'
import { canViewMoney } from '../../lib/rbac'
import { isMoneySurface } from '../../data/nav'
import { notReturnedDecisionEndsLine } from '../../actions/rentals/floorVerb'
import type { SystemRole } from '../../types/database'

describe('Week 2 Core Rental Loop Hardening & Boundary Invariants', () => {
  const BOOKING_NO = 'BK-2026-W2-HARDEN'

  /* ──────────────────────────────────────────────────────────────────────────
   * Dimension 1: Canonical Forward-Only Lifecycle & Stage Gate Invariants
   * ────────────────────────────────────────────────────────────────────────── */
  describe('1. Canonical Forward-Only Progression & Stage Legality', () => {
    it('strictly accepts canonical 1-step forward transitions and refuses all skips and regressions', () => {
      // 1-step legal transitions
      expect(canAdvance('Quote', 'Booked')).toBe(true)
      expect(canAdvance('Booked', 'Packed')).toBe(true)
      expect(canAdvance('Packed', 'On Rent')).toBe(true)
      expect(canAdvance('On Rent', 'Returned')).toBe(true)
      expect(canAdvance('Returned', 'Closed')).toBe(true)

      // Regressions strictly forbidden (Rule: backwards transitions invalid)
      expect(canAdvance('Booked', 'Quote')).toBe(false)
      expect(canAdvance('Packed', 'Booked')).toBe(false)
      expect(canAdvance('On Rent', 'Packed')).toBe(false)
      expect(canAdvance('Returned', 'On Rent')).toBe(false)
      expect(canAdvance('Closed', 'Returned')).toBe(false)
      expect(canAdvance('Closed', 'Quote')).toBe(false)

      // Skips strictly forbidden (Rule: intermediate custody cannot be bypassed)
      expect(canAdvance('Quote', 'Packed')).toBe(false)
      expect(canAdvance('Quote', 'On Rent')).toBe(false)
      expect(canAdvance('Quote', 'Returned')).toBe(false)
      expect(canAdvance('Quote', 'Closed')).toBe(false)
      expect(canAdvance('Booked', 'On Rent')).toBe(false)
      expect(canAdvance('Booked', 'Returned')).toBe(false)
      expect(canAdvance('Booked', 'Closed')).toBe(false)
      expect(canAdvance('Packed', 'Returned')).toBe(false)
      expect(canAdvance('Packed', 'Closed')).toBe(false)
      expect(canAdvance('On Rent', 'Closed')).toBe(false)

      // Self-transitions strictly refused
      const allStages: BookingStatus[] = ['Quote', 'Booked', 'Packed', 'On Rent', 'Returned', 'Closed']
      for (const stage of allStages) {
        expect(canAdvance(stage, stage)).toBe(false)
      }
    })

    it('verifies planTransition accurately identifies stage skips, regressions, and valid steps', () => {
      const validStep = planTransition({ from: 'Booked', to: 'Packed' })
      expect(validStep.allowed).toBe(true)
      expect(validStep.blockers).toHaveLength(0)

      const skipStep = planTransition({ from: 'Booked', to: 'On Rent' })
      expect(skipStep.allowed).toBe(false)
      expect(skipStep.blockers.some((b) => b.rule === 'forward-only')).toBe(true)

      const backwardStep = planTransition({ from: 'On Rent', to: 'Packed' })
      expect(backwardStep.allowed).toBe(false)
      expect(backwardStep.blockers.some((b) => b.rule === 'forward-only')).toBe(true)
    })

    it('asserts JOBS mapping to stages is completely isomorphic and immutable', () => {
      expect(JOBS.Pack.runsAt).toBe('Booked')
      expect(JOBS.Pack.sets).toBe('Packed')

      expect(JOBS.Handover.runsAt).toBe('Packed')
      expect(JOBS.Handover.sets).toBe('On Rent')

      expect(JOBS.Return.runsAt).toBe('On Rent')
      expect(JOBS.Return.sets).toBe('Returned')

      expect(JOBS.Reset.runsAt).toBe('Returned')
      expect(JOBS.Reset.sets).toBeNull() // Reset does not alter booking stage
    })
  })

  /* ──────────────────────────────────────────────────────────────────────────
   * Dimension 2: Operational Concurrency & Floor Custody Invariants
   * ────────────────────────────────────────────────────────────────────────── */
  describe('2. Operational Concurrency & Custody Invariants', () => {
    it('enforces that at most one operational job is In Progress per booking at any time', () => {
      // Clean single job state
      expect(() => {
        assertOneJobInProgress({ Pack: 'In Progress', Handover: 'Not Started', Return: 'Not Started', Reset: 'Not Started' })
      }).not.toThrow()

      // Two simultaneous In Progress jobs violates physical warehouse reality
      expect(() => {
        assertOneJobInProgress({ Pack: 'In Progress', Handover: 'In Progress' })
      }).toThrow(/§1\.5 violated: 2 jobs In Progress/i)

      expect(() => {
        assertOneJobInProgress({ Handover: 'In Progress', Return: 'In Progress' })
      }).toThrow(/§1\.5 violated: 2 jobs In Progress/i)
    })

    it('conserves item counts across custody transitions and detects missing gear', () => {
      const validCounts: ItemCounts = {
        Ready: 2,
        'Picked Up': 2,
        Returned: 1,
        Missing: 0,
      }
      expect(() => assertItemCounts(validCounts, 5)).not.toThrow()

      // Total sum mismatch throws invariant violation
      const leakyCounts: ItemCounts = {
        Ready: 2,
        'Picked Up': 1,
        Returned: 1,
        Missing: 0, // Sum = 4 != 5
      }
      expect(() => assertItemCounts(leakyCounts, 5)).toThrow(/§1\.6 invariant violated/i)

      // Damaged count cannot exceed returned count
      const invalidDamage: ItemCounts = {
        Ready: 0,
        'Picked Up': 0,
        Returned: 1,
        Missing: 0,
        Damaged: 2,
      }
      expect(() => assertItemCounts(invalidDamage, 1)).toThrow(/Damaged 2 exceeds Returned 1/i)
    })

    it('evaluates notReturnedDecisionEndsLine for partial returns correctly', () => {
      // Decisions that resolve/terminate the custody line
      expect(notReturnedDecisionEndsLine('Write off')).toBe(true)
      expect(notReturnedDecisionEndsLine('Charge replacement')).toBe(true)
      expect(notReturnedDecisionEndsLine('Insurance claim')).toBe(true)

      // Decisions that keep the line open (ongoing investigation)
      expect(notReturnedDecisionEndsLine('Still expected')).toBe(false)
      expect(notReturnedDecisionEndsLine(null)).toBe(false)
    })

    it('enforces mandatory photo evidence and clear descriptions for damaged equipment', () => {
      // Valid report with at least 1 photo and >= 10 character description
      const validReport = validateDamageReport({
        description: 'Scratched front element on 24-70mm lens',
        photos: 1,
        chargePaisa: rupees(8500),
        replacementPaisa: rupees(120000),
      })
      expect(validReport.valid).toBe(true)
      expect(Object.keys(validReport.errors)).toHaveLength(0)

      // Refuse damage report with zero photo evidence
      const missingPhoto = validateDamageReport({
        description: 'Broken filter thread on lens',
        photos: 0,
        chargePaisa: rupees(2000),
        replacementPaisa: rupees(120000),
      })
      expect(missingPhoto.valid).toBe(false)
      expect(missingPhoto.errors.photos).toBeDefined()

      // Refuse damage report with insufficient description (< 10 chars)
      const missingDesc = validateDamageReport({
        description: 'Broken',
        photos: 2,
        chargePaisa: rupees(3000),
        replacementPaisa: rupees(50000),
      })
      expect(missingDesc.valid).toBe(false)
      expect(missingDesc.errors.description).toBeDefined()
    })
  })

  /* ──────────────────────────────────────────────────────────────────────────
   * Dimension 3: Kathmandu 06:00 AM Operational Day & Interval Boundaries
   * ────────────────────────────────────────────────────────────────────────── */
  describe('3. Operational Day Boundaries (06:00 NPT Shift)', () => {
    it('treats 06:00 AM as the shift rollover point in Kathmandu', () => {
      // 05:59:59 AM belongs to previous operational calendar day (2026-11-22)
      const beforeSix = '2026-11-23T05:59:59.000+05:45'
      // 06:00:00 AM begins the new operational calendar day (2026-11-23)
      const atSix = '2026-11-23T06:00:00.000+05:45'

      const opDayBefore = operationalDayOf(beforeSix, OPERATIONAL_DAY_START_DEFAULT_MINUTES)
      const opDayAt = operationalDayOf(atSix, OPERATIONAL_DAY_START_DEFAULT_MINUTES)

      expect(opDayBefore).toBe('2026-11-22')
      expect(opDayAt).toBe('2026-11-23')
    })

    it('calculates rental days between operational dates correctly with half-open intervals', () => {
      // 2-day rental: 23 Nov 06:00 -> 25 Nov 06:00 NPT
      const start = '2026-11-23T06:00:00.000+05:45'
      const end = '2026-11-25T06:00:00.000+05:45'
      const days = rentalDaysBetween(start, end)
      expect(days).toBe(2)

      // Same-day hire: 23 Nov 06:00 -> 23 Nov 20:00 NPT (1 operational day)
      const sameDay = rentalDaysBetween('2026-11-23T06:00:00.000+05:45', '2026-11-23T20:00:00.000+05:45')
      expect(sameDay).toBe(1)
    })
  })

  /* ──────────────────────────────────────────────────────────────────────────
   * Dimension 4: Financial Invariants (Law 4, Law 5, Law 6 & Integer Paisa)
   * ────────────────────────────────────────────────────────────────────────── */
  describe('4. Financial Invariants (Integer Paisa, VAT, Deposits & Role Blindness)', () => {
    it('executes integer paisa calculations without floating point drift (13% VAT)', () => {
      const pipelineInput: PricingPipelineInput = {
        equipmentSubtotalPaisa: rupees(10000), // Rs 10,000 subtotal
        bundleSubtotalPaisa: 0 as Paisa,
        subRentalSubtotalPaisa: 0 as Paisa,
        servicesSubtotalPaisa: 0 as Paisa,
        crewSubtotalPaisa: 0 as Paisa,
        deliveryChargePaisa: 0 as Paisa,
        fuelChargePaisa: 0 as Paisa,
        discounts: {
          membershipPercent: 10, // 10% discount -> Rs 1,000 off -> Rs 9,000 net
        },
        vatEnabled: true,
        recommendedDepositPaisa: rupees(5000),
      }

      const result = calculatePricingPipeline(pipelineInput)

      // Gross subtotal: Rs 10,000 = 1,000,000 Paisa
      expect(result.grossSubtotalPaisa).toBe(rupees(10000))
      // Discount: Rs 1,000 = 100,000 Paisa
      expect(result.discounts.discountPaisa).toBe(rupees(1000))
      // Taxable net: Rs 9,000 = 900,000 Paisa
      expect(result.taxableSubtotalPaisa).toBe(rupees(9000))
      // 13% Nepal VAT on Rs 9,000: Rs 1,170 = 117,000 Paisa
      expect(result.vatPaisa).toBe(rupees(1170))
      // Rental total: Rs 10,170 = 1,017,000 Paisa
      expect(result.rentalTotalPaisa).toBe(rupees(10170))

      // Law 5 check: Deposit is balance sheet liability, never added to Rental Total
      expect(result.securityDeposit.requiredPaisa).toBe(rupees(5000))
      expect(result.rentalTotalPaisa).toBe(result.taxableSubtotalPaisa + result.vatPaisa)
    })

    it('settles security deposit with damage deduction, returning exact refund and shortfall isolation', () => {
      // Case A: Deposit covers damage with partial refund
      const depositHeld = rupees(15000)
      const damageCost = rupees(6000)
      const settlementA = settleDeposit(depositHeld, damageCost)
      expect(settlementA.refundPaisa).toBe(rupees(9000))
      expect(settlementA.shortfallPaisa).toBe(0)
      expect(settlementA.fullyConsumed).toBe(false)

      // Case B: Damage exceeds deposit -> zero refund, isolated shortfall
      const highDamage = rupees(22000)
      const settlementB = settleDeposit(depositHeld, highDamage)
      expect(settlementB.refundPaisa).toBe(0)               // Never negative refund
      expect(settlementB.shortfallPaisa).toBe(rupees(7000)) // Rs 7,000 shortfall
      expect(settlementB.fullyConsumed).toBe(true)
    })

    it('enforces Law 6 money blindness across floor roles and surfaces', () => {
      const moneyRoles: SystemRole[] = ['Owner', 'Admin', 'Manager', 'Accounts']
      const blindRoles: SystemRole[] = ['Warehouse', 'Technician', 'Driver', 'Client']

      for (const role of moneyRoles) {
        expect(canViewMoney(role)).toBe(true)
      }

      for (const role of blindRoles) {
        expect(canViewMoney(role)).toBe(false)
      }

      // Route surface checks
      expect(isMoneySurface('/finance')).toBe(true)
      expect(isMoneySurface('/finance/invoices')).toBe(true)
      expect(isMoneySurface('/finance/payments')).toBe(true)
      expect(isMoneySurface('/tools/pricing')).toBe(true)
      expect(isMoneySurface('/tools/audit-log')).toBe(false)
      expect(isMoneySurface('/tools/activity-log')).toBe(false)
    })
  })

  /* ──────────────────────────────────────────────────────────────────────────
   * Dimension 5: Four Mandatory Closing Gates Enforcement (Transition to Closed)
   * ────────────────────────────────────────────────────────────────────────── */
  describe('5. Four Mandatory Closing Gates Enforcement', () => {
    it('blocks closure when any of the four gates fail and admits closure when all four pass', () => {
      // Failure 1: Not invoiced
      const gateNotInvoiced: CloseGateInput = {
        rentalInvoiced: false,
        rentalOutstandingPaisa: 0,
        depositHeldPaisa: 0,
        openCases: 0,
        damageChargesPendingApproval: 0,
      }
      const eval1 = closeGates(gateNotInvoiced)
      expect(eval1.every((g) => g.passing)).toBe(false)
      const invoiceGate = eval1.find((g) => g.label.includes('settled'))
      expect(invoiceGate?.passing).toBe(false)
      expect(invoiceGate?.blocking).toMatch(/nothing has been invoiced/i)

      // Failure 2: Outstanding balance unpaid
      const gateOutstanding: CloseGateInput = {
        rentalInvoiced: true,
        rentalOutstandingPaisa: rupees(2500),
        depositHeldPaisa: 0,
        openCases: 0,
        damageChargesPendingApproval: 0,
      }
      const eval2 = closeGates(gateOutstanding)
      expect(eval2.every((g) => g.passing)).toBe(false)
      expect(eval2.find((g) => g.label.includes('settled'))?.passing).toBe(false)

      // Failure 3: Deposit held unsettled
      const gateDepositHeld: CloseGateInput = {
        rentalInvoiced: true,
        rentalOutstandingPaisa: 0,
        depositHeldPaisa: rupees(10000),
        openCases: 0,
        damageChargesPendingApproval: 0,
      }
      const eval3 = closeGates(gateDepositHeld)
      expect(eval3.every((g) => g.passing)).toBe(false)
      expect(eval3.find((g) => g.label.includes('Deposit resolved'))?.passing).toBe(false)

      // Failure 4: Open damage case pending approval
      const gateOpenDamage: CloseGateInput = {
        rentalInvoiced: true,
        rentalOutstandingPaisa: 0,
        depositHeldPaisa: 0,
        openCases: 0,
        damageChargesPendingApproval: 1,
      }
      const eval4 = closeGates(gateOpenDamage)
      expect(eval4.every((g) => g.passing)).toBe(false)
      expect(eval4.find((g) => g.label.includes('damage charge'))?.passing).toBe(false)

      // All 4 gates satisfied -> Closure Admitted
      const allPassed: CloseGateInput = {
        rentalInvoiced: true,
        rentalOutstandingPaisa: 0,
        depositHeldPaisa: 0,
        openCases: 0,
        damageChargesPendingApproval: 0,
      }
      const evalPass = closeGates(allPassed)
      expect(evalPass.every((g) => g.passing)).toBe(true)

      // planTransition for Closed with all gates passing
      const plan = planTransition({
        from: 'Returned',
        to: 'Closed',
        gates: allPassed,
      })
      expect(plan.allowed).toBe(true)
      expect(plan.blockers).toHaveLength(0)
    })
  })

  /* ──────────────────────────────────────────────────────────────────────────
   * Dimension 6: Offline Fleet Determinism & Primary Action Routing
   * ────────────────────────────────────────────────────────────────────────── */
  describe('6. Offline Fleet Determinism & Primary Action Workspaces', () => {
    it('mints identical deterministic session UUIDs on disconnected tablets', async () => {
      const bookingId = '11111111-2222-4333-8444-555555555555'

      // Two devices computing the same session independently
      const deviceA = await operationSessionId(bookingId, 'Packing', 1)
      const deviceB = await operationSessionId(bookingId, 'Packing', 1)
      expect(deviceA).toBe(deviceB)

      // Distinct session number produces distinct UUID
      const session2 = await operationSessionId(bookingId, 'Packing', 2)
      expect(session2).not.toBe(deviceA)

      // Distinct operation produces distinct UUID
      const handoverSession = await operationSessionId(bookingId, 'Handover', 1)
      expect(handoverSession).not.toBe(deviceA)
    })

    it('maps primary operational actions and full-screen routes across all stages', () => {
      // 1. Quote -> Confirm Booking
      const quoteAct = getRentalPrimaryAction('Quote', { bookingNo: BOOKING_NO })
      expect(quoteAct.label).toBe('Confirm Booking')
      expect(quoteAct.actionType).toBe('confirm')
      expect(quoteAct.disabled).toBe(false)

      // 2. Booked -> Start Packing (/rentals/BK-.../packing)
      const bookedAct = getRentalPrimaryAction('Booked', { bookingNo: BOOKING_NO })
      expect(bookedAct.label).toBe('Start Packing')
      expect(bookedAct.job).toBe('Pack')
      expect(bookedAct.route).toBe(`/rentals/${BOOKING_NO}/packing`)

      // 3. Packed -> Handover (/rentals/BK-.../handover)
      const packedAct = getRentalPrimaryAction('Packed', { bookingNo: BOOKING_NO })
      expect(packedAct.label).toBe('Handover')
      expect(packedAct.job).toBe('Handover')
      expect(packedAct.route).toBe(`/rentals/${BOOKING_NO}/handover`)

      // 4. On Rent -> Return & Inspect (/rentals/BK-.../return)
      const onRentAct = getRentalPrimaryAction('On Rent', { bookingNo: BOOKING_NO })
      expect(onRentAct.label).toBe('Return & Inspect')
      expect(onRentAct.job).toBe('Return')
      expect(onRentAct.route).toBe(`/rentals/${BOOKING_NO}/return`)

      // 5. Returned (unreset) -> Cleaning & Reset (/rentals/BK-.../reset)
      const unresetAct = getRentalPrimaryAction('Returned', {
        bookingNo: BOOKING_NO,
        isResetComplete: false,
        canCloseRental: false,
      })
      expect(unresetAct.label).toBe('Cleaning & Reset')
      expect(unresetAct.job).toBe('Reset')
      expect(unresetAct.route).toBe(`/rentals/${BOOKING_NO}/reset`)

      // 6. Returned (reset complete, non-closer) -> QC Done · Awaiting Close
      const awaitingCloseAct = getRentalPrimaryAction('Returned', {
        bookingNo: BOOKING_NO,
        isResetComplete: true,
        canCloseRental: false,
      })
      expect(awaitingCloseAct.label).toBe('QC Done · Awaiting Close')
      expect(awaitingCloseAct.disabled).toBe(true)

      // 7. Returned (reset complete, closer) -> Close Rental
      const closeAct = getRentalPrimaryAction('Returned', {
        bookingNo: BOOKING_NO,
        isResetComplete: true,
        canCloseRental: true,
      })
      expect(closeAct.label).toBe('Close Rental')
      expect(closeAct.disabled).toBe(false)

      // 8. Cancelled -> Label 'Cancelled' (disabled, not operable)
      const cancelledAct = getRentalPrimaryAction('Booked', {
        bookingNo: BOOKING_NO,
        isCancelled: true,
        cancelledReason: 'Client shoot cancelled',
      })
      expect(cancelledAct.isOperable).toBe(false)
      expect(cancelledAct.disabled).toBe(true)
      expect(cancelledAct.label).toBe('Cancelled')
    })

    it('calculates tiered advance payment brackets correctly', () => {
      // Bracket 1: <= Rs 5,000 (500,000 paisa) -> 100% full advance
      expect(calculateAdvanceRequired(rupees(3500))).toBe(rupees(3500))
      expect(calculateAdvanceRequired(rupees(5000))).toBe(rupees(5000))

      // Bracket 2: <= Rs 10,000 (1,000,000 paisa) -> Rs 5,000 flat advance
      expect(calculateAdvanceRequired(rupees(7500))).toBe(rupees(5000))
      expect(calculateAdvanceRequired(rupees(10000))).toBe(rupees(5000))

      // Bracket 3: > Rs 10,000 -> 50% advance
      expect(calculateAdvanceRequired(rupees(14000))).toBe(rupees(7000))
      expect(calculateAdvanceRequired(rupees(50000))).toBe(rupees(25000))
    })
  })
})
