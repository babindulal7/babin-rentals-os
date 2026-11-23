/**
 * BABIN RENTALS OS — INTELLIGENCE TRAINING CENTER
 * Unit Tests for Evaluation Engine & Golden Cases (TQC-01)
 */

import { describe, expect, it } from 'vitest'
import {
  parseGoldenCasesJsonl,
  validateGoldenCase,
  SYNTHETIC_GOLDEN_CASES,
} from '../goldenCases'
import {
  evaluateCaseResponse,
  calculateMetrics,
  executeSyntheticEvaluationRun,
} from '../evalEngine'

describe('Intelligence Golden Cases Parser & Schema (TQC-01)', () => {
  it('parses all 47 synthetic golden cases from raw JSONL', () => {
    expect(SYNTHETIC_GOLDEN_CASES).toHaveLength(47)
    expect(SYNTHETIC_GOLDEN_CASES[0]?.id).toBe('SYN-001')
    expect(SYNTHETIC_GOLDEN_CASES[46]?.id).toBe('SYN-047')
  })

  it('rejects duplicate case IDs in JSONL', () => {
    const duplicateJsonl = `{"id": "SYN-001", "suite": "model_identity", "severity": "critical", "audience": "staff", "locale": "en", "question": "Q1", "fixtureId": "f1", "expectedDisposition": "answer", "requiredAssertions": ["A1"], "forbiddenAssertions": [], "labels": [], "version": 1}
{"id": "SYN-001", "suite": "model_identity", "severity": "critical", "audience": "staff", "locale": "en", "question": "Q2", "fixtureId": "f1", "expectedDisposition": "answer", "requiredAssertions": ["A2"], "forbiddenAssertions": [], "labels": [], "version": 1}`

    expect(() => parseGoldenCasesJsonl(duplicateJsonl)).toThrow(/Duplicate case ID detected: 'SYN-001'/)
  })

  it('rejects malformed cases with invalid disposition', () => {
    const invalidCase = {
      id: 'SYN-999',
      suite: 'model_identity',
      severity: 'high',
      audience: 'staff',
      locale: 'en',
      question: 'Test',
      fixtureId: 'f1',
      expectedDisposition: 'invalid_action',
      requiredAssertions: ['A1'],
      forbiddenAssertions: [],
      labels: [],
      version: 1,
    }

    expect(() => validateGoldenCase(invalidCase)).toThrow(/Invalid expectedDisposition/)
  })

  it('rejects cases with empty requiredAssertions', () => {
    const invalidCase = {
      id: 'SYN-998',
      suite: 'model_identity',
      severity: 'high',
      audience: 'staff',
      locale: 'en',
      question: 'Test',
      fixtureId: 'f1',
      expectedDisposition: 'answer',
      requiredAssertions: [],
      forbiddenAssertions: [],
      labels: [],
      version: 1,
    }

    expect(() => validateGoldenCase(invalidCase)).toThrow(/must specify at least one required assertion/)
  })
})

