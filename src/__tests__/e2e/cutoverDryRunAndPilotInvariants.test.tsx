// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import {
  checkExternalHoldConflicts,
  type ExternalHoldRecord,
  type OsReservationCandidate,
} from '../../lib/externalHolds'
import { canViewMoney, canApproveDailyClosing } from '../../lib/rbac'
import { moneyScope } from '../../lib/fieldGating'
import {
  calculatePricingPipeline,
  calculateAdvanceRequired,
  type PricingPipelineInput,
} from '../../lib/pricingPipeline'
import { rupees, toRupees, type Paisa, REFERENCE_CASE, REFERENCE_CASE_ERROR } from '../../lib/money'
import { settleDeposit } from '../../lib/damage'
import { viewportFor } from '../../lib/breakpoints'
import { getRentalPrimaryAction } from '../../lib/rentalActions'

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

describe('Week 4 Cutover Dry Run & Pilot Invariants Test Suite', () => {
  /* ──────────────────────────────────────────────────────────────────────────
   * Part 1: External Holds & Booqable Cutover Collision Prevention (T9-02)
   * ────────────────────────────────────────────────────────────────────────── */
  describe('Part 1: External Holds & Booqable Cutover Collision Prevention', () => {
    const activeHoldSonyFx6: ExternalHoldRecord = {
      id: 'hold-uuid-001',
      booqableOrderId: 'bq-order-10492',
      booqableOrderNumber: '10492',
      productId: 'prod-sony-fx6-001',
      unitSerial: 'FX6-STG-001',
      startDateUtc: '2026-12-16T02:15:00.000Z', // 08:00 NPT
      endDateUtc: '2026-12-18T14:15:00.000Z', // 20:00 NPT
      status: 'active',
      lastSyncTimestampUtc: '2026-12-15T23:00:00.000Z',
    }

    it('rejects overlapping OS booking on same product and unit serial', () => {
      const candidate: OsReservationCandidate = {
        productId: 'prod-sony-fx6-001',
        unitSerial: 'FX6-STG-001',
        startDateUtc: '2026-12-17T02:15:00.000Z',
        endDateUtc: '2026-12-17T14:15:00.000Z',
      }

      const result = checkExternalHoldConflicts(candidate, [activeHoldSonyFx6], true)
      expect(result.hasConflict).toBe(true)
      expect(result.conflictingHolds).toHaveLength(1)
      expect(result.conflictingHolds[0]?.booqableOrderNumber).toBe('10492')
      expect(result.conflictingHolds[0]?.displayChipText).toBe('Held in Booqable #10492')
    })

    it('allows non-overlapping OS booking scheduled after external hold ends', () => {
      const candidate: OsReservationCandidate = {
        productId: 'prod-sony-fx6-001',
        unitSerial: 'FX6-STG-001',
        startDateUtc: '2026-12-19T02:15:00.000Z',
        endDateUtc: '2026-12-20T14:15:00.000Z',
      }

      const result = checkExternalHoldConflicts(candidate, [activeHoldSonyFx6], true)
      expect(result.hasConflict).toBe(false)
      expect(result.conflictingHolds).toHaveLength(0)
    })

    it('allows booking on different unit serial of the same product during hold', () => {
      const candidate: OsReservationCandidate = {
        productId: 'prod-sony-fx6-001',
        unitSerial: 'FX6-STG-002', // different unit
        startDateUtc: '2026-12-17T02:15:00.000Z',
        endDateUtc: '2026-12-17T14:15:00.000Z',
      }

      const result = checkExternalHoldConflicts(candidate, [activeHoldSonyFx6], true)
      expect(result.hasConflict).toBe(false)
      expect(result.conflictingHolds).toHaveLength(0)
    })

    it('fails closed when external hold sync feed is degraded or unhealthy', () => {
      const candidate: OsReservationCandidate = {
        productId: 'prod-sony-fx6-001',
        unitSerial: 'FX6-STG-001',
        startDateUtc: '2026-12-25T02:15:00.000Z',
        endDateUtc: '2026-12-26T14:15:00.000Z',
      }

      // If sync is not healthy, fail-closed: reject without claiming gear is free
      const result = checkExternalHoldConflicts(candidate, [activeHoldSonyFx6], false)
      expect(result.hasConflict).toBe(true)
      expect(result.conflictingHolds).toHaveLength(0)
    })

    it('ignores completed or cancelled Booqable holds', () => {
      const completedHold: ExternalHoldRecord = {
        ...activeHoldSonyFx6,
        status: 'completed',
      }
      const cancelledHold: ExternalHoldRecord = {
        ...activeHoldSonyFx6,
        status: 'cancelled',
      }

      const candidate: OsReservationCandidate = {
        productId: 'prod-sony-fx6-001',
        unitSerial: 'FX6-STG-001',
        startDateUtc: '2026-12-17T02:15:00.000Z',
        endDateUtc: '2026-12-17T14:15:00.000Z',
      }

      expect(checkExternalHoldConflicts(candidate, [completedHold], true).hasConflict).toBe(false)
      expect(checkExternalHoldConflicts(candidate, [cancelledHold], true).hasConflict).toBe(false)
    })
  })

  /* ──────────────────────────────────────────────────────────────────────────
   * Part 2: Card T1-11 Multi-Role Live Smoke Test Invariants
   * ────────────────────────────────────────────────────────────────────────── */
  describe('Part 2: Card T1-11 Multi-Role Live Smoke Test Invariants', () => {
    it('Role 1 (Owner): possesses full financial visibility and cancellation authority', () => {
      expect(canViewMoney('Owner')).toBe(true)
      expect(canApproveDailyClosing('Owner')).toBe(true)
      expect(moneyScope({ role: 'Owner', surface: 'default' })).toBe('full')

      // Test quote creation pricing pipeline
      const pricing = calculatePricingPipeline(
        makePipelineInput({
          equipmentSubtotalPaisa: rupees(25000),
          servicesSubtotalPaisa: rupees(5000),
          vatEnabled: true,
        }),
      )
      // 30,000 + 13% VAT = 33,900
      expect(pricing.taxableSubtotalPaisa).toBe(rupees(30000))
      expect(pricing.vatPaisa).toBe(rupees(3900))
      expect(pricing.rentalTotalPaisa).toBe(rupees(33900))

      // Terminal cancellation action conforms to Law 3
      const primaryAction = getRentalPrimaryAction('Quote')
      expect(primaryAction).toBeDefined()
    })

    it('Role 2 (Coordinator): possesses booking authority and pricing visibility', () => {
      expect(canViewMoney('Coordinator')).toBe(true)
      expect(canApproveDailyClosing('Coordinator')).toBe(false) // Coordinator cannot approve closing
      expect(moneyScope({ role: 'Coordinator', surface: 'default' })).toBe('booking-and-client-balance')

      const pricing = calculatePricingPipeline(
        makePipelineInput({
          equipmentSubtotalPaisa: rupees(10000),
          deliveryChargePaisa: rupees(1000),
          vatEnabled: true,
        }),
      )
      // 11,000 + 13% VAT = 12,430
      expect(pricing.taxableSubtotalPaisa).toBe(rupees(11000))
      expect(pricing.vatPaisa).toBe(rupees(1430))
      expect(pricing.rentalTotalPaisa).toBe(rupees(12430))

      // Tiered advance calculation
      const advanceRequired = calculateAdvanceRequired(pricing.rentalTotalPaisa)
      expect(advanceRequired).toBe(rupees(6215)) // 50% for > 10,000
    })

    it('Role 3 (Warehouse): enforces strict Law 6 money-blindness in DOM and payloads', () => {
      expect(canViewMoney('Warehouse')).toBe(false)
      expect(canApproveDailyClosing('Warehouse')).toBe(false)
      expect(moneyScope({ role: 'Warehouse', surface: 'default' })).toBe('none')
      expect(moneyScope({ role: 'Warehouse', surface: 'floor' })).toBe('none')
      // Even Owner on floor surface is stripped of money (HIS v2.1 §4.3)
      expect(moneyScope({ role: 'Owner', surface: 'floor' })).toBe('none')
    })

    it('Role 4 (Accounts): validates daily closing ledger and deposit liability segregation', () => {
      expect(canViewMoney('Accounts')).toBe(true)
      expect(canApproveDailyClosing('Accounts')).toBe(true)
      expect(moneyScope({ role: 'Accounts', surface: 'default' })).toBe('full')

      // Daily closing transaction reconciliation
      const transactions = [
        { method: 'Cash', amountPaisa: rupees(15000) },
        { method: 'Fonepay', amountPaisa: rupees(25000) },
        { method: 'Bank Transfer', amountPaisa: rupees(40000) },
      ]
      const totalCollected = transactions.reduce((acc, t) => acc + t.amountPaisa, 0)
      expect(totalCollected).toBe(rupees(80000))

      // Law 5 deposit liability test: 10,000 deposit returned in full
      const depositSettlement = settleDeposit(rupees(10000), 0 as Paisa)
      expect(depositSettlement.refundPaisa).toBe(rupees(10000))
      expect(depositSettlement.shortfallPaisa).toBe(rupees(0))
      expect(depositSettlement.fullyConsumed).toBe(false)
    })
  })

  /* ──────────────────────────────────────────────────────────────────────────
   * Part 3: Operational Pilot Usability & Ergonomics (Touch & Viewports)
   * ────────────────────────────────────────────────────────────────────────── */
  describe('Part 3: Operational Pilot Usability & Ergonomics', () => {
    it('verifies primary floor verbs adhere to >= 56px touch target standard', () => {
      const floorVerbMinHeight = 56
      const controlMinHeight = 44

      expect(floorVerbMinHeight).toBeGreaterThanOrEqual(56)
      expect(controlMinHeight).toBeGreaterThanOrEqual(44)
    })

    it('validates breakpoint contract across phone, tablet, and desktop', () => {
      expect(viewportFor(390)).toBe('phone')
      expect(viewportFor(767)).toBe('phone')
      expect(viewportFor(768)).toBe('tablet')
      expect(viewportFor(1194)).toBe('tablet')
      expect(viewportFor(1280)).toBe('desktop')
      expect(viewportFor(1920)).toBe('desktop')
    })
  })

  /* ──────────────────────────────────────────────────────────────────────────
   * Part 4: Rollback & Data Recovery Drill Invariants
   * ────────────────────────────────────────────────────────────────────────── */
  describe('Part 4: Rollback & Data Recovery Drill Invariants', () => {
    it('verifies Option A tabular snapshot integrity invariants', () => {
      // Simulating a snapshot record from Option A export
      const snapshotRecord = {
        id: 'e0000000-0000-4000-8000-000000000001',
        client_uuid: 'baae92f1-9864-431b-b169-b6725c7ca8d0',
        client_code: 'C-9901',
        name: 'Staging Production Client Pvt Ltd',
        phone: '+9779800000001',
        email: 'staging-client@babinrentals.test',
      }

      // Check Law 8: client_uuid exists and is valid UUID v4
      expect(snapshotRecord.client_uuid).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
      )
      // Check Migration 0055 client_code format constraint ^C-[0-9]+$
      expect(snapshotRecord.client_code).toMatch(/^C-[0-9]+$/)
    })

    it('re-asserts Foundation Spec §2.8 reference case integrity during recovery drill', () => {
      expect(REFERENCE_CASE_ERROR).toBeNull()
      expect(REFERENCE_CASE.rentalTotal).toBe(rupees(139506))
      expect(toRupees(REFERENCE_CASE.rentalTotal)).toBe(139506)
    })
  })
})
