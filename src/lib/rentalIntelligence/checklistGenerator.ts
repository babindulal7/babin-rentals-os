/**
 * BABIN RENTALS OS — RENTAL INTELLIGENCE CHECKLIST GENERATOR (RI-08)
 *
 * Implements stage-scoped operational checklists across the 4 canonical stages:
 * 1. `pack` — Warehouse prep, testing, serial scanning, cable completeness.
 * 2. `handover` — Client identity verification, cosmetic baseline, deposit receipt.
 * 3. `return` — Serial verification, partial return reconciliation, missing accessory checks.
 * 4. `reset` — QC sensor inspection, cleaning, monsoon dry-cabinet quarantine.
 *
 * Invariants:
 * - Generated suggestions ≠ persisted operational completion (RI-A20).
 * - Checklists cannot bypass or fake database custody gates; staff must complete
 *   existing authorized stage actions with actor, timestamps, and physical proof.
 * - Supports partial returns: preserves remaining active units on booking (RI-A19).
 * - Prep time estimates and Kathmandu logistics delivery load guidance.
 */

import type {
  RentalAdvice,
  AdviceTarget,
  EvidenceState,
} from './types'

export type OperationalStage = 'pack' | 'handover' | 'return' | 'reset'

export interface BookingLineForChecklist {
  id: string
  productId: string
  displayName: string
  dispatchedQuantity: number
  returnedQuantity?: number | undefined
  serialNumbers?: string[] | undefined
  isDampOrWet?: boolean | undefined
  hasDamage?: boolean | undefined
  damageDescription?: string | undefined
}

export interface ChecklistItem {
  id: string
  title: string
  category: 'hardware' | 'accessories' | 'safety' | 'custody' | 'maintenance'
  mandatory: boolean
  instruction: string
  suggestedOnly: boolean
  isCompleted?: boolean | undefined
}

export interface ChecklistGenerationQuery {
  bookingId: string
  stage: OperationalStage
  lines: BookingLineForChecklist[]
  isMonsoonSeason?: boolean | undefined
  isPartialReturn?: boolean | undefined
  vehicleType?: 'motorcycle' | 'car' | 'van' | 'two_staff' | undefined
}

export interface OperationalChecklistResult {
  bookingId: string
  stage: OperationalStage
  title: string
  description: string
  estimatedPrepMinutes: number
  deliveryLoadCategory: 'small_motorcycle' | 'medium_car' | 'heavy_van' | 'two_staff_required'
  deliveryLoadGuidance: string
  items: ChecklistItem[]
  advices: RentalAdvice[]
  evidenceState: EvidenceState
  summary: string
}

