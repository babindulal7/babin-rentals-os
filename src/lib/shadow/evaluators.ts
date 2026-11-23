/**
 * BABIN RENTALS OS — INTELLIGENCE SHADOW EVALUATION ENGINE (INT-SHADOW-01)
 * Pure, deterministic advisory candidate evaluators.
 *
 * Enforces:
 * 1. Read-only advisory candidates linked strictly to existing primary action targets.
 * 2. Inconclusive/fail-closed states on missing, stale, or offline data.
 * 3. Strict money-blind gating: finance figures omitted from warehouse/tech roles.
 * 4. Deduplication by ruleId + entity.type + entity.id.
 * 5. Redacted export with zero customer PII and zero sensitive leaks.
 */

import type {
  AdvisoryCandidate,
  AdvisoryEvidence,
  AdvisoryState,
  EvaluatorContext,
  RedactedExportPayload,
  Severity,
  ShadowAssetSnapshot,
  ShadowBookingSnapshot,
  ShadowKnowledgeSnapshot,
  ShadowSnapshotBundle,
} from './types'
import { isDueInCurrentNepalOperatingDay } from './nepalTime'

export const EVALUATOR_VERSION = 'v1.0.0-shadow-eval'

/**
 * Evaluates missing serial assignment on upcoming bookings.
 * Rule: advisory.pickup_missing_serial
 */
export function evaluatePickupMissingSerial(
  booking: ShadowBookingSnapshot,
  ctx: EvaluatorContext
): AdvisoryCandidate | null {
  // Disregard cancelled or closed bookings
  if (booking.status === 'cancelled' || booking.status === 'closed') {
    return null
  }

  // Check if unassigned units exist
  const missingCount = booking.reservedUnitsCount - booking.assignedSerials.length
  if (missingCount <= 0) {
    return null
  }

  const isStale = booking.isStaleSnapshot || !booking.snapshotVersion
  const freshness = isStale ? 'stale' : 'verified'
  const state: AdvisoryState = isStale ? 'inconclusive' : 'supported'

  const evidence: AdvisoryEvidence[] = [
    {
      sourceKind: 'booking',
      sourceId: booking.bookingNo,
      sourceVersion: booking.snapshotVersion || undefined,
      observedAtISO: booking.capturedAtISO || ctx.currentTimestampISO,
      freshness,
      note: `Reserved units: ${booking.reservedUnitsCount}, assigned serials: ${booking.assignedSerials.length}. Missing: ${missingCount}.`,
    },
  ]

  let isDueToday = false
  if (booking.pickupStartAd) {
    try {
      isDueToday = isDueInCurrentNepalOperatingDay(booking.pickupStartAd, ctx.currentTimestampISO)
    } catch {
      // safe fallback on malformed dates
    }
  }

  const severity: Severity = isDueToday ? 'urgent-review' : 'action-needed'

  return {
    id: `advisory.pickup_missing_serial:booking:${booking.bookingNo}`,
    ruleId: 'advisory.pickup_missing_serial',
    entity: { type: 'booking', id: booking.bookingNo },
    severity,
    state,
    summary: `${missingCount} reserved equipment unit(s) pending physical serial assignment`,
    reason: isStale
      ? 'Snapshot version is stale or missing timestamp; assignment count cannot be authoritatively confirmed.'
      : `Booking ${booking.bookingNo} requires ${missingCount} physical serial unit(s) assigned before packing can proceed.`,
    evidence,
    computedAtISO: ctx.currentTimestampISO,
    safeFocusTarget: `/rentals/${encodeURIComponent(booking.bookingNo)}`,
    evaluatorVersion: EVALUATOR_VERSION,
  }
}

/**
 * Evaluates incomplete packing state on bookings.
 * Rule: advisory.pickup_incomplete_pack
 */
