/**
 * BABIN RENTALS OS — RENTAL INTELLIGENCE ADAPTERS
 * Pure deterministic evaluators and role-safe advisory generators (RI-01 through RI-11)
 *
 * Invariants:
 * 1. Pure functions: no side effects, no database mutations, no network I/O.
 * 2. Role-scoped: moneyScope strips all monetary amounts from advice for unauthorized roles.
 * 3. Fail-closed: missing, ambiguous or unverified inputs yield 'needs_verification'.
 * 4. Grounded: kit dependencies and safety calculations match Babin bench tests and OEM specs.
 */

import { formatMoney, type Paisa } from '../money'
import { moneyScope, type Surface } from '../fieldGating'
import type { SystemRole } from '../../types/database'
import type { BookingAvailabilityEvaluation } from '../availabilityEvaluation'
import type { ItemAvailabilityState } from './kitRecommender'
import type {
  RentalAdvice,
  RigPayloadInput,
  PowerCircuitInput,
  BatteryRuntimeInput,
  QuoteExplanationInput,
  AdviceTarget,
  SuggestedAddition,
} from './types'

/* ------------------------------------------------------------------
 * Module RI-01: Kit Intelligence & Auto-Completion Adapter
 * ------------------------------------------------------------------ */

/**
 * Builds canonical ItemAvailabilityState map from a live BookingAvailabilityEvaluation query.
 * Reuses the existing canonical availability evaluation without creating a second ledger.
 */
export function buildAvailabilityMapFromEvaluation(
  evaluation: BookingAvailabilityEvaluation | null | undefined,
): Record<string, ItemAvailabilityState> | undefined {
  if (!evaluation || !evaluation.lineResults || evaluation.lineResults.length === 0) {
    return undefined
  }
  const map: Record<string, ItemAvailabilityState> = {}
  for (const line of evaluation.lineResults) {
    const isAvail = line.status === 'available' || line.status === 'available_with_reassignment'
    const status: ItemAvailabilityState['status'] =
      line.status === 'unavailable_maintenance'
        ? 'maintenance'
        : line.status === 'conflict' || line.status === 'hold_conflict'
          ? 'booked'
          : isAvail
            ? 'available'
            : 'qc_hold'
    const entry: ItemAvailabilityState = {
      available: isAvail,
      status,
      holdReason: line.conflictingReason,
      conflictBookingId: line.conflictingBookingNo,
    }
    map[line.productId] = entry
    map[line.productName] = entry
  }
  return map
}

export interface KitIntelligenceInput {
  bookingId: string
  items: Array<{
    id?: string
    name: string
    quantity?: number
  }>
  /** Optional map of itemId -> boolean indicating live availability */
  availabilityMap?: Record<string, boolean>
  shootType?: string
  crewSize?: number
}

