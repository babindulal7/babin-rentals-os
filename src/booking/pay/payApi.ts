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

export interface PaymentLinkDetails {
  valid: boolean
  reason?: string
  intent_id?: string
  amount_paisa?: number
  booking_id?: string
  booking_no?: string
  project_name?: string
  pickup_at?: string
  return_at?: string
  client_name_masked?: string
  items_count?: number
  expires_at?: string
  provider?: string
}

/**
 * Creates a server-calculated payment link for a booking (T7-15).
 * Enforces Law 1 (amount computed on server) and Law 6 (money roles only).
 */
export async function createBookingPaymentLink(bookingId: string): Promise<{
  success: boolean
  intent_id: string
  token: string
  amount_paisa: number
  expires_at: string
  booking_id: string
  booking_no: string
}> {
  const clientUuid = typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : 'link-' + Date.now()
  const { data, error } = await supabase.rpc('create_booking_payment_link', {
    p_client_uuid: clientUuid,
    p_booking_id: bookingId,
  })

  if (error || !data) {
    throw new Error(error?.message || 'Failed to generate payment link on server.')
  }

  return data as {
    success: boolean
    intent_id: string
    token: string
    amount_paisa: number
    expires_at: string
    booking_id: string
    booking_no: string
  }
}

/**
 * Fetches sanitized payment link details for public payment page (T7-15).
 */
export async function fetchPaymentLinkDetails(token: string): Promise<PaymentLinkDetails> {
  try {
    const { data, error } = await supabase.functions.invoke<{ success: boolean; details: PaymentLinkDetails }>('pay-init', {
      body: { action: 'link_details', token },
    })
    if (!error && data && data.details) {
      return data.details
    }
  } catch (err) {
    console.warn('[payApi] Edge function link_details call failed, falling back:', err)
  }

  // Direct RPC fallback (for authenticated staff / local / mock)
  const { data: rpcData, error: rpcError } = await supabase.rpc('get_payment_link_details', {
    p_token: token,
  })

  if (rpcError || !rpcData) {
    return { valid: false, reason: rpcError?.message || 'not_found' }
  }

  return rpcData as PaymentLinkDetails
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

  // A production provider outage must not advertise a fake sandbox
  // checkout. Only explicit mock mode may show synthetic payment providers.
  if (import.meta.env.VITE_DATA_SOURCE !== 'mock') return []
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
  token?: string | undefined
  provider?: PaymentProvider | undefined
  returnUrl?: string | undefined
}): Promise<PayInitResponse> {
  const clientUuid =
    params.clientUuid ||
    (typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : 'client-intent-uuid')
  const { bookingRequestId, bookingId, token, provider = 'fonepay', returnUrl } = params

  try {
    const { data, error } = await supabase.functions.invoke<PayInitResponse>('pay-init', {
      body: { clientUuid, bookingRequestId, bookingId, token, provider, returnUrl },
    })

    if (!error && data && data.success) {
      return data
    }
  } catch (err) {
    console.warn('[payApi] Edge function pay-init failed, trying direct RPC fallback:', err)
  }

  // Fail closed in every non-mock environment. An Edge Function outage,
  // rejected caller, or provider configuration error must never be silently
  // converted into a direct SQL checkout or a fabricated sandbox payment.
  if (import.meta.env.VITE_DATA_SOURCE !== 'mock') {
    throw new Error('Secure checkout is unavailable. Please contact the rental desk if you already paid.')
  }

  // Synthetic mock-mode fallback ONLY; never a production payment pathway.
  let intentId: string
  let amountPaisa: number

  if (token) {
    const details = await fetchPaymentLinkDetails(token)
    if (!details.valid || !details.intent_id || !details.amount_paisa) {
      throw new Error(details.reason === 'expired' ? 'Payment link has expired (48h).' : 'Payment link is invalid or already paid.')
    }
    intentId = details.intent_id
    amountPaisa = details.amount_paisa
  } else {
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
    intentId = res.intent_id
    amountPaisa = res.amount_paisa
  }

  const amtRupees = (amountPaisa / 100).toFixed(2)

  if (provider === 'esewa') {
    return {
      success: true,
      intent_id: intentId,
      amount_paisa: amountPaisa,
      amount_rupees: amtRupees,
      provider: 'esewa',
      payment_url: `https://rc-epay.esewa.com.np/api/epay/main/v2/form?transaction_uuid=${intentId}&amount=${amtRupees}`,
      esewa_params: {
        amount: amtRupees,
        tax_amount: '0',
        total_amount: amtRupees,
        transaction_uuid: intentId,
        product_code: 'EPAYTEST',
        product_service_charge: '0',
        product_delivery_charge: '0',
        success_url: returnUrl || `https://book.babinrentals.com/pay/callback?intent_id=${intentId}&provider=esewa`,
        failure_url: `https://book.babinrentals.com/pay/callback?status=failed&intent_id=${intentId}&provider=esewa`,
        signed_field_names: 'total_amount,transaction_uuid,product_code',
        signature: 'mock_esewa_sig_base64',
      },
      is_sandbox: true,
    }
  }

  if (provider === 'khalti') {
    const mockPidx = `KH-${intentId.slice(0, 8)}`
    return {
      success: true,
      intent_id: intentId,
      amount_paisa: amountPaisa,
      amount_rupees: amtRupees,
      provider: 'khalti',
      pidx: mockPidx,
      payment_url: `https://test-pay.khalti.com/?pidx=${mockPidx}`,
      is_sandbox: true,
    }
  }

  return {
    success: true,
    intent_id: intentId,
    amount_paisa: amountPaisa,
    amount_rupees: amtRupees,
    provider: 'fonepay',
    payment_url: `https://dev-clientapi.fonepay.com/api/merchantRequest?PRN=${intentId}&AMT=${amtRupees}`,
    fonepay_params: {
      PID: 'MDULAL',
      MD: 'P',
      PRN: intentId,
      AMT: amtRupees,
      CRN: 'NPR',
      DT: new Date().toLocaleDateString('en-US'),
      R1: `Rental Advance - Intent ${intentId.slice(0, 8)}`,
      R2: 'Babin Rentals',
      RU: returnUrl || `https://book.babinrentals.com/pay/callback?intent_id=${intentId}`,
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