export function evaluatePickupIncompletePack(
  booking: ShadowBookingSnapshot,
  ctx: EvaluatorContext
): AdvisoryCandidate | null {
  if (booking.status === 'cancelled' || booking.status === 'closed') {
    return null
  }

  // If request failed or offline, fail-closed with 'inconclusive'
  if (booking.packingStateAvailable === false || ctx.isOffline) {
    const isOfflineMode = ctx.isOffline === true
    return {
      id: `advisory.pickup_incomplete_pack:booking:${booking.bookingNo}`,
      ruleId: 'advisory.pickup_incomplete_pack',
      entity: { type: 'booking', id: booking.bookingNo },
      severity: 'urgent-review',
      state: 'inconclusive',
      summary: isOfflineMode
        ? 'Could not verify packing status (client is offline)'
        : 'Could not verify packing status (network offline or source unavailable)',
      reason: isOfflineMode
        ? 'Application is offline. Cannot verify physical completion without live operations read.'
        : 'Packing workspace state request failed. Cannot verify physical completion without live operations read.',
      evidence: [
        {
          sourceKind: 'operation',
          sourceId: booking.bookingNo,
          observedAtISO: ctx.currentTimestampISO,
          freshness: 'missing',
          note: isOfflineMode
            ? 'Client is running in offline mode.'
            : 'Operations packing state read returned unavailable or offline.',
        },
      ],
      computedAtISO: ctx.currentTimestampISO,
      safeFocusTarget: `/operations/prep/${encodeURIComponent(booking.bookingNo)}`,
      evaluatorVersion: EVALUATOR_VERSION,
    }
  }

  // If packing is complete, no incomplete pack advisory is generated
  if (booking.isPackingComplete === true) {
    return null
  }

  // If packing is explicitly incomplete
  if (booking.isPackingComplete === false) {
    const isStale = booking.isStaleSnapshot
    return {
      id: `advisory.pickup_incomplete_pack:booking:${booking.bookingNo}`,
      ruleId: 'advisory.pickup_incomplete_pack',
      entity: { type: 'booking', id: booking.bookingNo },
      severity: 'action-needed',
      state: isStale ? 'inconclusive' : 'supported',
      summary: 'Packing checklist not completed for upcoming dispatch',
      reason: isStale
        ? 'Stale packing checklist snapshot; refresh required to confirm packed status.'
        : `Booking ${booking.bookingNo} has incomplete items in the packing workspace.`,
      evidence: [
        {
          sourceKind: 'operation',
          sourceId: booking.bookingNo,
          sourceVersion: booking.snapshotVersion,
          observedAtISO: booking.capturedAtISO,
          freshness: isStale ? 'stale' : 'verified',
          note: 'Packing checklist has incomplete items in Operations workspace.',
        },
      ],
      computedAtISO: ctx.currentTimestampISO,
      safeFocusTarget: `/operations/prep/${encodeURIComponent(booking.bookingNo)}`,
      evaluatorVersion: EVALUATOR_VERSION,
    }
  }

  return null
}

/**
 * Evaluates safety and QC/maintenance holds on physical units.
 * Rule: advisory.safety_qc_hold
 */
export function evaluateSafetyQcHold(
  asset: ShadowAssetSnapshot,
  ctx: EvaluatorContext
): AdvisoryCandidate | null {
  // If asset has conflicting records
  if (asset.conflictingFactsDetected) {
    return {
      id: `advisory.safety_qc_hold:unit:${asset.unitId}`,
      ruleId: 'advisory.safety_qc_hold',
      entity: { type: 'unit', id: asset.unitId },
      severity: 'urgent-review',
      state: 'blocked',
      summary: `Conflicting records for asset ${asset.modelName} (${asset.unitId})`,
      reason: `Conflicted evidence: ${asset.conflictDescription || 'Asset state disagrees across ledger and maintenance tables.'}`,
      evidence: [
        {
          sourceKind: 'asset',
          sourceId: asset.unitId,
          sourceVersion: asset.snapshotVersion,
          observedAtISO: asset.capturedAtISO,
          freshness: 'conflicted',
          note: asset.conflictDescription || 'Conflicting operational and maintenance records.',
        },
      ],
      computedAtISO: ctx.currentTimestampISO,
      safeFocusTarget: `/inventory?unit=${encodeURIComponent(asset.unitId)}`,
      evaluatorVersion: EVALUATOR_VERSION,
    }
  }

  // Active verified maintenance hold
  if (asset.isUnderMaintenanceHold) {
    return {
      id: `advisory.safety_qc_hold:unit:${asset.unitId}`,
      ruleId: 'advisory.safety_qc_hold',
      entity: { type: 'unit', id: asset.unitId },
      severity: 'urgent-review',
      state: 'supported',
      summary: `Asset ${asset.modelName} (${asset.unitId}) is on verified safety/QC hold`,
      reason: `Unit is quarantined in Maintenance pool: ${asset.maintenanceReason || 'Pending inspection'}. No automated availability release permitted.`,
      evidence: [
        {
          sourceKind: 'asset',
          sourceId: asset.unitId,
          sourceVersion: asset.snapshotVersion,
          observedAtISO: asset.capturedAtISO,
          freshness: 'verified',
          note: `Hold reason: ${asset.maintenanceReason || 'QC hold'}.`,
        },
      ],
      computedAtISO: ctx.currentTimestampISO,
      safeFocusTarget: `/repairs?unit=${encodeURIComponent(asset.unitId)}`,
      evaluatorVersion: EVALUATOR_VERSION,
    }
  }

  return null
}

