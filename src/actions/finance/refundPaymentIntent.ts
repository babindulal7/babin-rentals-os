/**
 * src/actions/finance/refundPaymentIntent.ts
 *
 * Action to record an online payment refund or store account credit (T7-07, B39).
 * Calls Postgres RPC public.record_online_payment_refund.
 *
 * Law 4: Allocated payments mint an immutable payment_reversals row, never updating the original payment.
 * Law 6: Restricted to money roles (Owner, Admin, Manager, Accounts).
 */

import { supabase } from '../../lib/supabase'

export interface RefundPaymentIntentParams {
  intentId: string
  refundType: 'wallet_refund' | 'account_credit'
  refundRef?: string | null | undefined
  reason?: string | null | undefined
}

export interface RefundPaymentIntentResult {
  success: boolean
  intent_id: string
  refund_type: 'wallet_refund' | 'account_credit'
  refund_ref: string | null
  status: string
  reversal_id?: string | null
  account_credit_id?: string | null
  amount_paisa?: number
  already_refunded?: boolean
  error?: string
}

export async function refundPaymentIntent(
  params: RefundPaymentIntentParams
): Promise<RefundPaymentIntentResult> {
  const { data, error } = await supabase.rpc('record_online_payment_refund', {
    p_intent_id: params.intentId,
    p_refund_type: params.refundType,
    p_refund_ref: params.refundRef ?? null,
    p_reason: params.reason ?? null,
  })

  if (error) {
    throw new Error(error.message || 'Failed to record online payment refund')
  }

  return data as RefundPaymentIntentResult
}
