/**
 * src/lib/queries/reconciliation.ts
 *
 * Queries for online payment reconciliation and online payment intents (T7-07, B39).
 * Law 6: Enforced by Postgres RLS and auth_can_view_money().
 */

import { supabase } from '../supabase'
import type { Paisa } from '../money'

export interface OnlineReconciliationRow {
  provider: string
  day: string
  total_intents: number
  paid_intents: number
  allocated_intents: number
  refunded_intents: number
  total_collected_paisa: Paisa
  total_allocated_paisa: Paisa
  total_refunded_paisa: Paisa
  flagged_unreconciled_intents: number
}

export interface PaymentIntentRow {
  id: string
  client_uuid: string
  booking_id: string | null
  booking_request_id: string | null
  client_id: string | null
  provider: string
  amount_paisa: Paisa
  status: 'created' | 'pending' | 'paid' | 'allocated' | 'refunded' | 'failed' | 'expired'
  provider_ref: string | null
  payment_id: string | null
  paid_at: string | null
  allocated_at: string | null
  refunded_at: string | null
  refund_ref: string | null
  refund_reason: string | null
  refund_type: 'wallet_refund' | 'account_credit' | null
  created_at: string
}

export async function fetchOnlineReconciliation(
  startDate?: string,
  endDate?: string
): Promise<OnlineReconciliationRow[]> {
  const { data, error } = await supabase.rpc('get_online_payment_reconciliation', {
    p_start_date: startDate ?? null,
    p_end_date: endDate ?? null,
  })

  if (error) {
    throw new Error(error.message || 'Failed to fetch online payment reconciliation')
  }

  const raw = (data || []) as Array<{
    provider: string
    day: string
    total_intents: string | number
    paid_intents: string | number
    allocated_intents: string | number
    refunded_intents: string | number
    total_collected_paisa: string | number
    total_allocated_paisa: string | number
    total_refunded_paisa: string | number
    flagged_unreconciled_intents: string | number
  }>

  return raw.map((r) => ({
    provider: r.provider,
    day: r.day,
    total_intents: Number(r.total_intents),
    paid_intents: Number(r.paid_intents),
    allocated_intents: Number(r.allocated_intents),
    refunded_intents: Number(r.refunded_intents),
    total_collected_paisa: Number(r.total_collected_paisa) as Paisa,
    total_allocated_paisa: Number(r.total_allocated_paisa) as Paisa,
    total_refunded_paisa: Number(r.total_refunded_paisa) as Paisa,
    flagged_unreconciled_intents: Number(r.flagged_unreconciled_intents),
  }))
}

export async function fetchPaymentIntents(
  statusFilter?: string,
  limit: number = 50
): Promise<PaymentIntentRow[]> {
  let query = supabase
    .from('payment_intents')
    .select(
      'id, client_uuid, booking_id, booking_request_id, client_id, provider, amount_paisa, status, provider_ref, payment_id, paid_at, allocated_at, refunded_at, refund_ref, refund_reason, refund_type, created_at'
    )
    .order('created_at', { ascending: false })
    .limit(limit)

  if (statusFilter && statusFilter !== 'all') {
    query = query.eq('status', statusFilter)
  }

  const { data, error } = await query

  if (error) {
    throw new Error(error.message || 'Failed to fetch payment intents')
  }

  return (data || []) as PaymentIntentRow[]
}