/**
 * Evaluates return deadlines under Nepal operating day rules.
 * Rule: advisory.return_approaching
 */
export function evaluateReturnApproaching(
  booking: ShadowBookingSnapshot,
  ctx: EvaluatorContext
): AdvisoryCandidate | null {
  if (booking.status !== 'on_rent') {
    return null
  }

  if (!booking.returnDueAd) {
    return {
      id: `advisory.return_approaching:booking:${booking.bookingNo}`,
      ruleId: 'advisory.return_approaching',
      entity: { type: 'booking', id: booking.bookingNo },
      severity: 'action-needed',
      state: 'inconclusive',
      summary: 'Return deadline missing or unparseable',
      reason: 'Booking is marked On Rent but carries no valid return due timestamp in canonical record.',
      evidence: [
        {
          sourceKind: 'booking',
          sourceId: booking.bookingNo,
          observedAtISO: ctx.currentTimestampISO,
          freshness: 'missing',
          note: 'Missing returnDueAd timestamp.',
        },
      ],
      computedAtISO: ctx.currentTimestampISO,
      safeFocusTarget: `/rentals/${encodeURIComponent(booking.bookingNo)}`,
      evaluatorVersion: EVALUATOR_VERSION,
    }
  }

  let isDueCurrentDay = false
  try {
    isDueCurrentDay = isDueInCurrentNepalOperatingDay(booking.returnDueAd, ctx.currentTimestampISO)
  } catch {
    return null
  }

  if (!isDueCurrentDay) {
    return null
  }

  // Handle partial return state from persisted history only (§S10)
  const partial = booking.partialReturnHistory
  const returnSummary = partial && partial.outstandingUnits > 0
    ? `Return due today (Partial return in flight: ${partial.outstandingUnits} of ${partial.totalExpectedUnits} units outstanding)`
    : 'Equipment return due in current Nepal operating day (06:00–06:00 cycle)'

  return {
    id: `advisory.return_approaching:booking:${booking.bookingNo}`,
    ruleId: 'advisory.return_approaching',
    entity: { type: 'booking', id: booking.bookingNo },
    severity: 'action-needed',
    state: 'supported',
    summary: returnSummary,
    reason: `Booking ${booking.bookingNo} is due for return and inspection during today's operating cycle. Automated messages or late fees are not triggered.`,
    evidence: [
      {
        sourceKind: 'booking',
        sourceId: booking.bookingNo,
        sourceVersion: booking.snapshotVersion,
        observedAtISO: booking.capturedAtISO,
        freshness: booking.isStaleSnapshot ? 'stale' : 'verified',
        note: `Return deadline: ${booking.returnDueAd}. Nepal operating day match confirmed.`,
      },
    ],
    computedAtISO: ctx.currentTimestampISO,
    safeFocusTarget: `/operations/return/${encodeURIComponent(booking.bookingNo)}`,
    evaluatorVersion: EVALUATOR_VERSION,
  }
}

/**
 * Evaluates unreviewed knowledge guides.
 * Rule: advisory.knowledge_not_verified
 */
export function evaluateKnowledgeNotVerified(
  knowledge: ShadowKnowledgeSnapshot,
  ctx: EvaluatorContext
): AdvisoryCandidate | null {
  if (knowledge.approvalStatus === 'approved' && knowledge.isVerifiedPrimary) {
    return null
  }

  return {
    id: `advisory.knowledge_not_verified:model:${knowledge.modelId}`,
    ruleId: 'advisory.knowledge_not_verified',
    entity: { type: 'model', id: knowledge.modelId },
    severity: 'action-needed',
    state: 'supported',
    summary: `Technical guide for ${knowledge.title} requires staff verification`,
    reason: `Guide is in status '${knowledge.approvalStatus}' and cannot be published to client portal without human verification.`,
    evidence: [
      {
        sourceKind: 'knowledge',
        sourceId: knowledge.guideId,
        sourceVersion: knowledge.snapshotVersion,
        observedAtISO: knowledge.capturedAtISO,
        freshness: knowledge.isVerifiedPrimary ? 'verified' : 'stale',
        note: `Approval status: ${knowledge.approvalStatus}. Primary verified: ${knowledge.isVerifiedPrimary}.`,
      },
    ],
    computedAtISO: ctx.currentTimestampISO,
    safeFocusTarget: `/intelligence/training-center`,
    evaluatorVersion: EVALUATOR_VERSION,
  }
}

