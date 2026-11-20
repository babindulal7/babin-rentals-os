// =============================================================================
// pay-init/index.ts — Supabase Edge Function for Online Payment Init (T7-05, T7-06)
//
// Authority:
//   - T7-05 · Online payment — Fonepay first
//   - T7-06 · eSewa and Khalti payment providers
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
  clientUuid?: string
  bookingRequestId?: string
  bookingId?: string
  token?: string
  provider?: 'fonepay' | 'esewa' | 'khalti'
  returnUrl?: string
  action?: string
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

async function hmacSha256Base64(key: string, data: string): Promise<string> {
  const enc = new TextEncoder()
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    enc.encode(key),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  )
  const signature = await crypto.subtle.sign('HMAC', cryptoKey, enc.encode(data))
  const binary = String.fromCharCode(...new Uint8Array(signature))
  return btoa(binary)
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

    // Handle provider list request
    const url = new URL(req.url)
    const isListReq = req.method === 'GET' || url.searchParams.get('action') === 'providers'

    if (isListReq) {
      const { data: providers, error: provError } = await supabase.rpc('get_online_payment_providers')
      if (provError) {
        return new Response(
          JSON.stringify({ error: provError.message }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }
      return new Response(
        JSON.stringify({ success: true, providers: providers || [] }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Handle payment link details request
    const tokenParam = url.searchParams.get('token')
    if (url.searchParams.get('action') === 'link_details' && tokenParam) {
      const { data: linkDetails, error: linkErr } = await supabase.rpc('get_payment_link_details', {
        p_token: tokenParam,
      })
      if (linkErr) {
        return new Response(
          JSON.stringify({ error: linkErr.message }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }
      return new Response(
        JSON.stringify({ success: true, details: linkDetails }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const body: PayInitRequest = await req.json().catch(() => ({} as PayInitRequest))
    if (body.action === 'providers') {
      const { data: providers, error: provError } = await supabase.rpc('get_online_payment_providers')
      if (provError) {
        return new Response(
          JSON.stringify({ error: provError.message }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }
      return new Response(
        JSON.stringify({ success: true, providers: providers || [] }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    if (body.action === 'link_details') {
      const linkToken = body.token || tokenParam || ''
      const { data: linkDetails, error: linkErr } = await supabase.rpc('get_payment_link_details', {
        p_token: linkToken,
      })
      if (linkErr) {
        return new Response(
          JSON.stringify({ error: linkErr.message }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }
      return new Response(
        JSON.stringify({ success: true, details: linkDetails }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const { clientUuid, bookingRequestId, bookingId, token, provider = 'fonepay', returnUrl } = body

    if (!clientUuid || typeof clientUuid !== 'string') {
      return new Response(
        JSON.stringify({ error: 'A valid client_uuid is required (Law 8).' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    let intent_id: string
    let amount_paisa: number

    if (token) {
      // Payment link flow: server resolves amount from payment_intents using token
      const { data: linkDetails, error: linkErr } = await supabase.rpc('get_payment_link_details', {
        p_token: token,
      })
      if (linkErr || !linkDetails || !linkDetails.valid) {
        const reason = linkDetails?.reason || 'invalid'
        const msg = reason === 'expired'
          ? 'This payment link has expired (48-hour limit).'
          : reason === 'already_paid'
          ? 'This payment link has already been settled.'
          : 'Invalid or missing payment link.'
        return new Response(
          JSON.stringify({ error: msg }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      intent_id = linkDetails.intent_id
      amount_paisa = linkDetails.amount_paisa

      // Update provider choice on intent
      await supabase
        .from('payment_intents')
        .update({ provider, updated_at: new Date().toISOString() })
        .eq('id', intent_id)
    } else {
      if (!bookingRequestId && !bookingId) {
        return new Response(
          JSON.stringify({ error: 'Either bookingRequestId, bookingId, or token must be provided.' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      // Call create_payment_intent RPC (server-authoritative computation of amount & switch check)
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

      intent_id = intentRes.intent_id
      amount_paisa = intentRes.amount_paisa
    }
    const amountRupees = (amount_paisa / 100).toFixed(2)
    const siteUrl = Deno.env.get('SITE_URL') || 'https://book.babinrentals.com'
    const defaultReturnUrl = `${siteUrl}/pay/callback?intent_id=${intent_id}&provider=${provider}`
    const finalReturnUrl = returnUrl || defaultReturnUrl

    if (provider === 'esewa') {
      // eSewa ePAY v2 configuration
      const esewaProductCode = Deno.env.get('ESEWA_PRODUCT_CODE') || 'EPAYTEST'
      const esewaSecret = Deno.env.get('ESEWA_SECRET_KEY') || '8gBm/:&EnhH.1/q'
      const isSandbox = !Deno.env.get('ESEWA_SECRET_KEY') || Deno.env.get('ESEWA_ENV') === 'sandbox'
      const esewaActionUrl = isSandbox
        ? 'https://rc-epay.esewa.com.np/api/epay/main/v2/form'
        : 'https://epay.esewa.com.np/api/epay/main/v2/form'

      const signatureMsg = `total_amount=${amountRupees},transaction_uuid=${intent_id},product_code=${esewaProductCode}`
      const signature = await hmacSha256Base64(esewaSecret, signatureMsg)

      const esewaParams = {
        amount: amountRupees,
        tax_amount: '0',
        total_amount: amountRupees,
        transaction_uuid: intent_id,
        product_code: esewaProductCode,
        product_service_charge: '0',
        product_delivery_charge: '0',
        success_url: finalReturnUrl,
        failure_url: `${siteUrl}/pay/callback?status=failed&intent_id=${intent_id}&provider=esewa`,
        signed_field_names: 'total_amount,transaction_uuid,product_code',
        signature,
      }

      return new Response(
        JSON.stringify({
          success: true,
          intent_id,
          amount_paisa,
          amount_rupees: amountRupees,
          provider: 'esewa',
          payment_url: esewaActionUrl,
          esewa_params: esewaParams,
          is_sandbox: isSandbox,
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    if (provider === 'khalti') {
      // Khalti ePayment v2 configuration
      const khaltiSecret = Deno.env.get('KHALTI_SECRET_KEY')
      const isSandbox = !khaltiSecret || Deno.env.get('KHALTI_ENV') === 'sandbox'
      let pidx = `KH-${intent_id.slice(0, 8)}`
      let paymentUrl = `${siteUrl}/pay/callback?provider=khalti&intent_id=${intent_id}&pidx=${pidx}`

      if (khaltiSecret && !isSandbox) {
        try {
          const khaltiRes = await fetch('https://khalti.com/api/v2/epayment/initiate/', {
            method: 'POST',
            headers: {
              'Authorization': `Key ${khaltiSecret}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              return_url: finalReturnUrl,
              website_url: siteUrl,
              amount: amount_paisa,
              purchase_order_id: intent_id,
              purchase_order_name: `Babin Rentals Booking ${intent_id.slice(0, 8)}`,
            }),
          })
          const khaltiData = await khaltiRes.json()
          if (!khaltiRes.ok || typeof khaltiData.pidx !== 'string'
              || !khaltiData.pidx || typeof khaltiData.payment_url !== 'string'
              || !khaltiData.payment_url.startsWith('https://')) {
            throw new Error('Khalti did not issue a valid payment initiation.')
          }

          // Persist the provider-issued identifier before returning the checkout URL.
          // A callback is accepted only when lookup.pidx matches this trusted binding.
          const { data: boundIntent, error: bindError } = await supabase
            .from('payment_intents')
            .update({
              provider: 'khalti',
              provider_response: { initiated_pidx: khaltiData.pidx },
              updated_at: new Date().toISOString(),
            })
            .eq('id', intent_id)
            .eq('status', 'pending')
            .select('id')
            .single()
          if (bindError || !boundIntent) {
            throw new Error('Unable to bind Khalti checkout to a pending payment intent.')
          }
          pidx = khaltiData.pidx
          paymentUrl = khaltiData.payment_url
        } catch (fetchErr) {
          console.error('[pay-init] Khalti initiation failed:', fetchErr)
          return new Response(
            JSON.stringify({ success: false, error: 'Khalti checkout could not be initialized. No payment has been recorded.' }),
            { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          )
        }
      }

      return new Response(
        JSON.stringify({
          success: true,
          intent_id,
          amount_paisa,
          amount_rupees: amountRupees,
          provider: 'khalti',
          pidx,
          payment_url: paymentUrl,
          is_sandbox: isSandbox,
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Default: Fonepay merchant credentials
    const merchantCode = Deno.env.get('FONEPAY_MERCHANT_CODE') || 'MDULAL'
    const secretKey = Deno.env.get('FONEPAY_SECRET_KEY') || 'mock_fonepay_secret'

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
        provider: 'fonepay',
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
