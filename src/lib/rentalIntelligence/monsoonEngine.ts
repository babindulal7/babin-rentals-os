/**
 * BABIN RENTALS OS — MONSOON & ENVIRONMENTAL PROTECTION ENGINE (RI-06)
 * Operational advisory rules for Nepal Monsoon and Extreme Climates:
 *
 * 1. Monsoon window in Nepal: Ashadh - Ashwin (June 1 to September 30).
 * 2. High-Altitude Cold Operations: Altitude > 2,500m (Mustang, Manang, Khumbu).
 *    - 40% cold derating on lithium-ion batteries (-10°C).
 *    - Mandatory 45-60 minute sealed Pelican thermal equilibration before unlatching.
 * 3. Extreme Heat Operations (>35°C in Terai/summer sun):
 *    - Mandatory active fan profile (FX3: Always On; Komodo-X: Adaptive Preview Quiet Record).
 * 4. Return QC & Storage:
 *    - 3-point moisture audit (sensor glass, lens barrels with torch, battery wells).
 *    - Mandatory 24-hour electronic dry-cabinet bake (40%-45% RH) for damp units.
 * 5. Invariant RI-A23:
 *    - Advisory only; never autonomously locks inventory or changes unit status in DB.
 * 6. Role & Surface Gating:
 *    - Commercial fees (Rain cover Rs 500, Decontamination fee Rs 5,000) are stripped
 *      for Warehouse, Technician, Driver roles and on floor surfaces.
 */

import { formatMoney, type Paisa } from '../money'
import { moneyScope, type Surface } from '../fieldGating'
import type { SystemRole } from '../../types/database'
import type {
  RentalAdvice,
  AdviceTarget,
  MonsoonAssessment,
  MonsoonFeeLine,
  MonsoonEvaluationInput,
} from './types'

export const MONSOON_START_MONTH = 6 // June
export const MONSOON_END_MONTH = 9 // September

export const MONSOON_STANDARD_FEES = {
  rainCoverRentalPaisa: 50000, // Rs 500 / day
  wetDecontaminationFeePaisa: 500000, // Rs 5,000 for soaked returns requiring ultrasonic/dry chamber
  silicaPackPaisa: 0, // Free on outdoor kits
} as const

const OUTDOOR_KEYWORDS = [
  'outdoor',
  'field',
  'exterior',
  'monsoon',
  'rain',
  'wedding_exterior',
  'mustang',
  'pokhara',
  'terai',
  'hiking',
  'documentary',
  'event',
  'street',
  'forest',
]

const HIGH_ALTITUDE_KEYWORDS = [
  'mustang',
  'manang',
  'khumbu',
  'everest',
  'langtang',
  'jomsom',
  'kagbeni',
  'muktinath',
  'dingboche',
  'namche',
  'annapurna',
  'altitude',
]

const EXTREME_HEAT_KEYWORDS = [
  'terai',
  'nepalgunj',
  'biratnagar',
  'chitwan',
  'birgunj',
  'summer_heat',
  'direct_sun',
]

export function isMonsoonDate(targetDateIso?: string): boolean {
  let dt: Date
  if (targetDateIso) {
    try {
      dt = new Date(targetDateIso)
      if (isNaN(dt.getTime())) {
        dt = new Date()
      }
    } catch {
      dt = new Date()
    }
  } else {
    dt = new Date()
  }

  // Month is 0-indexed in JS Date: June is 5, Sept is 8
  const month = dt.getUTCMonth() + 1
  return month >= MONSOON_START_MONTH && month <= MONSOON_END_MONTH
}