export function generateOperationalChecklist(
  query: ChecklistGenerationQuery,
): OperationalChecklistResult {
  const target: AdviceTarget = { type: 'booking', id: query.bookingId }
  const nowIso = new Date().toISOString()
  const advices: RentalAdvice[] = []
  const items: ChecklistItem[] = []

  const itemNamesLower = query.lines.map((l) => l.displayName.toLowerCase())
  const totalItemCount = query.lines.reduce((acc, l) => acc + l.dispatchedQuantity, 0)

  // 1. Estimate Logistics Delivery Load (Kathmandu)
  let deliveryCategory: OperationalChecklistResult['deliveryLoadCategory'] = 'small_motorcycle'
  let deliveryGuidance = 'Compact delivery suitable for staff motorcycle or scooter backpack.'
  let prepMinutes = 15

  const hasHeavyCinema = itemNamesLower.some(
    (n) => n.includes('komodo') || n.includes('ronin 4d') || n.includes('chiopt'),
  )
  const hasHeavyLighting = itemNamesLower.some(
    (n) => n.includes('600x') || n.includes('400x') || n.includes('c-stand') || n.includes('tripod'),
  )

  if (hasHeavyCinema && hasHeavyLighting) {
    deliveryCategory = 'two_staff_required'
    deliveryGuidance = 'Heavy cinema + lighting package. Requires delivery utility van and 2-person staff handling team.'
    prepMinutes = 60
  } else if (hasHeavyLighting || totalItemCount >= 6) {
    deliveryCategory = 'heavy_van'
    deliveryGuidance = 'Bulky gear setup. Requires car/taxi boot with folded seats or delivery utility van.'
    prepMinutes = 45
  } else if (hasHeavyCinema || totalItemCount >= 3) {
    deliveryCategory = 'medium_car'
    deliveryGuidance = 'Multi-case cinema or gimbal kit. Requires standard taxi boot or hatchback.'
    prepMinutes = 30
  }

  // 2. Stage-Specific Checklist Synthesis
  switch (query.stage) {
    case 'pack': {
      items.push({
        id: `chk-pack-serial-match`,
        title: 'Barcode & Physical Serial Verification',
        category: 'custody',
        mandatory: true,
        instruction: 'Scan each physical asset barcode and verify printed serial matches booking assignment.',
        suggestedOnly: false,
      })

      items.push({
        id: `chk-pack-power-test`,
        title: 'Battery Charge & Terminal Inspection',
        category: 'hardware',
        mandatory: true,
        instruction: 'Confirm all lithium packs (NP-FZ100 / V-Mount) read 100% capacity on smart gauge; terminals clean.',
        suggestedOnly: false,
      })

      items.push({
        id: `chk-pack-media-format`,
        title: 'Media Format & Speed Verification',
        category: 'hardware',
        mandatory: true,
        instruction: 'Format CFexpress / SD cards in target camera body; confirm card write speed passes All-Intra benchmark.',
        suggestedOnly: false,
      })

      // Model-specific packing checks
      if (itemNamesLower.some((n) => n.includes('fx3'))) {
        items.push({
          id: `chk-pack-fx3-audio-handle`,
          title: 'Sony FX3 XLR Audio Handle Pin Check',
          category: 'hardware',
          mandatory: true,
          instruction: 'Inspect multi-interface shoe gold pins and verify XLR Channels 1 & 2 pass microphone signal.',
          suggestedOnly: false,
        })
      }

      if (itemNamesLower.some((n) => n.includes('komodo'))) {
        items.push({
          id: `chk-pack-komodo-cfast-reader`,
          title: 'RED Media Card Reader Verification',
          category: 'accessories',
          mandatory: true,
          instruction: 'Ensure dedicated high-speed USB-C card reader is packed in camera case with USB-C to USB-C cable.',
          suggestedOnly: false,
        })
      }

      if (itemNamesLower.some((n) => n.includes('chiopt'))) {
        items.push({
          id: `chk-pack-chiopt-support-bracket`,
          title: '15mm Studio Baseplate & Lens Support',
          category: 'safety',
          mandatory: true,
          instruction: 'Verify 15mm rods and rigid lens support bracket are packed with the CHIOPT cinema zoom.',
          suggestedOnly: false,
        })
      }

      if (itemNamesLower.some((n) => n.includes('600x') || n.includes('400x'))) {
        items.push({
          id: `chk-pack-sandbags`,
          title: 'Stand Tipping Counterweights (2x 10kg Sandbags)',
          category: 'safety',
          mandatory: true,
          instruction: 'Pack a minimum of 2x 10kg sandbags for each high-output COB light head to prevent tipping collapse.',
          suggestedOnly: false,
        })
      }

      advices.push({
        id: `adv-chk-pack-${query.bookingId}`,
        module: 'checklist',
        target,
        evidenceState: 'supported',
        severity: 'info',
        explanation: `PACKING STAGE CHECKLIST: Generated ${items.length} prep items for ${query.lines.length} booking lines. Estimated staging time: ${prepMinutes} minutes. Delivery requirement: ${deliveryCategory.replace(/_/g, ' ')}.`,
        sourceRefs: ['references/shoot_playbooks_and_ladders.md', 'src/lib/rentalActions.ts'],
        sourceKinds: ['approved_knowledge', 'live_os'],
        snapshotAt: nowIso,
        requiredChecks: ['Complete physical packing scan on warehouse terminal before moving booking to Packed'],
      })
      break
    }

    case 'handover': {
      items.push({
        id: `chk-handover-identity`,
        title: 'Client Identity & Authorized Representative Verification',
        category: 'custody',
        mandatory: true,
        instruction: 'Inspect valid government photo ID (Citizenship/Passport) and confirm name matches booking client record.',
        suggestedOnly: false,
      })

      items.push({
        id: `chk-handover-cosmetic-signoff`,
        title: 'Cosmetic Condition Baseline & Agreement Signing',
        category: 'custody',
        mandatory: true,
        instruction: 'Demonstrate clean sensor and unblemished lens optics to client; capture client signature on digital handover agreement.',
        suggestedOnly: false,
      })

      items.push({
        id: `chk-handover-deposit-verification`,
        title: 'Security Deposit Confirmation (Escrow)',
        category: 'custody',
        mandatory: true,
        instruction: 'Confirm security deposit has been received and receipted into separate liability escrow ledger.',
        suggestedOnly: false,
      })

      if (itemNamesLower.some((n) => n.includes('komodo'))) {
        items.push({
          id: `chk-handover-sdi-briefing`,
          title: 'RED 12G-SDI Cable Sequence Briefing',
          category: 'safety',
          mandatory: true,
          instruction: 'Brief camera operator: ALWAYS attach power cables first before plugging the BNC SDI cable to prevent port burnout.',
          suggestedOnly: false,
        })
      }

      advices.push({
        id: `adv-chk-handover-${query.bookingId}`,
        module: 'checklist',
        target,
        evidenceState: 'supported',
        severity: 'info',
        explanation: `HANDOVER STAGE CHECKLIST: Generated ${items.length} client verification items. Client signature and deposit verification are mandatory prior to dispatch.`,
        sourceRefs: ['data/os_laws.json', 'src/lib/rentalActions.ts'],
        sourceKinds: ['approved_knowledge', 'live_os'],
        snapshotAt: nowIso,
        requiredChecks: ['Capture digital signature and physical handover timestamp in OS'],
      })
      break
    }

    case 'return': {
      // Partial return detection (RI-A19)
      const hasPartialLines = query.lines.some(
        (l) => l.returnedQuantity !== undefined && l.returnedQuantity < l.dispatchedQuantity,
      )

      items.push({
        id: `chk-return-serial-scan`,
        title: 'Barcode & Physical Serial Verification',
        category: 'custody',
        mandatory: true,
        instruction: 'Scan every incoming asset barcode. Confirm physical serials match the exact units dispatched.',
        suggestedOnly: false,
      })

      items.push({
        id: `chk-return-damage-inspection`,
        title: 'Comprehensive Physical & Optical Inspection',
        category: 'hardware',
        mandatory: true,
        instruction: 'Check front/rear optical elements under penlight for scratches, cleaning marks, or impact denting.',
        suggestedOnly: false,
      })

      items.push({
        id: `chk-return-accessory-count`,
        title: 'Cable, Lens Cap & Small Accessory Count',
        category: 'accessories',
        mandatory: true,
        instruction: 'Count all included items: lens caps, hood, D-Tap cables, USB chargers, and case foam dividers.',
        suggestedOnly: false,
      })

      // Monsoon moisture quarantine check
      if (query.isMonsoonSeason) {
        items.push({
          id: `chk-return-monsoon-moisture`,
          title: 'Monsoon Moisture & Humidity Quarantine Inspection',
          category: 'maintenance',
          mandatory: true,
          instruction: 'Check case seals for moisture infiltration. If gear was used outdoors or feels damp, transfer immediately to dry cabinet.',
          suggestedOnly: false,
        })
      }

      if (hasPartialLines || query.isPartialReturn) {
        advices.push({
          id: `adv-chk-partial-return-${query.bookingId}`,
          module: 'checklist',
          target,
          evidenceState: 'supported',
          severity: 'review',
          explanation:
            'PARTIAL RETURN IN PROGRESS (RI-A19): Subset of units being checked in. Remaining unreturned items stay active in client custody on booking record until final check-in.',
          sourceRefs: ['src/lib/rentalActions.ts'],
          sourceKinds: ['live_os'],
          snapshotAt: nowIso,
          requiredChecks: [
            'Reconcile returned unit serials',
            'Leave booking in On Rent / Partial status until all lines cleared',
          ],
        })
      }

      advices.push({
        id: `adv-chk-return-${query.bookingId}`,
        module: 'checklist',
        target,
        evidenceState: 'supported',
        severity: 'info',
        explanation: `RETURN STAGE CHECKLIST: Generated ${items.length} return inspection checks. Any missing accessories or cosmetic defects must be logged immediately.`,
        sourceRefs: ['src/lib/rentalActions.ts'],
        sourceKinds: ['live_os'],
        snapshotAt: nowIso,
        requiredChecks: ['Perform return scan in OS before triggering deposit release'],
      })
      break
    }

    case 'reset': {
      items.push({
        id: `chk-reset-sensor-cleaning`,
        title: 'Sensor Glass & Optical Element Cleaning',
        category: 'maintenance',
        mandatory: true,
        instruction: 'Use professional air blower and sensor swab if dust is detected under penlight.',
        suggestedOnly: false,
      })

      items.push({
        id: `chk-reset-firmware-factory-default`,
        title: 'Profile Reset to Standard Factory Settings',
        category: 'maintenance',
        mandatory: true,
        instruction: 'Reset camera settings to Babin default base profile (S-Log3 / 24p / 1/48s / Dual Native ISO).',
        suggestedOnly: false,
      })

      items.push({
        id: `chk-reset-contact-cleaning`,
        title: 'Lens Mount & Battery Pin De-Oxidation',
        category: 'maintenance',
        mandatory: true,
        instruction: 'Clean electronic mount contacts with isopropyl alcohol swab to prevent communication errors.',
        suggestedOnly: false,
      })

      // Monsoon dry-cabinet quarantine
      if (query.isMonsoonSeason || query.lines.some((l) => l.isDampOrWet)) {
        items.push({
          id: `chk-reset-dry-cabinet-bake`,
          title: 'Mandatory 24-Hour Dry-Cabinet Dehumidification',
          category: 'maintenance',
          mandatory: true,
          instruction: 'Place lenses and camera bodies in 40% RH electronic dry cabinet for minimum 24-hour bake to eliminate fungus risks.',
          suggestedOnly: false,
        })
      }

      items.push({
        id: `chk-reset-return-to-available`,
        title: 'Inventory Status Restocked to AVAILABLE',
        category: 'custody',
        mandatory: true,
        instruction: 'Confirm all items cleaned, complete, and restocked to shelf location; mark unit AVAILABLE in OS.',
        suggestedOnly: false,
      })

      advices.push({
        id: `adv-chk-reset-${query.bookingId}`,
        module: 'checklist',
        target,
        evidenceState: 'supported',
        severity: 'info',
        explanation: `RESET & QC CHECKLIST: Generated ${items.length} maintenance items. Units can only return to AVAILABLE once all QC checks pass.`,
        sourceRefs: ['references/monsoon_and_safety_playbook.md', 'src/lib/rentalActions.ts'],
        sourceKinds: ['approved_knowledge', 'live_os'],
        snapshotAt: nowIso,
        requiredChecks: ['Complete QC checklist in OS to release maintenance holds'],
      })
      break
    }
  }

  // Mandatory Invariant Assertion: Advisory Labeling (RI-A20)
  advices.push({
    id: `adv-chk-advisory-guard-${query.bookingId}`,
    module: 'checklist',
    target,
    evidenceState: 'supported',
    severity: 'info',
    explanation:
      'OPERATIONAL INVARIANT: Checklist suggestions are assistive templates. Checking local UI boxes does NOT mark the operational stage as complete in the database. Custody progression requires verified OS action submission with staff actor and timestamp.',
    sourceRefs: ['src/lib/rentalActions.ts', 'docs/intelligence/rental/EXISTING_VS_PROPOSED_MATRIX.md'],
    sourceKinds: ['live_os'],
    snapshotAt: nowIso,
    requiredChecks: ['Perform authorized stage execution in Babin Rentals OS workflow'],
  })

  return {
    bookingId: query.bookingId,
    stage: query.stage,
    title: `${query.stage.toUpperCase()} Operational Checklist`,
    description: `Targeted checklist for ${query.lines.length} lines in stage ${query.stage}. Prep estimated at ${prepMinutes} minutes.`,
    estimatedPrepMinutes: prepMinutes,
    deliveryLoadCategory: deliveryCategory,
    deliveryLoadGuidance: deliveryGuidance,
    items,
    advices,
    evidenceState: 'supported',
    summary: `${query.stage.toUpperCase()} checklist: ${items.length} items (${prepMinutes}m prep, ${deliveryCategory.replace(/_/g, ' ')}).`,
  }
}