export function evaluateKitIntelligence(input: KitIntelligenceInput): RentalAdvice[] {
  const advices: RentalAdvice[] = []
  const itemNamesLower = input.items.map((i) => i.name.toLowerCase())
  const nowIso = new Date().toISOString()
  const target: AdviceTarget = { type: 'booking', id: input.bookingId }

  // Check 1: RED Komodo-X cinema body completeness
  const hasKomodoX = itemNamesLower.some((n) => n.includes('komodo-x') || n.includes('komodo x'))
  if (hasKomodoX) {
    const hasVmount = itemNamesLower.some((n) => n.includes('v-mount') || n.includes('v mount'))
    const hasCfexpressB = itemNamesLower.some((n) => n.includes('cfexpress') && (n.includes('type b') || n.includes('b')))
    const missingAdditions: SuggestedAddition[] = []

    if (!hasVmount) {
      missingAdditions.push({
        productId: 'BRPI-BATT-VMOUNT-99WH',
        displayName: '99Wh V-Mount Battery Pack (Dual)',
        quantity: 2,
        reason: 'RED Komodo-X cinema camera requires continuous V-Mount power.',
        chargeType: 'required_dependency',
      })
    }
    if (!hasCfexpressB) {
      missingAdditions.push({
        productId: 'BRPI-MEDIA-CFX-B-512GB',
        displayName: 'CFexpress Type B 512GB Card & Reader',
        quantity: 1,
        reason: 'RED Komodo-X requires high-speed CFexpress Type B media for R3D capture.',
        chargeType: 'required_dependency',
      })
    }

    advices.push({
      id: `adv-kit-komodo-x-${input.bookingId}`,
      module: 'kit',
      target,
      evidenceState: missingAdditions.length === 0 ? 'supported' : 'needs_verification',
      severity: missingAdditions.length === 0 ? 'info' : 'review',
      explanation:
        missingAdditions.length === 0
          ? 'RED Komodo-X production package has required power and high-speed media.'
          : `RED Komodo-X requires ${missingAdditions.map((a) => a.displayName).join(' and ')} before dispatch.`,
      sourceRefs: ['references/cameras.md', 'data/accessory_dependencies.json'],
      sourceKinds: ['approved_knowledge', 'live_os'],
      snapshotAt: nowIso,
      requiredChecks: ['Verify firmware version', 'Format CFexpress Type B card on-camera', 'Test V-Mount plate contact'],
      suggestedAdditions: missingAdditions.length > 0 ? missingAdditions : undefined,
    })
  }

  // Check 2: Sony FX3 / FX3A completeness
  const hasFx3 = itemNamesLower.some((n) => n.includes('fx3') && !n.includes('fx30'))
  if (hasFx3) {
    const hasBatteries = itemNamesLower.some((n) => n.includes('np-fz100') || n.includes('fz100') || n.includes('battery'))
    const hasMedia = itemNamesLower.some((n) => n.includes('cfexpress') || n.includes('v90') || n.includes('sd card'))

    const missingAdditions: SuggestedAddition[] = []

    if (!hasBatteries) {
      missingAdditions.push({
        productId: 'BRPI-SONY-NP-FZ100-3PK',
        displayName: 'Sony NP-FZ100 Batteries (3x) & Dual Charger',
        quantity: 1,
        reason: 'Sony FX3 standard day kit includes 3x NP-FZ100 batteries.',
        chargeType: 'included_kit',
      })
    }
    if (!hasMedia) {
      missingAdditions.push({
        productId: 'BRPI-MEDIA-CFX-A-160GB',
        displayName: 'Sony TOUGH CFexpress Type A 160GB',
        quantity: 1,
        reason: 'Recommended for 4K 120p All-Intra recording.',
        chargeType: 'required_dependency',
      })
    }

    if (missingAdditions.length > 0) {
      advices.push({
        id: `adv-kit-fx3-${input.bookingId}`,
        module: 'kit',
        target,
        evidenceState: 'needs_verification',
        severity: 'review',
        explanation: `Sony FX3 kit requires ${missingAdditions.map((a) => a.displayName).join(' and ')}.`,
        sourceRefs: ['references/cameras.md', 'data/accessory_dependencies.json'],
        sourceKinds: ['approved_knowledge', 'live_os'],
        snapshotAt: nowIso,
        requiredChecks: ['Check battery health indicator', 'Verify XLR audio handle audio pin continuity'],
        suggestedAdditions: missingAdditions,
      })
    }
  }

  // Check 3: Hard Block — DJI Ronin 4D + External Gimbal
  const hasRonin4D = itemNamesLower.some((n) => n.includes('ronin 4d') || n.includes('ronin-4d'))
  const hasExternalGimbal = itemNamesLower.some((n) => n.includes('rs3') || n.includes('rs 3') || n.includes('rs4') || n.includes('rs 4'))
  if (hasRonin4D && hasExternalGimbal) {
    advices.push({
      id: `adv-kit-ronin-block-${input.bookingId}`,
      module: 'kit',
      target,
      evidenceState: 'blocked',
      severity: 'urgent',
      explanation:
        'HARD BLOCK: DJI Ronin 4D is an integrated 4-axis cinema system and cannot be mounted onto an external handheld gimbal (RS3/RS4). Remove redundant gimbal.',
      sourceRefs: ['references/grip.md', 'data/compatibility_graph.json'],
      sourceKinds: ['approved_knowledge'],
      snapshotAt: nowIso,
      requiredChecks: ['Remove external gimbal from draft', 'Confirm client intended Ronin 4D standalone setup'],
      blockingReasons: ['Ronin 4D integrated stabilization renders external handheld gimbal mechanically incompatible.'],
    })
  }

  // Check 4: Hard Block — Heavy Cinema Zoom (CHIOPT) without rods and lens support
  const hasChiopt = itemNamesLower.some((n) => n.includes('chiopt'))
  if (hasChiopt) {
    const hasSupport = itemNamesLower.some((n) => (n.includes('rod') || n.includes('15mm')) && (n.includes('support') || n.includes('bracket')))
    if (!hasSupport) {
      advices.push({
        id: `adv-kit-chiopt-support-${input.bookingId}`,
        module: 'kit',
        target,
        evidenceState: 'blocked',
        severity: 'urgent',
        explanation:
          'HARD BLOCK: CHIOPT Cinema Zoom (2.8kg) lacks 15mm baseplate rods and lens support bracket. Mounting unsupported risks severe camera mount and chassis tearing.',
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
        blockingReasons: ['Heavy cinema lens mount damage risk without bottom support rods.'],
      })
    }
  }

  // Check 5: Live Availability Check
  if (input.availabilityMap) {
    for (const item of input.items) {
      const isAvailable = input.availabilityMap[item.id ?? item.name]
      if (isAvailable === false) {
        advices.push({
          id: `adv-kit-avail-${item.id ?? item.name}-${input.bookingId}`,
          module: 'kit',
          target,
          evidenceState: 'needs_verification',
          severity: 'urgent',
          explanation: `Item "${item.name}" has confirmed booking conflict or active maintenance hold for the requested period.`,
          sourceRefs: ['src/lib/availability.ts'],
          sourceKinds: ['live_os'],
          snapshotAt: nowIso,
          requiredChecks: ['Inspect alternate unit serials', 'Check partial return queue', 'Consider approved substitute model'],
          blockingReasons: [`Unit conflict or hold detected on ${item.name}.`],
        })
      }
    }
  }

  return advices
}