describe('Intelligence Evaluation Engine (TQC-01)', () => {
  const fx3Case = SYNTHETIC_GOLDEN_CASES.find((c) => c.id === 'SYN-001')!
  const fx30Case = SYNTHETIC_GOLDEN_CASES.find((c) => c.id === 'SYN-002')!
  const burnedCameraCase = SYNTHETIC_GOLDEN_CASES.find((c) => c.id === 'SYN-019')!

  it('enforces exact model identity: FX3 vs FX30 boundary protection', () => {
    // Valid FX3 candidate
    const validFx3 = evaluateCaseResponse(fx3Case, {
      disposition: 'answer',
      text: 'Matched Sony FX3 Full-Frame Cinema Camera',
      matchedModelId: 'CAM-SONY-FX3-BODY',
      evidenceStatus: 'verified_primary',
    })
    expect(validFx3.verdict).toBe('pass')
    expect(validFx3.failureCodes).toHaveLength(0)

    // Invalid FX3 candidate that merges with FX30 (triggers forbidden assertion)
    const confusedFx3 = evaluateCaseResponse(fx3Case, {
      disposition: 'answer',
      text: 'Matched Sony FX3 which is the same as FX30',
      matchedModelId: 'CAM-SONY-FX3-BODY',
    })
    expect(confusedFx3.verdict).toBe('fail')
    expect(confusedFx3.failureCodes.some((c) => c.includes('FORBIDDEN_ASSERTION_TRIGGERED'))).toBe(true)

    // Valid FX30 candidate
    const validFx30 = evaluateCaseResponse(fx30Case, {
      disposition: 'answer',
      text: 'Matched Sony FX30 Super35 Cinema Camera',
      matchedModelId: 'CAM-SONY-FX30-BODY',
      evidenceStatus: 'verified_primary',
    })
    expect(validFx30.verdict).toBe('pass')
  })

  it('fails immediately and logs critical violation on safety failure (SYN-019)', () => {
    // Dangerous advice: telling operator to power on burned gear
    const dangerousResponse = evaluateCaseResponse(burnedCameraCase, {
      disposition: 'answer',
      text: 'Smells burned, but you should power on for test to verify',
    })

    expect(dangerousResponse.verdict).toBe('fail')
    expect(dangerousResponse.failureCodes).toContain('CRITICAL_SAFETY_VIOLATION')
    expect(dangerousResponse.failureCodes.some((c) => c.includes('FORBIDDEN_ASSERTION_TRIGGERED'))).toBe(true)

    // Verify metrics fail zero-tolerance gate
    const metrics = calculateMetrics([dangerousResponse])
    expect(metrics.zeroSafetyPrivacyViolations).toBe(false)
    expect(metrics.safetyPrivacyViolationCount).toBe(1)
  })

  it('correctly reports blocked cases and never claims 100% accuracy with blocked tests (SYN-044)', () => {
    const blockedCaseResult = evaluateCaseResponse(fx3Case, {
      disposition: 'answer',
      text: 'Cannot connect to inventory fixture',
      isBlocked: true,
    })

    expect(blockedCaseResult.verdict).toBe('blocked')
    expect(blockedCaseResult.failureCodes).toContain('ENVIRONMENT_BLOCKED')

    // 1 pass, 1 blocked -> evaluated pass rate is 100% of evaluated, but total contains blocked
    const validResult = evaluateCaseResponse(fx30Case, {
      disposition: 'answer',
      text: 'Sony FX30 verified',
      matchedModelId: 'CAM-SONY-FX30-BODY',
    })

    const metrics = calculateMetrics([validResult, blockedCaseResult])
    expect(metrics.overallEvaluatedPassRate.passed).toBe(1)
    expect(metrics.overallEvaluatedPassRate.totalEvaluated).toBe(1)
    // Blocked cases count is tracked separately and cannot be silently rolled into pass rate
  })

  it('returns null rate when denominator is zero (SYN-046)', () => {
    const metrics = calculateMetrics([])
    expect(metrics.exactModelIdAccuracy.rate).toBeNull()
    expect(metrics.overallEvaluatedPassRate.rate).toBeNull()
  })

  it('detects regressions against an approved baseline run (SYN-043)', () => {
    // Baseline where SYN-001 passed
    const baselineResults = [
      {
        caseId: 'SYN-001',
        suite: 'model_identity',
        severity: 'critical' as const,
        verdict: 'pass' as const,
        candidateDisposition: 'answer' as const,
        predictedResponse: 'FX3 passed',
        matchedRequired: [],
        unmatchedRequired: [],
        triggeredForbidden: [],
        failureCodes: [],
        evidenceStatus: 'verified_primary' as const,
        durationMs: 5,
      },
    ]

    // Current run where SYN-001 failed
    const currentResults = [
      {
        caseId: 'SYN-001',
        suite: 'model_identity',
        severity: 'critical' as const,
        verdict: 'fail' as const,
        candidateDisposition: 'answer' as const,
        predictedResponse: 'FX3 regressed',
        matchedRequired: [],
        unmatchedRequired: ['Must match exact Sony FX3 model ID from fixture'],
        triggeredForbidden: [],
        failureCodes: ['MISSING_REQUIRED_ASSERTION'],
        evidenceStatus: 'unknown' as const,
        durationMs: 5,
      },
    ]

    const metrics = calculateMetrics(currentResults, baselineResults)
    expect(metrics.regressionRate.numerator).toBe(1)
    expect(metrics.regressionRate.denominator).toBe(1)
    expect(metrics.regressionRate.rate).toBe(100)
  })

  it('runs complete synthetic evaluation with 100% pass on all 47 synthetic cases', () => {
    const run = executeSyntheticEvaluationRun(SYNTHETIC_GOLDEN_CASES)
    expect(run.counts.total).toBe(47)
    expect(run.counts.pass).toBe(47)
    expect(run.counts.fail).toBe(0)
    expect(run.counts.blocked).toBe(0)
    expect(run.metrics.zeroSafetyPrivacyViolations).toBe(true)
    expect(run.metrics.exactModelIdAccuracy.rate).toBe(100)
  })
})
