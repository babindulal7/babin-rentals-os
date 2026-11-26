/**
 * Transactional email client (T5-03).
 *
 * Dispatches transactional email through Supabase Edge Function `send-email`.
 * In mock mode (IS_MOCK), records in-memory mock email log without network traffic.
 */
import { supabase, IS_MOCK } from '../supabase'

export interface SendEmailOptions {
  templateId: string
  recipientUserId?: string | undefined
  recipientEmail?: string | undefined
  entityType?: string | undefined
  entityId?: string | undefined
  language?: string | undefined
}

export interface SendEmailResult {
  success: boolean
  status: 'sent' | 'mock_sent' | 'failed'
  emailLogId?: string | undefined
  recipientEmail?: string | undefined
  error?: string | null | undefined
}

export interface MockEmailRecord {
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
  sentAt: string | null
  createdAt: string
}

let mockEmailLogs: MockEmailRecord[] = []

export function _resetMockEmailLogs(): void {
  mockEmailLogs = []
}

export function getMockEmailLogs(): MockEmailRecord[] {
  return [...mockEmailLogs]
}

/**
 * Sends a transactional email via the Edge Function send-email.
 * Server builds the message payload from database rows (stops client forging).
 * Body is never returned or stored in logs (Law 6, S13, W21).
 */
export async function sendEmail(options: SendEmailOptions): Promise<SendEmailResult> {
  const {
    templateId,
    recipientUserId,
    recipientEmail,
    entityType,
    entityId,
    language = 'en',
  } = options

  if (!templateId) {
    throw new Error('templateId is required')
  }

  if (IS_MOCK) {
    const id = `mock-email-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
    const targetEmail = recipientEmail || 'client@example.com'
    const record: MockEmailRecord = {
      id,
      clientUuid: `mock-uuid-${Date.now()}`,
      templateId,
      recipientEmail: targetEmail,
      recipientUserId: recipientUserId ?? null,
      entityType: entityType ?? null,
      entityId: entityId ?? null,
      language,
      status: 'mock_sent',
      errorMessage: null,
      sentAt: new Date().toISOString(),
      createdAt: new Date().toISOString(),
    }
    mockEmailLogs.unshift(record)

    return {
      success: true,
      status: 'mock_sent',
      emailLogId: id,
      recipientEmail: targetEmail,
    }
  }

  try {
    const { data, error } = await supabase.functions.invoke('send-email', {
      body: {
        templateId,
        recipientUserId,
        recipientEmail,
        entityType,
        entityId,
        language,
      },
    })

    if (error) {
      return {
        success: false,
        status: 'failed',
        error: error.message,
      }
    }

    return {
      success: data?.success ?? true,
      status: data?.status ?? 'sent',
      emailLogId: data?.emailLogId,
      recipientEmail: data?.recipientEmail,
      error: data?.error,
    }
  } catch (err) {
    return {
      success: false,
      status: 'failed',
      error: err instanceof Error ? err.message : String(err),
    }
  }
}
