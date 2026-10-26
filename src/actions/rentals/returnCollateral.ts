import { supabase } from '../../lib/supabase'
import { logAuditEvent } from '../../lib/audit'
import { canManageCollateral } from '../../lib/rbac'
import type { ActionContext } from '../core'

export interface ReturnCollateralInput {
  collateralId?: string
  bookingId: string
  clientUuid?: string
  notes?: string | null | undefined
}

export interface ReturnCollateralResult {
  success: true
  collateralId: string
  bookingId: string
  returnedAt: string
}

export const returnCollateralConfig = {
  name: 'rentals.returnCollateral',
  capability: 'collateral.return',
  permissions: ['collateral.return'],
  implemented: true,
}

/**
 * Records return of held collateral (ID card) to the client upon return of rental gear (Ruling D1, Task T2-03).
 * Close Gate: Close is refused while collateral remains held (gate.close.collateral_held).
 */
export async function returnCollateral(
  input: ReturnCollateralInput,
  ctx: ActionContext,
): Promise<ReturnCollateralResult> {
  if (!ctx.userId || !ctx.role) {
    throw new Error('Not recorded — an active authenticated session is required.')
  }
  if (!canManageCollateral(ctx.role)) {
    throw new Error(`Role ${ctx.role} is not permitted to return collateral documents.`)
  }
  if (!input.bookingId) {
    throw new Error('A booking ID is required to return collateral.')
  }

  const { data: booking, error: bErr } = await supabase
    .from('bookings')
    .select('id, branch_id')
    .eq('id', input.bookingId)
    .maybeSingle()

  if (bErr || !booking) {
    throw new Error(`Booking ${input.bookingId} not found: ${bErr?.message ?? 'unknown'}`)
  }

  // Find active collateral document
  let query = supabase
    .from('collateral_documents')
    .select('id, collateral_type')
    .eq('booking_id', input.bookingId)
    .is('returned_at', null)

  if (input.collateralId) {
    query = query.eq('id', input.collateralId)
  }

  const { data: collaterals, error: cErr } = await query

  if (cErr || !collaterals || collaterals.length === 0) {
    throw new Error('No active held collateral document found for this booking.')
  }

  const target = collaterals[0]!
  const returnedAt = new Date().toISOString()

  const { error: updErr } = await supabase
    .from('collateral_documents')
    .update({
      returned_at: returnedAt,
      returned_by: ctx.userId,
      notes: input.notes ? input.notes.trim() : undefined,
      updated_at: returnedAt,
      updated_by: ctx.userId,
    })
    .eq('id', target.id)

  if (updErr) {
    throw new Error(`Failed to update collateral document: ${updErr.message}`)
  }

  await logAuditEvent({
    module: 'Rentals',
    action: 'Update',
    tableName: 'collateral_documents',
    recordId: target.id,
    actorId: ctx.userId,
    actorRole: ctx.role,
    branchId: booking.branch_id,
    newValues: {
      booking_id: input.bookingId,
      collateral_id: target.id,
      returned_at: returnedAt,
      returned_by: ctx.userId,
    },
  })

  return {
    success: true,
    collateralId: target.id,
    bookingId: input.bookingId,
    returnedAt,
  }
}