export function evaluateMonsoonRisk(input: MonsoonEvaluationInput): MonsoonAssessment {
  const activeMonsoon = isMonsoonDate(input.targetDateIso)
  const locLower = (input.location ?? '').toLowerCase()
  const itemNamesLower = input.items.map((i) => i.name.toLowerCase()).join(' ')
  const combinedContext = `${locLower} ${itemNamesLower}`

  const isOutdoor =
    input.isOutdoor ??
    OUTDOOR_KEYWORDS.some((kw) => combinedContext.includes(kw))

  const isHighAltitude = HIGH_ALTITUDE_KEYWORDS.some((kw) => combinedContext.includes(kw))
  const isExtremeHeat = EXTREME_HEAT_KEYWORDS.some((kw) => combinedContext.includes(kw))

  const dispatchReqs: string[] = []
  const returnQcReqs: string[] = []
  const storageReqs: string[] = []
  const bookingPolicies: string[] = []
  const feeLines: MonsoonFeeLine[] = []
  const warningNotes: string[] = []

  if (activeMonsoon) {
    dispatchReqs.push('Pack all optical glass and electronic bodies with sealed silica packs in waterproof Pelican cases.')
    dispatchReqs.push('Deliver verbal rain briefing: No hot lens swapping in humid outdoor air.')
    if (isOutdoor) {
      dispatchReqs.push('Equip camera body and matte box with heavy-duty weatherproof rain poncho.')
      feeLines.push({
        description: 'Monsoon Weatherproof Rain Protection Pack',
        amountPaisa: MONSOON_STANDARD_FEES.rainCoverRentalPaisa,
        reason: 'Protects electronic cinema body and lens barrel from drizzle and airborne spray.',
      })
      bookingPolicies.push('Outdoor shoots are eligible for flexible 24-hour rain reschedule without cancellation penalty.')
    }

    returnQcReqs.push('MANDATORY 3-Point Moisture Audit: Sensor glass, lens internal barrels (torch inspection for fog/fungus), and battery contacts.')
    returnQcReqs.push('Any gear returning damp must be routed to Cleaning Quarantine for 24-hour dry-cabinet bake before returning to Available.')

    storageReqs.push('Maintain electronic dry cabinets at 40% - 45% Relative Humidity.')
    storageReqs.push('Store lenses unsealed in UV/dry cabinets if returning from high-humidity valleys.')

    warningNotes.push('Soaked returns requiring internal optical disassembly or ultrasonic drying incur standard Rs 5,000 decontamination fee.')
  } else if (isOutdoor) {
    returnQcReqs.push('Standard outdoor physical inspection: Check seals, mount joints, and dust ports.')
    storageReqs.push('Standard climate-controlled shelving.')
  }

  if (isHighAltitude) {
    dispatchReqs.push('High-altitude cold derating active: Lithium-ion battery capacity drops ~40% at sub-zero temperatures. Provide 2x spare batteries or V-Mount power.')
    dispatchReqs.push('Teahouse Acclimatization Protocol: Keep cases latched for 45-60 minutes after entering heated rooms to prevent internal condensation.')
    warningNotes.push('High-altitude generator derating: Naturally aspirated generators lose ~3.5% wattage per 1,000ft elevation.')
  }

  if (isExtremeHeat) {
    dispatchReqs.push('High-temperature shoot protocol: Provide reflective shade or umbrella for cinema camera bodies during outdoor midday takes.')
    dispatchReqs.push('Fan profile check: Set Sony FX3 Fan to Always On, RED Komodo-X to Adaptive Preview Quiet Record.')
  }

  return {
    monsoonModeActive: activeMonsoon,
    isOutdoor,
    isHighAltitudeCold: isHighAltitude,
    location: input.location,
    dispatchRequirements: dispatchReqs,
    returnQcRequirements: returnQcReqs,
    storageProtocols: storageReqs,
    bookingPolicies,
    suggestedFeeLines: feeLines,
    warningNotes,
    advisoryOnly: true, // Invariant RI-A23: strictly advisory, never auto-locks DB records
  }
}

export function generateMonsoonAdvice(
  assessment: MonsoonAssessment,
  targetId: string,
  userRole: SystemRole,
  surface: Surface = 'default',
): RentalAdvice | null {
  if (!assessment.monsoonModeActive && !assessment.isOutdoor && !assessment.isHighAltitudeCold) {
    return null
  }

  const target: AdviceTarget = { type: 'booking', id: targetId }
  const nowIso = new Date().toISOString()
  const scope = moneyScope({ role: userRole, surface })

  const parts: string[] = []

  if (assessment.monsoonModeActive) {
    if (assessment.isOutdoor) {
      parts.push('ACTIVE MONSOON PROTOCOL (Kathmandu Jun-Sep): Outdoor shoot detected during high precipitation season.')
    } else {
      parts.push('MONSOON SEASON ADVISORY: Kathmandu monsoon season active.')
    }
  }

  if (assessment.isHighAltitudeCold) {
    parts.push('HIGH-ALTITUDE ENVIRONMENTAL ALERT: Sub-zero conditions derate lithium batteries by 40%. Mandatory 45-60 minute sealed thermal acclimatization required before opening cases indoors.')
  }

  if (assessment.dispatchRequirements.length > 0) {
    parts.push(`Dispatch Actions: ${assessment.dispatchRequirements.join(' ')}`)
  }

  if (assessment.returnQcRequirements.length > 0) {
    parts.push(`Return Inspection: ${assessment.returnQcRequirements.join(' ')}`)
  }

  // Commercial fee notes: Only shown to authorized office roles
  if (scope !== 'none' && assessment.suggestedFeeLines.length > 0) {
    const feeDescriptions = assessment.suggestedFeeLines
      .map((f) => `${f.description} (${formatMoney(f.amountPaisa as Paisa)})`)
      .join(', ')
    parts.push(`Suggested Fee Items: ${feeDescriptions}.`)
  }

  const severity = assessment.isOutdoor && assessment.monsoonModeActive
    ? 'urgent'
    : assessment.isHighAltitudeCold
      ? 'review'
      : 'info'

  return {
    id: `adv-monsoon-${targetId}`,
    module: 'monsoon',
    target,
    evidenceState: 'supported',
    severity,
    explanation: parts.join(' '),
    sourceRefs: [
      'references/extreme_weather.md',
      'references/monsoon_and_safety_playbook.md',
      'scripts/monsoon_intelligence.py',
    ],
    sourceKinds: ['approved_knowledge', 'live_os'],
    snapshotAt: nowIso,
    requiredChecks: [
      'Verify airtight O-ring seals on all equipment cases',
      'Include fresh silica gel packets in camera and lens compartments',
      'Confirm 3-point moisture check upon equipment return',
    ],
  }
}
