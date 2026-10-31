import { describe, it, expect } from 'vitest'
import { validateFloorVerb } from '../floorVerb'

describe('Reset floorVerb validation — Self-QC when alone (W43, L7, T2-13)', () => {
  const BOOKING_REF = 'B-100'
  const UNIT_ID = 'unit-123'
  const CLEANER_ID = 'user-cleaner-1'
  const INSPECTOR_ID = 'user-inspector-2'

  it('throws when qcBy === cleanedBy without qcSelfChecked or qcSkipped (0003:887)', () => {
    expect(() =>
      validateFloorVerb('Reset', {
        bookingRef: BOOKING_REF,
        resetEntries: [
          {
            unitId: UNIT_ID,
            cleanedBy: CLEANER_ID,
            qcBy: CLEANER_ID,
            qcSelfChecked: false,
          },
        ],
      }),
    ).toThrowError(/checked by the person who cleaned it.*unless you are alone on shift/i)
  })

  it('accepts qcBy === cleanedBy when qcSelfChecked is true (W43, L7, T2-13)', () => {
    expect(() =>
      validateFloorVerb('Reset', {
        bookingRef: BOOKING_REF,
        resetEntries: [
          {
            unitId: UNIT_ID,
            cleanedBy: CLEANER_ID,
            qcBy: CLEANER_ID,
            qcSelfChecked: true,
          },
        ],
      }),
    ).not.toThrow()
  })

  it('accepts qcBy === cleanedBy when qcSkipped is true with qcSkipReason', () => {
    expect(() =>
      validateFloorVerb('Reset', {
        bookingRef: BOOKING_REF,
        resetEntries: [
          {
            unitId: UNIT_ID,
            cleanedBy: CLEANER_ID,
            qcBy: CLEANER_ID,
            qcSkipped: true,
            qcSkipReason: 'Fast-track turnaround',
          },
        ],
      }),
    ).not.toThrow()
  })

  it('accepts different qcBy and cleanedBy without requiring qcSelfChecked or qcSkipped', () => {
    expect(() =>
      validateFloorVerb('Reset', {
        bookingRef: BOOKING_REF,
        resetEntries: [
          {
            unitId: UNIT_ID,
            cleanedBy: CLEANER_ID,
            qcBy: INSPECTOR_ID,
          },
        ],
      }),
    ).not.toThrow()
  })
})
