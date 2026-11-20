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
  error?: string | undefined
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

  // Safe fallback default if database RPC is unauthenticated: Fonepay enabled, others off
  return [
    { provider: 'fonepay', name: 'Fonepay', enabled: true, env: 'sandbox' },
    { provider: 'esewa', name: 'eSewa', enabled: false, env: 'sandbox' },
    { provider: 'khalti', name: 'Khalti', enabled: false, env: 'sandbox' },
  ]
}

/**
 * Initialize payment through the trusted server only.
 * A failed Edge call must never synthesize a checkout or create an intent in-browser.
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

  const { data, error } = await supabase.functions.invoke<PayInitResponse>('pay-init', {
    body: { clientUuid, bookingRequestId, bookingId, token, provider, returnUrl },
  })

  if (error) {
    throw new Error(error.message || 'Could not initialize payment with the server.')
  }
  if (!data?.success) {
    throw new Error(data?.error || 'Payment initialization failed; no checkout was created.')
  }
  return data
}

/**
 * Requests server-to-server payment verification.
 * An Edge failure NEVER falls back to a browser-callable money RPC (D30).
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
  const { intentId, provider, providerRef, bid = '', uid = '', pidx = '', data = '', responseCode = '' } = params

  const { data: result, error } = await supabase.functions.invoke<PayVerifyResponse>('pay-verify', {
    body: { intentId, provider, providerRef, bid, uid, pidx, data, responseCode },
  })

  if (error) {
    throw new Error(error.message || 'Payment verification could not be completed.')
  }
  if (!result?.success) {
    throw new Error(result?.error || 'Payment verification failed; no payment has been recorded.')
  }
  return result
}
