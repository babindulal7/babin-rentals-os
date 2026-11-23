/**
 * BABIN RENTALS OS — SHADOW EVALUATOR & ACCEPTANCE FIXTURE TEST SUITE
 *
 * Verifies all 20 Synthetic Acceptance Fixtures (S01 through S20)
 * specified in Sprint Brief §7, plus edge cases, Nepal time cycle boundaries,
 * role-gating privacy boundaries, and redaction logic.
 */

import { describe, expect, it } from 'vitest'
import {
  evaluateFinanceDue,
  evaluateKnowledgeNotVerified,
  evaluatePickupIncompletePack,
  evaluatePickupMissingSerial,
  evaluateReturnApproaching,
  evaluateSafetyQcHold,
  evaluateShadowAdvisories,
  evaluateUnresolvedIssue,
  exportRedactedAdvisories,
} from '../evaluators'
import { SYNTHETIC_FIXTURES } from '../fixtures'
import {
  formatNepalTimeISO,
  getNepalOperatingDayBounds,
  isDueInCurrentNepalOperatingDay,
  toNepalDate,
} from '../nepalTime'
import type { EvaluatorContext, ShadowBookingSnapshot } from '../types'

describe('Nepal Operating Day Time Utilities (06:00 to 06:00 Local Cycle)', () => {
  it('converts UTC to Nepal Time (UTC+05:45)', () => {
    // 00:00 UTC = 05:45 NPT
    const utcDate = new Date('2026-11-23T00:00:00.000Z')
    const nepal = toNepalDate(utcDate)
    expect(nepal.getUTCHours()).toBe(5)
    expect(nepal.getUTCMinutes()).toBe(45)
  })

  it('correctly formats Nepal Time ISO string with +05:45 offset', () => {
    const formatted = formatNepalTimeISO(new Date('2026-11-23T00:15:00.000Z'))
    expect(formatted).toContain('+05:45')
    expect(formatted).toContain('06:00:00')
  })

  it('determines operating day boundary: 05:59:59 NPT is previous day, 06:00:00 NPT is new day', () => {
    // 00:14:00 UTC = 05:59:00 NPT (belongs to previous operating day starting Nov 22 06:00 NPT)
    const justBeforeSixUTC = '2026-11-23T00:14:00.000Z'
    // 00:15:00 UTC = 06:00:00 NPT (starts operating day Nov 23 06:00 NPT)
    const exactlySixUTC = '2026-11-23T00:15:00.000Z'

    const boundsBefore = getNepalOperatingDayBounds(justBeforeSixUTC)
    const boundsAt = getNepalOperatingDayBounds(exactlySixUTC)

    expect(boundsBefore.dayLabel).toBe('2026-11-22')
    expect(boundsAt.dayLabel).toBe('2026-11-23')

    // An event at 06:30 NPT on Nov 23 is NOT in the operating day of 05:59 NPT
    const eventAtSixThirtyUTC = '2026-11-23T00:45:00.000Z'
    expect(isDueInCurrentNepalOperatingDay(eventAtSixThirtyUTC, justBeforeSixUTC)).toBe(false)
    expect(isDueInCurrentNepalOperatingDay(eventAtSixThirtyUTC, exactlySixUTC)).toBe(true)
  })
})

