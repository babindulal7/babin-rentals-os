/**
 * BABIN RENTALS OS — RULES & SHOOT PLAYBOOKS ENGINE (RI-11)
 * Versioned store laws and operational shooting playbooks:
 *
 * 1. Store Laws:
 *    - Domain ownership, Security Deposit Escrow Isolation, Discount Governance,
 *      Multi-day pricing ladders, and Field-Level Role Isolation.
 * 2. Production Shoot Playbooks:
 *    - Wedding & Event, Music Video, Documentary & Expedition, Commercial & Narrative.
 * 3. 6-Vector Budget Scaling Ladder:
 *    - Camera Body, Optics Tier, ND Filtration, Power, Monitoring, Focus, Lighting.
 * 4. Invariant RI-A26:
 *    - Staff correction -> Draft pending review; no automatic catalog rule promotion.
 *    - Staff-submitted corrections are strictly marked as 'draft_pending_review'.
 * 5. Role & Surface Gating:
 *    - Commercial pricing rules are filtered out for floor roles and floor surfaces.
 */

import { moneyScope, type Surface } from '../fieldGating'
import type { SystemRole } from '../../types/database'
import type {
  RentalAdvice,
  AdviceTarget,
  StoreRule,
  ShootPlaybook,
  BudgetScalingVector,
  RuleAmendmentProposal,
} from './types'

/** Versioned store rules and policies */
export const STORE_RULES: readonly StoreRule[] = [
  {
    id: 'RULE-01',
    ruleNumber: 1,
    title: 'Domain Engine Logic Ownership',
    category: 'governance',
    version: '4.0.0',
    effectiveDate: '2026-01-01',
    approver: 'System Architect',
    summary: 'Core business logic and calculations must be owned by canonical domain engines, not ad-hoc UI handlers.',
    operationalGuideline: 'Rental Intelligence acts as an advisory layer; it never bypasses or duplicates canonical database RPCs.',
    isCommercial: false,
  },
  {
    id: 'RULE-05',
    ruleNumber: 5,
    title: 'Security Deposit Escrow Isolation',
    category: 'escrow',
    version: '4.0.0',
    effectiveDate: '2026-01-01',
    approver: 'Owner',
    summary: 'Security deposits are held strictly in escrow as balance-sheet liabilities, never mixed into rental revenue.',
    operationalGuideline: 'Deposits are refundable in full upon successful return inspection with zero equipment damage.',
    isCommercial: true,
  },
  {
    id: 'RULE-10',
    ruleNumber: 10,
    title: 'Discount Governance & Approval Gate',
    category: 'pricing',
    version: '4.0.0',
    effectiveDate: '2026-01-01',
    approver: 'Owner',
    summary: 'Discounts exceeding 10% require a documented operational reason (>= 10 characters) and named Owner or Manager authorization.',
    operationalGuideline: 'Hard ceiling cap at 25% discount across all rental lines; zero unapproved bypass.',
    isCommercial: true,
  },
  {
    id: 'RULE-17',
    ruleNumber: 17,
    title: 'Multi-Day Rental Rate Scaling',
    category: 'pricing',
    version: '4.0.0',
    effectiveDate: '2026-01-01',
    approver: 'Owner',
    summary: 'Days 1-4 are billed at full standard daily rate. Multi-day volume discounts scale on incremental days starting at Day 5.',
    operationalGuideline: 'Promotes multi-day production efficiency without devaluing peak weekend rental slots.',
    isCommercial: true,
  },
  {
    id: 'RULE-24',
    ruleNumber: 24,
    title: 'Field-Level Gating & Operational Role Isolation',
    category: 'access',
    version: '4.0.0',
    effectiveDate: '2026-01-01',
    approver: 'Owner',
    summary: 'Financial balances, profit margins, and customer commercial terms are completely stripped on warehouse and floor surfaces.',
    operationalGuideline: 'Floor staff focus on custody, serial number accuracy, and equipment testing without financial distraction.',
    isCommercial: false,
  },
]

