/**
 * Babin Rentals OS — Idle Stock Activation & Asset Intelligence Engine (RI-05)
 *
 * Domain logic for fleet utilization, capital efficiency, and lifecycle actions:
 * 1. BUY_ADD_ONE_MORE: High utilization (>= 65%) with recurring lost demand (>= 3 days/mo).
 * 2. BUNDLE_OR_REPOSITION: High-value idle capital (>= Rs 5 Lakhs) with low utilization (< 10%).
 *    Rule: Never discount standalone rate; embed into curated Commercial/Director Packages to stimulate DoP trial.
 * 3. HOLD_AND_OPTIMIZE: Healthy earner (>= 40% utilization).
 * 4. MONITOR_LIFECYCLE: Routine asset observation.
 * 5. UNKNOWN_NO_DATA: When utilization history is missing, fails closed with 'Unknown' instead of synthetic demo figures.
 * 6. Field-level gating (HIS v2.1 §4): capital values, rates, and revenue masked for floor roles/surfaces.
 */

import { formatMoney, type Paisa } from '../money'
import { moneyScope, type Surface } from '../fieldGating'
import type { SystemRole } from '../../types/database'
import type {
  RentalAdvice,
  AdviceTarget,
  EvidenceState,
} from './types'

export type AssetActionRecommendation =
  | 'BUY_ADD_ONE_MORE'
  | 'BUNDLE_OR_REPOSITION'
  | 'HOLD_AND_OPTIMIZE'
  | 'MONITOR_LIFECYCLE'
  | 'UNKNOWN_NO_DATA'

export type ActionPriority =
  | 'URGENT'
  | 'HIGH_IDLE_CAPITAL'
  | 'STEADY_EARNER'
  | 'ROUTINE'
  | 'INCONCLUSIVE'

export interface AssetPerformanceInput {
  productId: string
  displayName: string
  category: string
  purchaseCostPaisa?: number | undefined
  dailyRatePaisa?: number | undefined
  unitsOwned: number
  monthlyRentedDaysAvg?: number | undefined
  lostDemandDaysMonthly?: number | undefined
  lifetimeRentals?: number | undefined
  attachmentVelocity?: 'LOW' | 'MEDIUM' | 'HIGH' | 'VERY_HIGH' | 'MAXIMUM' | undefined
  daysSinceLastRental?: number | undefined
}

export interface AssetActionResult {
  productId: string
  displayName: string
  category: string
  action: AssetActionRecommendation
  priority: ActionPriority
  utilizationPct?: number | undefined
  reasoning: string
  purchaseCostFormatted?: string | undefined
  dailyRateFormatted?: string | undefined
  monthlyRevenueFormatted?: string | undefined
  tenMonthRecoveryPct?: number | undefined
  monthsToFullPayback?: number | undefined
  isMoneyMasked: boolean
  advices: RentalAdvice[]
  evidenceState: EvidenceState
}

export interface FleetIdleStockSummary {
  analyzedCount: number
  idleHighCapitalCount: number
  expansionCandidatesCount: number
  steadyEarnersCount: number
  unknownCount: number
  totalIdleCapitalPaisa: number
  totalIdleCapitalFormatted?: string | undefined
  assets: AssetActionResult[]
  advices: RentalAdvice[]
  evidenceState: EvidenceState
}

/**
 * Evaluates a single fleet asset against operational utilization and ROI doctrine.
 */
