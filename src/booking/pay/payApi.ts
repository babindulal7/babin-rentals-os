import { supabase } from '../../lib/supabase'

export interface PayInitResponse {
  success: boolean
  intent_id: string
  amount_paisa: number
  amount_rupees: string
  provider: string
  payment_url: string
  fonepay_params: {
    PID: string
    MD: string
    PRN: string
    AMT: string
    CRN: string
    DT: string
    R1: string
    R2: string
    RU: string
    DV: string
  }
  is_sandbox?: boolean | undefined
}

export interface PayVerifyResponse {
  success: boolean
  intent_id: string
  status: 'pending' | 'paid' | 'allocated' | 'failed' | 'expired'
  payment_id?: string | null | undefined
  payment_no?: string | undefined
  amount_paisa?: number | undefined
  already_allocated?: boolean | undefined
  error?: string | undefined
}

/**
 * Initializes an online payment via pay-init Edge Function or RPC fallback.
 * Computes amount server-side; client amount is never passed.
 */
export async function initOnlinePayment(params: {
  clientUuid?: string | undefined
  bookingRequestId?: string | undefined
  bookingId?: string | undefined
  provider?: 'fonepay' | 'esewa' | 'khalti' | undefined
  returnUrl?: string | undefined
}): Promise<PayInitResponse> {
  const clientUuid = params.clientUuid || (typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : 'client-intent-uuid')
  const { bookingRequestId, bookingId, provider = 'fonepay', returnUrl } = params

  try {
    const { data, error } = await supabase.functions.invoke<PayInitResponse>('pay-init', {
      body: { clientUuid, bookingRequestId, bookingId, provider, returnUrl },
    })

    if (!error && data && data.success) {
      return data
    }
  } catch (err) {
    console.warn('[payApi] Edge function pay-init failed, trying direct RPC fallback:', err)
  }

  // Fallback: direct RPC invocation (for local / mock environment)
  const { data: rpcData, error: rpcError } = await supabase.rpc('create_payment_intent', {
    p_client_uuid: clientUuid,
    p_booking_id: bookingId || null,
    p_booking_request_id: bookingRequestId || null,
    p_provider: provider,
  })

  if (rpcError || !rpcData) {
    throw new Error(rpcError?.message || 'Failed to initialize payment intent on server.')
  }

  const res = rpcData as {
    intent_id: string
    amount_paisa: number
    provider: string
  }

  const amtRupees = (res.amount_paisa / 100).toFixed(2)
  return {
    success: true,
    intent_id: res.intent_id,
    amount_paisa: res.amount_paisa,
    amount_rupees: amtRupees,
    provider: res.provider,
    payment_url: `https://dev-clientapi.fonepay.com/api/merchantRequest?PRN=${res.intent_id}&AMT=${amtRupees}`,
    fonepay_params: {
      PID: 'MDULAL',
      MD: 'P',
      PRN: res.intent_id,
      AMT: amtRupees,
      CRN: 'NPR',
      DT: new Date().toLocaleDateString('en-US'),
      R1: `Rental Advance - Intent ${res.intent_id.slice(0, 8)}`,
      R2: 'Babin Rentals',
      RU: returnUrl || `https://book.babinrentals.com/pay/callback?intent_id=${res.intent_id}`,
      DV: 'mock_dv_hash',
    },
    is_sandbox: true,
  }
}

/**
 * Confirms payment server-to-server via pay-verify Edge Function or RPC fallback.
 * A browser redirect alone never counts (D30).
 */
export async function verifyOnlinePayment(params: {
  intentId: string
  providerRef: string
  bid?: string
  uid?: string
  responseCode?: string
}): Promise<PayVerifyResponse> {
  const { intentId, providerRef, bid = '', uid = '', responseCode = 'successful' } = params

  // Only the trusted server can write a payment ledger entry. Never treat an
  // Edge Function outage or a browser-supplied callback as receipt evidence.
  const { data, error } = await supabase.functions.invoke<PayVerifyResponse>('pay-verify', {
    body: { intentId, providerRef, bid, uid, responseCode },
  })
  if (error || !data?.success) {
    throw new Error(data?.error || error?.message || 'Payment verification unavailable. Do not pay again until the rental desk confirms the result.')
  }
  return data
}