/** Production shooting playbooks */
export const SHOOT_PLAYBOOKS: readonly ShootPlaybook[] = [
  {
    id: 'PLAYBOOK-WEDDING',
    shootType: 'wedding',
    displayName: 'Wedding & Event Production',
    primaryObjective: 'High autofocus speed, low-light clean high-ISO performance, and long continuous battery runtime.',
    recommendedPackage: [
      'Sony FX3A Cinema Body (Dual)',
      'Sony FE 24-70mm f/2.8 GM II',
      'Sony FE 70-200mm f/2.8 GM II',
      'DJI RS4 Pro Gimbal System',
      'DJI Mic 2 Dual Wireless Audio',
    ],
    mandatoryAccessories: [
      '6x NP-FZ100 Batteries',
      'Dual Fast Battery Charger',
      '2x CFexpress Type A 160GB Cards',
    ],
    prohibitedOrAvoid: [
      'Heavy manual cinema primes without autofocus assist',
      'Anamorphic lenses during fast dynamic indoor dancing',
    ],
    powerAndMediaNotes: 'Provide 3x batteries per camera body for full 10-hour wedding event days.',
    consultativeUpsellTip: 'Recommend Dual FX3A setup for multi-angle ceremony coverage without cutting angles.',
  },
  {
    id: 'PLAYBOOK-MUSIC-VIDEO',
    shootType: 'music_video',
    displayName: 'Music Video & Stylized Commercial',
    primaryObjective: 'Optical character, dynamic range, anamorphic flare, and expressive stylized camera movement.',
    recommendedPackage: [
      'RED Komodo-X 6K Cinema Camera',
      'Blazar Mantis 1.33x Anamorphic Lens Set',
      'Tilta Mirage Matte Box with VND',
      'Accsoon CineView M7 Pro Wireless Director Monitor',
      'Aputure LS 600x Pro High-Power Fixture',
    ],
    mandatoryAccessories: [
      '4x 99Wh V-Mount Battery Grid',
      'CFexpress Type B 512GB Card & Reader',
      'Tilta Nucleus-M Follow Focus',
    ],
    prohibitedOrAvoid: [
      'Sterile consumer zoom lenses without optical character',
      'Unassisted handheld shooting with heavy anamorphic rig',
    ],
    powerAndMediaNotes: 'Komodo-X draws continuous V-Mount power. Format CFexpress B on-camera before shooting.',
    consultativeUpsellTip: 'Include dedicated Camera Caretaker to protect client deposit and manage technical rig setup.',
  },
  {
    id: 'PLAYBOOK-DOCUMENTARY',
    shootType: 'documentary',
    displayName: 'Documentary & Remote Expedition',
    primaryObjective: 'Run-and-gun agility, rugged weather protection, battery reserve, and dual media redundancy.',
    recommendedPackage: [
      'Sony FX3A Cinema Body',
      'Sigma 24-70mm f/2.8 DG DN Art II',
      'Sony FE 24-105mm f/4 G OSS',
      'Heavy Duty Travel Tripod',
      'Rode Wireless PRO with 32-bit Float Recording',
    ],
    mandatoryAccessories: [
      'Card Reader and Backup CFexpress Media',
      'Waterproof Pelican Hard Case with Silica Packs',
      'Clear Weatherproof Rain Poncho',
    ],
    prohibitedOrAvoid: [
      'Excessive multi-component cine rigs without single-operator ergonomics',
    ],
    powerAndMediaNotes: 'For high-altitude shoots (>2500m), apply 40% battery cold derating and add V-Mount power.',
    consultativeUpsellTip: 'Bundle outdoor rain protection pack and spare media for zero-interruption remote shooting.',
  },
  {
    id: 'PLAYBOOK-COMMERCIAL-STUDIO',
    shootType: 'commercial_studio',
    displayName: 'Brand Commercial & Narrative Film',
    primaryObjective: 'Repeatable focus marks, zero rolling shutter, client director feeds, and calibrated lighting grids.',
    recommendedPackage: [
      'RED Komodo-X 6K Cinema Camera',
      'NiSi Athena Cine Prime Set (PL / RF Mount)',
      '15mm Rod Baseplate & Lens Support',
      'Desview 7-inch High-Bright Director Monitor',
      'Aputure 600x Pro & 300c Lighting Grid',
    ],
    mandatoryAccessories: [
      'Tilta Nucleus-M Dual Motor Follow Focus',
      'Heavy Duty C-Stands with 10kg Sandbags',
      'Heavy Duty Extension Power Boards',
    ],
    prohibitedOrAvoid: [
      'Unstabilized rigging without 15mm baseplate rod support',
    ],
    powerAndMediaNotes: 'Ensure 230V 15A circuits are balanced: continuous load must not exceed 2,760W per socket.',
    consultativeUpsellTip: 'Provide full 4x5.65 cinema matte box filter kit for precise depth of field control.',
  },
]

