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
  total_amount_paisa?: number
  advance_due_paisa?: number
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
 * Simulates booking payment links in the isolated mock environment (T7-15).
 * Hosted link creation remains held.
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
  if (import.meta.env.VITE_DATA_SOURCE === 'mock') {
    const token = 'mock-link-' + (bookingId ? bookingId.slice(0, 8) : Date.now().toString())
    const expiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString()
    return {
      success: true,
      intent_id: 'intent-mock-' + (bookingId ? bookingId.slice(0, 8) : Date.now().toString()),
      token,
      amount_paisa: 500000,
      expires_at: expiresAt,
      booking_id: bookingId,
      booking_no: 'BK-MOCK-1',
    }
  }

  throw new Error('Online payment links are temporarily unavailable. Use the approved manual payment workflow.')
}

/**
 * Fetches sanitized payment link details for public payment page (T7-15).
 */
export async function fetchPaymentLinkDetails(token: string): Promise<PaymentLinkDetails> {
  const isMock = import.meta.env.VITE_DATA_SOURCE === 'mock'
  if (isMock && (token.startsWith('mock-link-') || token.startsWith('token-mock') || token === 'token-abc-123')) {
    return {
      valid: true,
      intent_id: 'intent-' + token,
      amount_paisa: 500000,
      total_amount_paisa: 1000000,
      advance_due_paisa: 500000,
      booking_id: 'mock-booking-id',
      booking_no: 'BK-2026-0042',
      project_name: 'Documentary - Solukhumbu',
      pickup_at: '2026-11-25T06:00:00Z',
      return_at: '2026-11-30T06:00:00Z',
      client_name_masked: 'P*** a',
      items_count: 2,
      expires_at: new Date(Date.now() + 48 * 3600 * 1000).toISOString(),
      provider: 'fonepay',
    }
  }

  // An unrecognized synthetic link must never escape the isolated mock environment.
  if (isMock) return { valid: false, reason: 'not_found' }

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
  if (import.meta.env.VITE_DATA_SOURCE === 'mock') {
    return [
      { provider: 'fonepay', name: 'Fonepay', enabled: true, env: 'sandbox' },
      { provider: 'esewa', name: 'eSewa', enabled: true, env: 'sandbox' },
      { provider: 'khalti', name: 'Khalti', enabled: true, env: 'sandbox' },
    ]
  }

  // Hosted checkout remains held pending independent gateway acceptance.
  return []
}

/**
 * Initializes an online payment in the isolated mock environment; hosted checkout is held.
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
  const { bookingRequestId, bookingId, token, provider = 'fonepay', returnUrl } = params

  const isMock = import.meta.env.VITE_DATA_SOURCE === 'mock'
  let intentId: string
  let amountPaisa: number

  if (isMock) {
    if (token) {
      const details = await fetchPaymentLinkDetails(token)
      if (!details.valid || !details.intent_id || !details.amount_paisa) {
        throw new Error(details.reason === 'expired' ? 'Payment link has expired (48h).' : 'Payment link is invalid or already paid.')
      }
      intentId = details.intent_id
      amountPaisa = details.amount_paisa
    } else {
      intentId = `intent-mock-${(bookingId || bookingRequestId || Date.now()).toString().slice(0, 12)}`
      amountPaisa = 500000
    }
  } else {
    throw new Error('Online payment is temporarily unavailable. Contact Babin Rentals for payment instructions.')
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
 * Simulates payment only in the isolated mock environment; hosted settlement is held.
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
  const { intentId } = params

  if (import.meta.env.VITE_DATA_SOURCE === 'mock') {
    return {
      success: true,
      intent_id: intentId,
      status: 'allocated',
      payment_id: `pay-mock-${Date.now()}`,
      payment_no: `PAY-MOCK-${String(Date.now()).slice(-4)}`,
      already_allocated: false,
    }
  }

  throw new Error('Online payment verification is temporarily unavailable. No payment has been recorded.')
}
