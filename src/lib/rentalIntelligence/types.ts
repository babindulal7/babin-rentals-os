/**
 * BABIN RENTALS OS — RENTAL INTELLIGENCE ADVISORY SYSTEM
 * Core types and advice contracts (RI-01 through RI-11)
 *
 * Strict read-only advisory contracts:
 * 1. Evidence-backed: Every advice card declares its EvidenceState and SourceKind.
 * 2. Fail-closed: Missing, ambiguous or stale data yields 'needs_verification'.
 * 3. Role-safe: Finance amounts and PII are omitted for unauthorized roles.
 * 4. Immutable: Advisory suggestions never mutate canonical state autonomously.
 */

import type { SystemRole } from '../../types/database'

export type EvidenceState = 'supported' | 'needs_verification' | 'inconclusive' | 'blocked'

export type SourceKind = 'live_os' | 'approved_knowledge' | 'synthetic' | 'external_unverified'

export type AdviceSeverity = 'info' | 'review' | 'urgent'

export type AdviceModule =
  | 'kit'
  | 'quote_explanation'
  | 'operations'
  | 'client'
  | 'idle_stock'
  | 'monsoon'
  | 'knowledge'
  | 'checklist'
  | 'decision'
  | 'safety'
  | 'rules'

export interface AdviceTarget {
  type: 'booking' | 'product' | 'unit' | 'client' | 'report'
  id: string
}

export interface SuggestedAddition {
  productId: string
  displayName: string
  quantity: number
  reason: string
  chargeType: 'included_kit' | 'required_dependency' | 'chargeable_extra'
}

export interface RentalAdvice {
  /** Stable idempotent recommendation key */
  id: string
  module: AdviceModule
  target: AdviceTarget
  evidenceState: EvidenceState
  severity: AdviceSeverity
  /** Role-safe, human-readable explanatory text */
  explanation: string
  /** Authorized stable references, citations or file paths */
  sourceRefs: string[]
  sourceKinds: SourceKind[]
  /** ISO timestamp of data snapshot */
  snapshotAt: string
  expiresAt?: string | undefined
  /** Existing authorized OS route (secondary link only, never duplicate primary CTA) */
  safeFocusTarget?: string | undefined
  requiredChecks: string[]
  /** Suggested additions or substitutions if applicable (IDs only, never phantom items) */
  suggestedAdditions?: SuggestedAddition[] | undefined
  /** Non-overrideable or review blocking errors */
  blockingReasons?: string[] | undefined
}

export type ModuleConnectionStatus = 'working' | 'planned' | 'not_connected'

export interface IntelligenceModuleMeta {
  id: AdviceModule
  title: string
  shortDesc: string
  icon: string
  status: ModuleConnectionStatus
  priority: 'P0' | 'P1' | 'P2'
}

/** Registry of all 11 unique concepts from the Rental Intelligence architecture */
export const RENTAL_INTELLIGENCE_MODULES: readonly IntelligenceModuleMeta[] = [
  {
    id: 'kit',
    title: 'Kit Recommender',
    shortDesc: 'Bundle-first kit auto-completion and compatibility checks',
    icon: 'backpack',
    status: 'working',
    priority: 'P0',
  },
  {
    id: 'safety',
    title: 'Safety Validation',
    shortDesc: 'Payload headroom, electrical limits, and mount compatibility',
    icon: 'shield',
    status: 'working',
    priority: 'P0',
  },
  {
    id: 'quote_explanation',
    title: 'Quote Explanation',
    shortDesc: 'Transparent "Why this price?" breakdown of canonical totals',
    icon: 'receipt',
    status: 'working',
    priority: 'P0',
  },
  {
    id: 'monsoon',
    title: 'Monsoon Mode',
    shortDesc: 'Seasonal moisture protection and dry-cabinet quarantine alerts',
    icon: 'cloud-rain',
    status: 'working',
    priority: 'P2',
  },
  {
    id: 'operations',
    title: 'Morning Report',
    shortDesc: 'Daily operational insights, handover risks, and overdue gear',
    icon: 'activity',
    status: 'working',
    priority: 'P1',
  },
  {
    id: 'client',
    title: 'Client Intelligence',
    shortDesc: 'Client rental persona insights and respectful due recovery drafts',
    icon: 'users',
    status: 'working',
    priority: 'P1',
  },
  {
    id: 'idle_stock',
    title: 'Idle Stock Activation',
    shortDesc: 'Utilization tracking and asset repositioning observations',
    icon: 'package',
    status: 'working',
    priority: 'P1',
  },
  {
    id: 'checklist',
    title: 'Checklist Generator',
    shortDesc: 'Booking-linked prep and return custody checklists',
    icon: 'check-square',
    status: 'working',
    priority: 'P0',
  },
  {
    id: 'knowledge',
    title: 'Rental RAG',
    shortDesc: 'Approved policy and equipment manual search with citations',
    icon: 'book-open',
    status: 'working',
    priority: 'P1',
  },
  {
    id: 'rules',
    title: 'Rules & Playbooks',
    shortDesc: 'Versioned store laws and operational shooting playbooks',
    icon: 'file-text',
    status: 'working',
    priority: 'P1',
  },
  {
    id: 'decision',
    title: 'Decision Journal',
    shortDesc: 'Recommendation review tracking and measured outcome feedback',
    icon: 'clipboard',
    status: 'working',
    priority: 'P1',
  },
] as const

/* ------------------------------------------------------------------
 * Input Interfaces for Pure Evaluator Adapters
 * ------------------------------------------------------------------ */

