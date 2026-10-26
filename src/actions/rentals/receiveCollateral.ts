import { supabase } from '../../lib/supabase'
import { generateClientUuid } from '../../lib/dataAccess'
import { logAuditEvent } from '../../lib/audit'
import { canManageCollateral } from '../../lib/rbac'
import type { ActionContext } from '../core'
import type { CollateralType } from '../../types/database'

export interface ReceiveCollateralInput {
  bookingId: string
  clientUuid?: string
  collateralType: CollateralType
  documentNumber: string
  evidenceFileId?: string | null | undefined
  notes?: string | null | undefined
}

export interface ReceiveCollateralResult {
  success: true
  collateralId: string
  bookingId: string
  collateralType: CollateralType
}

export const receiveCollateralConfig = {
  name: 'rentals.receiveCollateral',
  capability: 'collateral.receive',
  permissions: ['collateral.receive'],
  implemented: true,
}

/**
 * Records an ID card document held as deposit collateral in lieu of cash (Ruling D1, Task T2-03).
 * Law 5: Collateral is strictly non-monetary; never enters Rental Total, reports, or outstanding balances.
 * Gate 4: Held collateral satisfies the deposit gate at Handover.
 */
export async function receiveCollateral(
  input: ReceiveCollateralInput,
  ctx: ActionContext,
): Promise<ReceiveCollateralResult> {
  if (!ctx.userId || !ctx.role) {
    throw new Error('Not recorded — an active authenticated session is required.')
  }
  if (!canManageCollateral(ctx.role)) {
    throw new Error(`Role ${ctx.role} is not permitted to receive collateral documents.`)
  }
  if (!input.bookingId) {
    throw new Error('A booking ID is required to record collateral.')
  }
  if (!input.documentNumber || input.documentNumber.trim() === '') {
    throw new Error('A document number is required.')
  }

  const clientUuid = input.clientUuid ?? generateClientUuid()

  const { data: booking, error: bErr } = await supabase
    .from('bookings')
    .select('id, branch_id')
    .eq('id', input.bookingId)
    .maybeSingle()

  if (bErr || !booking) {
    throw new Error(`Booking ${input.bookingId} not found: ${bErr?.message ?? 'unknown'}`)
  }

  const { data: inserted, error: insErr } = await supabase
    .from('collateral_documents')
    .insert({
      client_uuid: clientUuid,
      booking_id: input.bookingId,
      collateral_type: input.collateralType,
      document_number: input.documentNumber.trim(),
      evidence_file_id: input.evidenceFileId ?? null,
      notes: input.notes?.trim() || null,
      held_by: ctx.userId,
      created_by: ctx.userId,
    })
    .select('id')
    .single()

  if (insErr || !inserted) {
    throw new Error(`Failed to record collateral document: ${insErr?.message ?? 'unknown'}`)
  }

  await logAuditEvent({
    module: 'Rentals',
    action: 'Create',
    tableName: 'collateral_documents',
    recordId: inserted.id,
    actorId: ctx.userId,
    actorRole: ctx.role,
    branchId: booking.branch_id,
    newValues: {
      booking_id: input.bookingId,
      collateral_type: input.collateralType,
      notes: input.notes?.trim() || null,
    },
  })

  return {
    success: true,
    collateralId: inserted.id,
    bookingId: input.bookingId,
    collateralType: input.collateralType,
  }
}
