import { supabase } from '../../lib/supabase'

export interface PauseClientRemindersInput {
  clientId: string
  reason: string
  clientUuid?: string
}

export interface ResumeClientRemindersInput {
  clientId: string
  clientUuid?: string
}

/**
 * Pauses automatic payment reminders for a client via `pause_client_payment_reminders` (0219).
 * Carries a `client_uuid` idempotency key (Law 8).
 */
export async function pauseClientReminders(input: PauseClientRemindersInput): Promise<void> {
  const reason = input.reason.trim()
  if (!reason) {
    throw new Error('A reason is required to pause payment reminders.')
  }
  const clientUuid = input.clientUuid ?? crypto.randomUUID()
  const { error } = await supabase.rpc('pause_client_payment_reminders', {
    p_client_uuid: clientUuid,
    p_client_id: input.clientId,
    p_reason: reason,
  })
  if (error) {
    throw new Error(error.message || 'Could not pause payment reminders.')
  }
}

/**
 * Resumes automatic payment reminders for a client via `resume_client_payment_reminders` (0219).
 * Carries a `client_uuid` idempotency key (Law 8).
 */
export async function resumeClientReminders(input: ResumeClientRemindersInput): Promise<void> {
  const clientUuid = input.clientUuid ?? crypto.randomUUID()
  const { error } = await supabase.rpc('resume_client_payment_reminders', {
    p_client_uuid: clientUuid,
    p_client_id: input.clientId,
  })
  if (error) {
    throw new Error(error.message || 'Could not resume payment reminders.')
  }
}