describe('Sprint Brief §7: 20 Synthetic Acceptance Fixtures (S01 to S20)', () => {
  // S01: Complete packing, all units verified -> No false incomplete-pack warning
  it('S01: Complete packing, all units verified -> 0 incomplete-pack advisories', () => {
    const fix = SYNTHETIC_FIXTURES.S01
    const candidates = evaluateShadowAdvisories(fix.bundle, fix.context)
    expect(candidates).toHaveLength(fix.expectedAdvisoryCount ?? 0)
  })

  // S02: One reserved unit lacks assignment -> Missing-serial advisory with correct evidence
  it('S02: One reserved unit lacks assignment -> missing serial advisory', () => {
    const fix = SYNTHETIC_FIXTURES.S02
    const candidates = evaluateShadowAdvisories(fix.bundle, fix.context)
    expect(candidates).toHaveLength(1)
    const c = candidates[0]!
    expect(c.ruleId).toBe(fix.expectedRuleId)
    expect(c.state).toBe(fix.expectedState)
    expect(c.severity).toBe('action-needed')
    expect(c.summary).toContain('1 reserved equipment unit(s) pending physical serial assignment')
    expect(c.evidence[0]!.sourceKind).toBe('booking')
    expect(c.evidence[0]!.freshness).toBe('verified')
  })

  // S03: Packing state request fails -> Inconclusive, not packed/unpacked guess
  it('S03: Packing state request fails -> Inconclusive, fail-closed state', () => {
    const fix = SYNTHETIC_FIXTURES.S03
    const candidates = evaluateShadowAdvisories(fix.bundle, fix.context)
    expect(candidates).toHaveLength(1)
    const c = candidates[0]!
    expect(c.ruleId).toBe(fix.expectedRuleId)
    expect(c.state).toBe('inconclusive')
    expect(c.summary).toContain('Could not verify packing status')
    expect(c.evidence[0]!.freshness).toBe('missing')
  })

  // S04: Damaged unit on verified maintenance hold -> Safety review advisory, no auto-release
  it('S04: Damaged unit on verified maintenance hold -> safety hold advisory with urgent review', () => {
    const fix = SYNTHETIC_FIXTURES.S04
    const candidates = evaluateShadowAdvisories(fix.bundle, fix.context)
    expect(candidates).toHaveLength(1)
    const c = candidates[0]!
    expect(c.ruleId).toBe(fix.expectedRuleId)
    expect(c.state).toBe('supported')
    expect(c.severity).toBe('urgent-review')
    expect(c.summary).toContain('Sony FX3 Body')
    expect(c.summary).toContain('safety/QC hold')
    expect(c.safeFocusTarget).toBe('/repairs?unit=UNIT-FX3-DAMAGED')
  })

  // S05: Unverified AI guide -> Knowledge-review advisory, no publish action
  it('S05: Unverified AI guide -> Knowledge review advisory, unreviewed status', () => {
    const fix = SYNTHETIC_FIXTURES.S05
    const candidates = evaluateShadowAdvisories(fix.bundle, fix.context)
    expect(candidates).toHaveLength(1)
    const c = candidates[0]!
    expect(c.ruleId).toBe(fix.expectedRuleId)
    expect(c.state).toBe('supported')
    expect(c.summary).toContain('requires staff verification')
    expect(c.safeFocusTarget).toBe('/intelligence/training-center')
  })

  // S06: Two identical source rows -> Exactly 1 deduplicated advisory candidate
  it('S06: Two identical source rows -> Deduplicated to exactly 1 candidate', () => {
    const fix = SYNTHETIC_FIXTURES.S06
    expect(fix.bundle.bookings).toHaveLength(2) // 2 source rows
    const candidates = evaluateShadowAdvisories(fix.bundle, fix.context)
    expect(candidates).toHaveLength(1)
    expect(candidates[0]!.ruleId).toBe(fix.expectedRuleId)
  })

  // S07: Unauthorized Warehouse view requesting payment -> No financial data in props, DOM, export or logs
  it('S07: Unauthorized Warehouse view -> Finance advisory blocked and zero balance leakage', () => {
    const fix = SYNTHETIC_FIXTURES.S07
    const candidates = evaluateShadowAdvisories(fix.bundle, fix.context)
    const financeCandidate = candidates.find((c) => c.ruleId === 'advisory.finance_due')
    expect(financeCandidate).toBeDefined()
    expect(financeCandidate!.state).toBe('blocked')
    expect(financeCandidate!.evidence[0]!.freshness).toBe('unauthorized')
    // Ensure no monetary values (e.g. "5000" or "500000" or "Rs") appear in summary or reason
    expect(financeCandidate!.summary).not.toMatch(/\d+/)
    expect(financeCandidate!.reason).not.toContain('5000')
    expect(financeCandidate!.reason).not.toContain('Paisa')
  })

  // S08: 05:59 -> 06:00 Nepal boundary -> Correct operational day result
  it('S08: 05:59 -> 06:00 Nepal boundary -> Return approaching recognized in current day', () => {
    const fix = SYNTHETIC_FIXTURES.S08
    const candidates = evaluateShadowAdvisories(fix.bundle, fix.context)
    expect(candidates).toHaveLength(1)
    const c = candidates[0]!
    expect(c.ruleId).toBe(fix.expectedRuleId)
    expect(c.state).toBe('supported')
    expect(c.summary).toContain('Equipment return due in current Nepal operating day')
  })

  // S09: Booking cancelled or closed -> No active pickup/return prompt
  it('S09: Booking cancelled or closed -> 0 active advisories generated', () => {
    const fix = SYNTHETIC_FIXTURES.S09
    const candidates = evaluateShadowAdvisories(fix.bundle, fix.context)
    expect(candidates).toHaveLength(0)
  })

  // S10: Booking has partial return -> Remaining units from persisted history only
  it('S10: Booking has partial return -> Reflects outstanding remaining units', () => {
    const fix = SYNTHETIC_FIXTURES.S10
    const candidates = evaluateShadowAdvisories(fix.bundle, fix.context)
    expect(candidates).toHaveLength(1)
    const c = candidates[0]!
    expect(c.ruleId).toBe('advisory.return_approaching')
    expect(c.summary).toContain('Partial return in flight: 2 of 3 units outstanding')
  })

  // S11: Stale cached snapshot after update -> Freshness reported stale and state inconclusive
  it('S11: Stale cached snapshot -> Stale freshness, inconclusive state', () => {
    const fix = SYNTHETIC_FIXTURES.S11
    const candidates = evaluateShadowAdvisories(fix.bundle, fix.context)
    expect(candidates).toHaveLength(1)
    const c = candidates[0]!
    expect(c.ruleId).toBe('advisory.pickup_missing_serial')
    expect(c.state).toBe('inconclusive')
    expect(c.evidence[0]!.freshness).toBe('stale')
  })

  // S12: Client ID details present in raw input -> Redacted export scrubs phone numbers, emails, and PANs
  it('S12: Redacted export scrubs client telephone, email, and PAN numbers', () => {
    const fix = SYNTHETIC_FIXTURES.S12
    const candidates = evaluateShadowAdvisories(fix.bundle, fix.context)
    const exportData = exportRedactedAdvisories(candidates, fix.context)
    expect(exportData.candidates).toHaveLength(1)
    const exported = exportData.candidates[0]!
    // Check PII redaction
    expect(exported.summary).not.toContain('9841234567')
    expect(exported.summary).not.toContain('600123456')
    expect(exported.reason).not.toContain('9841234567')
    expect(exported.reason).not.toContain('600123456')
  })

  // S13: Existing primary action already visible -> No duplicate filled CTA anywhere
  it('S13: safeFocusTarget links to canonical existing routes only', () => {
    const fix = SYNTHETIC_FIXTURES.S13
    const candidates = evaluateShadowAdvisories(fix.bundle, fix.context)
    expect(candidates).toHaveLength(1)
    const c = candidates[0]!
    expect(c.safeFocusTarget).toBe('/rentals/BK-S13-ACTION')
  })

  // S14: Offline app -> Read-only, inconclusive state
  it('S14: Offline app -> Fails closed with inconclusive state', () => {
    const fix = SYNTHETIC_FIXTURES.S14
    const candidates = evaluateShadowAdvisories(fix.bundle, fix.context)
    expect(candidates).toHaveLength(1)
    const c = candidates[0]!
    expect(c.state).toBe('inconclusive')
    expect(c.reason).toContain('offline')
  })

  // S15: Missing source timestamp/version -> Unknown freshness and inconclusive state
  it('S15: Missing snapshot version -> Stale freshness and inconclusive state', () => {
    const fix = SYNTHETIC_FIXTURES.S15
    const candidates = evaluateShadowAdvisories(fix.bundle, fix.context)
    expect(candidates).toHaveLength(1)
    const c = candidates[0]!
    expect(c.state).toBe('inconclusive')
    expect(c.evidence[0]!.freshness).toBe('stale')
  })

  // S16: Conflicting asset status facts -> Conflicted evidence, blocked state
  it('S16: Conflicting asset status facts -> Conflicted evidence, blocked state', () => {
    const fix = SYNTHETIC_FIXTURES.S16
    const candidates = evaluateShadowAdvisories(fix.bundle, fix.context)
    expect(candidates).toHaveLength(1)
    const c = candidates[0]!
    expect(c.state).toBe('blocked')
    expect(c.evidence[0]!.freshness).toBe('conflicted')
    expect(c.reason).toContain('Conflicted evidence')
  })

  // S17: Repeated evaluation of same snapshot -> Stable deterministic output
  it('S17: Repeated evaluations produce strictly identical candidate outputs', () => {
    const fix = SYNTHETIC_FIXTURES.S17
    const run1 = evaluateShadowAdvisories(fix.bundle, fix.context)
    const run2 = evaluateShadowAdvisories(fix.bundle, fix.context)
    expect(run1).toEqual(run2)
  })

  // S18: Externally held rental item -> Reflects unresolved blocker without bypassing hold
  it('S18: Externally held rental item -> advisory.unresolved_issue with urgent-review', () => {
    const fix = SYNTHETIC_FIXTURES.S18
    const candidates = evaluateShadowAdvisories(fix.bundle, fix.context)
    expect(candidates).toHaveLength(1)
    const c = candidates[0]!
    expect(c.ruleId).toBe('advisory.unresolved_issue')
    expect(c.state).toBe('supported')
    expect(c.severity).toBe('urgent-review')
    expect(c.reason).toContain('Equipment held by police custody')
  })

  // S19: Owner/Manager vs Warehouse role -> Gated financial permissions
  it('S19: Owner sees financial figures; Warehouse role receives blocked sentinel with zero numbers', () => {
    const fix = SYNTHETIC_FIXTURES.S19
    // 1. Owner evaluation
    const ownerCandidates = evaluateShadowAdvisories(fix.bundle, fix.context)
    const ownerFinance = ownerCandidates.find((c) => c.ruleId === 'advisory.finance_due')
    expect(ownerFinance).toBeDefined()
    expect(ownerFinance!.state).toBe('supported')
    expect(ownerFinance!.reason).toContain('Rs. 7,500')

    // 2. Warehouse evaluation of same bundle
    const warehouseCtx: EvaluatorContext = {
      role: 'warehouse',
      currentTimestampISO: fix.context.currentTimestampISO,
    }
    const warehouseCandidates = evaluateShadowAdvisories(fix.bundle, warehouseCtx)
    const warehouseFinance = warehouseCandidates.find((c) => c.ruleId === 'advisory.finance_due')
    expect(warehouseFinance).toBeDefined()
    expect(warehouseFinance!.state).toBe('blocked')
    expect(warehouseFinance!.reason).not.toContain('7,500')
    expect(warehouseFinance!.reason).not.toContain('750000')
    expect(warehouseFinance!.evidence[0]!.freshness).toBe('unauthorized')
  })

  // S20: Accessibility navigation target verification
  it('S20: Accessible navigation target is provided and valid', () => {
    const fix = SYNTHETIC_FIXTURES.S20
    const candidates = evaluateShadowAdvisories(fix.bundle, fix.context)
    expect(candidates).toHaveLength(1)
    const c = candidates[0]!
    expect(c.safeFocusTarget).toMatch(/^\/(rentals|operations|repairs|intelligence)/)
  })
})

