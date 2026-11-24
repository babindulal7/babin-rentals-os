/**
 * BABIN RENTALS OS — DECISION JOURNAL & OUTCOME FEEDBACK ENGINE (RI-09)
 * Recommendation review tracking and measured outcome feedback:
 *
 * 1. Immutable Audit Records:
 *    - Captures staff decisions on AI recommendations (accepted, modified, rejected).
 *    - Records reviewer identity, role, timestamp, rationale, and evidence snapshot.
 * 2. Invariant RI-A27:
 *    - Acceptance of suggestion != confirmed result.
 *    - An accepted recommendation starts in 'pending_observation'.
 *    - Outcome status transitions to success, lesson, or incident only after physical
 *      return QC and shoot completion.
 * 3. Learning & Continuous Improvement:
 *    - Tracks incident prevention and modifications to improve future kit advice.
 * 4. Role-Safe Field Gating:
 *    - Floor roles can view operational notes and technical gear modifications,
 *      while commercial deal terms are scrubbed.
 */

import { moneyScope, type Surface } from '../fieldGating'
import type { SystemRole } from '../../types/database'
import type {
  RentalAdvice,
  AdviceTarget,
  DecisionRecord,
  DecisionJournalSummary,
  StaffDecisionType,
  OutcomeStatus,
} from './types'

/** Seeded verified recommendation records from Babin field operations */
export const SEED_DECISION_RECORDS: readonly DecisionRecord[] = [
  {
    id: 'DEC-2026-001',
    recommendationId: 'adv-kit-fx3-wedding-0412',
    module: 'kit',
    targetId: 'BK-2026-0412',
    targetType: 'booking',
    reviewerRole: 'Owner',
    reviewerName: 'Babin',
    decision: 'accepted_unmodified',
    staffNotes: 'Standard dual FX3A wedding package that works reliably every time.',
    evidenceSnapshot: {
      evidenceState: 'supported',
      sourceRefs: ['references/cameras.md', 'data/rental_patterns.json'],
    },
    reviewedAt: '2026-06-04T11:20:00Z',
    observationWindow: 'post_settlement',
    actualOutcome: {
      status: 'completed_success',
      damageDetected: false,
      returnedOnTime: true,
      batteryOrPowerShortage: false,
      clientFeedback: 'Seamless shoot at Godavari Resort. Colors matched instantly in post.',
      measuredAt: '2026-06-07T18:00:00Z',
      learningReflection: 'Validates Dual FX3A as gold standard for high-end wedding teams.',
    },
  },
  {
    id: 'DEC-2026-002',
    recommendationId: 'adv-kit-komodo-commercial-0489',
    module: 'kit',
    targetId: 'BK-2026-0489',
    targetType: 'booking',
    reviewerRole: 'Owner',
    reviewerName: 'Babin',
    decision: 'modified_by_staff',
    staffNotes: 'Client requested Blazar Mantis Anamorphic instead of NiSi Athena primes for wider cinematic flare.',
    modifications: ['Substituted NiSi Athena primes with Blazar Mantis 1.33x Anamorphic'],
    evidenceSnapshot: {
      evidenceState: 'supported',
      sourceRefs: ['references/cameras.md', 'references/lenses.md'],
    },
    reviewedAt: '2026-06-15T09:40:00Z',
    observationWindow: 'at_return_qc',
    actualOutcome: {
      status: 'completed_with_lesson',
      damageDetected: false,
      returnedOnTime: true,
      batteryOrPowerShortage: false,
      clientFeedback: 'Loved the anamorphic look. Monitor needed 1.33x de-squeeze activated.',
      measuredAt: '2026-06-18T10:30:00Z',
      learningReflection: 'When anamorphic glass is selected, auto-verify monitor firmware de-squeeze capability.',
    },
  },
  {
    id: 'DEC-2026-003',
    recommendationId: 'adv-safety-mustang-0534',
    module: 'safety',
    targetId: 'BK-2026-0534',
    targetType: 'booking',
    reviewerRole: 'Owner',
    reviewerName: 'Babin',
    decision: 'modified_by_staff',
    staffNotes: 'Upgraded power: Mustang high-altitude cold drains batteries fast. Added 1x 99Wh V-Mount + D-Tap dummy battery + silica packs.',
    modifications: ['Added 99Wh V-Mount battery', 'Added D-Tap dummy battery', 'Added silica packs'],
    evidenceSnapshot: {
      evidenceState: 'supported',
      sourceRefs: ['references/extreme_weather.md', 'references/power.md'],
    },
    reviewedAt: '2026-06-22T14:10:00Z',
    observationWindow: 'post_settlement',
    actualOutcome: {
      status: 'completed_incident_avoided',
      damageDetected: false,
      returnedOnTime: true,
      batteryOrPowerShortage: false,
      clientFeedback: 'Temperatures hit -8C at night. Standard NP-FZ100s died in 35 mins; the V-Mount powered the time-lapse for 4 hours solid.',
      measuredAt: '2026-06-28T16:00:00Z',
      learningReflection: 'Whenever destination is Mustang or >3000m altitude, auto-mandate V-Mount cold derating (40%).',
    },
  },
]