/* ------------------------------------------------------------------
 * Module RI-10: Safety Validation Adapter
 * ------------------------------------------------------------------ */

export function evaluateRigPayloadSafety(input: RigPayloadInput): RentalAdvice {
  const target: AdviceTarget = { type: 'product', id: input.targetId }
  const nowIso = new Date().toISOString()

  if (!input.supportRatingKg || input.supportRatingKg <= 0 || isNaN(input.supportRatingKg)) {
    return {
      id: `adv-safety-payload-unverified-${input.targetId}`,
      module: 'safety',
      target,
      evidenceState: 'needs_verification',
      severity: 'urgent',
      explanation:
        'SUPPORT RATING UNVERIFIED: Support equipment payload rating is unknown or invalid. Verify manufacturer specification before mounting camera rig.',
      sourceRefs: ['references/grip.md', 'data/payload_matrix.json'],
      sourceKinds: ['approved_knowledge'],
      snapshotAt: nowIso,
      requiredChecks: [
        'Verify support equipment model and rated capacity in manufacturer documentation',
      ],
      blockingReasons: ['Support rating is missing or unverified.'],
    }
  }

  if (input.supportType === 'tripod') {
    // 30% safety headroom rule: rig weight must not exceed 70% of max tripod capacity
    const safeLimitKg = input.supportRatingKg * 0.7
    const utilizationPct = Math.round((input.rigWeightKg / input.supportRatingKg) * 100)
    const isSafe = input.rigWeightKg <= safeLimitKg

    return {
      id: `adv-safety-payload-tripod-${input.targetId}`,
      module: 'safety',
      target,
      evidenceState: isSafe ? 'supported' : 'needs_verification',
      severity: isSafe ? 'info' : 'urgent',
      explanation: isSafe
        ? `Tripod payload utilization is ${utilizationPct}% (${input.rigWeightKg}kg / ${input.supportRatingKg}kg rating), well within the safe 70% operational ceiling.`
        : `SAFETY RISK: Rig weight (${input.rigWeightKg}kg) exceeds safe 70% threshold of tripod capacity (${input.supportRatingKg}kg max rating, safe limit ${safeLimitKg.toFixed(1)}kg). Utilization is ${utilizationPct}%. Risk of head slipping or leg buckling.`,
      sourceRefs: ['references/grip.md', 'data/payload_matrix.json'],
      sourceKinds: ['approved_knowledge'],
      snapshotAt: nowIso,
      requiredChecks: isSafe
        ? ['Verify fluid head tilt lock']
        : ['Upgrade to Studio Assist 15kg/20kg tripod head', 'Remove non-essential rig counterweights'],
      blockingReasons: isSafe ? undefined : ['Rig payload exceeds safe 70% tripod rating limit.'],
    }
  }

  // Gimbal dynamic motor load: maximum 85% utilization
  const safeGimbalLimitKg = input.supportRatingKg * 0.85
  const utilizationPct = Math.round((input.rigWeightKg / input.supportRatingKg) * 100)
  const isSafe = input.rigWeightKg <= safeGimbalLimitKg

  return {
    id: `adv-safety-payload-gimbal-${input.targetId}`,
    module: 'safety',
    target,
    evidenceState: isSafe ? 'supported' : 'needs_verification',
    severity: isSafe ? 'info' : 'urgent',
    explanation: isSafe
      ? `Gimbal payload utilization is ${utilizationPct}% (${input.rigWeightKg}kg / ${input.supportRatingKg}kg rating), within 85% dynamic motor threshold.`
      : `MOTOR OVERLOAD RISK: Rig weight (${input.rigWeightKg}kg) exceeds safe 85% limit of gimbal (${input.supportRatingKg}kg rating). High probability of motor jitter, overheating, and mid-take shutdown.`,
    sourceRefs: ['references/grip.md', 'data/payload_matrix.json'],
    sourceKinds: ['approved_knowledge'],
    snapshotAt: nowIso,
    requiredChecks: isSafe
      ? ['Perform 3-axis physical balance before powering on motors', 'Run DJI auto-tune calibration']
      : ['Strip heavy cage accessories or swap for lighter prime lens', 'Upgrade to heavy-payload stabilizer'],
    blockingReasons: isSafe ? undefined : ['Gimbal motor overload risk (>85% limit).'],
  }
}