/**
 * Evaluates unresolved blockers on bookings.
 * Rule: advisory.unresolved_issue
 */
export function evaluateUnresolvedIssue(
  booking: ShadowBookingSnapshot,
  ctx: EvaluatorContext
): AdvisoryCandidate | null {
  if (booking.status === 'cancelled' || booking.status === 'closed') {
    return null
  }

  if (!booking.hasUnresolvedBlocker) {
    return null
  }

  return {
    id: `advisory.unresolved_issue:booking:${booking.bookingNo}`,
    ruleId: 'advisory.unresolved_issue',
    entity: { type: 'booking', id: booking.bookingNo },
    severity: 'urgent-review',
    state: 'supported',
    summary: `Unresolved operational blocker on booking ${booking.bookingNo}`,
    reason: booking.blockerDescription || 'Unresolved dependency reported by nextRequirement selector.',
    evidence: [
      {
        sourceKind: 'operation',
        sourceId: booking.bookingNo,
        sourceVersion: booking.snapshotVersion,
        observedAtISO: booking.capturedAtISO,
        freshness: booking.isStaleSnapshot ? 'stale' : 'verified',
        note: booking.blockerDescription || 'Blocker in operations workspace.',
      },
    ],
    computedAtISO: ctx.currentTimestampISO,
    safeFocusTarget: `/rentals/${encodeURIComponent(booking.bookingNo)}`,
    evaluatorVersion: EVALUATOR_VERSION,
  }
}

/**
 * Evaluates outstanding finance due. Strictly role-gated.
 * Rule: advisory.finance_due
 *
 * CRITICAL MONEY-BLIND ENFORCEMENT:
 * Warehouse, technician, driver, and client roles CANNOT receive financial data.
 */
export function evaluateFinanceDue(
  booking: ShadowBookingSnapshot,
  ctx: EvaluatorContext
): AdvisoryCandidate | null {
  const isFinanceAuthorized = ctx.role === 'owner' || ctx.role === 'manager'

  // If role is unauthorized, completely omit financial figures
  if (!isFinanceAuthorized) {
    // If outstanding balance exists, return unauthorized sentinel without money data
    if (booking.outstandingBalancePaisa && booking.outstandingBalancePaisa > 0) {
      return {
        id: `advisory.finance_due:booking:${booking.bookingNo}`,
        ruleId: 'advisory.finance_due',
        entity: { type: 'booking', id: booking.bookingNo },
        severity: 'informational',
        state: 'blocked',
        summary: 'Financial balance status restricted for current role',
        reason: 'Role lacks financial read permissions. Balance and payment status omitted per security policy.',
        evidence: [
          {
            sourceKind: 'policy',
            sourceId: 'POLICY-MONEY-BLIND-01',
            observedAtISO: ctx.currentTimestampISO,
            freshness: 'unauthorized',
            note: 'Permission denied for financial fields.',
          },
        ],
        computedAtISO: ctx.currentTimestampISO,
        safeFocusTarget: `/rentals/${encodeURIComponent(booking.bookingNo)}`,
        evaluatorVersion: EVALUATOR_VERSION,
      }
    }
    return null
  }

  // Authorized role: evaluate outstanding balance
  if (!booking.outstandingBalancePaisa || booking.outstandingBalancePaisa <= 0) {
    return null
  }

  return {
    id: `advisory.finance_due:booking:${booking.bookingNo}`,
    ruleId: 'advisory.finance_due',
    entity: { type: 'booking', id: booking.bookingNo },
    severity: 'action-needed',
    state: 'supported',
    summary: `Outstanding payment balance pending review for booking ${booking.bookingNo}`,
    reason: `Balance of Rs. ${(booking.outstandingBalancePaisa / 100).toLocaleString('en-IN')} pending settlement. Automated billing messages are not sent.`,
    evidence: [
      {
        sourceKind: 'booking',
        sourceId: booking.bookingNo,
        sourceVersion: booking.snapshotVersion,
        observedAtISO: booking.capturedAtISO,
        freshness: booking.isStaleSnapshot ? 'stale' : 'verified',
        note: `Outstanding balance: ${booking.outstandingBalancePaisa} Paisa.`,
      },
    ],
    computedAtISO: ctx.currentTimestampISO,
    safeFocusTarget: `/rentals/${encodeURIComponent(booking.bookingNo)}`,
    evaluatorVersion: EVALUATOR_VERSION,
  }
}

