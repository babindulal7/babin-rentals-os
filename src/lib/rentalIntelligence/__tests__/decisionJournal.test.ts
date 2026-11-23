import { describe, it, expect } from 'vitest'
import {
  createDecisionRecord,
  recordMeasuredOutcome,
  calculateJournalSummary,
  generateDecisionJournalAdvice,
  SEED_DECISION_RECORDS,
} from '../decisionJournal'

describe('Rental Intelligence RI-09: Decision Journal & Outcome Feedback Engine', () => {
  it('contains verified seed decision records from Babin field operations', () => {
    expect(SEED_DECISION_RECORDS.length).toBeGreaterThanOrEqual(3)
    const ids = SEED_DECISION_RECORDS.map((r) => r.id)
    expect(ids).toContain('DEC-2026-001')
    expect(ids).toContain('DEC-2026-002')
    expect(ids).toContain('DEC-2026-003')
  })

  it('enforces Invariant RI-A27: newly created decisions always start in pending_observation (acceptance != confirmed outcome)', () => {
    const decision = createDecisionRecord({
      recommendationId: 'adv-kit-100',
      module: 'kit',
      targetId: 'BK-2026-999',
      targetType: 'booking',
      reviewerRole: 'Owner',
      reviewerName: 'Babin',
      decision: 'accepted_unmodified',
      staffNotes: 'Kit verified against physical stock',
      evidenceState: 'supported',
      sourceRefs: ['references/cameras.md'],
    })

    expect(decision.decision).toBe('accepted_unmodified')
    // Invariant RI-A27: Status MUST be pending_observation upon acceptance
    expect(decision.actualOutcome?.status).toBe('pending_observation')
  })

  it('records measured outcome post-return QC and transitions from pending_observation', () => {
    const initial = createDecisionRecord({
      recommendationId: 'adv-kit-101',
      module: 'kit',
      targetId: 'BK-2026-101',
      targetType: 'booking',
      reviewerRole: 'Owner',
      reviewerName: 'Babin',
      decision: 'modified_by_staff',
      staffNotes: 'Added 1x spare battery pack',
      modifications: ['Added 1x NP-FZ100'],
      evidenceState: 'supported',
      sourceRefs: ['references/cameras.md'],
    })

    expect(initial.actualOutcome?.status).toBe('pending_observation')

    const measured = recordMeasuredOutcome(initial, {
      status: 'completed_incident_avoided',
      damageDetected: false,
      returnedOnTime: true,
      batteryOrPowerShortage: false,
      clientFeedback: 'Shoot ran 2 hours overtime; extra battery saved the ceremony coverage.',
      learningReflection: 'Always include spare battery on wedding full-day bookings.',
    })

    expect(measured.actualOutcome?.status).toBe('completed_incident_avoided')
    expect(measured.actualOutcome?.clientFeedback).toContain('extra battery saved')
    expect(measured.actualOutcome?.measuredAt).toBeDefined()
  })

  it('calculates aggregate journal summary metrics across decisions and observed outcomes', () => {
    const summary = calculateJournalSummary(SEED_DECISION_RECORDS)

    expect(summary.totalDecisions).toBe(3)
    expect(summary.acceptedCount).toBe(1)
    expect(summary.modifiedCount).toBe(2)
    expect(summary.rejectedCount).toBe(0)
    expect(summary.acceptanceRatePercent).toBe(33)
    expect(summary.observedOutcomesCount).toBe(3)
    expect(summary.successRatePercent).toBe(100)
    expect(summary.incidentsAvoidedCount).toBe(1)
  })

  it('generates role-safe decision journal advice for reporting', () => {
    const summary = calculateJournalSummary(SEED_DECISION_RECORDS)
    const advice = generateDecisionJournalAdvice(summary, 'Owner', 'default')

    expect(advice.module).toBe('decision')
    expect(advice.explanation).toContain('DECISION JOURNAL AUDIT: 3 AI suggestions evaluated')
    expect(advice.explanation).toContain('100% success rate')
    expect(advice.explanation).toContain('1 incidents proactively avoided')
    expect(advice.sourceRefs).toContain('data/recommendation_outcomes.json')
  })

  it('scrubs commercial terms in decision journal advice when viewed on floor surfaces', () => {
    const summary = calculateJournalSummary(SEED_DECISION_RECORDS)
    const advice = generateDecisionJournalAdvice(summary, 'Warehouse', 'floor')

    expect(advice.explanation).toContain('DECISION JOURNAL AUDIT')
    expect(advice.explanation).toContain('Operational feedback loop active across physical custody checkpoints.')
  })
})
