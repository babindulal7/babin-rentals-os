import { describe, expect, it } from 'vitest'
import {
  checkDispatchTransition,
  type DispatchActor,
  type DispatchState,
} from '../deliveryDispatchWorkflow'

const owner: DispatchActor = { id: 'owner', role: 'Owner', branchMatches: false }
const warehouse: DispatchActor = { id: 'floor', role: 'Warehouse', branchMatches: true }
const driver: DispatchActor = { id: 'driver', role: 'Driver', branchMatches: true }
const otherDriver: DispatchActor = { id: 'another-driver', role: 'Driver', branchMatches: true }

const base: DispatchState = {
  status: 'Scheduled',
  leg: 'Outbound',
  bookingStage: 'Packed',
  assignedDriverId: 'driver',
  cancelled: false,
}

describe('audited dispatch workflow intent (database remains authoritative)', () => {
  it('allows Warehouse to prepare a packed job but not dispatch or finish it', () => {
    expect(checkDispatchTransition(base, warehouse, { next: 'Ready' })).toBeNull()
    expect(checkDispatchTransition({ ...base, status: 'Ready' }, warehouse, { next: 'In Transit' }))
      .toMatch(/not permitted/)
  })

  it('limits driver movement to the named assigned driver only', () => {
    const ready = { ...base, status: 'Ready' as const }
    expect(checkDispatchTransition(ready, driver, { next: 'In Transit' })).toBeNull()
    expect(checkDispatchTransition(ready, otherDriver, { next: 'In Transit' }))
      .toMatch(/not permitted/)
  })

  it('requires real receiving-person proof for delivery completion', () => {
    const inTransit = { ...base, status: 'In Transit' as const }
    expect(checkDispatchTransition(inTransit, driver, { next: 'Delivered' }))
      .toMatch(/receiver name/)
    expect(checkDispatchTransition(inTransit, driver, { next: 'Delivered', recipientName: '  R  ' }))
      .toMatch(/receiver name/)
    expect(checkDispatchTransition(inTransit, driver, { next: 'Delivered', recipientName: 'Production Manager' }))
      .toBeNull()
  })

  it('requires manager-level authority and a ten-character note for failure', () => {
    expect(checkDispatchTransition(base, warehouse, { next: 'Failed', note: 'Undeliverable' }))
      .toMatch(/not permitted/)
    expect(checkDispatchTransition(base, owner, { next: 'Failed', note: 'bad' }))
      .toMatch(/ten characters/)
    expect(checkDispatchTransition(base, owner, { next: 'Failed', note: 'Vehicle broke down' }))
      .toBeNull()
  })

  it('never sends unassigned jobs out on the road', () => {
    expect(checkDispatchTransition({ ...base, status: 'Ready', assignedDriverId: null },
      owner, { next: 'In Transit' })).toMatch(/Assign/)
  })

  it('requires packing for outbound and does not change booking stage itself', () => {
    expect(checkDispatchTransition({ ...base, bookingStage: 'Booked' },
      warehouse, { next: 'Ready' })).toMatch(/packing/)
    expect(checkDispatchTransition({ ...base, leg: 'Return', bookingStage: 'Booked' },
      warehouse, { next: 'Ready' })).toBeNull()
  })

  it('denies closed, failed, cancelled and anonymous sessions', () => {
    expect(checkDispatchTransition({ ...base, status: 'Delivered' },
      owner, { next: 'Ready' })).toMatch(/cannot be edited/)
    expect(checkDispatchTransition({ ...base, status: 'Failed' },
      owner, { next: 'Ready' })).toMatch(/cannot be edited/)
    expect(checkDispatchTransition({ ...base, cancelled: true },
      owner, { next: 'Ready' })).toMatch(/Cancelled/)
    expect(checkDispatchTransition(base,
      { id: null, role: null, branchMatches: false }, { next: 'Ready' })).toMatch(/Sign in/)
  })

  it('cannot let a cross-branch coordinator dispatch', () => {
    expect(checkDispatchTransition(base,
      { id: 'staff', role: 'Coordinator', branchMatches: false },
      { next: 'Ready' })).toMatch(/not permitted/)
  })
})