/**
 * Master evaluator: Runs all pure evaluators over a snapshot bundle.
 * Enforces deduplication by ruleId + entity.type + entity.id.
 */
export function evaluateShadowAdvisories(
  bundle: ShadowSnapshotBundle,
  ctx: EvaluatorContext
): AdvisoryCandidate[] {
  const candidates: AdvisoryCandidate[] = []
  const seenKeys = new Set<string>()

  const addCandidate = (c: AdvisoryCandidate | null) => {
    if (!c) return
    const dedupKey = `${c.ruleId}:${c.entity.type}:${c.entity.id}`
    if (seenKeys.has(dedupKey)) {
      return // Deduplicate identical rule + entity candidates (S06)
    }
    seenKeys.add(dedupKey)
    candidates.push(c)
  }

  // 1. Evaluate bookings
  if (bundle.bookings) {
    for (const b of bundle.bookings) {
      addCandidate(evaluatePickupMissingSerial(b, ctx))
      addCandidate(evaluatePickupIncompletePack(b, ctx))
      addCandidate(evaluateReturnApproaching(b, ctx))
      addCandidate(evaluateUnresolvedIssue(b, ctx))
      addCandidate(evaluateFinanceDue(b, ctx))
    }
  }

  // 2. Evaluate assets
  if (bundle.assets) {
    for (const a of bundle.assets) {
      addCandidate(evaluateSafetyQcHold(a, ctx))
    }
  }

  // 3. Evaluate knowledge
  if (bundle.knowledge) {
    for (const k of bundle.knowledge) {
      addCandidate(evaluateKnowledgeNotVerified(k, ctx))
    }
  }

  return candidates
}

/**
 * Generates redacted export of shadow advisory candidates.
 * Enforces zero customer PII and zero unauthorized finance leaks (S07, S12).
 */
export function exportRedactedAdvisories(
  candidates: AdvisoryCandidate[],
  ctx: EvaluatorContext
): RedactedExportPayload {
  const isFinanceAuthorized = ctx.role === 'owner' || ctx.role === 'manager'

  const redactedCandidates = candidates.map((c) => {
    // If not finance authorized, scrub any finance details from text
    let cleanSummary = c.summary
    let cleanReason = c.reason

    if (!isFinanceAuthorized && c.ruleId === 'advisory.finance_due') {
      cleanSummary = 'Financial balance status restricted for current role'
      cleanReason = 'Financial data omitted per role security policy.'
    }

    // PII scrubber: scrub telephone, email, PAN or national ID patterns
    cleanSummary = scrubPii(cleanSummary)
    cleanReason = scrubPii(cleanReason)

    return {
      id: c.id,
      ruleId: c.ruleId,
      entityType: c.entity.type,
      entityId: c.entity.id,
      severity: c.severity,
      state: c.state,
      summary: cleanSummary,
      reason: cleanReason,
      evidenceSources: c.evidence.map((e) => `${e.sourceKind}:${e.sourceId}`),
      freshness: c.evidence[0]?.freshness ?? 'missing',
      evaluatorVersion: c.evaluatorVersion,
      computedAtISO: c.computedAtISO,
    }
  })

  return {
    exportTimestampISO: ctx.currentTimestampISO,
    totalCandidates: redactedCandidates.length,
    reviewerRole: ctx.role,
    environment: 'shadow_evaluation_synthetic',
    candidates: redactedCandidates,
  }
}

function scrubPii(input: string): string {
  return input
    .replace(/\b\d{10}\b/g, '[REDACTED_PHONE]')
    .replace(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g, '[REDACTED_EMAIL]')
    .replace(/\bPAN[-:\s]*\d{9}\b/gi, '[REDACTED_PAN]')
}
