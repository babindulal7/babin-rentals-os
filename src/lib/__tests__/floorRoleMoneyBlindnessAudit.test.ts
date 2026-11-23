import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { SystemRole } from '../../types/database'
import { canViewMoney } from '../rbac'
import {
  gateContext,
  moneyScope,
  canViewMoneyField,
  canViewUtilization,
  type MoneyField,
} from '../fieldGating'
import { explainCanonicalQuote, type CanonicalQuoteSnapshot } from '../rentalIntelligence/quoteExplainer'

/**
 * FLOOR ROLE MONEY BLINDNESS AUDIT (Law 6 / Foundation §8.3)
 *
 * Verifies that floor roles (Warehouse, Technician, Driver) and operational
 * floor surfaces (Packing, Handover, Return, Scanner, Trips) strictly observe
 * zero-money visibility across runtime functions, intelligence engines,
 * and workspace source architectures.
 */

describe('Floor Role Money Blindness Audit — Law 6 Core RBAC & Field Gating', () => {
  const ALL_ROLES: readonly SystemRole[] = [
    'Owner',
    'Admin',
    'Manager',
    'Coordinator',
    'Warehouse',
    'Technician',
    'Accounts',
    'Driver',
    'Client',
  ]
  const FLOOR_AND_EXTERNAL_ROLES: readonly SystemRole[] = ['Warehouse', 'Technician', 'Driver', 'Client']
  const OFFICE_FINANCIAL_ROLES: readonly SystemRole[] = ['Owner', 'Admin', 'Manager', 'Coordinator', 'Accounts']
  const MONEY_FIELDS: readonly MoneyField[] = ['booking', 'client-balance', 'asset-finance']

  it('strictly blinds Warehouse, Technician, Driver, and Client in rbac.canViewMoney', () => {
    for (const role of FLOOR_AND_EXTERNAL_ROLES) {
      expect(canViewMoney(role)).toBe(false)
    }
    for (const role of OFFICE_FINANCIAL_ROLES) {
      expect(canViewMoney(role)).toBe(true)
    }
  })

  it('denies all money fields to floor roles in default and floor contexts', () => {
    for (const role of FLOOR_AND_EXTERNAL_ROLES) {
      for (const field of MONEY_FIELDS) {
        expect(canViewMoneyField(gateContext(role), field)).toBe(false)
        expect(canViewMoneyField({ role, surface: 'floor' }, field)).toBe(false)
      }
    }
  })

  it('strips all money fields on floor surfaces even for executive/office roles', () => {
    for (const role of OFFICE_FINANCIAL_ROLES) {
      for (const field of MONEY_FIELDS) {
        expect(canViewMoneyField({ role, surface: 'floor' }, field)).toBe(false)
      }
      expect(moneyScope({ role, surface: 'floor' })).toBe('none')
    }
  })

  it('hides asset utilization percentages from all floor roles and floor surfaces', () => {
    for (const role of FLOOR_AND_EXTERNAL_ROLES) {
      expect(canViewUtilization(gateContext(role))).toBe(false)
    }
    for (const role of ALL_ROLES) {
      expect(canViewUtilization({ role, surface: 'floor' })).toBe(false)
    }
  })
})

