/**
 * BABIN RENTALS OS — INTELLIGENCE SHADOW EVALUATION (INT-SHADOW-01)
 * Data contracts and normalized candidate types.
 *
 * Strict advisory contracts: zero autonomous writes, zero action hijacking,
 * zero customer PII, zero financial leakage to unauthorized roles.
 */

export type EvidenceState = 'verified' | 'missing' | 'stale' | 'conflicted' | 'unauthorized'
export type AdvisoryState = 'supported' | 'inconclusive' | 'blocked' | 'contradicted'
export type Severity = 'informational' | 'action-needed' | 'urgent-review'

export interface AdvisoryEvidence {
  sourceKind: 'booking' | 'asset' | 'operation' | 'policy' | 'knowledge'
  sourceId: string // safe nonsecret identifier
  sourceVersion?: string | undefined // revision or snapshot token
  observedAtISO?: string | undefined
  freshness: EvidenceState
  note?: string | undefined // role-safe summary, no secret payloads
}

export interface AdvisoryCandidate {
  id: string // stable deterministic key: ruleId + entity.type + entity.id
  ruleId: string
  entity: {
    type: 'booking' | 'unit' | 'model'
    id: string
  }
  severity: Severity
  state: AdvisoryState
  summary: string // role-safe summary
  reason: string // evidence-backed or explicit unknown
  evidence: AdvisoryEvidence[]
  computedAtISO: string
  safeFocusTarget?: string | undefined // existing route or workspace anchor ONLY
  evaluatorVersion: string
}

export interface ShadowBookingSnapshot {
  bookingNo: string
  status: 'draft' | 'quote' | 'confirmed' | 'packed' | 'on_rent' | 'returned' | 'cancelled' | 'closed'
  pickupStartAd?: string | undefined // ISO timestamp
  returnDueAd?: string | undefined // ISO timestamp
  reservedUnitsCount: number
  assignedSerials: string[]
  isPackingComplete?: boolean | undefined
  packingStateAvailable?: boolean | undefined // false if request failed or offline
  hasUnresolvedBlocker?: boolean | undefined
  blockerDescription?: string | undefined
  partialReturnHistory?: {
    totalExpectedUnits: number
    returnedUnits: number
    outstandingUnits: number
  } | undefined
  outstandingBalancePaisa?: number | undefined // Strictly gated: never passed to unauthorized roles
  clientNameRedacted?: string | undefined
  snapshotVersion: string
  capturedAtISO: string
  isStaleSnapshot?: boolean | undefined
}

export interface ShadowAssetSnapshot {
  unitId: string
  modelId: string
  modelName: string
  isUnderMaintenanceHold: boolean
  maintenanceReason?: string | undefined
  maintenanceSeverity?: 'critical' | 'high' | 'medium' | 'low' | undefined
  conflictingFactsDetected?: boolean | undefined
  conflictDescription?: string | undefined
  snapshotVersion: string
  capturedAtISO: string
}

export interface ShadowKnowledgeSnapshot {
  guideId: string
  modelId: string
  title: string
  isVerifiedPrimary: boolean
  approvalStatus: 'approved' | 'unreviewed_candidate' | 'rejected'
  snapshotVersion: string
  capturedAtISO: string
}

export interface ShadowSnapshotBundle {
  bookings?: ShadowBookingSnapshot[] | undefined
  assets?: ShadowAssetSnapshot[] | undefined
  knowledge?: ShadowKnowledgeSnapshot[] | undefined
  observedAtISO: string
}

export interface EvaluatorContext {
  role: 'owner' | 'manager' | 'staff' | 'warehouse' | 'technician' | 'driver' | 'client'
  currentTimestampISO: string
  isOffline?: boolean | undefined
}

export interface RedactedExportCandidate {
  id: string
  ruleId: string
  entityType: 'booking' | 'unit' | 'model'
  entityId: string
  severity: Severity
  state: AdvisoryState
  summary: string
  reason: string
  evidenceSources: string[]
  freshness: EvidenceState
  evaluatorVersion: string
  computedAtISO: string
}

export interface RedactedExportPayload {
  exportTimestampISO: string
  totalCandidates: number
  reviewerRole: string
  environment: 'shadow_evaluation_synthetic'
  candidates: RedactedExportCandidate[]
}
