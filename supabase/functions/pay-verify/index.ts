// =============================================================================
// pay-verify/index.ts — Supabase Edge Function for Online Payment Verify (T7-05)
//
// Authority:
//   - T7-05 · Online payment — Fonepay first
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
  providerRef: string
  bid?: string
  uid?: string
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

    // Handle both JSON body and URLSearchParams (from Fonepay callback webhook / redirect)
    let body: PayVerifyRequest = {} as PayVerifyRequest
    if (req.headers.get('content-type')?.includes('application/json')) {
      body = await req.json().catch(() => ({} as PayVerifyRequest))
    } else {
      const url = new URL(req.url)
      body = {
        intentId: url.searchParams.get('intent_id') || url.searchParams.get('PRN') || '',
        providerRef: url.searchParams.get('UID') || url.searchParams.get('ref') || '',
        bid: url.searchParams.get('BID') || '',
        uid: url.searchParams.get('UID') || '',
        responseCode: url.searchParams.get('RC') || '',
      }
    }

    const { intentId, bid = '', uid = '' } = body

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

    // 2. Only the merchant's independent server-to-server verification can
    // authorize a payment. A redirect, UID, responseCode or providerRef supplied
    // by a browser never counts as proof of receipt.
    if (intent.provider !== 'fonepay') {
      return new Response(
        JSON.stringify({ error: 'Wrong payment provider for Fonepay verification.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const merchantCode = Deno.env.get('FONEPAY_MERCHANT_CODE')?.trim()
    const secretKey = Deno.env.get('FONEPAY_SECRET_KEY')?.trim()
    const providerEnvironment = Deno.env.get('FONEPAY_ENV')?.trim().toLowerCase()

    // Never credit a production ledger from sandbox or absent credentials.
    // Synthetic settlement tests belong in isolated test fixtures, not this
    // deployed verification endpoint.
    if (!merchantCode || !secretKey || providerEnvironment !== 'production') {
      return new Response(
        JSON.stringify({ error: 'Verified Fonepay payments are not configured.' }),
        { status: 503, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    if (!bid || !uid || bid.length > 128 || uid.length > 128) {
      return new Response(
        JSON.stringify({ error: 'A provider transaction reference is required.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const amountRupees = (intent.amount_paisa / 100).toFixed(2)
    const verifyEndpoint = 'https://clientapi.fonepay.com/api/merchantRequest/verificationMerchant'
    // Preserve the existing merchant signature contract until the acquired
    // bank/Fonepay integration specification is independently validated.
    const dvHash = await hmacSha512Hex(secretKey, `${merchantCode},${intentId},${amountRupees},${bid},${uid}`)
    const verifyUrl = `${verifyEndpoint}?PRN=${encodeURIComponent(intentId)}&PID=${encodeURIComponent(merchantCode)}&BID=${encodeURIComponent(bid)}&AMT=${encodeURIComponent(amountRupees)}&UID=${encodeURIComponent(uid)}&DV=${encodeURIComponent(dvHash)}`

    const upstreamRes = await fetch(verifyUrl, { method: 'GET' })
    if (!upstreamRes.ok) {
      return new Response(
        JSON.stringify({ error: 'Fonepay verification could not be confirmed.' }),
        { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const upstreamText = await upstreamRes.text()
    let upstreamFields: Record<string, unknown> = {}
    let verified = false
    try {
      const parsed: unknown = JSON.parse(upstreamText)
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        upstreamFields = parsed as Record<string, unknown>
        const code = upstreamFields.responseCode ?? upstreamFields.response_code
        verified = typeof code === 'string' && code.trim().toLowerCase() === 'successful'
      }
    } catch {
      // Fonepay deployments may return XML instead of JSON. Match the exact
      // response_code element, not a substring such as "unsuccessful".
      const code = upstreamText.match(/<response_code>\\s*([^<]+)\\s*<\\/response_code>/i)
      verified = code?.[1]?.trim().toLowerCase() === 'successful'
    }

    // When the provider echoes identifiers, require them to match the exact
    // merchant request. Empty/missing values do not override a rejected status.
    const providerClaim = (names: string[]): string | null => {
      for (const name of names) {
        const value = upstreamFields[name]
        if (typeof value === 'string' || typeof value === 'number') {
          return String(value).trim()
        }
      }
      return null
    }
    const echoedPrn = providerClaim(['PRN', 'prn', 'merchant_prn'])
    const echoedPid = providerClaim(['PID', 'pid', 'merchant_code'])
    const echoedUid = providerClaim(['UID', 'uid', 'transaction_id'])
    const echoedAmount = providerClaim(['AMT', 'amt', 'amount'])
    if (
      (echoedPrn !== null && echoedPrn !== intentId) ||
      (echoedPid !== null && echoedPid !== merchantCode) ||
      (echoedUid !== null && echoedUid !== uid) ||
      (echoedAmount !== null && (!Number.isFinite(Number(echoedAmount)) || Number(echoedAmount).toFixed(2) !== amountRupees))
    ) {
      verified = false
    }

    if (!verified) {
      return new Response(
        JSON.stringify({ success: false, error: 'Fonepay server-to-server verification failed.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Never store the raw gateway response (which may contain payer details).
    const upstreamData: Record<string, unknown> = {
      verified_by: 'fonepay_s2s',
      verification_code: 'successful',
    }

    // 3. Atomically allocate payment intent in database via RPC
    // The verified transaction reference is the UID used in the signed S2S lookup.
    const finalRef = uid
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