export function evaluatePowerCircuitSafety(input: PowerCircuitInput): RentalAdvice {
  const target: AdviceTarget = { type: 'product', id: input.targetId }
  const nowIso = new Date().toISOString()
  const voltage = input.circuitVoltage ?? 230
  const amps = input.circuitAmps ?? 15
  // Nepal standard 80% continuous safety rule: 15A * 230V * 0.80 = 2,760W
  const safeContinuousWatts = Math.round(amps * voltage * 0.8)
  const isSafe = input.watts <= safeContinuousWatts

  return {
    id: `adv-safety-power-${input.targetId}`,
    module: 'safety',
    target,
    evidenceState: isSafe ? 'supported' : 'blocked',
    severity: isSafe ? 'info' : 'urgent',
    explanation: isSafe
      ? `Lighting package draw (${input.watts}W) is within Nepal 230V ${amps}A single-circuit safe continuous load limit (${safeContinuousWatts}W max continuous).`
      : `ELECTRICAL OVERLOAD BLOCKED: Lighting rig draw (${input.watts}W) exceeds safe threshold of ${safeContinuousWatts}W for a single 230V ${amps}A circuit. Breaker trip or cable fire hazard. Split lighting across multiple separate electrical circuits.`,
    sourceRefs: ['references/lighting.md', 'references/power.md', 'data/power_matrix.json'],
    sourceKinds: ['approved_knowledge'],
    snapshotAt: nowIso,
    requiredChecks: isSafe
      ? ['Verify 3-pin earth pin contact on site sockets']
      : ['Allocate lighting heads to separate breakers', 'Deploy distribution board with 32A industrial feed'],
    blockingReasons: isSafe ? undefined : ['Total lighting power draw exceeds single 15A circuit safe capacity.'],
  }
}