/** 6-Vector Budget Scaling Ladder */
export const BUDGET_SCALING_LADDER: readonly BudgetScalingVector[] = [
  {
    vector: 'Camera Body',
    lowRunAndGun: 'Sony A7IV Hybrid Mirrorless',
    midStandardPro: 'Sony FX3A Cinema Line Body',
    highEndCinema: 'RED Komodo-X 6K / DJI Ronin 4D 6K',
  },
  {
    vector: 'Optics Tier',
    lowRunAndGun: 'Sigma Art / Tamron G2 Zooms',
    midStandardPro: 'Sony G Master Zooms / NiSi Athena Primes',
    highEndCinema: 'Full Cine Primes / Blazar Mantis Anamorphic Set',
  },
  {
    vector: 'ND Filtration',
    lowRunAndGun: 'Screw-on Variable ND (77/82mm)',
    midStandardPro: 'Tilta Mirage Matte Box with VND',
    highEndCinema: '4x5.65 Full Spectrum IRND + Mirage Tray',
  },
  {
    vector: 'Power Solution',
    lowRunAndGun: '4x NP-FZ100 Batteries',
    midStandardPro: 'Dual 99Wh V-Mount + D-Tap Plate',
    highEndCinema: 'Quad 150Wh V-Mount Grid + Fast Quad Charger',
  },
  {
    vector: 'Monitoring',
    lowRunAndGun: '5-inch On-Camera Monitor',
    midStandardPro: 'Accsoon M7 Pro Wireless Director Monitor',
    highEndCinema: 'Desview 7-inch High-Bright OLED + Multi-RX System',
  },
  {
    vector: 'Focus Control',
    lowRunAndGun: 'Camera Fast Hybrid AF',
    midStandardPro: 'Tilta Nucleus Nano II Wireless Focus',
    highEndCinema: 'Tilta Nucleus-M Dual-Motor + 1st AC Wireless Rig',
  },
  {
    vector: 'Lighting',
    lowRunAndGun: 'Amaran 100d / RGB Tube Lights',
    midStandardPro: 'Amaran 300c / 200d with Octa Softboxes',
    highEndCinema: 'Aputure LS 600x Pro / 400x + Full Grip Kit',
  },
]

/**
 * Invariant RI-A26: Staff proposed amendment or correction.
 * Strictly generates a draft proposal pending Owner review;
 * NEVER automatically promotes into canonical store law.
 */
export function proposeRuleAmendment(params: {
  ruleOrPlaybookId: string
  proposedBy: string
  proposedRole: SystemRole
  summary: string
  rationale: string
}): RuleAmendmentProposal {
  return {
    id: `PROP-${Date.now().toString(36).toUpperCase()}`,
    ruleOrPlaybookId: params.ruleOrPlaybookId,
    proposedBy: params.proposedBy,
    proposedRole: params.proposedRole,
    proposedAt: new Date().toISOString(),
    summary: params.summary,
    rationale: params.rationale,
    status: 'draft_pending_review', // Invariant RI-A26: strictly pending review
    isDraft: true,
  }
}

export function getApplicableRules(
  userRole: SystemRole,
  surface: Surface = 'default',
): StoreRule[] {
  const scope = moneyScope({ role: userRole, surface })

  // Floor roles: omit commercial rules
  if (scope === 'none') {
    return STORE_RULES.filter((r) => !r.isCommercial)
  }

  return [...STORE_RULES]
}

export function getPlaybookForShootType(shootType: string): ShootPlaybook | undefined {
  const normalized = shootType.toLowerCase()
  return SHOOT_PLAYBOOKS.find(
    (p) =>
      p.shootType === normalized ||
      p.displayName.toLowerCase().includes(normalized),
  )
}

export function generatePlaybookAdvice(
  shootType: string,
  targetId: string,
  userRole: SystemRole,
  surface: Surface = 'default',
): RentalAdvice | null {
  const playbook = getPlaybookForShootType(shootType)
  if (!playbook) {
    return null
  }

  const target: AdviceTarget = { type: 'booking', id: targetId }
  const nowIso = new Date().toISOString()
  const scope = moneyScope({ role: userRole, surface })

  const parts: string[] = [
    `PRODUCTION PLAYBOOK (${playbook.displayName}): ${playbook.primaryObjective}`,
    `Recommended Package: ${playbook.recommendedPackage.join(', ')}.`,
    `Mandatory Items: ${playbook.mandatoryAccessories.join(', ')}.`,
    `Avoid: ${playbook.prohibitedOrAvoid.join(', ')}.`,
    `Power & Media: ${playbook.powerAndMediaNotes}`,
  ]

  if (scope !== 'none' && playbook.consultativeUpsellTip) {
    parts.push(`Staff Advisory: ${playbook.consultativeUpsellTip}`)
  }

  return {
    id: `adv-playbook-${playbook.id}-${targetId}`,
    module: 'rules',
    target,
    evidenceState: 'supported',
    severity: 'info',
    explanation: parts.join(' '),
    sourceRefs: [
      'references/shoot_playbooks_and_ladders.md',
      'data/os_laws.json',
    ],
    sourceKinds: ['approved_knowledge', 'live_os'],
    snapshotAt: nowIso,
    requiredChecks: [
      'Confirm all mandatory accessories are physically prepped',
      'Verify compatibility before client handover',
    ],
  }
}
