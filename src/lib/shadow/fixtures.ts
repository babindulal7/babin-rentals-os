/**
 * BABIN RENTALS OS — SHADOW EVALUATION SYNTHETIC ACCEPTANCE FIXTURES (INT-SHADOW-01)
 *
 * Implements the 20 Synthetic Acceptance Fixtures (S01 through S20)
 * specified in Sprint Brief §7.
 */

import type {
  EvaluatorContext,
  ShadowSnapshotBundle,
} from './types'

export type SyntheticFixtureId =
  | 'S01'
  | 'S02'
  | 'S03'
  | 'S04'
  | 'S05'
  | 'S06'
  | 'S07'
  | 'S08'
  | 'S09'
  | 'S10'
  | 'S11'
  | 'S12'
  | 'S13'
  | 'S14'
  | 'S15'
  | 'S16'
  | 'S17'
  | 'S18'
  | 'S19'
  | 'S20'

export interface SyntheticFixtureCase {
  id: SyntheticFixtureId
  title: string
  description: string
  bundle: ShadowSnapshotBundle
  context: EvaluatorContext
  expectedRuleId?: string | undefined
  expectedState?: string | undefined
  expectedAdvisoryCount?: number | undefined
}

export const SYNTHETIC_FIXTURES: Record<SyntheticFixtureId, SyntheticFixtureCase> = {
  // S01: Complete packing, all units verified -> No false incomplete-pack warning
  S01: {
    id: 'S01',
    title: 'Complete packing, all units verified',
    description: 'Booking has all serials assigned and packing checklist verified complete. Must NOT generate incomplete pack warning.',
    bundle: {
      observedAtISO: '2026-11-23T10:00:00.000Z',
      bookings: [
        {
          bookingNo: 'BK-S01-COMPLETE',
          status: 'confirmed',
          reservedUnitsCount: 2,
          assignedSerials: ['SN-FX3-001', 'SN-FX3-002'],
          isPackingComplete: true,
          packingStateAvailable: true,
          snapshotVersion: 'v1.0.0',
          capturedAtISO: '2026-11-23T10:00:00.000Z',
        },
      ],
    },
    context: { role: 'staff', currentTimestampISO: '2026-11-23T10:00:00.000Z' },
    expectedAdvisoryCount: 0,
  },

  // S02: One reserved unit lacks assignment -> Missing-serial advisory with correct evidence
  S02: {
    id: 'S02',
    title: 'One reserved unit lacks assignment',
    description: 'Booking reserves 3 units but only 2 serials assigned. Must trigger advisory.pickup_missing_serial.',
    bundle: {
      observedAtISO: '2026-11-23T10:00:00.000Z',
      bookings: [
        {
          bookingNo: 'BK-S02-MISSING-SERIAL',
          status: 'confirmed',
          reservedUnitsCount: 3,
          assignedSerials: ['SN-FX3-001', 'SN-FX3-002'],
          isPackingComplete: true,
          packingStateAvailable: true,
          snapshotVersion: 'v1.0.0',
          capturedAtISO: '2026-11-23T10:00:00.000Z',
        },
      ],
    },
    context: { role: 'staff', currentTimestampISO: '2026-11-23T10:00:00.000Z' },
    expectedRuleId: 'advisory.pickup_missing_serial',
    expectedState: 'supported',
  },

  // S03: Packing state request fails -> Inconclusive, not packed/unpacked guess
  S03: {
    id: 'S03',
    title: 'Packing state request fails',
    description: 'Packing workspace state request failed. Must report inconclusive state without guessing completion.',
    bundle: {
      observedAtISO: '2026-11-23T10:00:00.000Z',
      bookings: [
        {
          bookingNo: 'BK-S03-REQUEST-FAIL',
          status: 'confirmed',
          reservedUnitsCount: 2,
          assignedSerials: ['SN-FX3-001', 'SN-FX3-002'],
          packingStateAvailable: false,
          snapshotVersion: 'v1.0.0',
          capturedAtISO: '2026-11-23T10:00:00.000Z',
        },
      ],
    },
    context: { role: 'staff', currentTimestampISO: '2026-11-23T10:00:00.000Z' },
    expectedRuleId: 'advisory.pickup_incomplete_pack',
    expectedState: 'inconclusive',
  },

  // S04: Damaged unit on verified maintenance hold -> Safety review advisory, no auto-release
  S04: {
    id: 'S04',
    title: 'Damaged unit on verified maintenance hold',
    description: 'Unit is quarantined under maintenance hold. Must generate urgent-review safety hold advisory.',
    bundle: {
      observedAtISO: '2026-11-23T10:00:00.000Z',
      assets: [
        {
          unitId: 'UNIT-FX3-DAMAGED',
          modelId: 'M-FX3-BODY',
          modelName: 'Sony FX3 Body',
          isUnderMaintenanceHold: true,
          maintenanceReason: 'Cracked top plate screw mount and loose HDMI port',
          maintenanceSeverity: 'critical',
          snapshotVersion: 'v2.1',
          capturedAtISO: '2026-11-23T09:30:00.000Z',
        },
      ],
    },
    context: { role: 'technician', currentTimestampISO: '2026-11-23T10:00:00.000Z' },
    expectedRuleId: 'advisory.safety_qc_hold',
    expectedState: 'supported',
  },

  // S05: Unverified AI guide -> Knowledge-review advisory, no publish action
  S05: {
    id: 'S05',
    title: 'Unverified AI guide',
    description: 'Technical how-to guide is in unreviewed candidate status. Must report knowledge review advisory.',
    bundle: {
      observedAtISO: '2026-11-23T10:00:00.000Z',
      knowledge: [
        {
          guideId: 'GUIDE-CANDIDATE-01',
          modelId: 'M-DJI-RS4',
          title: 'DJI RS 4 Pro Balancing Procedure',
          isVerifiedPrimary: false,
          approvalStatus: 'unreviewed_candidate',
          snapshotVersion: 'v0.9-draft',
          capturedAtISO: '2026-11-23T08:00:00.000Z',
        },
      ],
    },
    context: { role: 'staff', currentTimestampISO: '2026-11-23T10:00:00.000Z' },
    expectedRuleId: 'advisory.knowledge_not_verified',
    expectedState: 'supported',
  },

  // S06: Two identical source rows -> One deduplicated advisory
  S06: {
    id: 'S06',
    title: 'Two identical source rows',
    description: 'Two identical booking rows supplied. Must produce exactly 1 deduplicated advisory candidate.',
    bundle: {
      observedAtISO: '2026-11-23T10:00:00.000Z',
      bookings: [
        {
          bookingNo: 'BK-S06-DUP',
          status: 'confirmed',
          reservedUnitsCount: 2,
          assignedSerials: ['SN-001'],
          snapshotVersion: 'v1.0.0',
          capturedAtISO: '2026-11-23T10:00:00.000Z',
        },
        {
          bookingNo: 'BK-S06-DUP',
          status: 'confirmed',
          reservedUnitsCount: 2,
          assignedSerials: ['SN-001'],
          snapshotVersion: 'v1.0.0',
          capturedAtISO: '2026-11-23T10:00:00.000Z',
        },
      ],
    },
    context: { role: 'staff', currentTimestampISO: '2026-11-23T10:00:00.000Z' },
    expectedRuleId: 'advisory.pickup_missing_serial',
    expectedAdvisoryCount: 1,
  },

  // S07: Unauthorized Warehouse view requesting payment -> No financial data in props, DOM, export or logs
  S07: {
    id: 'S07',
    title: 'Unauthorized Warehouse view requesting payment',
    description: 'Warehouse role evaluates booking with outstanding balance. Money figures must be completely omitted.',
    bundle: {
      observedAtISO: '2026-11-23T10:00:00.000Z',
      bookings: [
        {
          bookingNo: 'BK-S07-FINANCE',
          status: 'confirmed',
          reservedUnitsCount: 1,
          assignedSerials: ['SN-001'],
          outstandingBalancePaisa: 500000, // Rs. 5,000
          snapshotVersion: 'v1.0.0',
          capturedAtISO: '2026-11-23T10:00:00.000Z',
        },
      ],
    },
    context: { role: 'warehouse', currentTimestampISO: '2026-11-23T10:00:00.000Z' },
    expectedRuleId: 'advisory.finance_due',
    expectedState: 'blocked',
  },

  // S08: 05:59 -> 06:00 Nepal boundary -> Correct operational day result
  S08: {
    id: 'S08',
    title: '05:59 -> 06:00 Nepal boundary',
    description: 'Timestamp at 05:59:00 Nepal time belongs to previous operating day; 06:00:00 starts new day.',
    bundle: {
      observedAtISO: '2026-11-23T00:15:00.000Z', // 06:00 AM Nepal time (+05:45)
      bookings: [
        {
          bookingNo: 'BK-S08-BOUNDARY',
          status: 'on_rent',
          reservedUnitsCount: 1,
          assignedSerials: ['SN-001'],
          returnDueAd: '2026-11-23T02:00:00.000Z', // Due in current operating day
          snapshotVersion: 'v1.0.0',
          capturedAtISO: '2026-11-23T00:15:00.000Z',
        },
      ],
    },
    context: { role: 'staff', currentTimestampISO: '2026-11-23T00:15:00.000Z' },
    expectedRuleId: 'advisory.return_approaching',
    expectedState: 'supported',
  },

  // S09: Booking cancelled or closed -> No active pickup/return prompt
  S09: {
    id: 'S09',
    title: 'Booking cancelled or closed',
    description: 'Cancelled booking with unassigned serials. Must NOT trigger pickup missing serial advisory.',
    bundle: {
      observedAtISO: '2026-11-23T10:00:00.000Z',
      bookings: [
        {
          bookingNo: 'BK-S09-CANCELLED',
          status: 'cancelled',
          reservedUnitsCount: 4,
          assignedSerials: [],
          snapshotVersion: 'v1.0.0',
          capturedAtISO: '2026-11-23T10:00:00.000Z',
        },
      ],
    },
    context: { role: 'staff', currentTimestampISO: '2026-11-23T10:00:00.000Z' },
    expectedAdvisoryCount: 0,
  },

  // S10: Booking has partial return -> Remaining units from persisted history only
  S10: {
    id: 'S10',
    title: 'Booking has partial return',
    description: 'Booking has partial return recorded. Must reflect outstanding units from persisted history.',
    bundle: {
      observedAtISO: '2026-11-23T04:00:00.000Z',
      bookings: [
        {
          bookingNo: 'BK-S10-PARTIAL',
          status: 'on_rent',
          reservedUnitsCount: 3,
          assignedSerials: ['SN-01', 'SN-02', 'SN-03'],
          returnDueAd: '2026-11-23T05:00:00.000Z',
          partialReturnHistory: {
            totalExpectedUnits: 3,
            returnedUnits: 1,
            outstandingUnits: 2,
          },
          snapshotVersion: 'v1.2',
          capturedAtISO: '2026-11-23T04:00:00.000Z',
        },
      ],
    },
    context: { role: 'staff', currentTimestampISO: '2026-11-23T04:00:00.000Z' },
    expectedRuleId: 'advisory.return_approaching',
    expectedState: 'supported',
  },

  // S11: Stale cached snapshot after update -> Freshness reported stale/inconclusive
  S11: {
    id: 'S11',
    title: 'Stale cached snapshot after update',
    description: 'Booking snapshot is marked stale. Freshness must be reported as stale and state as inconclusive.',
    bundle: {
      observedAtISO: '2026-11-23T10:00:00.000Z',
      bookings: [
        {
          bookingNo: 'BK-S11-STALE',
          status: 'confirmed',
          reservedUnitsCount: 2,
          assignedSerials: ['SN-01'],
          isStaleSnapshot: true,
          snapshotVersion: 'v1.0-stale',
          capturedAtISO: '2026-11-22T08:00:00.000Z',
        },
      ],
    },
    context: { role: 'staff', currentTimestampISO: '2026-11-23T10:00:00.000Z' },
    expectedRuleId: 'advisory.pickup_missing_serial',
    expectedState: 'inconclusive',
  },

  // S12: Client ID details present in raw input -> No client identity leaked in reviewer export
  S12: {
    id: 'S12',
    title: 'Client ID details present in raw input',
    description: 'Raw input contains phone 9841234567 and PAN 600123456. Exported payload must scrub PII.',
    bundle: {
      observedAtISO: '2026-11-23T10:00:00.000Z',
      bookings: [
        {
          bookingNo: 'BK-S12-PII',
          status: 'confirmed',
          reservedUnitsCount: 2,
          assignedSerials: ['SN-01'],
          clientNameRedacted: 'Client phone 9841234567 PAN 600123456',
          snapshotVersion: 'v1.0.0',
          capturedAtISO: '2026-11-23T10:00:00.000Z',
        },
      ],
    },
    context: { role: 'staff', currentTimestampISO: '2026-11-23T10:00:00.000Z' },
    expectedRuleId: 'advisory.pickup_missing_serial',
  },

  // S13: Existing primary action already visible -> No duplicate filled CTA anywhere
  S13: {
    id: 'S13',
    title: 'Existing primary action already visible',
    description: 'Advisory candidate safeFocusTarget points to existing canonical route, never creates a second filled CTA.',
    bundle: {
      observedAtISO: '2026-11-23T10:00:00.000Z',
      bookings: [
        {
          bookingNo: 'BK-S13-ACTION',
          status: 'confirmed',
          reservedUnitsCount: 1,
          assignedSerials: [],
          snapshotVersion: 'v1.0.0',
          capturedAtISO: '2026-11-23T10:00:00.000Z',
        },
      ],
    },
    context: { role: 'staff', currentTimestampISO: '2026-11-23T10:00:00.000Z' },
    expectedRuleId: 'advisory.pickup_missing_serial',
    expectedState: 'supported',
  },

  // S14: Offline app -> Read-only, no false save/sent/committed state
  S14: {
    id: 'S14',
    title: 'Offline app',
    description: 'Client is offline. Evaluators must report inconclusive without claiming active operations status.',
    bundle: {
      observedAtISO: '2026-11-23T10:00:00.000Z',
      bookings: [
        {
          bookingNo: 'BK-S14-OFFLINE',
          status: 'confirmed',
          reservedUnitsCount: 2,
          assignedSerials: ['SN-01', 'SN-02'],
          isPackingComplete: false,
          snapshotVersion: 'v1.0.0',
          capturedAtISO: '2026-11-23T10:00:00.000Z',
        },
      ],
    },
    context: { role: 'staff', currentTimestampISO: '2026-11-23T10:00:00.000Z', isOffline: true },
    expectedRuleId: 'advisory.pickup_incomplete_pack',
    expectedState: 'inconclusive',
  },

  // S15: Missing source timestamp/version -> Unknown freshness and no overconfident claim
  S15: {
    id: 'S15',
    title: 'Missing source timestamp/version',
    description: 'Booking snapshot lacks version. Freshness must be reported as stale and state inconclusive.',
    bundle: {
      observedAtISO: '2026-11-23T10:00:00.000Z',
      bookings: [
        {
          bookingNo: 'BK-S15-NO-VERSION',
          status: 'confirmed',
          reservedUnitsCount: 3,
          assignedSerials: ['SN-01'],
          snapshotVersion: '',
          capturedAtISO: '',
        },
      ],
    },
    context: { role: 'staff', currentTimestampISO: '2026-11-23T10:00:00.000Z' },
    expectedRuleId: 'advisory.pickup_missing_serial',
    expectedState: 'inconclusive',
  },

  // S16: Conflicting asset status facts -> Conflicted evidence, no definitive available/ready claim
  S16: {
    id: 'S16',
    title: 'Conflicting asset status facts',
    description: 'Asset has conflicting status across inventory and maintenance ledger. Must report conflicted freshness and blocked state.',
    bundle: {
      observedAtISO: '2026-11-23T10:00:00.000Z',
      assets: [
        {
          unitId: 'UNIT-FX3-CONFLICT',
          modelId: 'M-FX3-BODY',
          modelName: 'Sony FX3 Body',
          isUnderMaintenanceHold: true,
          conflictingFactsDetected: true,
          conflictDescription: 'Inventory table lists Available but repair log records open overhaul',
          snapshotVersion: 'v1.0.0',
          capturedAtISO: '2026-11-23T10:00:00.000Z',
        },
      ],
    },
    context: { role: 'technician', currentTimestampISO: '2026-11-23T10:00:00.000Z' },
    expectedRuleId: 'advisory.safety_qc_hold',
    expectedState: 'blocked',
  },

  // S17: Repeated evaluation of same snapshot -> Stable deterministic output
  S17: {
    id: 'S17',
    title: 'Repeated evaluation of same snapshot',
    description: 'Evaluating same snapshot multiple times produces strictly identical candidate IDs and outputs.',
    bundle: {
      observedAtISO: '2026-11-23T10:00:00.000Z',
      bookings: [
        {
          bookingNo: 'BK-S17-DETERMINISM',
          status: 'confirmed',
          reservedUnitsCount: 2,
          assignedSerials: ['SN-01'],
          snapshotVersion: 'v1.0.0',
          capturedAtISO: '2026-11-23T10:00:00.000Z',
        },
      ],
    },
    context: { role: 'staff', currentTimestampISO: '2026-11-23T10:00:00.000Z' },
    expectedRuleId: 'advisory.pickup_missing_serial',
    expectedState: 'supported',
  },

  // S18: Externally held rental item -> Show canonical reservation conflict without bypassing hold
  S18: {
    id: 'S18',
    title: 'Externally held rental item',
    description: 'Booking has an unresolved external hold blocker. Advisory points to existing blocker resolution.',
    bundle: {
      observedAtISO: '2026-11-23T10:00:00.000Z',
      bookings: [
        {
          bookingNo: 'BK-S18-HOLD',
          status: 'confirmed',
          reservedUnitsCount: 2,
          assignedSerials: ['SN-01', 'SN-02'],
          hasUnresolvedBlocker: true,
          blockerDescription: 'Equipment held by police custody documentation check',
          snapshotVersion: 'v1.0.0',
          capturedAtISO: '2026-11-23T10:00:00.000Z',
        },
      ],
    },
    context: { role: 'manager', currentTimestampISO: '2026-11-23T10:00:00.000Z' },
    expectedRuleId: 'advisory.unresolved_issue',
    expectedState: 'supported',
  },

  // S19: Owner/Manager vs Warehouse role -> Only permitted fields visible
  S19: {
    id: 'S19',
    title: 'Owner/Manager vs Warehouse role',
    description: 'Owner receives financial advisory with exact balance; Warehouse role has financial balance completely omitted.',
    bundle: {
      observedAtISO: '2026-11-23T10:00:00.000Z',
      bookings: [
        {
          bookingNo: 'BK-S19-ROLE-TEST',
          status: 'confirmed',
          reservedUnitsCount: 1,
          assignedSerials: ['SN-01'],
          outstandingBalancePaisa: 750000, // Rs. 7,500
          snapshotVersion: 'v1.0.0',
          capturedAtISO: '2026-11-23T10:00:00.000Z',
        },
      ],
    },
    context: { role: 'owner', currentTimestampISO: '2026-11-23T10:00:00.000Z' },
    expectedRuleId: 'advisory.finance_due',
    expectedState: 'supported',
  },

  // S20: Mobile + keyboard + screen reader -> Meaningful safe focus target
  S20: {
    id: 'S20',
    title: 'Mobile + keyboard + screen reader',
    description: 'Advisory candidate includes valid safeFocusTarget for direct accessibility navigation.',
    bundle: {
      observedAtISO: '2026-11-23T10:00:00.000Z',
      bookings: [
        {
          bookingNo: 'BK-S20-A11Y',
          status: 'confirmed',
          reservedUnitsCount: 3,
          assignedSerials: ['SN-01'],
          snapshotVersion: 'v1.0.0',
          capturedAtISO: '2026-11-23T10:00:00.000Z',
        },
      ],
    },
    context: { role: 'staff', currentTimestampISO: '2026-11-23T10:00:00.000Z' },
    expectedRuleId: 'advisory.pickup_missing_serial',
    expectedState: 'supported',
  },
}
