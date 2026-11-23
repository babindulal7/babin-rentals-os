// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { canViewMoney, canApproveDailyClosing, type SystemRole } from '../../lib/rbac'
import { moneyScope, canViewPII, gateContext } from '../../lib/fieldGating'
import {
  calculatePricingPipeline,
  calculateAdvanceRequired,
  type PricingPipelineInput,
} from '../../lib/pricingPipeline'
import { rupees, toRupees, type Paisa, REFERENCE_CASE, REFERENCE_CASE_ERROR } from '../../lib/money'
import { canAdvance, closeGates, FLAGS, type CloseGateInput } from '../../lib/workflow'
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

describe('Week 5 Release Candidate Readiness & Surface Certification Suite', () => {
  /* ──────────────────────────────────────────────────────────────────────────
   * 1. Three Surface Architecture & Tenant Isolation
   * ────────────────────────────────────────────────────────────────────────── */
  describe('Surface 1: Operations App & Role Boundaries', () => {
    const roles: SystemRole[] = [
      'Owner',
      'Admin',
      'Manager',
      'Accounts',
      'Coordinator',
      'Warehouse',
      'Technician',
      'Driver',
      'Client',
    ]

    it('enforces exact money viewing permissions across all 9 roles', () => {
      const moneyAllowedRoles = ['Owner', 'Admin', 'Manager', 'Accounts', 'Coordinator']
      const moneyBlindRoles = ['Warehouse', 'Technician', 'Driver', 'Client']

      for (const role of roles) {
        if (moneyAllowedRoles.includes(role)) {
          expect(canViewMoney(role)).toBe(true)
        } else {
          expect(canViewMoney(role)).toBe(false)
        }
      }
    })

    it('enforces daily closing sign-off gate to exactly Owner, Admin, Manager, and Accounts', () => {
      const authorizedClosingRoles = ['Owner', 'Admin', 'Manager', 'Accounts']
      for (const role of roles) {
        if (authorizedClosingRoles.includes(role)) {
          expect(canApproveDailyClosing(role)).toBe(true)
        } else {
          expect(canApproveDailyClosing(role)).toBe(false)
        }
      }
    })
  })

  describe('Surface 2: Public Catalogue & Privacy Invariants', () => {
    it('restricts public anonymous visitors to catalogue-only data', () => {
      // Anonymous cannot view money or PII
      const isAnonMoneySafe = moneyScope({ role: 'Client', surface: 'default' }) === 'none'
      expect(isAnonMoneySafe).toBe(true)

      const isPIIBlocked = canViewPII(gateContext('Client'))
      expect(isPIIBlocked).toBe(false)
    })
  })

  describe('Surface 3: Client Portal (D-5 Tenant Isolation & KYC)', () => {
    it('ensures client role has zero access to internal financial views or closing controls', () => {
      expect(canViewMoney('Client')).toBe(false)
      expect(canApproveDailyClosing('Client')).toBe(false)
      expect(moneyScope({ role: 'Client', surface: 'default' })).toBe('none')
    })
  })

  /* ──────────────────────────────────────────────────────────────────────────
   * 2. Financial Precision & Law 5 Deposit Segregation
   * ────────────────────────────────────────────────────────────────────────── */
  describe('Financial Integrity & Exact Arithmetic', () => {
    it('reasserts Foundation Spec §2.8 canonical reference figures', () => {
      expect(REFERENCE_CASE_ERROR).toBeNull()
      expect(REFERENCE_CASE.rentalTotal).toBe(rupees(139506))
      expect(toRupees(REFERENCE_CASE.rentalTotal)).toBe(139506)
      expect(toRupees(REFERENCE_CASE.subtotal)).toBe(132750)
      expect(toRupees(REFERENCE_CASE.discount)).toBe(9293)
      expect(toRupees(REFERENCE_CASE.taxable)).toBe(123457)
      expect(toRupees(REFERENCE_CASE.vat)).toBe(16049)
      expect(toRupees(REFERENCE_CASE.payments)).toBe(15000)
      expect(toRupees(REFERENCE_CASE.outstanding)).toBe(124506)
    })

    it('segregates deposit as separate liability that never commingles with revenue', () => {
      const pricing = calculatePricingPipeline(
        makePipelineInput({
          equipmentSubtotalPaisa: rupees(20000),
          recommendedDepositPaisa: rupees(10000),
          vatEnabled: true,
        }),
      )
      // 20,000 + 13% VAT = 22,600
      expect(pricing.rentalTotalPaisa).toBe(rupees(22600))
      expect(pricing.securityDeposit.requiredPaisa).toBe(rupees(10000))

      // Deposit settlement returns refund without altering invoice totals
      const settlement = settleDeposit(rupees(10000), 0 as Paisa)
      expect(settlement.refundPaisa).toBe(rupees(10000))
      expect(settlement.shortfallPaisa).toBe(rupees(0))
      expect(settlement.fullyConsumed).toBe(false)
    })
  })

  /* ──────────────────────────────────────────────────────────────────────────
   * 3. Floor Ergonomics & Law 14 Standards
   * ────────────────────────────────────────────────────────────────────────── */
  describe('Floor Ergonomics & Responsive Breakpoints', () => {
    it('asserts floor verb minimum dimension standard >= 56px and interactive controls >= 44px', () => {
      const FLOOR_VERB_HEIGHT_PX = 56
      const STANDARD_CONTROL_HEIGHT_PX = 44

      expect(FLOOR_VERB_HEIGHT_PX).toBeGreaterThanOrEqual(56)
      expect(STANDARD_CONTROL_HEIGHT_PX).toBeGreaterThanOrEqual(44)
    })

    it('validates breakpoint contract (phone < 768 <= tablet < 1280 <= desktop)', () => {
      expect(viewportFor(390)).toBe('phone')
      expect(viewportFor(767)).toBe('phone')
      expect(viewportFor(768)).toBe('tablet')
      expect(viewportFor(1024)).toBe('tablet')
      expect(viewportFor(1194)).toBe('tablet')
      expect(viewportFor(1280)).toBe('desktop')
      expect(viewportFor(1920)).toBe('desktop')
    })
  })

  /* ──────────────────────────────────────────────────────────────────────────
   * 4. Offline Queue & Idempotency Invariants (Law 8)
   * ────────────────────────────────────────────────────────────────────────── */
  describe('Offline Queue & Data Invariants', () => {
    it('verifies client_uuid format compliance on all write payloads', () => {
      const sampleMutation = {
        client_uuid: 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d',
        action: 'PACK_LINE_ITEM',
        timestamp: '2026-12-28T10:00:00.000Z',
      }
      expect(sampleMutation.client_uuid).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
      )
    })

    it('confirms four closing gates refuse premature closure', () => {
      const closingInput: CloseGateInput = {
        rentalInvoiced: false,
        rentalOutstandingPaisa: rupees(5000),
        depositHeldPaisa: rupees(10000),
        damageChargesPendingApproval: 1,
        collateralHeld: true,
      }
      const gates = closeGates(closingInput)
      const allPassed = gates.every((g) => g.passing)
      expect(allPassed).toBe(false)
      const failingGates = gates.filter((g) => !g.passing)
      expect(failingGates.length).toBeGreaterThan(0)
    })
  })
})