export interface RigPayloadInput {
  targetId: string
  rigWeightKg: number
  supportRatingKg: number
  supportType: 'tripod' | 'gimbal' | 'crane'
}

export interface PowerCircuitInput {
  targetId: string
  watts: number
  circuitVoltage?: number | undefined // Standard Nepal grid: 230V
  circuitAmps?: number | undefined // Standard heavy socket: 15A
}

export interface BatteryRuntimeInput {
  targetId: string
  batteryWh: number
  rigWatts: number
  coldWeather?: boolean | undefined
}

export interface QuoteExplanationInput {
  bookingId: string
  equipmentRatePaisa: number
  days: number
  discountPercent: number
  discountReason?: string | undefined
  discountApprover?: string | undefined
  vatPaisa: number
  totalPaisa: number
  depositPaisa: number
  advancePaidPaisa: number
  outstandingPaisa: number
}

/* ------------------------------------------------------------------
 * Module RI-06: Monsoon & Environmental Protection Engine Types
 * ------------------------------------------------------------------ */

export interface MonsoonFeeLine {
  description: string
  amountPaisa: number
  reason: string
}

export interface MonsoonAssessment {
  monsoonModeActive: boolean
  isOutdoor: boolean
  isHighAltitudeCold: boolean
  location?: string | undefined
  dispatchRequirements: string[]
  returnQcRequirements: string[]
  storageProtocols: string[]
  bookingPolicies: string[]
  suggestedFeeLines: MonsoonFeeLine[]
  warningNotes: string[]
  advisoryOnly: boolean
}

export interface MonsoonEvaluationInput {
  targetId: string
  items: Array<{ name: string; category?: string }>
  isOutdoor?: boolean | undefined
  targetDateIso?: string | undefined
  location?: string | undefined
}

/* ------------------------------------------------------------------
 * Module RI-07: Rental RAG Knowledge & Retrieval Types
 * ------------------------------------------------------------------ */

export interface RagDocumentSource {
  id: string
  title: string
  category: 'operational_sop' | 'equipment_manual' | 'policy' | 'playbook'
  version: string
  effectiveDate: string
  expiresAt?: string | undefined
  supersededBy?: string | undefined
  verifiedBy: string
  tags: string[]
  content: string
}

export interface RagSearchResult {
  documentId: string
  title: string
  category: string
  version: string
  relevanceScore: number
  snippet: string
  citationPath: string
  isExpired: boolean
  warningNote?: string | undefined
  sourceKind: SourceKind
}

export interface RagSearchResponse {
  query: string
  sanitizedQuery: string
  securityStatus: 'safe' | 'prompt_injection_flagged'
  results: RagSearchResult[]
  advice?: RentalAdvice | undefined
}

export interface RagSearchInput {
  query: string
  categoryFilter?: 'operational_sop' | 'equipment_manual' | 'policy' | 'playbook' | undefined
  maxResults?: number | undefined
}

/* ------------------------------------------------------------------
 * Module RI-09: Decision Journal & Outcome Feedback Types
 * ------------------------------------------------------------------ */

export type StaffDecisionType =
  | 'accepted_unmodified'
  | 'modified_by_staff'
  | 'rejected_by_staff'
  | 'deferred_pending_check'

export type OutcomeStatus =
  | 'pending_observation'
  | 'completed_success'
  | 'completed_with_lesson'
  | 'completed_incident_avoided'
  | 'incident_occurred'

export interface DecisionRecord {
  id: string
  recommendationId: string
  module: AdviceModule
  targetId: string
  targetType: AdviceTarget['type']
  reviewerRole: SystemRole
  reviewerName: string
  decision: StaffDecisionType
  staffNotes: string
  modifications?: string[] | undefined
  evidenceSnapshot: {
    evidenceState: EvidenceState
    sourceRefs: string[]
  }
  reviewedAt: string
  observationWindow: 'during_shoot' | 'at_return_qc' | 'post_settlement'
  actualOutcome?: {
    status: OutcomeStatus
    damageDetected: boolean
    returnedOnTime: boolean
    batteryOrPowerShortage: boolean
    clientFeedback?: string | undefined
    measuredAt?: string | undefined
    learningReflection?: string | undefined
  } | undefined
}

export interface DecisionJournalSummary {
  totalDecisions: number
  acceptedCount: number
  modifiedCount: number
  rejectedCount: number
  acceptanceRatePercent: number
  observedOutcomesCount: number
  successRatePercent: number
  incidentsAvoidedCount: number
}

/* ------------------------------------------------------------------
 * Module RI-11: Rules & Shoot Playbooks Types
 * ------------------------------------------------------------------ */

export interface StoreRule {
  id: string
  ruleNumber: number
  title: string
  category: 'governance' | 'pricing' | 'escrow' | 'custody' | 'access'
  version: string
  effectiveDate: string
  approver: string
  summary: string
  operationalGuideline: string
  isCommercial: boolean
}

export interface ShootPlaybook {
  id: string
  shootType: string
  displayName: string
  primaryObjective: string
  recommendedPackage: string[]
  mandatoryAccessories: string[]
  prohibitedOrAvoid: string[]
  powerAndMediaNotes: string
  consultativeUpsellTip?: string | undefined
}

export interface BudgetScalingVector {
  vector: string
  lowRunAndGun: string
  midStandardPro: string
  highEndCinema: string
}

export interface RuleAmendmentProposal {
  id: string
  ruleOrPlaybookId: string
  proposedBy: string
  proposedRole: SystemRole
  proposedAt: string
  summary: string
  rationale: string
  status: 'draft_pending_review'
  isDraft: true
}

