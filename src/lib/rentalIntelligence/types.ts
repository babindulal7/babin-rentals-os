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
    status: 'planned',
    priority: 'P1',
  },
  {
    id: 'client',
    title: 'Client Intelligence',
    shortDesc: 'Client rental persona insights and respectful due recovery drafts',
    icon: 'users',
    status: 'planned',
    priority: 'P1',
  },
  {
    id: 'idle_stock',
    title: 'Idle Stock Activation',
    shortDesc: 'Utilization tracking and asset repositioning observations',
    icon: 'package',
    status: 'planned',
    priority: 'P1',
  },
  {
    id: 'checklist',
    title: 'Checklist Generator',
    shortDesc: 'Booking-linked prep and return custody checklists',
    icon: 'check-square',
    status: 'planned',
    priority: 'P0',
  },
  {
    id: 'knowledge',
    title: 'Rental RAG',
    shortDesc: 'Approved policy and equipment manual search with citations',
    icon: 'book-open',
    status: 'planned',
    priority: 'P1',
  },
  {
    id: 'rules',
    title: 'Rules & Playbooks',
    shortDesc: 'Versioned store laws and operational shooting playbooks',
    icon: 'file-text',
    status: 'planned',
    priority: 'P1',
  },
  {
    id: 'decision',
    title: 'Decision Journal',
    shortDesc: 'Recommendation review tracking and measured outcome feedback',
    icon: 'clipboard',
    status: 'planned',
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