describe('Individual Pure Evaluator Edge Cases', () => {
  const defaultCtx: EvaluatorContext = {
    role: 'staff',
    currentTimestampISO: '2026-11-23T10:00:00.000Z',
  }

  it('evaluatePickupMissingSerial returns null if all serials are assigned', () => {
    const booking: ShadowBookingSnapshot = {
      bookingNo: 'BK-ALL-ASSIGNED',
      status: 'confirmed',
      reservedUnitsCount: 2,
      assignedSerials: ['SN-1', 'SN-2'],
      snapshotVersion: 'v1.0',
      capturedAtISO: '2026-11-23T10:00:00.000Z',
    }
    expect(evaluatePickupMissingSerial(booking, defaultCtx)).toBeNull()
  })

  it('evaluatePickupMissingSerial sets urgent-review if pickup is due today', () => {
    const booking: ShadowBookingSnapshot = {
      bookingNo: 'BK-DUE-TODAY',
      status: 'confirmed',
      reservedUnitsCount: 2,
      assignedSerials: ['SN-1'],
      pickupStartAd: '2026-11-23T11:00:00.000Z',
      snapshotVersion: 'v1.0',
      capturedAtISO: '2026-11-23T10:00:00.000Z',
    }
    const result = evaluatePickupMissingSerial(booking, defaultCtx)
    expect(result).not.toBeNull()
    expect(result!.severity).toBe('urgent-review')
  })

  it('evaluatePickupIncompletePack returns null when booking is closed or cancelled', () => {
    const booking: ShadowBookingSnapshot = {
      bookingNo: 'BK-CLOSED',
      status: 'closed',
      reservedUnitsCount: 1,
      assignedSerials: ['SN-1'],
      snapshotVersion: 'v1.0',
      capturedAtISO: '2026-11-23T10:00:00.000Z',
    }
    expect(evaluatePickupIncompletePack(booking, defaultCtx)).toBeNull()
  })

  it('evaluateReturnApproaching returns null when booking is not on_rent', () => {
    const booking: ShadowBookingSnapshot = {
      bookingNo: 'BK-NOT-ON-RENT',
      status: 'confirmed',
      reservedUnitsCount: 1,
      assignedSerials: ['SN-1'],
      returnDueAd: '2026-11-23T12:00:00.000Z',
      snapshotVersion: 'v1.0',
      capturedAtISO: '2026-11-23T10:00:00.000Z',
    }
    expect(evaluateReturnApproaching(booking, defaultCtx)).toBeNull()
  })

  it('evaluateUnresolvedIssue returns null when booking has no blocker', () => {
    const booking: ShadowBookingSnapshot = {
      bookingNo: 'BK-NO-BLOCKER',
      status: 'confirmed',
      reservedUnitsCount: 1,
      assignedSerials: ['SN-1'],
      hasUnresolvedBlocker: false,
      snapshotVersion: 'v1.0',
      capturedAtISO: '2026-11-23T10:00:00.000Z',
    }
    expect(evaluateUnresolvedIssue(booking, defaultCtx)).toBeNull()
  })

  it('evaluateSafetyQcHold returns null if unit is not on hold and has no conflicts', () => {
    const asset = {
      unitId: 'UNIT-CLEAN',
      modelId: 'M-MIC',
      modelName: 'Sennheiser MKH 416',
      isUnderMaintenanceHold: false,
      snapshotVersion: 'v1.0',
      capturedAtISO: '2026-11-23T10:00:00.000Z',
    }
    expect(evaluateSafetyQcHold(asset, defaultCtx)).toBeNull()
  })

  it('evaluateKnowledgeNotVerified returns null if guide is already approved and primary', () => {
    const knowledge = {
      guideId: 'GUIDE-APPROVED',
      modelId: 'M-FX3',
      title: 'Sony FX3 Setup',
      isVerifiedPrimary: true,
      approvalStatus: 'approved' as const,
      snapshotVersion: 'v1.0',
      capturedAtISO: '2026-11-23T10:00:00.000Z',
    }
    expect(evaluateKnowledgeNotVerified(knowledge, defaultCtx)).toBeNull()
  })

  it('evaluateFinanceDue returns null if outstanding balance is 0 or undefined', () => {
    const booking: ShadowBookingSnapshot = {
      bookingNo: 'BK-PAID',
      status: 'confirmed',
      reservedUnitsCount: 1,
      assignedSerials: ['SN-1'],
      outstandingBalancePaisa: 0,
      snapshotVersion: 'v1.0',
      capturedAtISO: '2026-11-23T10:00:00.000Z',
    }
    const ownerCtx: EvaluatorContext = { ...defaultCtx, role: 'owner' }
    expect(evaluateFinanceDue(booking, ownerCtx)).toBeNull()
  })
})