export function analyzeAssetAction(
  profile: AssetPerformanceInput,
  userRole: SystemRole = 'Coordinator',
  surface: Surface = 'default',
): AssetActionResult {
  const target: AdviceTarget = { type: 'product', id: profile.productId }
  const nowIso = new Date().toISOString()
  const scope = moneyScope({ role: userRole, surface })
  const isMoneyMasked = scope === 'none'
  const advices: RentalAdvice[] = []

  // Check 1: Missing or unverified data fails closed (RI-A15)
  if (
    profile.monthlyRentedDaysAvg === undefined ||
    profile.unitsOwned <= 0 ||
    isNaN(profile.monthlyRentedDaysAvg)
  ) {
    const reasoning = `Insufficient verified booking records for ${profile.displayName}. Utilization metrics and capital action recommendations cannot be computed without verified checkout history.`
    advices.push({
      id: `adv-idle-unknown-${profile.productId}`,
      module: 'idle_stock',
      target,
      evidenceState: 'inconclusive',
      severity: 'info',
      explanation: reasoning,
      sourceRefs: ['src/lib/intel/selectors.ts'],
      sourceKinds: ['live_os'],
      snapshotAt: nowIso,
      requiredChecks: ['Accumulate verified booking cycles before projecting asset lifecycle recommendations'],
    })

    return {
      productId: profile.productId,
      displayName: profile.displayName,
      category: profile.category,
      action: 'UNKNOWN_NO_DATA',
      priority: 'INCONCLUSIVE',
      utilizationPct: undefined,
      reasoning,
      isMoneyMasked,
      advices,
      evidenceState: 'inconclusive',
    }
  }

  const units = profile.unitsOwned
  const days = profile.monthlyRentedDaysAvg
  const utilizationPct = Math.min(100.0, Math.round(((days / (30.0 * units)) * 100.0) * 10) / 10)
  const costPaisa = profile.purchaseCostPaisa ?? 0
  const ratePaisa = profile.dailyRatePaisa ?? 0
  const lostDemandDays = profile.lostDemandDaysMonthly ?? 0
  const monthlyRevenuePaisa = Math.round(days * ratePaisa)
  const tenMonthRecoveryPct =
    costPaisa > 0 ? Math.round(((monthlyRevenuePaisa * 10.0) / costPaisa) * 100.0 * 10) / 10 : 0.0
  const monthsToFullPayback =
    monthlyRevenuePaisa > 0 ? Math.round((costPaisa / monthlyRevenuePaisa) * 10) / 10 : 999.0

  let action: AssetActionRecommendation = 'MONITOR_LIFECYCLE'
  let priority: ActionPriority = 'ROUTINE'
  let reasoning = `Asset maintains routine operational status (${utilizationPct}% utilization). Continue monitoring across quarterly seasonal demand.`

  const costFormatted = isMoneyMasked ? undefined : formatMoney(costPaisa as Paisa)
  const rateFormatted = isMoneyMasked ? undefined : formatMoney(ratePaisa as Paisa)
  const revFormatted = isMoneyMasked ? undefined : formatMoney(monthlyRevenuePaisa as Paisa)

  // 5 Lakhs Paisa = 50,000,000 paisa (500,000 NPR)
  const FIVE_LAKHS_PAISA = 50_000_000

  if (utilizationPct >= 65.0 && lostDemandDays >= 3.0) {
    action = 'BUY_ADD_ONE_MORE'
    priority = 'URGENT'
    if (isMoneyMasked) {
      reasoning = `Fleet utilization is high (${utilizationPct}%) with ${lostDemandDays} recurring days of turned-away demand per month. Inventory addition recommended to satisfy excess demand.`
    } else {
      const lostRevFormatted = formatMoney(Math.round(lostDemandDays * ratePaisa) as Paisa)
      reasoning = `Fleet utilization is ${utilizationPct}% with ${lostDemandDays} days of turned-away demand per month. Adding a unit captures approximately ${lostRevFormatted}/month with 10-month recovery projected at ${tenMonthRecoveryPct}%.`
    }

    advices.push({
      id: `adv-idle-buy-${profile.productId}`,
      module: 'idle_stock',
      target,
      evidenceState: 'supported',
      severity: 'review',
      explanation: reasoning,
      sourceRefs: ['scripts/recommend_asset_action.py'],
      sourceKinds: ['live_os'],
      snapshotAt: nowIso,
      requiredChecks: ['Audit lost booking inquiry log', 'Submit capital requisition for management review'],
    })
  } else if (utilizationPct < 10.0 && costPaisa >= FIVE_LAKHS_PAISA) {
    action = 'BUNDLE_OR_REPOSITION'
    priority = 'HIGH_IDLE_CAPITAL'
    if (isMoneyMasked) {
      reasoning = `High-value capital asset experiences low utilization (< 10%). Reposition into curated production bundles to increase client adoption. Do not discount standalone rate.`
    } else {
      reasoning = `${costFormatted} in idle capital trapped with only ${utilizationPct}% monthly utilization. Do not discount standalone catalog rate. Reposition by bundling with flagship camera packages to stimulate DP trial.`
    }

    advices.push({
      id: `adv-idle-reposition-${profile.productId}`,
      module: 'idle_stock',
      target,
      evidenceState: 'supported',
      severity: 'review',
      explanation: reasoning,
      sourceRefs: ['scripts/recommend_asset_action.py'],
      sourceKinds: ['live_os'],
      snapshotAt: nowIso,
      requiredChecks: [
        'Add as bundled option in Commercial and Film Director packages',
        'Verify zero unauthorized standalone rate discounts',
      ],
    })
  } else if (utilizationPct >= 40.0) {
    action = 'HOLD_AND_OPTIMIZE'
    priority = 'STEADY_EARNER'
    if (isMoneyMasked) {
      reasoning = `High-demand earner with steady utilization (${utilizationPct}%). Prioritize scheduled maintenance between bookings.`
    } else {
      reasoning = `Strong cash flow generator (utilization ${utilizationPct}%, 10-month recovery ${tenMonthRecoveryPct}%). Protect asset reliability with preventative QC maintenance.`
    }

    advices.push({
      id: `adv-idle-hold-${profile.productId}`,
      module: 'idle_stock',
      target,
      evidenceState: 'supported',
      severity: 'info',
      explanation: reasoning,
      sourceRefs: ['scripts/recommend_asset_action.py'],
      sourceKinds: ['live_os'],
      snapshotAt: nowIso,
      requiredChecks: ['Schedule routine sensor cleaning and optical calibration'],
    })
  } else {
    advices.push({
      id: `adv-idle-monitor-${profile.productId}`,
      module: 'idle_stock',
      target,
      evidenceState: 'supported',
      severity: 'info',
      explanation: reasoning,
      sourceRefs: ['scripts/recommend_asset_action.py'],
      sourceKinds: ['live_os'],
      snapshotAt: nowIso,
      requiredChecks: ['Monitor seasonal rental variance'],
    })
  }

  return {
    productId: profile.productId,
    displayName: profile.displayName,
    category: profile.category,
    action,
    priority,
    utilizationPct,
    reasoning,
    purchaseCostFormatted: costFormatted,
    dailyRateFormatted: rateFormatted,
    monthlyRevenueFormatted: revFormatted,
    tenMonthRecoveryPct: isMoneyMasked ? undefined : tenMonthRecoveryPct,
    monthsToFullPayback: isMoneyMasked ? undefined : monthsToFullPayback,
    isMoneyMasked,
    advices,
    evidenceState: 'supported',
  }
}

