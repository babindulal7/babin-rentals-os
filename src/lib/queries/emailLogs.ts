/**
 * Email logs query layer (T5-03).
 *
 * Interacts with the `email_log_v` view and `record_email_send` RPC.
 * Maintains Law 3 (no deletion), Law 4 (immutable entries), Law 6 (money blind),
 * and strictly zero email body retention (S13, W21).
 */
import { supabase, IS_MOCK } from '../supabase'
import { getMockEmailLogs, type MockEmailRecord } from '../email/client'

export interface EmailLogEntry {
  id: string
  clientUuid: string
  templateId: string
  recipientEmail: string
  recipientUserId: string | null
  entityType: string | null
  entityId: string | null
  language: string
  status: 'pending' | 'sent' | 'failed' | 'mock_sent'
  errorMessage: string | null
  metadata?: Record<string, unknown> | null | undefined
  sentAt: string | null
  createdAt: string
}

interface EmailLogDbRow {
  id: string
  client_uuid: string
  template_id: string
  recipient_email: string
  recipient_user_id: string | null
  entity_type: string | null
  entity_id: string | null
  language: string
  status: 'pending' | 'sent' | 'failed' | 'mock_sent'
  error_message: string | null
  metadata: Record<string, unknown> | null
  sent_at: string | null
  created_at: string
}

function mapDbRow(row: EmailLogDbRow): EmailLogEntry {
  return {
    id: row.id,
    clientUuid: row.client_uuid,
    templateId: row.template_id,
    recipientEmail: row.recipient_email,
    recipientUserId: row.recipient_user_id,
    entityType: row.entity_type,
    entityId: row.entity_id,
    language: row.language,
    status: row.status,
    errorMessage: row.error_message,
    metadata: row.metadata,
    sentAt: row.sent_at,
    createdAt: row.created_at,
  }
}

/**
 * Fetch email log entries for staff review.
 * Only privileged roles (Owner, Admin, Manager, Accounts) or the recipient user
 * can view these rows via RLS / view filtering.
 */
export async function fetchEmailLogs(options?: {
  recipientUserId?: string | undefined
  entityId?: string | undefined
  templateId?: string | undefined
  limit?: number | undefined
}): Promise<EmailLogEntry[]> {
  if (IS_MOCK) {
    let list = getMockEmailLogs()
    if (options?.recipientUserId) {
      list = list.filter((l) => l.recipientUserId === options.recipientUserId)
    }
    if (options?.entityId) {
      list = list.filter((l) => l.entityId === options.entityId)
    }
    if (options?.templateId) {
      list = list.filter((l) => l.templateId === options.templateId)
    }
    if (options?.limit) {
      list = list.slice(0, options.limit)
    }
    return list.map((l: MockEmailRecord) => ({
      ...l,
      metadata: null,
    }))
  }

  let query = supabase
    .from('email_log_v')
    .select('*')
    .order('created_at', { ascending: false })

  if (options?.recipientUserId) {
    query = query.eq('recipient_user_id', options.recipientUserId)
  }
  if (options?.entityId) {
    query = query.eq('entity_id', options.entityId)
  }
  if (options?.templateId) {
    query = query.eq('template_id', options.templateId)
  }
  if (options?.limit) {
    query = query.limit(options.limit)
  }

  const { data, error } = await query

  if (error) {
    console.error('Failed to fetch email logs:', error)
    throw new Error(error.message)
  }

  return (data as unknown as EmailLogDbRow[]).map(mapDbRow)
}