describe('Floor Role Money Blindness Audit — Rental Intelligence Scrubbing (RI-02)', () => {
  const sampleSnapshot: CanonicalQuoteSnapshot = {
    bookingId: 'BK-2026-TEST-FLOOR',
    days: 3,
    lineItems: [
      {
        productId: 'PUB-CAM-FX3',
        displayName: 'Sony FX3 Cinema Camera',
        quantity: 2,
        unitRatePaisa: 800000,
        lineTotalPaisa: 4800000,
      },
    ],
    equipmentSubtotalPaisa: 4800000,
    discountPercent: 10,
    discountAmountPaisa: 480000,
    taxRatePercent: 13,
    taxAmountPaisa: 561600,
    totalRentalPaisa: 4881600,
    depositPaisa: 1500000,
    advancePaidPaisa: 2440800,
    outstandingPaisa: 2440800,
    currency: 'NPR',
    calculatedAtIso: new Date().toISOString(),
  }

  it('omits all financial figures in quote explanations for Warehouse, Technician, and Driver', () => {
    for (const role of ['Warehouse', 'Technician', 'Driver'] as const) {
      const breakdown = explainCanonicalQuote(sampleSnapshot, role, 'default')
      expect(breakdown.isMoneyMasked).toBe(true)
      expect(breakdown.equipmentSubtotalFormatted).toBeUndefined()
      expect(breakdown.discountFormatted).toBeUndefined()
      expect(breakdown.vatFormatted).toBeUndefined()
      expect(breakdown.totalRentalFormatted).toBeUndefined()
      expect(breakdown.depositLiabilityFormatted).toBeUndefined()
      expect(breakdown.outstandingBalanceFormatted).toBeUndefined()
      expect(breakdown.advices[0]?.explanation).toContain('Commercial pricing, VAT, deposits, and invoice balances are omitted')
    }
  })

  it('omits all financial figures when an Owner or Manager accesses quote explanation on floor surface', () => {
    const breakdown = explainCanonicalQuote(sampleSnapshot, 'Owner', 'floor')
    expect(breakdown.isMoneyMasked).toBe(true)
    expect(breakdown.equipmentSubtotalFormatted).toBeUndefined()
    expect(breakdown.totalRentalFormatted).toBeUndefined()
  })
})

describe('Floor Role Money Blindness Audit — Source & AST Architectural Invariants', () => {
  const read = (relPath: string) => readFileSync(join(process.cwd(), relPath), 'utf8')

  it('verifies PackingWorkspace does not import money formatting libraries', () => {
    const src = read('src/modules/rentals/PackingWorkspace.tsx')
    expect(src).not.toContain("from '../../lib/money'")
    expect(src).not.toContain('formatMoney')
    expect(src).not.toContain('useCanViewMoney')
  })

  it('verifies ReturnWorkspace explicitly stays money-free by construction', () => {
    const src = read('src/modules/rentals/ReturnWorkspace.tsx')
    expect(src).toContain('`lib/money.ts` stays unimported here')
    expect(src).toContain('**No money, anywhere.** Foundation §8.3')
    expect(src).not.toContain("from '../../lib/money'")
    expect(src).not.toContain('formatMoney(')
  })

  it('verifies HandoverWorkspace restricts Mark Cleared to money-sighted roles', () => {
    const src = read('src/modules/rentals/HandoverWorkspace.tsx')
    expect(src).toContain('canViewMoney')
    expect(src).toContain('moneyGateClearer')
    expect(src).toContain('Payment and deposit must be cleared by Accounts or a Manager.')
    expect(src).toContain('Warehouse sees no money')
  })

  it('verifies DeliveryWorkspace gates revenue totals and fee table headers behind canMoney', () => {
    const src = read('src/modules/operations/DeliveryWorkspace.tsx')
    expect(src).toContain('useCanViewMoney')
    expect(src).toContain('const canMoney = useCanViewMoney()')
    expect(src).toContain('{canMoney && <th>FEE</th>}')
  })

  it('verifies RiderDeliveryPage explicitly enforces money-blind dispatch view', () => {
    const src = read('src/modules/operations/RiderDeliveryPage.tsx')
    expect(src).toContain('Strictly money-blind (Law 6: zero prices, rates, fees, or deposit figures)')
    expect(src).not.toContain('formatMoney')
    expect(src).not.toContain('rupees(')
  })

  it('verifies ScannerFab passes withMoney: canViewMoney into item card lookups', () => {
    const src = read('src/components/shell/ScannerFab.tsx')
    expect(src).toContain('lookupItemCard(c, { withMoney: canViewMoney })')
  })

  it('verifies EquipmentRecordEditor hides purchase price and daily rental rates for floor roles', () => {
    const src = read('src/components/records/EquipmentRecordEditor.tsx')
    expect(src).toContain('Financial and rental pricing fields are hidden for your role')
    expect(src).toContain('canViewMoney')
  })
})
