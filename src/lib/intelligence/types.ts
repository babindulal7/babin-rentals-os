/**
 * BABIN RENTALS OS — INTELLIGENCE TRAINING CENTER
 * Core domain types and contracts (TQC-01)
 *
 * Strict offline evaluation contracts, golden test schemas,
 * and immutable quality evaluation reporting types.
 */

export type EvidenceStatus =
  | 'verified_primary'
  | 'approved_internal'
  | 'unreviewed_candidate'
  | 'contradictory'
  | 'expired'
  | 'unknown'

export type ExpectedDisposition = 'answer' | 'abstain' | 'clarify' | 'reject_action'

export type CaseSeverity = 'critical' | 'high' | 'medium' | 'low'

export type CaseAudience = 'owner' | 'manager' | 'staff' | 'warehouse' | 'technician' | 'client'

export type CaseLocale = 'en' | 'ne' | 'mixed'

export type EvaluationVerdict = 'pass' | 'fail' | 'inconclusive' | 'blocked'

export interface GoldenCase {
  id: string
  suite: string
  severity: CaseSeverity
  audience: CaseAudience
  locale: CaseLocale
  question: string
  fixtureId: string
  asOf?: string | undefined
  expectedDisposition: ExpectedDisposition
  requiredAssertions: string[]
  forbiddenAssertions: string[]
  requiredSourceIds?: string[] | undefined
  labels: string[]
  approvedBy?: string | null | undefined
  approvedAt?: string | null | undefined
  version: number
}

export interface EvaluationCaseResult {
  caseId: string
  suite: string
  severity: CaseSeverity
  verdict: EvaluationVerdict
  candidateDisposition: ExpectedDisposition
  predictedResponse: string
  matchedRequired: string[]
  unmatchedRequired: string[]
  triggeredForbidden: string[]
  failureCodes: string[]
  evidenceStatus: EvidenceStatus
  durationMs: number
}

export interface MetricFraction {
  numerator: number
  denominator: number
  rate: number | null // null when denominator is 0
}

export interface EvaluationMetrics {
  exactModelIdAccuracy: MetricFraction
  sourceSupportRate: MetricFraction
  safeAbstentionRate: MetricFraction
  regressionRate: MetricFraction
  zeroSafetyPrivacyViolations: boolean
  safetyPrivacyViolationCount: number
  overallEvaluatedPassRate: {
    passed: number
    totalEvaluated: number
    rate: number | null
  }
}

export interface EvaluationRun {
  runId: string
  baseSha: string
  candidateVersion: string
  knowledgeSnapshotId: string
  fixtureSnapshotId: string
  suiteVersion: string
  asOf: string
  environment: 'synthetic_offline' | 'authorized_staging'
  results: EvaluationCaseResult[]
  counts: {
    pass: number
    fail: number
    inconclusive: number
    blocked: number
    total: number
  }
  metrics: EvaluationMetrics
  costEstimate?: number | undefined
  actualCost?: number | undefined
}

export type QualityIssueCategory =
  | 'identity'
  | 'completeness'
  | 'consistency'
  | 'freshness'
  | 'operational'

export interface DataQualityIssue {
  code: string
  severity: CaseSeverity
  category: QualityIssueCategory
  title: string
  description: string
  canonicalId: string
  deepLink: string
  evidence: string
  earliestSafeFix: string
  proposedOwner: string
  reviewStatus: 'open' | 'under_review' | 'resolved'
}

export type KnowledgeCandidateCategory =
  | 'specification'
  | 'guide'
  | 'included_kit'
  | 'compatible'
  | 'optional_addon'
  | 'rental_rule'
  | 'troubleshooting'
  | 'safety'

export interface KnowledgeReviewItem {
  id: string
  modelId: string
  modelName: string
  category: KnowledgeCandidateCategory
  sourceType: string
  publisher: string
  sourceRevision: string
  currentApprovedValue: string
  proposedValue: string
  confidence: EvidenceStatus
  status: 'pending' | 'approved_internal' | 'approved_client' | 'rejected' | 'evidence_requested'
  rejectionReason?: string | undefined
  updatedAt: string
}

export type FeedbackType =
  | 'helpful'
  | 'wrong'
  | 'missing_accessory'
  | 'unsafe'
  | 'outdated'
  | 'not_applicable'
  | 'wrong_model'
  | 'other'

export interface StaffFeedbackItem {
  id: string
  modelId: string
  modelName: string
  sourceType: string
  feedbackType: FeedbackType
  comment: string
  status: 'pending' | 'review_candidate_created' | 'dismissed'
  createdAt: string
  userRole: CaseAudience
}
