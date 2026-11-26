import { describe, expect, it } from 'vitest'
import { resourceConflicts, shiftedRentalWindow } from '../calendarIntervals'
import type { Bar } from '../../data/calendar'
const day = new Date('2027-01-10T00:00:00Z')
function bar(id: string, start: string, end: string, quantity = 1, kind: Bar['kind'] = 'Reserved'): Bar {
  return { id, label: id, kind, from: day, to: day, intervalStart: start, intervalEnd: end, quantity }
}
describe('Exact Calendar allocation intervals', () => {
  it('detects a same-display-day conflict from exact times', () => {
    expect(resourceConflicts([bar('a','2027-01-10T01:00:00Z','2027-01-10T03:00:00Z'),bar('b','2027-01-10T02:00:00Z','2027-01-10T04:00:00Z')])).toEqual([
      { start: '2027-01-10T02:00:00.000Z', end: '2027-01-10T03:00:00.000Z', ids: ['a','b'], labels: ['a','b'] },
    ])
  })
  it('allows exact end-at-start turnover on the same display day', () => {
    expect(resourceConflicts([bar('a','2027-01-10T01:00:00Z','2027-01-10T02:00:00Z'),bar('b','2027-01-10T02:00:00Z','2027-01-10T03:00:00Z')])).toEqual([])
  })
  it('tests peak quantity rather than all demand in the window', () => {
    expect(resourceConflicts([bar('a','2027-01-10T01:00:00Z','2027-01-10T02:00:00Z',2),bar('b','2027-01-10T02:00:00Z','2027-01-10T03:00:00Z',2)],3)).toEqual([])
  })
  it('flags quantity over capacity only during the real overlap', () => {
    const overlaps=resourceConflicts([bar('a','2027-01-10T01:00:00Z','2027-01-10T03:00:00Z',2),bar('b','2027-01-10T02:00:00Z','2027-01-10T04:00:00Z',2)],3)
    expect(overlaps).toHaveLength(1);expect(overlaps[0]?.start).toBe('2027-01-10T02:00:00.000Z')
  })
  it('excludes completed, draft and unreserved quote rows from commitments', () => {
    for(const kind of ['Completed','Draft','Quote'] as const)expect(resourceConflicts([bar('a','2027-01-10T01:00:00Z','2027-01-10T03:00:00Z'),bar('b','2027-01-10T01:00:00Z','2027-01-10T03:00:00Z',1,kind)])).toEqual([])
  })
  it('moves both exact instants together across the Kathmandu operational boundary', () => {
    expect(shiftedRentalWindow('2027-01-10T00:14:00Z','2027-01-11T00:16:00Z',-2)).toEqual({pickupAt:'2027-01-08T00:14:00.000Z',returnAt:'2027-01-09T00:16:00.000Z'})
  })
  it('refuses a fractional shift and invalid stored interval', () => {
    expect(()=>shiftedRentalWindow('2027-01-10T00:00:00Z','2027-01-11T00:00:00Z',0.5)).toThrow(/Reload/)
    expect(()=>shiftedRentalWindow('invalid','2027-01-11T00:00:00Z',1)).toThrow(/Reload/)
  })
})
