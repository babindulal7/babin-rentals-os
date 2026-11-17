import { describe, it, expect } from 'vitest'
import {
  checkExternalHoldConflicts,
  syncExternalHolds,
  type ExternalHoldRecord,
  type OsReservationCandidate,
} from '../externalHolds'

describe('T9-02 External Booqable Holds Model', () => {
  const existingHolds: ExternalHoldRecord[] = [
    {
      id: 'hold-1',
      booqableOrderId: 'bq-ord-101',
      booqableOrderNumber: '10492',
      productId: 'prod-fx3',
      unitSerial: 'FX3-01',
      startDateUtc: '2026-11-20T00:15:00Z', // 06:00 NPT
      endDateUtc: '2026-11-22T00:15:00Z',
      status: 'active',
      lastSyncTimestampUtc: '2026-11-17T01:15:00Z',
    },
    {
      id: 'hold-2',
      booqableOrderId: 'bq-ord-102',
      booqableOrderNumber: '10495',
      productId: 'prod-c70',
      startDateUtc: '2026-11-25T00:15:00Z',
      endDateUtc: '2026-11-28T00:15:00Z',
      status: 'completed', // Already returned
      lastSyncTimestampUtc: '2026-11-17T01:15:00Z',
    },
  ]

  it('detects overlap with active Booqable hold and generates neutral chip', () => {
    const candidate: OsReservationCandidate = {
      productId: 'prod-fx3',
      unitSerial: 'FX3-01',
      startDateUtc: '2026-11-21T00:15:00Z',
      endDateUtc: '2026-11-23T00:15:00Z',
    }

    const res = checkExternalHoldConflicts(candidate, existingHolds)
    expect(res.hasConflict).toBe(true)
    expect(res.conflictingHolds.length).toBe(1)
    expect(res.conflictingHolds[0]?.displayChipText).toBe('Held in Booqable #10492')
  })

  it('allows reservation when serials do not clash or dates do not overlap', () => {
    // Different serial
    const candidateDiffSerial: OsReservationCandidate = {
      productId: 'prod-fx3',
      unitSerial: 'FX3-02',
      startDateUtc: '2026-11-21T00:15:00Z',
      endDateUtc: '2026-11-23T00:15:00Z',
    }
    expect(checkExternalHoldConflicts(candidateDiffSerial, existingHolds).hasConflict).toBe(false)

    // Non-overlapping date
    const candidateLaterDate: OsReservationCandidate = {
      productId: 'prod-fx3',
      unitSerial: 'FX3-01',
      startDateUtc: '2026-11-23T00:15:00Z',
      endDateUtc: '2026-11-25T00:15:00Z',
    }
    expect(checkExternalHoldConflicts(candidateLaterDate, existingHolds).hasConflict).toBe(false)
  })

  it('ignores completed or cancelled Booqable holds', () => {
    const candidateCompleted: OsReservationCandidate = {
      productId: 'prod-c70',
      startDateUtc: '2026-11-26T00:15:00Z',
      endDateUtc: '2026-11-27T00:15:00Z',
    }
    expect(checkExternalHoldConflicts(candidateCompleted, existingHolds).hasConflict).toBe(false)
  })

  it('fails closed on sync failure, preserving existing active holds', () => {
    const retained = syncExternalHolds([], existingHolds, false)
    expect(retained.length).toBe(2)
    expect(retained[0]?.id).toBe('hold-1')
  })
})
