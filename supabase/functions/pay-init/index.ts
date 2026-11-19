// =============================================================================
// pay-init/index.ts — Supabase Edge Function for Online Payment Init (T7-05)
//
// Authority:
//   - T7-05 · Online payment — Fonepay first
//   - Law 1: Computes amount on the server (advance required or invoice balance).
//   - Law 5: Security deposit is excluded (O-3).
//   - Law 8: Idempotent client_uuid.
//   - N-8: Credentials stored exclusively in Edge Function secrets.
// =============================================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface PayInitRequest {
  clientUuid: string
  bookingRequestId?: string
  bookingId?: string
  provider?: 'fonepay' | 'esewa' | 'khalti'
  returnUrl?: string
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

    const body: PayInitRequest = await req.json().catch(() => ({} as PayInitRequest))
    const { clientUuid, bookingRequestId, bookingId, provider = 'fonepay', returnUrl } = body

    if (!clientUuid || typeof clientUuid !== 'string') {
      return new Response(
        JSON.stringify({ error: 'A valid client_uuid is required (Law 8).' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    if (!bookingRequestId && !bookingId) {
      return new Response(
        JSON.stringify({ error: 'Either bookingRequestId or bookingId must be provided.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Call create_payment_intent RPC (server-authoritative computation of amount)
    const { data: intentRes, error: intentError } = await supabase.rpc('create_payment_intent', {
      p_client_uuid: clientUuid,
      p_booking_id: bookingId || null,
      p_booking_request_id: bookingRequestId || null,
      p_provider: provider,
    })

    if (intentError || !intentRes) {
      return new Response(
        JSON.stringify({
          error: intentError?.message || 'Failed to initialize payment intent.',
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const { intent_id, amount_paisa } = intentRes
    const amountRupees = (amount_paisa / 100).toFixed(2)

    // Fonepay merchant credentials
    const merchantCode = Deno.env.get('FONEPAY_MERCHANT_CODE') || 'MDULAL'
    const secretKey = Deno.env.get('FONEPAY_SECRET_KEY') || 'mock_fonepay_secret'
    const siteUrl = Deno.env.get('SITE_URL') || 'https://book.babinrentals.com'
    const defaultReturnUrl = `${siteUrl}/pay/callback?intent_id=${intent_id}`
    const finalReturnUrl = returnUrl || defaultReturnUrl

    const now = new Date()
    const dt = `${String(now.getMonth() + 1).padStart(2, '0')}/${String(now.getDate()).padStart(2, '0')}/${now.getFullYear()}`
    const remarks1 = `Rental Advance - Intent ${intent_id.slice(0, 8)}`
    const remarks2 = 'Babin Rentals'

    // DV hash string: PID,MD,PRN,AMT,CRN,DT,R1,R2,RU
    const hashData = `${merchantCode},P,${intent_id},${amountRupees},NPR,${dt},${remarks1},${remarks2},${finalReturnUrl}`
    const dvHash = await hmacSha512Hex(secretKey, hashData)

    const isSandbox = !Deno.env.get('FONEPAY_SECRET_KEY') || Deno.env.get('FONEPAY_ENV') === 'sandbox'
    const fonepayEndpoint = isSandbox
      ? 'https://dev-clientapi.fonepay.com/api/merchantRequest'
      : 'https://clientapi.fonepay.com/api/merchantRequest'

    const paymentParams = {
      PID: merchantCode,
      MD: 'P',
      PRN: intent_id,
      AMT: amountRupees,
      CRN: 'NPR',
      DT: dt,
      R1: remarks1,
      R2: remarks2,
      RU: finalReturnUrl,
      DV: dvHash,
    }

    const paymentUrl = `${fonepayEndpoint}?${new URLSearchParams(paymentParams).toString()}`

    return new Response(
      JSON.stringify({
        success: true,
        intent_id,
        amount_paisa,
        amount_rupees: amountRupees,
        provider,
        payment_url: paymentUrl,
        fonepay_params: paymentParams,
        is_sandbox: isSandbox,
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
