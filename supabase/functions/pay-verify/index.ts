// =============================================================================
// pay-verify/index.ts — Supabase Edge Function for Online Payment Verify (T7-05, T7-06)
//
// Authority:
//   - T7-05 · Online payment — Fonepay first
//   - T7-06 · eSewa and Khalti payment providers
//   - Ruling D30: Server-to-server confirmation only. Browser redirect alone never counts.
//   - Law 4: Immutability on created payment rows.
//   - Law 8: Idempotent allocation. Replayed callbacks change nothing.
// =============================================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface PayVerifyRequest {
  intentId: string
  provider?: 'fonepay' | 'esewa' | 'khalti'
  providerRef?: string
  bid?: string
  uid?: string
  pidx?: string
  data?: string
  responseCode?: string
  providerResponse?: Record<string, unknown>
}

async function hmacSha512Hex(key: string, data: string): Promise<string> {
  const enc = new TextEncoder()
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    enc.encode(key),
    { name: 'HMAC', hash: 'SHA-512' },
    false,
    ['sign']
  )
  const signature = await crypto.subtle.sign('HMAC', cryptoKey, enc.encode(data))
  return Array.from(new Uint8Array(signature))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') || ''
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''

    if (!supabaseUrl || !supabaseServiceKey) {
      return new Response(
        JSON.stringify({ error: 'Server configuration error: missing service keys' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    // Handle both JSON body and URLSearchParams (from webhook callbacks / redirects)
    let body: PayVerifyRequest = {} as PayVerifyRequest
    if (req.headers.get('content-type')?.includes('application/json')) {
      body = await req.json().catch(() => ({} as PayVerifyRequest))
    } else {
      const url = new URL(req.url)
      body = {
        intentId: url.searchParams.get('intent_id') || url.searchParams.get('PRN') || url.searchParams.get('purchase_order_id') || '',
        provider: (url.searchParams.get('provider') as 'fonepay' | 'esewa' | 'khalti') || undefined,
        providerRef: url.searchParams.get('UID') || url.searchParams.get('ref') || url.searchParams.get('transaction_id') || '',
        bid: url.searchParams.get('BID') || '',
        uid: url.searchParams.get('UID') || '',
        pidx: url.searchParams.get('pidx') || '',
        data: url.searchParams.get('data') || '',
        responseCode: url.searchParams.get('RC') || '',
      }
    }

    let { intentId, provider, providerRef, bid = '', uid = '', pidx = '', data = '', responseCode } = body

    // eSewa data payload can contain encoded transaction_uuid
    if (!intentId && data) {
      try {
        const decoded = JSON.parse(atob(data))
        if (decoded.transaction_uuid) intentId = decoded.transaction_uuid
      } catch {
        // ignore decode error here
      }
    }

    if (!intentId) {
      return new Response(
        JSON.stringify({ error: 'Payment intent ID is required.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // 1. Fetch intent from database
    const { data: intent, error: intentFetchError } = await supabase
      .from('payment_intents')
      .select('*')
      .eq('id', intentId)
      .single()

    if (intentFetchError || !intent) {
      return new Response(
        JSON.stringify({ error: 'Payment intent not found.' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const effectiveProvider = provider || intent.provider
    if (!['fonepay', 'esewa', 'khalti'].includes(effectiveProvider) || (provider && provider !== intent.provider)) {
      return new Response(
        JSON.stringify({ success: false, error: 'Provider does not match the payment intent.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }
    if (['refunded', 'expired', 'failed'].includes(intent.status)) {
      return new Response(
        JSON.stringify({ success: false, error: 'Payment intent is terminal and cannot be replayed.' }),
        { status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }
    // Sandbox callbacks and missing merchant credentials are not proof of payment.
    // Only a verified production provider response may reach the money-writing RPC.
    const secretName = effectiveProvider === 'esewa'
      ? 'ESEWA_SECRET_KEY'
      : effectiveProvider === 'khalti' ? 'KHALTI_SECRET_KEY' : 'FONEPAY_SECRET_KEY'
    const envName = effectiveProvider === 'esewa'
      ? 'ESEWA_ENV' : effectiveProvider === 'khalti' ? 'KHALTI_ENV' : 'FONEPAY_ENV'
    if (!Deno.env.get(secretName) || Deno.env.get(envName) === 'sandbox') {
      return new Response(
        JSON.stringify({ success: false, error: 'Provider verification is not configured for live settlement.' }),
        { status: 503, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Idempotency: if already allocated or paid, return current state
    if (intent.status === 'allocated') {
      return new Response(
        JSON.stringify({
          success: true,
          intent_id: intent.id,
          payment_id: intent.payment_id,
          status: 'allocated',
          already_allocated: true,
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const amountRupees = (intent.amount_paisa / 100).toFixed(2)
    let verified = false
    let upstreamData: Record<string, unknown> = {}
    let finalRef = providerRef || ''

    if (effectiveProvider === 'esewa') {
      const esewaSecret = Deno.env.get('ESEWA_SECRET_KEY')
      const isSandbox = !esewaSecret || Deno.env.get('ESEWA_ENV') === 'sandbox'
      const productCode = Deno.env.get('ESEWA_PRODUCT_CODE') || 'EPAYTEST'

      let esewaDecoded: Record<string, unknown> = {}
      if (data) {
        try {
          esewaDecoded = JSON.parse(atob(data))
          finalRef = (esewaDecoded.transaction_code as string) || finalRef
        } catch {
          // ignore
        }
      }

      if (esewaSecret && !isSandbox) {
        // Query official eSewa status verification API
        try {
          const statusUrl = `https://epay.esewa.com.np/api/epay/transaction/status/?product_code=${encodeURIComponent(productCode)}&total_amount=${encodeURIComponent(amountRupees)}&transaction_uuid=${encodeURIComponent(intentId)}`
          const statusRes = await fetch(statusUrl)
          const statusJson = await statusRes.json()
          verified = statusRes.ok
            && statusJson.status === 'COMPLETE'
            && statusJson.transaction_uuid === intentId
            && statusJson.product_code === productCode
            && Number(statusJson.total_amount) === Number(amountRupees)
            && typeof statusJson.ref_id === 'string'
            && statusJson.ref_id.length > 0
          upstreamData = statusJson
          if (statusJson.ref_id) finalRef = statusJson.ref_id
        } catch (fetchErr) {
          console.error('[pay-verify] eSewa status check failed:', fetchErr)
          verified = false
        }
      } else {
        // Sandbox mode verification
        verified = false // Sandbox must not write production payments
        upstreamData = {
          mock_verified: true,
          sandbox: true,
          provider: 'esewa',
          ...esewaDecoded,
        }
      }
      // A genuine upstream payment reference is required; never mint one locally.
    } else if (effectiveProvider === 'khalti') {
      const khaltiSecret = Deno.env.get('KHALTI_SECRET_KEY')
      const isSandbox = !khaltiSecret || Deno.env.get('KHALTI_ENV') === 'sandbox'

      const initiatedPidx = (intent.provider_response as Record<string, unknown> | null)?.initiated_pidx
      if (khaltiSecret && !isSandbox && pidx && initiatedPidx === pidx) {
        try {
          const lookupRes = await fetch('https://khalti.com/api/v2/epayment/lookup/', {
            method: 'POST',
            headers: {
              'Authorization': `Key ${khaltiSecret}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ pidx }),
          })
          const lookupJson = await lookupRes.json()
          verified = lookupRes.ok
            && lookupJson.status === 'Completed'
            && lookupJson.pidx === pidx
            && Number(lookupJson.total_amount) === Number(intent.amount_paisa)
            && lookupJson.refunded === false
            && typeof lookupJson.transaction_id === 'string'
            && lookupJson.transaction_id.length > 0
          upstreamData = lookupJson
          if (lookupJson.transaction_id) finalRef = lookupJson.transaction_id
        } catch (fetchErr) {
          console.error('[pay-verify] Khalti lookup check failed:', fetchErr)
          verified = false
        }
      } else {
        // Sandbox mode verification
        verified = false // Missing or unbound pidx, or sandbox, cannot settle a payment
        upstreamData = {
          mock_verified: true,
          sandbox: true,
          provider: 'khalti',
          pidx,
        }
      }
      // The verified Khalti transaction_id must be used as the immutable provider reference.
    } else {
      // Default: Fonepay server-to-server verification
      const merchantCode = Deno.env.get('FONEPAY_MERCHANT_CODE') || 'MDULAL'
      const secretKey = Deno.env.get('FONEPAY_SECRET_KEY')
      const isSandbox = !secretKey || Deno.env.get('FONEPAY_ENV') === 'sandbox'

      if (secretKey && !isSandbox) {
        const verifyEndpoint = 'https://clientapi.fonepay.com/api/merchantRequest/verificationMerchant'
        const dvHash = await hmacSha512Hex(secretKey, `${merchantCode},${intentId},${amountRupees},${bid},${uid}`)
        const verifyUrl = `${verifyEndpoint}?PRN=${encodeURIComponent(intentId)}&PID=${encodeURIComponent(merchantCode)}&BID=${encodeURIComponent(bid)}&AMT=${encodeURIComponent(amountRupees)}&UID=${encodeURIComponent(uid)}&DV=${encodeURIComponent(dvHash)}`

        const upstreamRes = await fetch(verifyUrl, { method: 'GET' })
        const upstreamText = await upstreamRes.text()
        try {
          upstreamData = JSON.parse(upstreamText)
          verified = (upstreamData.responseCode === 'successful' || upstreamData.success === true)
        } catch {
          verified = upstreamText.includes('<response_code>successful</response_code>')
          upstreamData = { raw: upstreamText }
        }
      } else {
        verified = false // Sandbox callbacks cannot create Received ledger rows
        upstreamData = {
          mock_verified: true,
          response_code: responseCode || 'successful',
          sandbox: true,
        }
      }
      finalRef = providerRef || uid
    }

    if (!verified || !finalRef.trim()) {
      return new Response(
        JSON.stringify({
          success: false,
          error: `${effectiveProvider} server-to-server verification failed.`,
          details: upstreamData,
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // 3. Atomically allocate payment intent in database via RPC
    const { data: allocResult, error: allocError } = await supabase.rpc('allocate_payment_intent', {
      p_intent_id: intentId,
      p_provider_ref: finalRef,
      p_provider_response: upstreamData,
    })

    if (allocError || !allocResult) {
      return new Response(
        JSON.stringify({ error: allocError?.message || 'Payment allocation failed.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    return new Response(
      JSON.stringify({
        success: true,
        intent_id: intentId,
        status: allocResult.status,
        payment_id: allocResult.payment_id,
        payment_no: allocResult.payment_no,
        amount_paisa: allocResult.amount_paisa,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal server error'
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
