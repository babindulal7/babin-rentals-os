import { supabase } from '../../lib/supabase'
import { generateClientUuid } from '../../lib/dataAccess'
import { logAuditEvent } from '../../lib/audit'
import { canManageClientCollectors } from '../../lib/rbac'
import type { ActionContext } from '../core'
import type { ClientIdDocumentType } from '../../types/database'

export interface RecordIdDocumentInput {
  clientId: string
  clientUuid?: string | undefined
  idType: ClientIdDocumentType
  idNumber: string
  evidenceFileId?: string | null | undefined
  expiryDate?: string | null | undefined
  notes?: string | null | undefined
}

export interface RecordIdDocumentResult {
  success: true
  documentId: string
  clientId: string
  idType: ClientIdDocumentType
}

export const recordIdDocumentConfig = {
  name: 'clients.recordIdDocument',
  capability: 'client.manage_id',
  permissions: ['client.manage_id'],
  implemented: true,
}

/**
 * Records an identity document on file for a client (Ruling W50, W51 / Task T2-12).
 * Stored once and reused across all subsequent rentals.
 * Citizenship cards do not expire (W51); passport and driving license can carry an expiry date.
 */
export async function recordIdDocument(
  input: RecordIdDocumentInput,
  ctx: ActionContext,
): Promise<RecordIdDocumentResult> {
  if (!ctx.userId || !ctx.role) {
    throw new Error('Not recorded — an active authenticated session is required.')
  }
  if (!canManageClientCollectors(ctx.role)) {
    throw new Error(`Role ${ctx.role} is not permitted to record client ID documents.`)
  }
  if (!input.clientId) {
    throw new Error('A client ID is required.')
  }
  if (!input.idNumber || input.idNumber.trim() === '') {
    throw new Error('An ID document number is required.')
  }

  const clientUuid = input.clientUuid ?? generateClientUuid()

  // Verify client exists
  const { data: client, error: cErr } = await supabase
    .from('clients')
    .select('id, name')
    .eq('id', input.clientId)
    .maybeSingle()

  if (cErr || !client) {
    throw new Error(`Client ${input.clientId} not found: ${cErr?.message ?? 'unknown'}`)
  }

  // Citizenship cards do not expire in Nepal (W51)
  const effectiveExpiry = input.idType === 'citizenship_card' ? null : (input.expiryDate?.trim() || null)

  const { data: inserted, error: insErr } = await supabase
    .from('client_id_documents')
    .insert({
      client_uuid: clientUuid,
      client_id: input.clientId,
      id_type: input.idType,
      id_number: input.idNumber.trim(),
      evidence_file_id: input.evidenceFileId ?? null,
      expiry_date: effectiveExpiry,
      verified_by: ctx.userId,
      notes: input.notes?.trim() || null,
      created_by: ctx.userId,
      updated_by: ctx.userId,
    })
    .select('id')
    .single()

  if (insErr || !inserted) {
    throw new Error(`Failed to record client ID document: ${insErr?.message ?? 'unknown'}`)
  }

  await logAuditEvent({
    module: 'Clients',
    action: 'Create',
    tableName: 'client_id_documents',
    recordId: inserted.id,
    actorId: ctx.userId,
    actorRole: ctx.role,
    newValues: {
      client_id: input.clientId,
      id_type: input.idType,
      has_photo: Boolean(input.evidenceFileId),
      expiry_date: effectiveExpiry,
      notes: input.notes?.trim() || null,
    },
  })

  return {
    success: true,
    documentId: inserted.id,
    clientId: input.clientId,
    idType: input.idType,
  }
}
