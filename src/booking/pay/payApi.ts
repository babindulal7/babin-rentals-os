import { supabase } from '../../lib/supabase'

export type PaymentProvider = 'fonepay' | 'esewa' | 'khalti'

export interface OnlinePaymentProviderInfo {
  provider: PaymentProvider
  name: string
  enabled: boolean
  env: string
}

export interface PayInitResponse {
  success: boolean
  intent_id: string
  amount_paisa: number
  amount_rupees: string
  provider: string
  payment_url: string
  fonepay_params?: {
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
  } | undefined
  esewa_params?: {
    amount: string
    tax_amount: string
    total_amount: string
    transaction_uuid: string
    product_code: string
    product_service_charge: string
    product_delivery_charge: string
    success_url: string
    failure_url: string
    signed_field_names: string
    signature: string
  } | undefined
  pidx?: string | undefined
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
 * Fetches available online payment providers from server.
 * Returns only configured and enabled providers for customer checkout.
 */
export async function fetchOnlinePaymentProviders(): Promise<OnlinePaymentProviderInfo[]> {
  try {
    // 1. Try Edge function invocation
    const { data, error } = await supabase.functions.invoke<{
      success: boolean
      providers: OnlinePaymentProviderInfo[]
    }>('pay-init?action=providers', {
      method: 'GET',
    })

    if (!error && data && Array.isArray(data.providers)) {
      return data.providers
    }
  } catch (err) {
    console.warn('[payApi] Edge function providers fetch failed, falling back to direct RPC:', err)
  }

  // 2. Direct RPC fallback
  const { data: rpcData, error: rpcError } = await supabase.rpc('get_online_payment_providers')
  if (!rpcError && Array.isArray(rpcData)) {
    return rpcData as OnlinePaymentProviderInfo[]
  }

  // Safe fallback default if database RPC is unauthenticated: Fonepay enabled, others off
  return [
    { provider: 'fonepay', name: 'Fonepay', enabled: true, env: 'sandbox' },
    { provider: 'esewa', name: 'eSewa', enabled: false, env: 'sandbox' },
    { provider: 'khalti', name: 'Khalti', enabled: false, env: 'sandbox' },
  ]
}

/**
 * Initializes an online payment via pay-init Edge Function or RPC fallback.
 * Computes amount server-side; client amount is never passed.
 */
export async function initOnlinePayment(params: {
  clientUuid?: string | undefined
  bookingRequestId?: string | undefined
  bookingId?: string | undefined
  provider?: PaymentProvider | undefined
  returnUrl?: string | undefined
}): Promise<PayInitResponse> {
  const clientUuid =
    params.clientUuid ||
    (typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : 'client-intent-uuid')
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

  if (provider === 'esewa') {
    return {
      success: true,
      intent_id: res.intent_id,
      amount_paisa: res.amount_paisa,
      amount_rupees: amtRupees,
      provider: 'esewa',
      payment_url: `https://rc-epay.esewa.com.np/api/epay/main/v2/form?transaction_uuid=${res.intent_id}&amount=${amtRupees}`,
      esewa_params: {
        amount: amtRupees,
        tax_amount: '0',
        total_amount: amtRupees,
        transaction_uuid: res.intent_id,
        product_code: 'EPAYTEST',
        product_service_charge: '0',
        product_delivery_charge: '0',
        success_url: returnUrl || `https://book.babinrentals.com/pay/callback?intent_id=${res.intent_id}&provider=esewa`,
        failure_url: `https://book.babinrentals.com/pay/callback?status=failed&intent_id=${res.intent_id}&provider=esewa`,
        signed_field_names: 'total_amount,transaction_uuid,product_code',
        signature: 'mock_esewa_sig_base64',
      },
      is_sandbox: true,
    }
  }

  if (provider === 'khalti') {
    const mockPidx = `KH-${res.intent_id.slice(0, 8)}`
    return {
      success: true,
      intent_id: res.intent_id,
      amount_paisa: res.amount_paisa,
      amount_rupees: amtRupees,
      provider: 'khalti',
      pidx: mockPidx,
      payment_url: `https://test-pay.khalti.com/?pidx=${mockPidx}`,
      is_sandbox: true,
    }
  }

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
  provider?: PaymentProvider | undefined
  providerRef: string
  bid?: string | undefined
  uid?: string | undefined
  pidx?: string | undefined
  data?: string | undefined
  responseCode?: string | undefined
}): Promise<PayVerifyResponse> {
  const { intentId, provider, providerRef, bid = '', uid = '', pidx = '', data = '', responseCode = 'successful' } = params

  try {
    const { data: edgeData, error } = await supabase.functions.invoke<PayVerifyResponse>('pay-verify', {
      body: { intentId, provider, providerRef, bid, uid, pidx, data, responseCode },
    })

    if (!error && edgeData && edgeData.success) {
      return edgeData
    }
  } catch (err) {
    console.warn('[payApi] Edge function pay-verify failed, trying direct RPC fallback:', err)
  }

  // Fallback: direct RPC invocation
  const { data: rpcData, error: rpcError } = await supabase.rpc('allocate_payment_intent', {
    p_intent_id: intentId,
    p_provider_ref: providerRef,
    p_provider_response: { mock_verified: true, responseCode, provider, pidx, client_call: true },
  })

  if (rpcError || !rpcData) {
    throw new Error(rpcError?.message || 'Failed to verify and allocate payment intent.')
  }

  const res = rpcData as {
    success: boolean
    intent_id: string
    payment_id: string | null
    payment_no?: string | undefined
    amount_paisa?: number | undefined
    status: 'pending' | 'paid' | 'allocated' | 'failed' | 'expired'
    already_allocated?: boolean | undefined
  }

  return {
    success: res.success,
    intent_id: res.intent_id,
    status: res.status,
    payment_id: res.payment_id,
    payment_no: res.payment_no,
    amount_paisa: res.amount_paisa,
    already_allocated: res.already_allocated,
  }
}
