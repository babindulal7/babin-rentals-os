import { describe, it, expect } from 'vitest'
import {
  buildResourceTimeline,
  RESOURCE_CATALOGUE,
  ARCHIVED_RESOURCE_CATALOGUE,
  SAVED_VIEWS,
  type Bar,
} from '../../../lib/queries/calendar'

describe('Calendar Resource Timeline & Conflict Detection Engine (Phase 5 Correctness Fix)', () => {
  const baseDay = new Date('2026-08-01T00:00:00.000Z')
  const addDays = (d: Date, n: number) => new Date(d.getTime() + n * 86_400_000)

  it('fails closed in production: returns [] when RESOURCE_CATALOGUE is empty (no fabricated lanes)', () => {
    expect(RESOURCE_CATALOGUE).toEqual([])
    const lanes = buildResourceTimeline([])
    expect(lanes).toEqual([])
  })

  it('filters authoritative resource lanes by selectedRowType when catalogue is supplied', () => {
    const equipmentLanes = buildResourceTimeline([], 'Equipment', ARCHIVED_RESOURCE_CATALOGUE)
    expect(equipmentLanes.every((l) => l.type === 'Equipment')).toBe(true)
    expect(equipmentLanes.length).toBe(9)

    const vehicleLanes = buildResourceTimeline([], 'Vehicles', ARCHIVED_RESOURCE_CATALOGUE)
    expect(vehicleLanes.every((l) => l.type === 'Vehicles')).toBe(true)
    expect(vehicleLanes.length).toBe(2)

    const crewLanes = buildResourceTimeline([], 'Crew', ARCHIVED_RESOURCE_CATALOGUE)
    expect(crewLanes.every((l) => l.type === 'Crew')).toBe(true)
    expect(crewLanes.length).toBe(4)

    const bayLanes = buildResourceTimeline([], 'Warehouse Bays', ARCHIVED_RESOURCE_CATALOGUE)
    expect(bayLanes.every((l) => l.type === 'Warehouse Bays')).toBe(true)
    expect(bayLanes.length).toBe(3)
  })

  it('assigns bars strictly by authoritative matching unitId or resourceId, not label hash', () => {
    const mockBars: Bar[] = [
      {
        id: 'bk-101',
        kind: 'Reserved',
        label: 'BK-101',
        bookingNo: 'BK-101',
        unitId: 'SN-FX6-001',
        resourceId: 'res-fx6',
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
        unitId: 'SN-FX6-001',
        resourceId: 'res-fx6',
        sub: 'Pokhara Media',
        client: 'Pokhara Media',
        from: addDays(baseDay, 5),
        to: addDays(baseDay, 7),
      },
      {
        id: 'bk-unassigned',
        kind: 'Reserved',
        label: 'BK-999',
        bookingNo: 'BK-999',
        // No unitId or resourceId
        from: baseDay,
        to: addDays(baseDay, 3),
      },
    ]

    const lanes = buildResourceTimeline(mockBars, 'All', ARCHIVED_RESOURCE_CATALOGUE)
    const fx6Lane = lanes.find((l) => l.id === 'res-fx6')
    expect(fx6Lane).toBeDefined()
    expect(fx6Lane?.bars.length).toBe(2)
    expect(fx6Lane?.meta).toContain('2 allocations')
    expect(fx6Lane?.metaTone).toBe('primary')

    // Unassigned bar must NOT appear on any lane
    const otherLanesWithBars = lanes.filter((l) => l.id !== 'res-fx6' && l.bars.length > 0)
    expect(otherLanesWithBars.length).toBe(0)
  })

  it('detects concurrent double-booking conflicts and generates Conflict bars with dot: danger for overlapping half-open intervals', () => {
    // Two overlapping bookings on the SAME physical unit
    const overlappingBars: Bar[] = [
      {
        id: 'bk-201',
        kind: 'Reserved',
        label: 'BK-201',
        bookingNo: 'BK-201',
        unitId: 'SN-FX6-001',
        resourceId: 'res-fx6',
        client: 'Client Alpha',
        from: addDays(baseDay, 1),
        to: addDays(baseDay, 4),
      },
      {
        id: 'bk-202',
        kind: 'On Rent',
        label: 'BK-202',
        bookingNo: 'BK-202',
        unitId: 'SN-FX6-001',
        resourceId: 'res-fx6',
        client: 'Client Beta',
        from: addDays(baseDay, 2),
        to: addDays(baseDay, 5),
      },
    ]

    const lanes = buildResourceTimeline(overlappingBars, 'All', ARCHIVED_RESOURCE_CATALOGUE)
    const fx6Lane = lanes.find((l) => l.id === 'res-fx6')
    expect(fx6Lane).toBeDefined()

    const conflictBars = fx6Lane?.bars.filter((b) => b.kind === 'Conflict') ?? []
    expect(conflictBars.length).toBe(1)
    expect(conflictBars[0]?.dot).toBe('danger')
    expect(conflictBars[0]?.label).toBe('CONFLICT')
    expect(conflictBars[0]?.sub).toContain('Double Booking')
    expect(fx6Lane?.meta).toContain('1 conflict detected')
    expect(fx6Lane?.metaTone).toBe('progress')
  })

  it('does not flag conflicts for sequential back-to-back bookings on the turnover boundary [from, to)', () => {
    // Booking 1: Day 0 to Day 2
    // Booking 2: Day 2 to Day 5
    // In half-open interval [pickup, return), Day 2 is the exact handover moment and does NOT overlap
    const backToBackBars: Bar[] = [
      {
        id: 'bk-301',
        kind: 'Reserved',
        label: 'BK-301',
        bookingNo: 'BK-301',
        unitId: 'SN-FX6-001',
        resourceId: 'res-fx6',
        client: 'Client 1',
        from: baseDay,
        to: addDays(baseDay, 2),
      },
      {
        id: 'bk-302',
        kind: 'Reserved',
        label: 'BK-302',
        bookingNo: 'BK-302',
        unitId: 'SN-FX6-001',
        resourceId: 'res-fx6',
        client: 'Client 2',
        from: addDays(baseDay, 2),
        to: addDays(baseDay, 5),
      },
    ]

    const lanes = buildResourceTimeline(backToBackBars, 'All', ARCHIVED_RESOURCE_CATALOGUE)
    const fx6Lane = lanes.find((l) => l.id === 'res-fx6')
    const conflictBars = fx6Lane?.bars.filter((b) => b.kind === 'Conflict') ?? []
    expect(conflictBars.length).toBe(0)
    expect(fx6Lane?.meta).toBe('2 allocations')
  })

  it('excludes Completed history bookings from conflict triggers', () => {
    const completedAndActive: Bar[] = [
      {
        id: 'bk-401',
        kind: 'Completed',
        label: 'BK-401',
        bookingNo: 'BK-401',
        unitId: 'SN-FX6-001',
        resourceId: 'res-fx6',
        from: baseDay,
        to: addDays(baseDay, 4),
      },
      {
        id: 'bk-402',
        kind: 'Reserved',
        label: 'BK-402',
        bookingNo: 'BK-402',
        unitId: 'SN-FX6-001',
        resourceId: 'res-fx6',
        from: addDays(baseDay, 2),
        to: addDays(baseDay, 6),
      },
    ]

    const lanes = buildResourceTimeline(completedAndActive, 'All', ARCHIVED_RESOURCE_CATALOGUE)
    const fx6Lane = lanes.find((l) => l.id === 'res-fx6')
    const conflictBars = fx6Lane?.bars.filter((b) => b.kind === 'Conflict') ?? []
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
