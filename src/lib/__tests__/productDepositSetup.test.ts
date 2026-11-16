import { describe, expect, it } from 'vitest'
import {
  depositRuleType,
  hasDepositRule,
  calculateEffectiveDeposit,
  exportDepositSetupCsv,
  parseDepositSetupCsv,
  type ProductDepositRow,
} from '../productDeposit'
import { rupees } from '../money'

describe('productDeposit setup and dry-run engine (T3-02)', () => {
  const sampleProducts: ProductDepositRow[] = [
    {
      id: 'prod-1',
      name: 'Sony FX3 Cinema Camera',
      brand: 'Sony',
      model: 'ILME-FX3',
      category: 'Cameras',
      dailyRatePaisa: rupees(6000),
      replacementValuePaisa: rupees(450000),
      depositFixedPaisa: rupees(10000),
      depositPercent: null,
      effectiveDepositPaisa: rupees(10000),
      hasDeposit: true,
    },
    {
      id: 'prod-2',
      name: 'Canon EOS R5 C',
      brand: 'Canon',
      model: 'R5C',
      category: 'Cameras',
      dailyRatePaisa: rupees(5500),
      replacementValuePaisa: rupees(500000),
      depositFixedPaisa: null,
      depositPercent: 10,
      effectiveDepositPaisa: rupees(50000),
      hasDeposit: true,
    },
    {
      id: 'prod-3',
      name: 'Manfrotto 504HD Tripod',
      brand: 'Manfrotto',
      model: '504HD',
      category: 'Support',
      dailyRatePaisa: rupees(1500),
      replacementValuePaisa: rupees(75000),
      depositFixedPaisa: null,
      depositPercent: null,
      effectiveDepositPaisa: null,
      hasDeposit: false,
    },
  ]

  it('determines depositRuleType correctly', () => {
    expect(depositRuleType({ depositFixedPaisa: rupees(5000), depositPercent: null })).toBe('fixed')
    expect(depositRuleType({ depositFixedPaisa: rupees(5000), depositPercent: 10 })).toBe('fixed') // Fixed wins
    expect(depositRuleType({ depositFixedPaisa: null, depositPercent: 10 })).toBe('percent')
    expect(depositRuleType({ depositFixedPaisa: null, depositPercent: null })).toBe('none')
    expect(depositRuleType({ depositFixedPaisa: rupees(0), depositPercent: 0 })).toBe('none')
  })

  it('determines hasDepositRule correctly', () => {
    expect(hasDepositRule({ depositFixedPaisa: rupees(5000), depositPercent: null })).toBe(true)
    expect(hasDepositRule({ depositFixedPaisa: null, depositPercent: 10, replacementValuePaisa: rupees(100000) })).toBe(true)
    // Percent with no replacement value is not a usable deposit rule
    expect(hasDepositRule({ depositFixedPaisa: null, depositPercent: 10, replacementValuePaisa: null })).toBe(false)
    expect(hasDepositRule({ depositFixedPaisa: null, depositPercent: null })).toBe(false)
  })

  it('calculates effective deposit in paisa', () => {
    expect(
      calculateEffectiveDeposit({
        depositFixedPaisa: rupees(8000),
        depositPercent: null,
        replacementValuePaisa: rupees(100000),
      }),
    ).toBe(rupees(8000))

    expect(
      calculateEffectiveDeposit({
        depositFixedPaisa: null,
        depositPercent: 15,
        replacementValuePaisa: rupees(200000),
      }),
    ).toBe(rupees(30000))

    expect(
      calculateEffectiveDeposit({
        depositFixedPaisa: null,
        depositPercent: null,
        replacementValuePaisa: rupees(200000),
      }),
    ).toBeNull()
  })

  it('exports RFC 4180 CSV correctly', () => {
    const csv = exportDepositSetupCsv(sampleProducts)
    expect(csv).toContain('Product ID,Product Name,Brand,Model,Category,Rule Type')
    expect(csv).toContain('Sony FX3 Cinema Camera')
    expect(csv).toContain('fixed,10000')
    expect(csv).toContain('percent,,10,500000,50000')
    expect(csv).toContain('none,,,75000,')
  })

  it('parses CSV dry-run and identifies changes before applying', () => {
    const csvData = [
      'Product ID,Product Name,Brand,Model,Category,Rule Type,Fixed Deposit (NPR),Deposit Percent (%),Replacement Value (NPR)',
      'prod-1,Sony FX3 Cinema Camera,Sony,ILME-FX3,Cameras,fixed,12000,,450000', // Changed fixed: 10000 -> 12000
      'prod-2,Canon EOS R5 C,Canon,R5C,Cameras,percent,,10,500000', // Unchanged
      'prod-3,Manfrotto 504HD Tripod,Manfrotto,504HD,Support,percent,,5,80000', // Changed: set percent=5, repl=80000
    ].join('\r\n')

    const dryRun = parseDepositSetupCsv(csvData, sampleProducts)
    expect(dryRun.totalRows).toBe(3)
    expect(dryRun.changeCount).toBe(2)
    expect(dryRun.unchangedCount).toBe(1)
    expect(dryRun.errorCount).toBe(0)

    const fx3 = dryRun.entries.find((e) => e.productId === 'prod-1')!
    expect(fx3.hasChange).toBe(true)
    expect(fx3.oldFixed).toBe(rupees(10000))
    expect(fx3.newFixed).toBe(rupees(12000))

    const tripod = dryRun.entries.find((e) => e.productId === 'prod-3')!
    expect(tripod.hasChange).toBe(true)
    expect(tripod.oldRule).toBe('none')
    expect(tripod.newRule).toBe('percent')
    expect(tripod.newPercent).toBe(5)
    expect(tripod.newReplacement).toBe(rupees(80000))
    expect(tripod.newEffective).toBe(rupees(4000))
  })

  it('catches and reports validation errors in CSV rows', () => {
    const csvData = [
      'Product ID,Product Name,Brand,Model,Category,Rule Type,Fixed Deposit (NPR),Deposit Percent (%),Replacement Value (NPR)',
      'prod-unknown,Nonexistent Gear,Brand,M1,Cameras,fixed,1000,,',
      'prod-1,Sony FX3 Cinema Camera,Sony,ILME-FX3,Cameras,percent,,150,', // Invalid > 100%
      'prod-2,Canon EOS R5 C,Canon,R5C,Cameras,fixed,-500,,', // Negative amount
    ].join('\r\n')

    const dryRun = parseDepositSetupCsv(csvData, sampleProducts)
    expect(dryRun.errorCount).toBe(3)
    expect(dryRun.entries[0]?.error).toContain('Product not found in active inventory')
    expect(dryRun.entries[1]?.error).toContain('between 0 and 100')
    expect(dryRun.entries[2]?.error).toContain('cannot be negative')
  })
})
