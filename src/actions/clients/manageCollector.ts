import { supabase } from '../../lib/supabase'
import { generateClientUuid } from '../../lib/dataAccess'
import { logAuditEvent } from '../../lib/audit'
import { canManageClientCollectors } from '../../lib/rbac'
import type { ActionContext } from '../core'
import type { ClientIdDocumentType } from '../../types/database'

export interface CreateClientCollectorInput {
  clientId: string
  clientUuid?: string | undefined
  name: string
  phone: string
  roleTitle?: string | null | undefined
  idType?: ClientIdDocumentType | null | undefined
  idNumber?: string | null | undefined
  evidenceFileId?: string | null | undefined
}

export interface CreateClientCollectorResult {
  success: true
  collectorId: string
  clientId: string
  name: string
}

export const createClientCollectorConfig = {
  name: 'clients.createClientCollector',
  capability: 'client.manage_id',
  permissions: ['client.manage_id'],
  implemented: true,
}

/**
 * Saves an authorized collector against a client record (Rulings W28, W34 / Task T2-12).
 * Enables one-tap receiver selection at Handover.
 */
export async function createClientCollector(
  input: CreateClientCollectorInput,
  ctx: ActionContext,
): Promise<CreateClientCollectorResult> {
  if (!ctx.userId || !ctx.role) {
    throw new Error('Not recorded — an active authenticated session is required.')
  }
  if (!canManageClientCollectors(ctx.role)) {
    throw new Error(`Role ${ctx.role} is not permitted to manage client collectors.`)
  }
  if (!input.clientId) {
    throw new Error('A client ID is required.')
  }
  if (!input.name || input.name.trim() === '') {
    throw new Error('Collector name is required.')
  }
  if (!input.phone || input.phone.trim() === '') {
    throw new Error('Collector phone is required.')
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

  const { data: inserted, error: insErr } = await supabase
    .from('client_collectors')
    .insert({
      client_uuid: clientUuid,
      client_id: input.clientId,
      name: input.name.trim(),
      phone: input.phone.trim(),
      role_title: input.roleTitle?.trim() || null,
      id_type: input.idType ?? null,
      id_number: input.idNumber?.trim() || null,
      evidence_file_id: input.evidenceFileId ?? null,
      is_active: true,
      created_by: ctx.userId,
      updated_by: ctx.userId,
    })
    .select('id')
    .single()

  if (insErr || !inserted) {
    throw new Error(`Failed to save client collector: ${insErr?.message ?? 'unknown'}`)
  }

  await logAuditEvent({
    module: 'Clients',
    action: 'Create',
    tableName: 'client_collectors',
    recordId: inserted.id,
    actorId: ctx.userId,
    actorRole: ctx.role,
    newValues: {
      client_id: input.clientId,
      name: input.name.trim(),
      phone: input.phone.trim(),
      role_title: input.roleTitle?.trim() || null,
      id_type: input.idType ?? null,
      has_photo: Boolean(input.evidenceFileId),
    },
  })

  return {
    success: true,
    collectorId: inserted.id,
    clientId: input.clientId,
    name: input.name.trim(),
  }
}

export async function deactivateClientCollector(
  collectorId: string,
  ctx: ActionContext,
): Promise<{ success: true; collectorId: string }> {
  if (!ctx.userId || !ctx.role) {
    throw new Error('Not recorded — an active authenticated session is required.')
  }
  if (!canManageClientCollectors(ctx.role)) {
    throw new Error(`Role ${ctx.role} is not permitted to manage client collectors.`)
  }

  const { error } = await supabase
    .from('client_collectors')
    .update({ is_active: false, updated_by: ctx.userId, updated_at: new Date().toISOString() })
    .eq('id', collectorId)

  if (error) {
    throw new Error(`Failed to deactivate client collector: ${error.message}`)
  }

  await logAuditEvent({
    module: 'Clients',
    action: 'Update',
    tableName: 'client_collectors',
    recordId: collectorId,
    actorId: ctx.userId,
    actorRole: ctx.role,
    newValues: { is_active: false },
  })

  return { success: true, collectorId }
}
