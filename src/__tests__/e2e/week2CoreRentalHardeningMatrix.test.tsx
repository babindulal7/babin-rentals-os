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
import { rupees, type Paisa } from '../../lib/money'
import { operationalDayOf, OPERATIONAL_DAY_START_DEFAULT_MINUTES } from '../../lib/operationalDay'
import { getRentalPrimaryAction } from '../../lib/rentalActions'
import { canViewMoney, canApproveDiscount } from '../../lib/rbac'
import { isMoneySurface } from '../../data/nav'
import {
  checkExternalHoldConflicts,
  type ExternalHoldRecord,
  type OsReservationCandidate,
} from '../../lib/externalHolds'
import { lateBand, bandConsequence } from '../../lib/lateFee'
import { canViewMoneyField, moneyScope } from '../../lib/fieldGating'
import type { SystemRole } from '../../types/database'

describe('Week 2 Core Rental Flow Hardening & Boundary Matrix', () => {
  const BOOKING_NO = 'BK-2026-W2-MATRIX'

  /* ──────────────────────────────────────────────────────────────────────────
   * 1. Full 9-Step Physical Custody Flow
   * ────────────────────────────────────────────────────────────────────────── */
  describe('1. Full 9-Step Physical Custody Progression', () => {
    it('traverses the entire canonical flow: create -> confirm -> pack -> handover -> return -> reset -> close', () => {
      // 1. Quote -> Booked
      expect(canAdvance('Quote', 'Booked')).toBe(true)
      const a1 = getRentalPrimaryAction('Quote', { bookingNo: BOOKING_NO })
      expect(a1.label).toBe('Confirm Booking')

      // 2. Booked -> Packed
      expect(canAdvance('Booked', 'Packed')).toBe(true)
      const a2 = getRentalPrimaryAction('Booked', { bookingNo: BOOKING_NO })
      expect(a2.label).toBe('Start Packing')
      expect(a2.route).toBe(`/rentals/${BOOKING_NO}/packing`)

      // 3. Packed -> On Rent
      expect(canAdvance('Packed', 'On Rent')).toBe(true)
      const a3 = getRentalPrimaryAction('Packed', { bookingNo: BOOKING_NO })
      expect(a3.label).toBe('Handover')
      expect(a3.route).toBe(`/rentals/${BOOKING_NO}/handover`)

      // 4. On Rent -> Returned
      expect(canAdvance('On Rent', 'Returned')).toBe(true)
      const a4 = getRentalPrimaryAction('On Rent', { bookingNo: BOOKING_NO })
      expect(a4.label).toBe('Return & Inspect')
      expect(a4.route).toBe(`/rentals/${BOOKING_NO}/return`)

      // 5. Returned (unreset) -> Cleaning & Reset
      const a5 = getRentalPrimaryAction('Returned', {
        bookingNo: BOOKING_NO,
        isResetComplete: false,
        canCloseRental: false,
      })
      expect(a5.label).toBe('Cleaning & Reset')
      expect(a5.route).toBe(`/rentals/${BOOKING_NO}/reset`)

      // 6. Returned (reset done, closer) -> Close Rental
      const a6 = getRentalPrimaryAction('Returned', {
        bookingNo: BOOKING_NO,
        isResetComplete: true,
        canCloseRental: true,
      })
      expect(a6.label).toBe('Close Rental')
      expect(a6.disabled).toBe(false)

      // 7. Returned -> Closed
      expect(canAdvance('Returned', 'Closed')).toBe(true)
    })

    it('enforces item quantity sum preservation across partial pickup and partial return (§1.6)', () => {
      const totalUnits = 10

      // Initial packed state
      const initialCounts: ItemCounts = {
        Ready: 10,
        'Picked Up': 0,
        Returned: 0,
        Missing: 0,
      }
      expect(() => assertItemCounts(initialCounts, totalUnits)).not.toThrow()

      // Partial pickup: 6 picked up, 4 remain ready
      const partialPickup: ItemCounts = {
        Ready: 4,
        'Picked Up': 6,
        Returned: 0,
        Missing: 0,
      }
      expect(() => assertItemCounts(partialPickup, totalUnits)).not.toThrow()

      // Partial return with damage: 4 returned (1 damaged), 2 still out, 4 still ready
      const partialReturn: ItemCounts = {
        Ready: 4,
        'Picked Up': 2,
        Returned: 4,
        Missing: 0,
        Damaged: 1,
      }
      expect(() => assertItemCounts(partialReturn, totalUnits)).not.toThrow()

      // Violation: Sum does not match total
      const invalidSum: ItemCounts = {
        Ready: 4,
        'Picked Up': 2,
        Returned: 3,
        Missing: 0,
      }
      expect(() => assertItemCounts(invalidSum, totalUnits)).toThrow(/§1.6 invariant violated/)

      // Violation: Damaged count exceeds Returned count
      const invalidDamage: ItemCounts = {
        Ready: 4,
        'Picked Up': 2,
        Returned: 4,
        Missing: 0,
        Damaged: 5,
      }
      expect(() => assertItemCounts(invalidDamage, totalUnits)).toThrow(/Damaged 5 exceeds Returned 4/)
    })
  })

  /* ──────────────────────────────────────────────────────────────────────────
   * 2. Concurrency, External Holds & Time Boundaries
   * ────────────────────────────────────────────────────────────────────────── */
  describe('2. Concurrency, External Holds & Shift Boundaries', () => {
    it('detects external Booqable hold conflicts and renders neutral chips', () => {
      const activeHold: ExternalHoldRecord = {
        id: 'hold-fx6-01',
        booqableOrderId: 'bq-9021',
        booqableOrderNumber: '9021',
        productId: 'PUB-CAM-FX6',
        unitSerial: 'FX6-001',
        startDateUtc: '2026-11-25T00:15:00Z', // 06:00 NPT
        endDateUtc: '2026-11-28T00:15:00Z',
        status: 'active',
        lastSyncTimestampUtc: '2026-11-24T00:00:00Z',
      }

      // Clashing candidate
      const clashing: OsReservationCandidate = {
        productId: 'PUB-CAM-FX6',
        unitSerial: 'FX6-001',
        startDateUtc: '2026-11-26T00:15:00Z',
        endDateUtc: '2026-11-27T00:15:00Z',
      }
      const checkClash = checkExternalHoldConflicts(clashing, [activeHold])
      expect(checkClash.hasConflict).toBe(true)
      expect(checkClash.conflictingHolds[0]?.displayChipText).toBe('Held in Booqable #9021')

      // Non-clashing candidate (different serial)
      const differentSerial: OsReservationCandidate = {
        productId: 'PUB-CAM-FX6',
        unitSerial: 'FX6-002',
        startDateUtc: '2026-11-26T00:15:00Z',
        endDateUtc: '2026-11-27T00:15:00Z',
      }
      expect(checkExternalHoldConflicts(differentSerial, [activeHold]).hasConflict).toBe(false)
    })

    it('enforces Kathmandu 06:00 AM operational day rollover and rental day span calculation', () => {
      // 05:59:59 NPT is previous day
      expect(operationalDayOf('2026-12-01T05:59:59.000+05:45', OPERATIONAL_DAY_START_DEFAULT_MINUTES)).toBe('2026-11-30')
      // 06:00:00 NPT begins new day
      expect(operationalDayOf('2026-12-01T06:00:00.000+05:45', OPERATIONAL_DAY_START_DEFAULT_MINUTES)).toBe('2026-12-01')

      // Rental days span calculation (Law 1) aligned to Kathmandu 06:00 AM shift
      const pickup = '2026-12-01T00:15:00.000Z' // 06:00 NPT Dec 1
      const returnDate = '2026-12-03T00:15:00.000Z' // 06:00 NPT Dec 3
      expect(rentalDaysBetween(pickup, returnDate)).toBe(2)
    })

    it('evaluates return overruns into descriptive operational bands without rupee penalties', () => {
      const scheduled = new Date('2026-12-02T18:00:00.000Z')

      // On-time return (within 30-min grace)
      const onTime = lateBand(scheduled, new Date('2026-12-02T18:20:00.000Z'))
      expect(onTime.band).toBe('None')
      expect(bandConsequence(onTime)).toContain('Within the 30-minute grace period')

      // Half-day overrun
      const halfDay = lateBand(scheduled, new Date('2026-12-02T19:30:00.000Z'))
      expect(halfDay.band).toBe('Half Day')
      expect(bandConsequence(halfDay)).toContain('Half a rental day is chargeable')

      // Full-day overrun
      const fullDay = lateBand(scheduled, new Date('2026-12-03T02:00:00.000Z'))
      expect(fullDay.band).toBe('Full Day')
      expect(fullDay.fullDaysCharged).toBe(1)
      expect(bandConsequence(fullDay)).toContain('A full rental day is chargeable')
    })

    it('enforces Foundation Spec §1.5: strictly one job In Progress per booking at a time', () => {
      // Valid: Only Pack in progress
      expect(() =>
        assertOneJobInProgress({
          Pack: 'In Progress',
          Handover: 'Not Started',
          Return: 'Not Started',
          Reset: 'Not Started',
        }),
      ).not.toThrow()

      // Valid: None in progress
      expect(() =>
        assertOneJobInProgress({
          Pack: 'Complete',
          Handover: 'Not Started',
          Return: 'Not Started',
          Reset: 'Not Started',
        }),
      ).not.toThrow()

      // Invalid: Both Pack and Handover in progress simultaneously
      expect(() =>
        assertOneJobInProgress({
          Pack: 'In Progress',
          Handover: 'In Progress',
          Return: 'Not Started',
          Reset: 'Not Started',
        }),
      ).toThrow(/§1.5 violated: 2 jobs In Progress at once — Pack, Handover/)
    })
  })

  /* ──────────────────────────────────────────────────────────────────────────
   * 3. Financial Invariants & Arithmetic Correctness
   * ────────────────────────────────────────────────────────────────────────── */
  describe('3. Financial Invariants, VAT & Law 10 Discount Governance', () => {
    it('computes 13% VAT, separate deposit liability, and 50% advance in integer paisa', () => {
      const input: PricingPipelineInput = {
        equipmentSubtotalPaisa: rupees(20000),
        bundleSubtotalPaisa: 0 as Paisa,
        subRentalSubtotalPaisa: 0 as Paisa,
        servicesSubtotalPaisa: 0 as Paisa,
        crewSubtotalPaisa: 0 as Paisa,
        deliveryChargePaisa: 0 as Paisa,
        fuelChargePaisa: 0 as Paisa,
        discounts: {
          membershipPercent: 10, // 10% discount -> Rs 2,000 off -> Rs 18,000 taxable net
        },
        vatEnabled: true,
        recommendedDepositPaisa: rupees(15000), // Rs 15,000 deposit liability
      }

      const res = calculatePricingPipeline(input)
      expect(res.grossSubtotalPaisa).toBe(rupees(20000))
      expect(res.discounts.discountPaisa).toBe(rupees(2000))
      expect(res.taxableSubtotalPaisa).toBe(rupees(18000))
      // 13% VAT on Rs 18,000 = Rs 2,340
      expect(res.vatPaisa).toBe(rupees(2340))
      // Total = Rs 18,000 + Rs 2,340 = Rs 20,340
      expect(res.rentalTotalPaisa).toBe(rupees(20340))

      // Law 5 Invariant: Deposit is strictly excluded from rental total
      expect(res.securityDeposit.requiredPaisa).toBe(rupees(15000))
      expect(res.rentalTotalPaisa).toBe(res.taxableSubtotalPaisa + res.vatPaisa)

      // Tiered advance calculation
      expect(calculateAdvanceRequired(res.rentalTotalPaisa)).toBe(rupees(10170)) // 50% of 20,340
    })

    it('enforces Ruling D3: discounts are ungated for valid percentages (0-100%), but negative or >100% are refused', () => {
      const roles: SystemRole[] = ['Owner', 'Manager', 'Coordinator', 'Accounts']
      for (const role of roles) {
        expect(canApproveDiscount(role, 0)).toBe(true)
        expect(canApproveDiscount(role, 10)).toBe(true)
        expect(canApproveDiscount(role, 25)).toBe(true)
        expect(canApproveDiscount(role, 100)).toBe(true)

        // Invalid percentages are refused for every role
        expect(canApproveDiscount(role, -1)).toBe(false)
        expect(canApproveDiscount(role, 100.01)).toBe(false)
      }
    })

    it('settles security deposits with damage deduction, ensuring zero negative refunds', () => {
      const depositHeld = rupees(12000)

      // Normal deduction
      const partial = settleDeposit(depositHeld, rupees(5000))
      expect(partial.refundPaisa).toBe(rupees(7000))
      expect(partial.shortfallPaisa).toBe(0)
      expect(partial.fullyConsumed).toBe(false)

      // Excessive damage exceeding deposit -> zero refund, isolated shortfall
      const excess = settleDeposit(depositHeld, rupees(18000))
      expect(excess.refundPaisa).toBe(0)
      expect(excess.shortfallPaisa).toBe(rupees(6000))
      expect(excess.fullyConsumed).toBe(true)
    })
  })

  /* ──────────────────────────────────────────────────────────────────────────
   * 4. Fail-Closed Atomic Guards & Actionable Gate Errors
   * ────────────────────────────────────────────────────────────────────────── */
  describe('4. Fail-Closed Atomic Guards & Actionable Gate Errors', () => {
    it('blocks illegal stage skips and regressions with clear forward-only blockers', () => {
      const skip = planTransition({ from: 'Quote', to: 'On Rent' })
      expect(skip.allowed).toBe(false)
      expect(skip.blockers.some((b) => b.rule === 'forward-only')).toBe(true)

      const regressed = planTransition({ from: 'Returned', to: 'Booked' })
      expect(regressed.allowed).toBe(false)
      expect(regressed.blockers.some((b) => b.rule === 'forward-only')).toBe(true)
    })

    it('enforces flag-based gate blocking (Deposit Pending blocks Handover, Damaged blocks Close) while preserving Cancelled orthogonality', () => {
      // Deposit Pending blocks advance to On Rent
      const blockedHandover = planTransition({
        from: 'Packed',
        to: 'On Rent',
        flags: ['Deposit Pending'],
      })
      expect(blockedHandover.allowed).toBe(false)
      expect(blockedHandover.blockers.some((b) => b.rule === 'flag' && b.blocking === 'Deposit Pending')).toBe(true)

      // Payment Due also blocks advance to On Rent
      const blockedPayment = planTransition({
        from: 'Packed',
        to: 'On Rent',
        flags: ['Payment Due'],
      })
      expect(blockedPayment.allowed).toBe(false)
      expect(blockedPayment.blockers.some((b) => b.rule === 'flag' && b.blocking === 'Payment Due')).toBe(true)

      // Damaged flag blocks advance to Closed
      const blockedClose = planTransition({
        from: 'Returned',
        to: 'Closed',
        flags: ['Damaged'],
        gates: {
          rentalInvoiced: true,
          rentalOutstandingPaisa: 0,
          depositHeldPaisa: 0,
          openCases: 0,
          damageChargesPendingApproval: 0,
        },
      })
      expect(blockedClose.allowed).toBe(false)
      expect(blockedClose.blockers.some((b) => b.rule === 'flag' && b.blocking === 'Damaged')).toBe(true)

      // Cancelled flag is an orthogonal critical state, not an artificial stage skip
      expect(FLAGS.Cancelled.type).toBe('Critical')
      expect(FLAGS.Cancelled.blocks).toHaveLength(0) // Orthogonal to stage machine, handled via terminal policy
    })

    it('strictly enforces damage photo evidence and minimum 10-char descriptions before return completion (L68)', () => {
      // Missing photo rejected
      const noPhoto = validateDamageReport({
        description: 'Sensor cover scratched and bent',
        photos: 0,
        chargePaisa: rupees(10000),
        replacementPaisa: rupees(50000),
      })
      expect(noPhoto.valid).toBe(false)
      expect(noPhoto.errors.photos).toBeDefined()

      // Short description (< 10 chars) rejected
      const shortDesc = validateDamageReport({
        description: 'Broken',
        photos: 1,
        chargePaisa: rupees(10000),
        replacementPaisa: rupees(50000),
      })
      expect(shortDesc.valid).toBe(false)
      expect(shortDesc.errors.description).toBeDefined()

      // Compliant report accepted
      const compliant = validateDamageReport({
        description: 'Sensor cover scratched and bent',
        photos: 1,
        chargePaisa: rupees(10000),
        replacementPaisa: rupees(50000),
      })
      expect(compliant.valid).toBe(true)
    })

    it('enforces all 4 closing gates before admitting Closed stage', () => {
      // Unsettled deposit blocks closure
      const openDeposit: CloseGateInput = {
        rentalInvoiced: true,
        rentalOutstandingPaisa: 0,
        depositHeldPaisa: rupees(5000),
        openCases: 0,
        damageChargesPendingApproval: 0,
      }
      expect(closeGates(openDeposit).every((g) => g.passing)).toBe(false)

      // Outstanding invoice balance blocks closure with actionable message
      const unpaid: CloseGateInput = {
        rentalInvoiced: true,
        rentalOutstandingPaisa: rupees(2000),
        depositHeldPaisa: 0,
        openCases: 0,
        damageChargesPendingApproval: 0,
      }
      const unpaidGates = closeGates(unpaid)
      expect(unpaidGates.every((g) => g.passing)).toBe(false)
      const invoiceGate = unpaidGates.find((g) => g.label === 'Rental Outstanding settled')
      expect(invoiceGate?.passing).toBe(false)
      expect(invoiceGate?.blocking).toBe('Rs 2,000 still outstanding')

      // Un-invoiced rental blocks closure with MONEY-13 actionable message
      const unInvoiced: CloseGateInput = {
        rentalInvoiced: false,
        rentalOutstandingPaisa: 0,
        depositHeldPaisa: 0,
        openCases: 0,
        damageChargesPendingApproval: 0,
      }
      const unInvoicedGates = closeGates(unInvoiced)
      expect(unInvoicedGates.find((g) => g.label === 'Rental Outstanding settled')?.blocking).toContain(
        'nothing has been invoiced for this rental, so its outstanding balance is an empty sum rather than a settled account',
      )

      // Zero-value override allows closure when 0 outstanding even if un-invoiced (§4.51)
      const zeroValuePass: CloseGateInput = {
        rentalInvoiced: false,
        isZeroValueOverride: true,
        rentalOutstandingPaisa: 0,
        depositHeldPaisa: 0,
        openCases: 0,
        damageChargesPendingApproval: 0,
      }
      expect(closeGates(zeroValuePass).every((g) => g.passing)).toBe(true)

      // Deposit held can be skipped by Manager with >=10 char justification (Migration 0155)
      const skippedDeposit: CloseGateInput = {
        rentalInvoiced: true,
        rentalOutstandingPaisa: 0,
        depositHeldPaisa: rupees(5000),
        depositSkipReason: 'Client dispute settled offline via management credit',
        openCases: 0,
        damageChargesPendingApproval: 0,
      }
      expect(closeGates(skippedDeposit).every((g) => g.passing)).toBe(true)

      // Collateral (ID card) held blocks closure (D1 / T2-03)
      const heldCollateral: CloseGateInput = {
        rentalInvoiced: true,
        rentalOutstandingPaisa: 0,
        depositHeldPaisa: 0,
        openCases: 0,
        damageChargesPendingApproval: 0,
        collateralHeld: true,
      }
      const collateralGates = closeGates(heldCollateral)
      expect(collateralGates.every((g) => g.passing)).toBe(false)
      const collateralGate = collateralGates.find((g) => g.label === 'No client collateral held')
      expect(collateralGate?.passing).toBe(false)
      expect(collateralGate?.blocking).toContain("Client collateral (ID card) is still held")

      // All gates green -> closure allowed
      const allGreen: CloseGateInput = {
        rentalInvoiced: true,
        rentalOutstandingPaisa: 0,
        depositHeldPaisa: 0,
        openCases: 0,
        damageChargesPendingApproval: 0,
      }
      expect(closeGates(allGreen).every((g) => g.passing)).toBe(true)
    })
  })

  /* ──────────────────────────────────────────────────────────────────────────
   * 5. Role-Based Visibility & Law 6 Blindness
   * ────────────────────────────────────────────────────────────────────────── */
  describe('5. Role-Based Visibility & Law 6 Blindness', () => {
    it('enforces Law 6: Warehouse, Technician, Driver, and Client are completely money-blind', () => {
      expect(canViewMoney('Warehouse')).toBe(false)
      expect(canViewMoney('Technician')).toBe(false)
      expect(canViewMoney('Driver')).toBe(false)
      expect(canViewMoney('Client')).toBe(false)

      expect(canViewMoney('Owner')).toBe(true)
      expect(canViewMoney('Admin')).toBe(true)
      expect(canViewMoney('Manager')).toBe(true)
      expect(canViewMoney('Coordinator')).toBe(true)
      expect(canViewMoney('Accounts')).toBe(true)
    })

    it('strips all money fields on floor surfaces even when accessed by Owner or Manager', () => {
      const floorCtx = gateContext('Owner', { surface: 'floor' })
      expect(canViewMoneyField(floorCtx, 'booking')).toBe(false)
      expect(canViewMoneyField({ role: 'Manager', surface: 'floor' }, 'client-balance')).toBe(false)
      expect(moneyScope(floorCtx)).toBe('none')
    })

    it('classifies finance and pricing routes as money surfaces', () => {
      expect(isMoneySurface('/finance')).toBe(true)
      expect(isMoneySurface('/finance/invoices')).toBe(true)
      expect(isMoneySurface('/finance/payments')).toBe(true)
      expect(isMoneySurface('/operations')).toBe(false)
      expect(isMoneySurface('/rentals')).toBe(false)
    })
  })
})