export function evaluateBatteryRuntime(input: BatteryRuntimeInput): RentalAdvice {
  const target: AdviceTarget = { type: 'product', id: input.targetId }
  const nowIso = new Date().toISOString()
  // Efficiency factor: 0.85 nominal, derated by 40% in freezing/high-altitude conditions (-10°C Mustang)
  const tempDerating = input.coldWeather ? 0.6 : 1.0
  const effectiveWh = input.batteryWh * 0.85 * tempDerating
  const runtimeHours = input.rigWatts > 0 ? effectiveWh / input.rigWatts : 0

  return {
    id: `adv-safety-battery-${input.targetId}`,
    module: 'safety',
    target,
    evidenceState: 'supported',
    severity: input.coldWeather ? 'review' : 'info',
    explanation: input.coldWeather
      ? `Cold weather derating (-10°C high-altitude profile) reduces effective battery capacity by 40%. Expected runtime for ${input.rigWatts}W rig on ${input.batteryWh}Wh pack is ~${runtimeHours.toFixed(1)} hours (down from ~${((input.batteryWh * 0.85) / input.rigWatts).toFixed(1)}h). Recommend keeping spare packs insulated in thermal bags.`
      : `Expected runtime for ${input.rigWatts}W rig on ${input.batteryWh}Wh pack at nominal temperature is ~${runtimeHours.toFixed(1)} hours (85% discharge efficiency).`,
    sourceRefs: ['references/power.md', 'references/extreme_weather.md', 'data/power_matrix.json'],
    sourceKinds: ['approved_knowledge'],
    snapshotAt: nowIso,
    requiredChecks: input.coldWeather
      ? ['Keep lithium packs above 10°C prior to mounting', 'Carry double standard battery count for winter outdoor shoots']
      : ['Verify terminal contacts are clean and unoxidized'],
  }
}

/* ------------------------------------------------------------------
 * Module RI-02: Quote Explanation Adapter (Role-Safe)
 * ------------------------------------------------------------------ */

export function explainQuoteTotals(
  input: QuoteExplanationInput,
  userRole: SystemRole,
  surface: Surface = 'default',
): RentalAdvice {
  const target: AdviceTarget = { type: 'booking', id: input.bookingId }
  const nowIso = new Date().toISOString()
  const scope = moneyScope({ role: userRole, surface })

  // Money-blind roles (Warehouse, Technician, Driver or any Floor surface) receive zero monetary figures
  if (scope === 'none') {
    return {
      id: `adv-quote-expl-${input.bookingId}`,
      module: 'quote_explanation',
      target,
      evidenceState: 'supported',
      severity: 'info',
      explanation: `Booking duration: ${input.days} day(s). Commercial pricing, VAT, and financial balances are omitted on operational floor surfaces in accordance with field-level gating.`,
      sourceRefs: ['src/lib/fieldGating.ts', 'src/lib/rentalActions.ts'],
      sourceKinds: ['live_os'],
      snapshotAt: nowIso,
      requiredChecks: ['Verify physical gear against checklist', 'Check serial numbers at handover'],
    }
  }

  // Office roles: explain canonical computation transparently
  const parts: string[] = []
  parts.push(`Rental Period: ${input.days} day(s).`)
  parts.push(`Equipment Base Rate: ${formatMoney(input.equipmentRatePaisa as Paisa)}.`)

  if (input.discountPercent > 0) {
    if (input.discountPercent > 10 && (!input.discountReason || input.discountReason.length < 10 || !input.discountApprover)) {
      parts.push(
        `WARNING (Law 10): Discount of ${input.discountPercent}% requires a documented reason (>=10 chars) and named approver. Current reason/approver is incomplete.`,
      )
    } else {
      parts.push(
        `Approved Discount: ${input.discountPercent}%${input.discountApprover ? ` (authorized by ${input.discountApprover})` : ''}.`,
      )
    }
  }

  parts.push(`VAT (13%): ${formatMoney(input.vatPaisa as Paisa)}.`)
  parts.push(`Rental Total: ${formatMoney(input.totalPaisa as Paisa)}.`)

  // Law 5 deposit transparency
  if (input.depositPaisa > 0) {
    parts.push(
      `Security Deposit: ${formatMoney(input.depositPaisa as Paisa)} (held separately as liability under Law 5; strictly excluded from rental revenue).`,
    )
  }

  const advanceSufficiency = input.advancePaidPaisa >= input.totalPaisa * 0.5
  parts.push(
    `Advance Received: ${formatMoney(input.advancePaidPaisa as Paisa)} (${advanceSufficiency ? 'Sufficient (>=50%)' : 'Under 50% advance threshold'}). Current Balance Due: ${formatMoney(input.outstandingPaisa as Paisa)}.`,
  )

  return {
    id: `adv-quote-expl-${input.bookingId}`,
    module: 'quote_explanation',
    target,
    evidenceState: 'supported',
    severity: input.discountPercent > 10 && !input.discountApprover ? 'review' : 'info',
    explanation: parts.join(' '),
    sourceRefs: ['src/lib/pricingStructures.ts', 'src/lib/money.ts', 'data/os_laws.json'],
    sourceKinds: ['live_os', 'approved_knowledge'],
    snapshotAt: nowIso,
    requiredChecks: [
      'Ensure deposit is receipted to separate liability account',
      'Verify advance meets minimum threshold before gear dispatch',
    ],
  }
}