/**
 * Aggregates fleet-wide performance inputs into actionable idle stock intelligence.
 */
export function evaluateFleetIdleStock(
  fleet: AssetPerformanceInput[],
  userRole: SystemRole = 'Coordinator',
  surface: Surface = 'default',
): FleetIdleStockSummary {
  const scope = moneyScope({ role: userRole, surface })
  const isMoneyMasked = scope === 'none'
  const assets = fleet.map((item) => analyzeAssetAction(item, userRole, surface))

  let idleHighCapitalCount = 0
  let expansionCandidatesCount = 0
  let steadyEarnersCount = 0
  let unknownCount = 0
  let totalIdleCapitalPaisa = 0
  const combinedAdvices: RentalAdvice[] = []

  for (let i = 0; i < fleet.length; i++) {
    const item = fleet[i]!
    const res = assets[i]!

    if (res.action === 'BUNDLE_OR_REPOSITION') {
      idleHighCapitalCount++
      totalIdleCapitalPaisa += item.purchaseCostPaisa ?? 0
    } else if (res.action === 'BUY_ADD_ONE_MORE') {
      expansionCandidatesCount++
    } else if (res.action === 'HOLD_AND_OPTIMIZE') {
      steadyEarnersCount++
    } else if (res.action === 'UNKNOWN_NO_DATA') {
      unknownCount++
    }

    for (const adv of res.advices) {
      combinedAdvices.push(adv)
    }
  }

  const nowIso = new Date().toISOString()
  if (idleHighCapitalCount > 0) {
    const formattedCapital = isMoneyMasked
      ? 'significant capital'
      : formatMoney(totalIdleCapitalPaisa as Paisa)

    combinedAdvices.unshift({
      id: 'adv-fleet-idle-summary',
      module: 'idle_stock',
      target: { type: 'product', id: 'FLEET' },
      evidenceState: 'supported',
      severity: 'review',
      explanation: `FLEET ACTIVATION ADVISORY: Identified ${idleHighCapitalCount} high-value asset(s) representing ${formattedCapital} in underutilized capital (< 10% monthly utilization). Repositioning into curated bundles recommended.`,
      sourceRefs: ['scripts/recommend_asset_action.py'],
      sourceKinds: ['live_os'],
      snapshotAt: nowIso,
      requiredChecks: ['Review Director and Commercial bundle compositions'],
    })
  }

  const totalIdleCapitalFormatted = isMoneyMasked
    ? undefined
    : formatMoney(totalIdleCapitalPaisa as Paisa)

  return {
    analyzedCount: fleet.length,
    idleHighCapitalCount,
    expansionCandidatesCount,
    steadyEarnersCount,
    unknownCount,
    totalIdleCapitalPaisa,
    totalIdleCapitalFormatted,
    assets,
    advices: combinedAdvices,
    evidenceState: unknownCount === fleet.length ? 'inconclusive' : 'supported',
  }
}