export function createDecisionRecord(params: {
  recommendationId: string
  module: DecisionRecord['module']
  targetId: string
  targetType: AdviceTarget['type']
  reviewerRole: SystemRole
  reviewerName: string
  decision: StaffDecisionType
  staffNotes: string
  modifications?: string[] | undefined
  evidenceState: DecisionRecord['evidenceSnapshot']['evidenceState']
  sourceRefs: string[]
  observationWindow?: DecisionRecord['observationWindow'] | undefined
}): DecisionRecord {
  // Invariant RI-A27: newly created decisions always start in 'pending_observation'
  const id = `DEC-${Date.now().toString(36).toUpperCase()}`
  return {
    id,
    recommendationId: params.recommendationId,
    module: params.module,
    targetId: params.targetId,
    targetType: params.targetType,
    reviewerRole: params.reviewerRole,
    reviewerName: params.reviewerName,
    decision: params.decision,
    staffNotes: params.staffNotes,
    modifications: params.modifications,
    evidenceSnapshot: {
      evidenceState: params.evidenceState,
      sourceRefs: params.sourceRefs,
    },
    reviewedAt: new Date().toISOString(),
    observationWindow: params.observationWindow ?? 'at_return_qc',
    actualOutcome: {
      status: 'pending_observation', // Invariant RI-A27: Acceptance != confirmed result
      damageDetected: false,
      returnedOnTime: true,
      batteryOrPowerShortage: false,
    },
  }
}

export function recordMeasuredOutcome(
  record: DecisionRecord,
  outcome: {
    status: Exclude<OutcomeStatus, 'pending_observation'>
    damageDetected: boolean
    returnedOnTime: boolean
    batteryOrPowerShortage: boolean
    clientFeedback?: string | undefined
    learningReflection?: string | undefined
  },
): DecisionRecord {
  return {
    ...record,
    actualOutcome: {
      ...outcome,
      measuredAt: new Date().toISOString(),
    },
  }
}

export function calculateJournalSummary(records: readonly DecisionRecord[]): DecisionJournalSummary {
  const totalDecisions = records.length
  const acceptedCount = records.filter((r) => r.decision === 'accepted_unmodified').length
  const modifiedCount = records.filter((r) => r.decision === 'modified_by_staff').length
  const rejectedCount = records.filter((r) => r.decision === 'rejected_by_staff').length

  const observed = records.filter(
    (r) => r.actualOutcome && r.actualOutcome.status !== 'pending_observation',
  )
  const observedOutcomesCount = observed.length

  const successful = observed.filter(
    (r) =>
      r.actualOutcome?.status === 'completed_success' ||
      r.actualOutcome?.status === 'completed_with_lesson' ||
      r.actualOutcome?.status === 'completed_incident_avoided',
  )
  const incidentsAvoided = observed.filter(
    (r) => r.actualOutcome?.status === 'completed_incident_avoided',
  ).length

  const acceptanceRatePercent =
    totalDecisions > 0 ? Math.round((acceptedCount / totalDecisions) * 100) : 0
  const successRatePercent =
    observedOutcomesCount > 0 ? Math.round((successful.length / observedOutcomesCount) * 100) : 0

  return {
    totalDecisions,
    acceptedCount,
    modifiedCount,
    rejectedCount,
    acceptanceRatePercent,
    observedOutcomesCount,
    successRatePercent,
    incidentsAvoidedCount: incidentsAvoided,
  }
}

export function generateDecisionJournalAdvice(
  summary: DecisionJournalSummary,
  userRole: SystemRole,
  surface: Surface = 'default',
): RentalAdvice {
  const target: AdviceTarget = { type: 'report', id: 'decision-summary' }
  const nowIso = new Date().toISOString()
  const scope = moneyScope({ role: userRole, surface })

  const parts: string[] = [
    `DECISION JOURNAL AUDIT: ${summary.totalDecisions} AI suggestions evaluated (${summary.acceptedCount} accepted, ${summary.modifiedCount} modified, ${summary.rejectedCount} rejected).`,
    `Acceptance Rate: ${summary.acceptanceRatePercent}%.`,
    `Empirically Observed Outcomes: ${summary.observedOutcomesCount} (${summary.successRatePercent}% success rate, ${summary.incidentsAvoidedCount} incidents proactively avoided by staff safety modifications).`,
    'In accordance with advisory standards, suggestion acceptance is tracked separately from measured operational results.',
  ]

  if (scope === 'none') {
    // Floor roles: ensure no commercial terms in summary
    parts.push('Operational feedback loop active across physical custody checkpoints.')
  }

  return {
    id: `adv-decision-summary-${Date.now()}`,
    module: 'decision',
    target,
    evidenceState: 'supported',
    severity: 'info',
    explanation: parts.join(' '),
    sourceRefs: [
      'data/recommendation_outcomes.json',
      'references/decision_framework.md',
    ],
    sourceKinds: ['live_os', 'approved_knowledge'],
    snapshotAt: nowIso,
    requiredChecks: [
      'Conduct return QC before closing observation window',
      'Log lessons learned on modified or rejected recommendations',
    ],
  }
}