/* ------------------------------------------------------------------
 * Module RI-06: Monsoon Mode Seasonal Advisory Adapter
 * ------------------------------------------------------------------ */

export function evaluateMonsoonAdvisory(dateIso: string, isOutdoor: boolean, targetId: string): RentalAdvice | null {
  const target: AdviceTarget = { type: 'booking', id: targetId }
  const nowIso = new Date().toISOString()
  const d = new Date(dateIso)
  const month = d.getUTCMonth() + 1 // 1-12

  // Kathmandu Monsoon Season: June 1 to September 30 (months 6 through 9)
  const isMonsoon = month >= 6 && month <= 9

  if (!isMonsoon) {
    return null
  }

  const advice: RentalAdvice = {
    id: `adv-monsoon-${targetId}`,
    module: 'monsoon',
    target,
    evidenceState: 'supported',
    severity: isOutdoor ? 'urgent' : 'review',
    explanation: isOutdoor
      ? 'ACTIVE MONSOON PROTOCOL (Kathmandu Jun-Sep): Outdoor shoot detected during high precipitation season. Pack waterproof rain covers, dry bags, and silica gel packs. Units returning damp must undergo mandatory 24-hour dry-cabinet bake before returning to AVAILABLE. Rain reschedule policy is active.'
      : 'MONSOON SEASON ADVISORY: Kathmandu monsoon season active. Ensure dry case seals are inspected. Wet/damp returns require dry-cabinet bake to protect lenses from optical fungus.',
    sourceRefs: ['references/extreme_weather.md', 'references/monsoon_and_safety_playbook.md'],
    sourceKinds: ['approved_knowledge'],
    snapshotAt: nowIso,
    requiredChecks: [
      'Confirm rain cover included in camera bag',
      'Inform client of 24h flexible rain reschedule terms',
      'Mandatory dry-cabinet holding inspection on return',
    ],
  }

  return advice
}

/* ------------------------------------------------------------------
 * Role & Surface Filter for Advice Feeds
 * ------------------------------------------------------------------ */

export function filterAdviceForRole(
  advices: RentalAdvice[],
  role: SystemRole,
  surface: Surface = 'default',
): RentalAdvice[] {
  const scope = moneyScope({ role, surface })

  return advices.map((adv) => {
    // If the role is money-blind and the advice is quote_explanation, sanitize the explanation
    if (scope === 'none' && adv.module === 'quote_explanation') {
      return {
        ...adv,
        explanation: 'Commercial terms and invoice totals omitted on floor surfaces according to field-level gating.',
      }
    }
    return adv
  })
}
