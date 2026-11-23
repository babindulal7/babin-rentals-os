/**
 * BABIN RENTALS OS — RENTAL INTELLIGENCE SAFETY VALIDATOR (RI-10)
 *
 * Implements deterministic safety and mechanical compatibility validation:
 * 1. Tripod 30% headroom rule: rig weight must not exceed 70% of max tripod capacity.
 * 2. Gimbal dynamic motor strain: rig weight must not exceed 85% of rated stabilizer capacity.
 * 3. Mount compatibility & heavy optics protection:
 *    - PL lenses require PL-to-E or PL-to-RF adapter on mirrorless mounts
 *    - Heavy lenses (>=2.0kg) require 15mm studio baseplate rods & lens support bracket (Hard Block)
 *    - Ronin 4D + external gimbal forbidden (Hard Block)
 * 4. Electrical continuous load thresholds:
 *    - Nepal 230V 15A circuit safe continuous limit = 2,760W (80% rule). Draw > 2,760W = Hard Block.
 *    - Domestic 5A circuit safe continuous limit = 920W. Heavy lights require dedicated 15A breaker feed.
 * 5. Stand stability & sandbagging:
 *    - High-output COB lights (Aputure 600x / 400x) require steel C-stand / combo stand + 2x 10kg sandbags.
 * 6. High-altitude cold derating (-10°C Mustang profile):
 *    - 40% reduction in effective lithium battery capacity.
 * 7. SDI Ground Loop & ESD Protection:
 *    - Power sequence warning for RED Komodo / Komodo-X 12G-SDI ports.
 */

import type {
  RentalAdvice,
  AdviceTarget,
  EvidenceState,
  SuggestedAddition,
} from './types'

export interface RigItemInput {
  id?: string | undefined
  name: string
  quantity?: number | undefined
  weightGrams?: number | undefined
  powerWatts?: number | undefined
}

export interface SafetyValidationContext {
  targetId: string
  supportType?: 'tripod' | 'gimbal' | 'handheld' | undefined
  supportRatingKg?: number | undefined
  supportModelName?: string | undefined
  circuitAmps?: number | undefined
  circuitVoltage?: number | undefined
  environment?: 'normal' | 'cold_high_altitude' | 'rain_monsoon' | 'domestic_home' | undefined
}

export interface SafetyValidationReport {
  isSafe: boolean
  overallEvidenceState: EvidenceState
  totalRigWeightGrams: number
  totalPowerWatts: number
  advices: RentalAdvice[]
  blockingReasons: string[]
  suggestedAdditions: SuggestedAddition[]
}

/** Standard equipment weight registry (grams) grounded in OEM specs */
const COMPONENT_WEIGHTS_G: Record<string, number> = {
  // Bodies
  'sony fx3': 715,
  'fx3a': 715,
  'sony a7s iii': 699,
  'sony a7 iv': 743,
  'red komodo 6k': 1850,
  'red komodo-x': 2200,
  'komodo-x': 2200,
  'dji ronin 4d': 4670,

  // Lenses
  'sigma 24-70': 745,
  'sony 70-200': 1045,
  'tamron 70-180': 810,
  'nisi athena': 800,
  'blazar mantis': 800,
  'chiopt': 2800, // 2.8kg cinema zoom

  // Accessories & Power
  'v-mount': 540,
  'vmount': 540,
  'accsoon m7': 480,
  'cage': 220,
  'matte box': 380,
  'follow focus': 110,
  '15mm rods': 150,
}

/** Standard power draw registry (watts) */
const COMPONENT_POWER_WATTS: Record<string, number> = {
  'sony fx3': 15,
  'red komodo 6k': 42,
  'red komodo-x': 45,
  'dji ronin 4d': 50,
  'accsoon m7': 12,
  'aputure 600x': 720,
  '600x pro': 720,
  'aputure 400x': 450,
  'amaran 300c': 360,
  'amaran 200d': 250,
}

