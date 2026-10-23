import { describe, it, expect } from 'vitest'
import {
  buildResourceTimeline,
  RESOURCE_CATALOGUE,
  SAVED_VIEWS,
  type Bar,
} from '../../../lib/queries/calendar'

describe('Calendar Resource Timeline & Conflict Detection Engine (Phase 5)', () => {
  const baseDay = new Date('2026-08-01T00:00:00.000Z')
  const addDays = (d: Date, n: number) => new Date(d.getTime() + n * 86_400_000)

  it('generates physical resource lanes across all 4 categories from RESOURCE_CATALOGUE', () => {
    const lanes = buildResourceTimeline([])
    expect(lanes.length).toBe(RESOURCE_CATALOGUE.length)

    const types = new Set(lanes.map((l) => l.type))
    expect(types.has('Equipment')).toBe(true)
    expect(types.has('Vehicles')).toBe(true)
    expect(types.has('Crew')).toBe(true)
    expect(types.has('Warehouse Bays')).toBe(true)

    for (const lane of lanes) {
      expect(lane.bars).toEqual([])
      expect(lane.meta).toBeDefined()
    }
  })

  it('filters resource lanes by selectedRowType', () => {
    const equipmentLanes = buildResourceTimeline([], 'Equipment')
    expect(equipmentLanes.every((l) => l.type === 'Equipment')).toBe(true)
    expect(equipmentLanes.length).toBe(9)

    const vehicleLanes = buildResourceTimeline([], 'Vehicles')
    expect(vehicleLanes.every((l) => l.type === 'Vehicles')).toBe(true)
    expect(vehicleLanes.length).toBe(2)

    const crewLanes = buildResourceTimeline([], 'Crew')
    expect(crewLanes.every((l) => l.type === 'Crew')).toBe(true)
    expect(crewLanes.length).toBe(4)

    const bayLanes = buildResourceTimeline([], 'Warehouse Bays')
    expect(bayLanes.every((l) => l.type === 'Warehouse Bays')).toBe(true)
    expect(bayLanes.length).toBe(3)
  })

  it('deterministically assigns live booking bars to resource lanes', () => {
    const mockBars: Bar[] = [
      {
        id: 'bk-101',
        kind: 'Reserved',
        label: 'BK-101',
        bookingNo: 'BK-101',
        sub: 'Everest Films',
        client: 'Everest Films',
        from: baseDay,
        to: addDays(baseDay, 2),
      },
      {
        id: 'bk-102',
        kind: 'On Rent',
        label: 'BK-102',
        bookingNo: 'BK-102',
        sub: 'Pokhara Media',
        client: 'Pokhara Media',
        from: addDays(baseDay, 5),
        to: addDays(baseDay, 7),
      },
    ]

    const lanes = buildResourceTimeline(mockBars)
    const lanesWithBars = lanes.filter((l) => l.bars.length > 0)
    expect(lanesWithBars.length).toBeGreaterThan(0)

    for (const lane of lanesWithBars) {
      expect(lane.meta).toContain('allocation')
      expect(lane.metaTone).toBe('primary')
    }
  })

  it('detects concurrent double-booking conflicts and generates Conflict bars with dot: danger', () => {
    // Two overlapping bookings on the same dates
    const overlappingBars: Bar[] = [
      {
        id: 'bk-201',
        kind: 'Reserved',
        label: 'BK-201',
        bookingNo: 'BK-201',
        client: 'Client Alpha',
        from: addDays(baseDay, 1),
        to: addDays(baseDay, 4),
      },
      {
        id: 'bk-202',
        kind: 'On Rent',
        label: 'BK-202',
        bookingNo: 'BK-202',
        client: 'Client Beta',
        from: addDays(baseDay, 2),
        to: addDays(baseDay, 5),
      },
      {
        id: 'bk-203',
        kind: 'Reserved',
        label: 'BK-203',
        bookingNo: 'BK-203',
        client: 'Client Gamma',
        from: addDays(baseDay, 3),
        to: addDays(baseDay, 6),
      },
    ]

    const lanes = buildResourceTimeline(overlappingBars)
    const conflictingLanes = lanes.filter((l) => l.bars.some((b) => b.kind === 'Conflict'))

    expect(conflictingLanes.length).toBeGreaterThan(0)

    for (const lane of conflictingLanes) {
      const conflictBars = lane.bars.filter((b) => b.kind === 'Conflict')
      expect(conflictBars.length).toBeGreaterThan(0)
      for (const cb of conflictBars) {
        expect(cb.dot).toBe('danger')
        expect(cb.label).toBe('CONFLICT')
        expect(cb.sub).toContain('Double Booking')
        expect(cb.from.getTime()).toBeLessThanOrEqual(cb.to.getTime())
      }
      expect(lane.meta).toContain('conflict')
      expect(lane.metaTone).toBe('progress')
    }
  })

  it('does not flag conflicts for sequential non-overlapping bookings', () => {
    const sequentialBars: Bar[] = [
      {
        id: 'bk-301',
        kind: 'Reserved',
        label: 'BK-301',
        bookingNo: 'BK-301',
        client: 'Client 1',
        from: baseDay,
        to: addDays(baseDay, 2),
      },
      {
        id: 'bk-302',
        kind: 'Reserved',
        label: 'BK-302',
        bookingNo: 'BK-302',
        client: 'Client 2',
        from: addDays(baseDay, 3),
        to: addDays(baseDay, 5),
      },
    ]

    const lanes = buildResourceTimeline(sequentialBars)
    const conflictBars = lanes.flatMap((l) => l.bars).filter((b) => b.kind === 'Conflict')
    expect(conflictBars.length).toBe(0)
  })

  it('excludes Completed history bookings from conflict triggers', () => {
    const completedAndActive: Bar[] = [
      {
        id: 'bk-401',
        kind: 'Completed',
        label: 'BK-401',
        bookingNo: 'BK-401',
        from: baseDay,
        to: addDays(baseDay, 4),
      },
      {
        id: 'bk-402',
        kind: 'Reserved',
        label: 'BK-402',
        bookingNo: 'BK-402',
        from: addDays(baseDay, 2),
        to: addDays(baseDay, 6),
      },
    ]

    const lanes = buildResourceTimeline(completedAndActive)
    const conflictBars = lanes.flatMap((l) => l.bars).filter((b) => b.kind === 'Conflict')
    expect(conflictBars.length).toBe(0)
  })

  it('has all 5 operational SAVED_VIEWS configured', () => {
    expect(SAVED_VIEWS.length).toBe(5)
    const names = SAVED_VIEWS.map((s) => s.name)
    expect(names).toContain('Equipment View')
    expect(names).toContain('Crew Schedule')
    expect(names).toContain('Warehouse View')
    expect(names).toContain('My Bookings')
    expect(names).toContain('Conflict View')

    const conflictView = SAVED_VIEWS.find((s) => s.name === 'Conflict View')
    expect(conflictView?.kinds).toContain('Conflict')
  })
})
