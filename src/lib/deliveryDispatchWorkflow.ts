import type { SystemRole } from '../types/database'

/**
 * UI preview/validation of migration 0164's server-owned transition model.
 * The server RPC and its immutable event table remain authoritative.
 * Do NOT optimistically update the UI from this helper before an RPC succeeds.
 */
export type DispatchStatus = 'Scheduled' | 'Ready' | 'In Transit' | 'Delivered' | 'Failed'
export type DispatchLeg = 'Outbound' | 'Return'

export interface DispatchState {
  status: DispatchStatus
  leg: DispatchLeg
  assignedDriverId: string | null
  riderName?: string | null
  bookingStage: string
  cancelled: boolean
}

export interface DispatchActor {
  id: string | null
  role: SystemRole | null
  /** Branch is the *server-verified* branch for this actor, not a client claim. */
  branchMatches: boolean
}

export interface DispatchTransition {
  next: DispatchStatus
  recipientName?: string
  note?: string
}

export const DISPATCH_STATES: readonly DispatchStatus[] =
  ['Scheduled', 'Ready', 'In Transit', 'Delivered', 'Failed']

/** Check UI intent only; status changes still require a signed server RPC. */
export function checkDispatchTransition(
  state: DispatchState, actor: DispatchActor, request: DispatchTransition,
): string | null {
  if (!actor.id || !actor.role) return 'Sign in before changing a dispatch.'
  if (state.cancelled) return 'Cancelled bookings cannot be dispatched.'
  if (state.status === 'Delivered' || state.status === 'Failed') {
    return 'Completed and failed delivery jobs cannot be edited.'
  }

  const manager = actor.role === 'Owner' || actor.role === 'Admin'
    || (actor.branchMatches && (actor.role === 'Manager' || actor.role === 'Coordinator'))
  const warehouse = actor.role === 'Warehouse' && actor.branchMatches
  const assignedDriver = actor.role === 'Driver' && state.assignedDriverId === actor.id

  const valid =
    (state.status === 'Scheduled' && request.next === 'Ready' && (manager || warehouse))
    || (state.status === 'Ready' && request.next === 'In Transit' && (manager || assignedDriver))
    || (state.status === 'In Transit' && request.next === 'Delivered' && (manager || assignedDriver))
    || (request.next === 'Failed' && manager)

  if (!valid) return 'This transition is not permitted for the role or current status.'
  if (state.leg === 'Outbound' && (request.next === 'Ready' || request.next === 'In Transit')
    && !['Packed', 'On Rent'].includes(state.bookingStage)) {
    return 'Finish packing before dispatching outbound equipment.'
  }
  if (request.next === 'In Transit' && !state.assignedDriverId && !state.riderName?.trim()) {
    return 'Assign an active driver or hired rider before marking In Transit.'
  }
  if (request.next === 'Delivered' && (request.recipientName?.trim().length ?? 0) < 2) {
    return 'Record the receiver name as proof of delivery.'
  }
  if (request.next === 'Failed' && (request.note?.trim().length ?? 0) < 10) {
    return 'Explain a failed delivery with at least ten characters.'
  }
  return null
}