export function validateKitSafety(
  items: RigItemInput[],
  context: SafetyValidationContext,
): SafetyValidationReport {
  const target: AdviceTarget = { type: 'booking', id: context.targetId }
  const nowIso = new Date().toISOString()
  const advices: RentalAdvice[] = []
  const blockingReasons: string[] = []
  const suggestedAdditions: SuggestedAddition[] = []

  const itemNamesLower = items.map((i) => i.name.toLowerCase())

  // 1. Calculate Total Rig Weight
  let totalRigWeightG = 0
  for (const item of items) {
    if (item.weightGrams) {
      totalRigWeightG += item.weightGrams * (item.quantity ?? 1)
    } else {
      const lower = item.name.toLowerCase()
      let matchedWeight = 0
      for (const [key, weight] of Object.entries(COMPONENT_WEIGHTS_G)) {
        if (lower.includes(key)) {
          matchedWeight = Math.max(matchedWeight, weight)
        }
      }
      totalRigWeightG += matchedWeight * (item.quantity ?? 1)
    }
  }

  // 2. Calculate Total Power Draw
  let totalPowerWatts = 0
  for (const item of items) {
    if (item.powerWatts) {
      totalPowerWatts += item.powerWatts * (item.quantity ?? 1)
    } else {
      const lower = item.name.toLowerCase()
      for (const [key, watts] of Object.entries(COMPONENT_POWER_WATTS)) {
        if (lower.includes(key)) {
          totalPowerWatts += watts * (item.quantity ?? 1)
        }
      }
    }
  }

  // 3. Support & Headroom Validation
  if (context.supportType === 'tripod' && context.supportRatingKg) {
    const rigWeightKg = totalRigWeightG / 1000
    const safeLimitKg = context.supportRatingKg * 0.7 // 30% headroom rule
    const utilizationPct = Math.round((rigWeightKg / context.supportRatingKg) * 100)

    if (rigWeightKg > safeLimitKg) {
      const reason = `Rig payload (${rigWeightKg.toFixed(1)}kg) exceeds safe 70% threshold of tripod capacity (${context.supportRatingKg}kg max rating, safe limit ${safeLimitKg.toFixed(1)}kg). Utilization is ${utilizationPct}%. Risk of fluid head slipping or leg clamp collapse.`
      blockingReasons.push(reason)
      advices.push({
        id: `adv-safety-tripod-${context.targetId}`,
        module: 'safety',
        target,
        evidenceState: 'needs_verification',
        severity: 'urgent',
        explanation: `SAFETY WARNING: ${reason}`,
        sourceRefs: ['references/grip.md', 'data/payload_matrix.json'],
        sourceKinds: ['approved_knowledge'],
        snapshotAt: nowIso,
        requiredChecks: [
          'Upgrade to Studio Assist Heavy Tripod (15kg rating)',
          'Remove redundant heavy cage accessories',
          'Lock fluid head tilt friction before untended operation',
        ],
        blockingReasons: [reason],
      })
    } else {
      advices.push({
        id: `adv-safety-tripod-${context.targetId}`,
        module: 'safety',
        target,
        evidenceState: 'supported',
        severity: 'info',
        explanation: `Tripod payload utilization is ${utilizationPct}% (${rigWeightKg.toFixed(1)}kg / ${context.supportRatingKg}kg rating), well within safe 70% operational ceiling.`,
        sourceRefs: ['references/grip.md', 'data/payload_matrix.json'],
        sourceKinds: ['approved_knowledge'],
        snapshotAt: nowIso,
        requiredChecks: ['Verify fluid head tilt lock engagement'],
      })
    }
  } else if (context.supportType === 'gimbal' && context.supportRatingKg) {
    const rigWeightKg = totalRigWeightG / 1000
    const safeLimitKg = context.supportRatingKg * 0.85 // 85% dynamic motor strain rule
    const utilizationPct = Math.round((rigWeightKg / context.supportRatingKg) * 100)

    if (rigWeightKg > safeLimitKg) {
      const reason = `Gimbal payload (${rigWeightKg.toFixed(1)}kg) exceeds safe 85% motor strain threshold of stabilizer (${context.supportRatingKg}kg rating, utilization ${utilizationPct}%). High probability of motor jitter, overheating, and mid-take shutdown.`
      blockingReasons.push(reason)
      advices.push({
        id: `adv-safety-gimbal-${context.targetId}`,
        module: 'safety',
        target,
        evidenceState: 'needs_verification',
        severity: 'urgent',
        explanation: `MOTOR STRAIN WARNING: ${reason}`,
        sourceRefs: ['references/grip.md', 'data/payload_matrix.json'],
        sourceKinds: ['approved_knowledge'],
        snapshotAt: nowIso,
        requiredChecks: [
          'Strip non-essential monitor/matte box to lower payload',
          'Perform physical 3-axis re-balancing before powering motors',
          'Upgrade from RS3 to RS4 Pro (4.5kg capacity)',
        ],
        blockingReasons: [reason],
      })
    } else {
      advices.push({
        id: `adv-safety-gimbal-${context.targetId}`,
        module: 'safety',
        target,
        evidenceState: 'supported',
        severity: 'info',
        explanation: `Gimbal payload utilization is ${utilizationPct}% (${rigWeightKg.toFixed(1)}kg / ${context.supportRatingKg}kg rating), within 85% dynamic motor threshold.`,
        sourceRefs: ['references/grip.md', 'data/payload_matrix.json'],
        sourceKinds: ['approved_knowledge'],
        snapshotAt: nowIso,
        requiredChecks: [
          'Perform physical 3-axis re-balancing before powering motors',
          'Run DJI auto-tune calibration',
        ],
      })
    }
  }

  // 4. Hard Block: Ronin 4D + External Gimbal
  const hasRonin4D = itemNamesLower.some((n) => n.includes('ronin 4d') || n.includes('ronin-4d'))
  const hasExternalGimbal = itemNamesLower.some(
    (n) => n.includes('rs3') || n.includes('rs 3') || n.includes('rs4') || n.includes('rs 4'),
  )
  if (hasRonin4D && hasExternalGimbal) {
    const reason = 'DJI Ronin 4D is an integrated 4-axis motorized cinema camera and cannot be mounted onto an external handheld gimbal.'
    blockingReasons.push(reason)
    advices.push({
      id: `adv-safety-ronin-block-${context.targetId}`,
      module: 'safety',
      target,
      evidenceState: 'blocked',
      severity: 'urgent',
      explanation: `HARD BLOCK: ${reason} Remove redundant gimbal from package.`,
      sourceRefs: ['references/grip.md', 'data/compatibility_graph.json'],
      sourceKinds: ['approved_knowledge'],
      snapshotAt: nowIso,
      requiredChecks: ['Remove external gimbal from draft', 'Confirm client intended Ronin 4D standalone setup'],
      blockingReasons: [reason],
    })
  }

  // 5. Hard Block: Heavy Cinema Zoom without Support Rods
  const hasChiopt = itemNamesLower.some((n) => n.includes('chiopt'))
  const has15mmSupport = itemNamesLower.some(
    (n) => (n.includes('rod') || n.includes('15mm')) && (n.includes('support') || n.includes('bracket')),
  )
  if (hasChiopt && !has15mmSupport) {
    const reason = 'CHIOPT Cinema Zoom (2.8kg) lacks 15mm baseplate rods and lens support bracket. Mounting unsupported risks severe camera mount and chassis tearing.'
    blockingReasons.push(reason)
    suggestedAdditions.push({
      productId: 'BRPI-ACC-RODS-SUPPORT-15MM',
      displayName: '15mm Rods & Heavy Lens Support Bracket',
      quantity: 1,
      reason: 'Mandatory mechanical support to prevent mount distortion and optical misalignment.',
      chargeType: 'required_dependency',
    })
    advices.push({
      id: `adv-safety-chiopt-support-${context.targetId}`,
      module: 'safety',
      target,
      evidenceState: 'blocked',
      severity: 'urgent',
      explanation: `HARD BLOCK: ${reason}`,
      sourceRefs: ['references/lenses.md', 'data/compatibility_graph.json'],
      sourceKinds: ['approved_knowledge'],
      snapshotAt: nowIso,
      requiredChecks: ['Add 15mm Baseplate Rods & Lens Support Bracket before dispatch approval'],
      suggestedAdditions: [
        {
          productId: 'BRPI-ACC-RODS-SUPPORT-15MM',
          displayName: '15mm Rods & Heavy Lens Support Bracket',
          quantity: 1,
          reason: 'Mandatory mechanical support to prevent mount distortion and optical misalignment.',
          chargeType: 'required_dependency',
        },
      ],
      blockingReasons: [reason],
    })
  }

  // 6. Mount Adapter Check (PL glass on Sony E / Canon RF)
  const hasPlLens = itemNamesLower.some((n) => n.includes('chiopt') || n.includes('athena') || n.includes('mantis'))
  const hasMirrorlessBody = itemNamesLower.some((n) => n.includes('fx3') || n.includes('a7') || n.includes('komodo'))
  const hasPlAdapter = itemNamesLower.some((n) => n.includes('pl adapter') || n.includes('pl-to') || n.includes('pl to'))
  if (hasPlLens && hasMirrorlessBody && !hasPlAdapter) {
    advices.push({
      id: `adv-safety-pl-adapter-${context.targetId}`,
      module: 'kit',
      target,
      evidenceState: 'needs_verification',
      severity: 'review',
      explanation: 'PL-Mount cinema optics selected for mirrorless body without a PL-to-E or RF-to-PL mount adapter.',
      sourceRefs: ['references/lenses.md', 'data/compatibility_graph.json'],
      sourceKinds: ['approved_knowledge'],
      snapshotAt: nowIso,
      requiredChecks: ['Verify mount adapter in package', 'Confirm flange focal distance calibration'],
      suggestedAdditions: [
        {
          productId: 'BRPI-ACC-PL-ADAPTER',
          displayName: 'Heavy-Duty PL Mount Adapter',
          quantity: 1,
          reason: 'Required to mount PL cinema lenses to camera body.',
          chargeType: 'required_dependency',
        },
      ],
    })
  }

  // 7. Electrical Circuit Safety Check
  const voltage = context.circuitVoltage ?? 230
  const amps = context.circuitAmps ?? 15
  // Nepal standard 80% continuous safety rule: 15A * 230V * 0.80 = 2,760W
  const safeContinuousWatts = Math.round(amps * voltage * 0.8)

  if (totalPowerWatts > safeContinuousWatts) {
    const reason = `Total lighting package draw (${totalPowerWatts}W) exceeds safe threshold of ${safeContinuousWatts}W for a single 230V ${amps}A circuit. Breaker trip or cable fire hazard.`
    blockingReasons.push(reason)
    advices.push({
      id: `adv-safety-electrical-overload-${context.targetId}`,
      module: 'safety',
      target,
      evidenceState: 'blocked',
      severity: 'urgent',
      explanation: `ELECTRICAL OVERLOAD BLOCKED: ${reason} Split lighting heads across separate electrical circuits or deploy a distribution board with a 32A industrial feed.`,
      sourceRefs: ['references/lighting.md', 'references/power.md', 'data/power_matrix.json'],
      sourceKinds: ['approved_knowledge'],
      snapshotAt: nowIso,
      requiredChecks: [
        'Allocate lighting heads to separate breakers on location',
        'Verify site electrical supply capacity before rigging',
      ],
      blockingReasons: [reason],
    })
  } else if (totalPowerWatts > 0) {
    // Domestic 5A socket warning
    const domesticLimit = Math.round(5 * voltage * 0.8) // 920W
    if (context.environment === 'domestic_home' && totalPowerWatts > domesticLimit) {
      advices.push({
        id: `adv-safety-domestic-power-${context.targetId}`,
        module: 'safety',
        target,
        evidenceState: 'needs_verification',
        severity: 'review',
        explanation: `DOMESTIC CIRCUIT WARNING: Lighting draw (${totalPowerWatts}W) exceeds safe 5A household wall outlet limit (${domesticLimit}W). Connect to a 15A heavy power socket or split loads.`,
        sourceRefs: ['references/power.md'],
        sourceKinds: ['approved_knowledge'],
        snapshotAt: nowIso,
        requiredChecks: ['Locate 15A kitchen or geyser socket on location'],
      })
    }
  }

  // 8. Stand Tipping & Sandbagging Rule (Aputure 600x / 400x)
  const hasHeavyLight = itemNamesLower.some((n) => n.includes('600x') || n.includes('400x'))
  const hasSandbags = itemNamesLower.some((n) => n.includes('sandbag') || n.includes('sand bag'))
  if (hasHeavyLight && !hasSandbags) {
    suggestedAdditions.push({
      productId: 'BRPI-ACC-SANDBAG-10KG-2PK',
      displayName: '10kg Heavy Sandbags (2-Pack)',
      quantity: 1,
      reason: 'Mandatory stand tipping counterweight for high-output COB light heads.',
      chargeType: 'required_dependency',
    })
    advices.push({
      id: `adv-safety-sandbags-${context.targetId}`,
      module: 'safety',
      target,
      evidenceState: 'needs_verification',
      severity: 'review',
      explanation:
        'SAFETY REQUIREMENT: Heavy COB punch lights (Aputure 600x/400x) mounted on C-Stands require a minimum of 2x 10kg sandbags per stand to prevent dangerous tipping hazards.',
      sourceRefs: ['references/lighting.md', 'data/accessory_dependencies.json'],
      sourceKinds: ['approved_knowledge'],
      snapshotAt: nowIso,
      requiredChecks: ['Pack 2x 10kg sandbags with each heavy junior/combo stand'],
      suggestedAdditions: [
        {
          productId: 'BRPI-ACC-SANDBAG-10KG-2PK',
          displayName: '10kg Heavy Sandbags (2-Pack)',
          quantity: 1,
          reason: 'Mandatory stand tipping counterweight for high-output COB light heads.',
          chargeType: 'required_dependency',
        },
      ],
    })
  }

  // 9. High-Altitude Cold Weather Derating (-10°C Mustang profile)
  if (context.environment === 'cold_high_altitude') {
    advices.push({
      id: `adv-safety-cold-weather-${context.targetId}`,
      module: 'safety',
      target,
      evidenceState: 'supported',
      severity: 'review',
      explanation:
        'COLD WEATHER DERATING (-10°C Mustang profile): Freezing high-altitude temperatures reduce effective lithium battery capacity by 40%. Expected runtime is reduced significantly. Store spare battery packs in insulated thermal wraps or inside jackets until mounting.',
      sourceRefs: ['references/power.md', 'references/extreme_weather.md'],
      sourceKinds: ['approved_knowledge'],
      snapshotAt: nowIso,
      requiredChecks: [
        'Carry 2x standard battery complement for winter outdoor shoots',
        'Keep battery packs above 10°C prior to mounting on camera',
      ],
    })
  }

  // 10. SDI Ground Loop & ESD Precaution (RED Komodo / Komodo-X)
  const hasKomodo = itemNamesLower.some((n) => n.includes('komodo'))
  const hasSdiMonitor = itemNamesLower.some((n) => n.includes('sdi') || n.includes('m7') || n.includes('monitor'))
  if (hasKomodo && hasSdiMonitor) {
    advices.push({
      id: `adv-safety-sdi-ground-loop-${context.targetId}`,
      module: 'safety',
      target,
      evidenceState: 'supported',
      severity: 'info',
      explanation:
        'CRITICAL POWER SEQUENCE (RED Komodo 12G-SDI): Connect power cables to camera and monitor BEFORE connecting the BNC SDI video cable. Connecting SDI before ground is established risks ESD voltage spike and permanent SDI board burnout.',
      sourceRefs: ['references/cameras.md', 'references/power.md'],
      sourceKinds: ['approved_knowledge'],
      snapshotAt: nowIso,
      requiredChecks: [
        'Follow mandatory power-first, SDI-second cable attachment sequence',
        'Use 12G-rated shielded BNC cables only',
      ],
    })
  }

  const isSafe = blockingReasons.length === 0
  let overallEvidenceState: EvidenceState = 'supported'
  if (blockingReasons.length > 0) {
    overallEvidenceState = advices.some((a) => a.evidenceState === 'blocked') ? 'blocked' : 'needs_verification'
  }

  return {
    isSafe,
    overallEvidenceState,
    totalRigWeightGrams: totalRigWeightG,
    totalPowerWatts,
    advices,
    blockingReasons,
    suggestedAdditions,
  }
}
