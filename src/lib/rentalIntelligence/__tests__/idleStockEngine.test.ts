import { describe, it, expect } from 'vitest'
import {
  analyzeAssetAction,
  evaluateFleetIdleStock,
  type AssetPerformanceInput,
} from '../idleStockEngine'
import { rupees } from '../../money'

describe('Rental Intelligence RI-05: Idle Stock Activation Engine', () => {
  const sampleFleet: AssetPerformanceInput[] = [
    {
      productId: 'BRPI-CAM-FX3',
      displayName: 'Sony FX3A Cinema Line Body',
      category: 'Camera Body',
      purchaseCostPaisa: rupees(285000),
      dailyRatePaisa: rupees(4000),
      unitsOwned: 2,
      monthlyRentedDaysAvg: 46.0, // 46 / 60 = 76.7% utilization
      lostDemandDaysMonthly: 4.5,
      lifetimeRentals: 48,
    },
    {
      productId: 'BRPI-LNS-CHIOPT-SET',
      displayName: 'CHIOPT 28-85mm + 75-250mm Cine Zoom Set',
      category: 'Cine Lenses',
      purchaseCostPaisa: rupees(790000), // > 5 Lakhs
      dailyRatePaisa: rupees(14000),
      unitsOwned: 1,
      monthlyRentedDaysAvg: 0.8, // 0.8 / 30 = 2.7% utilization
      lostDemandDaysMonthly: 0.0,
      lifetimeRentals: 3,
    },
    {
      productId: 'BRPI-LGT-600X',
      displayName: 'Aputure LS 600x Pro Bi-Color COB',
      category: 'Lighting',
      purchaseCostPaisa: rupees(285000),
      dailyRatePaisa: rupees(4500),
      unitsOwned: 1,
      monthlyRentedDaysAvg: 16.5, // 16.5 / 30 = 55.0% utilization
      lostDemandDaysMonthly: 0.5,
      lifetimeRentals: 32,
    },
    {
      productId: 'BRPI-NEW-PROTOTYPE',
      displayName: 'Unreleased Wireless Transmitter',
      category: 'Monitoring',
      unitsOwned: 1,
      // No utilization data recorded
    },
  ]

  it('identifies BUY_ADD_ONE_MORE for high-utilization asset with recurring lost demand', () => {
    const fx3 = sampleFleet[0]!
    const result = analyzeAssetAction(fx3, 'Manager')

    expect(result.action).toBe('BUY_ADD_ONE_MORE')
    expect(result.priority).toBe('URGENT')
    expect(result.utilizationPct).toBe(76.7)
    expect(result.reasoning).toContain('Fleet utilization is 76.7%')
    expect(result.reasoning).toContain('4.5 days of turned-away demand')
    expect(result.purchaseCostFormatted).toBe('Rs 2,85,000')
    expect(result.evidenceState).toBe('supported')
  })

  it('identifies BUNDLE_OR_REPOSITION for high-value idle capital without discounting rate', () => {
    const chiopt = sampleFleet[1]!
    const result = analyzeAssetAction(chiopt, 'Owner')

    expect(result.action).toBe('BUNDLE_OR_REPOSITION')
    expect(result.priority).toBe('HIGH_IDLE_CAPITAL')
    expect(result.utilizationPct).toBe(2.7)
    expect(result.purchaseCostFormatted).toBe('Rs 7,90,000')
    expect(result.reasoning).toContain('Do not discount standalone catalog rate')
    expect(result.reasoning).toContain('Reposition by bundling')
  })

  it('identifies HOLD_AND_OPTIMIZE for steady earners above 40% utilization', () => {
    const aputure = sampleFleet[2]!
    const result = analyzeAssetAction(aputure, 'Coordinator')

    expect(result.action).toBe('HOLD_AND_OPTIMIZE')
    expect(result.priority).toBe('STEADY_EARNER')
    expect(result.utilizationPct).toBe(55.0)
    expect(result.reasoning).toContain('Strong cash flow generator')
    expect(result.reasoning).toContain('55%')
  })

  it('fails closed with UNKNOWN_NO_DATA and inconclusive state when utilization is missing (RI-A15)', () => {
    const unrecorded = sampleFleet[3]!
    const result = analyzeAssetAction(unrecorded, 'Manager')

    expect(result.action).toBe('UNKNOWN_NO_DATA')
    expect(result.priority).toBe('INCONCLUSIVE')
    expect(result.utilizationPct).toBeUndefined()
    expect(result.evidenceState).toBe('inconclusive')
    expect(result.reasoning).toContain('Insufficient verified booking records')

    // Must never fabricate synthetic figures like NPR 2.29M
    expect(result.reasoning).not.toContain('2.29M')
  })

  describe('Fleet Aggregation & Summary', () => {
    it('aggregates fleet summary metrics accurately with integer paisa precision', () => {
      const summary = evaluateFleetIdleStock(sampleFleet, 'Owner')

      expect(summary.analyzedCount).toBe(4)
      expect(summary.idleHighCapitalCount).toBe(1) // CHIOPT
      expect(summary.expansionCandidatesCount).toBe(1) // FX3
      expect(summary.steadyEarnersCount).toBe(1) // 600X
      expect(summary.unknownCount).toBe(1) // Prototype

      // Total idle capital = CHIOPT Rs 7,90,000
      expect(summary.totalIdleCapitalPaisa).toBe(rupees(790000))
      expect(summary.totalIdleCapitalFormatted).toBe('Rs 7,90,000')

      const fleetAdvice = summary.advices.find((a) => a.id === 'adv-fleet-idle-summary')
      expect(fleetAdvice).toBeDefined()
      expect(fleetAdvice?.explanation).toContain('Rs 7,90,000 in underutilized capital')
    })
  })

  describe('Field-Level Gating & Role Isolation (HIS v2.1 §4)', () => {
    it('strips all monetary values and rates when user is Warehouse role', () => {
      const chiopt = sampleFleet[1]!
      const result = analyzeAssetAction(chiopt, 'Warehouse')

      expect(result.isMoneyMasked).toBe(true)
      expect(result.purchaseCostFormatted).toBeUndefined()
      expect(result.dailyRateFormatted).toBeUndefined()
      expect(result.monthlyRevenueFormatted).toBeUndefined()
      expect(result.tenMonthRecoveryPct).toBeUndefined()
      expect(result.monthsToFullPayback).toBeUndefined()

      // Explanation must not leak money to warehouse
      expect(result.reasoning).not.toContain('Rs')
      expect(result.reasoning).not.toContain('790,000')
      expect(result.reasoning).toContain('High-value capital asset experiences low utilization')
    })

    it('strips fleet total idle capital when surface is floor', () => {
      const summary = evaluateFleetIdleStock(sampleFleet, 'Coordinator', 'floor')

      expect(summary.totalIdleCapitalFormatted).toBeUndefined()
      const fleetAdvice = summary.advices.find((a) => a.id === 'adv-fleet-idle-summary')
      expect(fleetAdvice?.explanation).not.toContain('Rs')
      expect(fleetAdvice?.explanation).toContain('significant capital')
    })
  })
})
