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

const rejectPayment = (message: string, status = 403) =>
  new Response(JSON.stringify({ success: false, error: message }), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })

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

    const { clientUuid, bookingRequestId, bookingId, token, provider = 'fonepay' } = body

    if (!['fonepay', 'esewa', 'khalti'].includes(provider)) {
      return rejectPayment('Unsupported payment provider.', 400)
    }
    const { data: configuredProviders, error: providerError } =
      await supabase.rpc('get_online_payment_providers')
    if (providerError || !Array.isArray(configuredProviders)) {
      return rejectPayment('Payment providers are unavailable.', 503)
    }
    if (!configuredProviders.some((item: { provider: string; enabled: boolean }) =>
      item.provider === provider && item.enabled === true)) {
      return rejectPayment('The selected payment provider is disabled.', 400)
    }

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

      // Never change a provider after a Khalti checkout was issued: the
      // first pidx may already have been paid by the client.
      const { data: storedLink, error: storedLinkError } = await supabase
        .from('payment_intents')
        .select('provider, provider_response, status')
        .eq('id', intent_id)
        .single()
      if (storedLinkError || !storedLink || storedLink.status !== 'pending') {
        return rejectPayment('The payment link is not available for checkout.', 409)
      }
      const issuedPidx = (storedLink.provider_response as Record<string, unknown> | null)?.initiated_pidx
      if (typeof issuedPidx === 'string' && issuedPidx && storedLink.provider !== provider) {
        return rejectPayment('A checkout is already active with the original provider.', 409)
      }

      // A valid high-entropy token grants access to this pending link only.
      const { data: providerUpdate, error: providerUpdateError } = await supabase
        .from('payment_intents')
        .update({ provider, updated_at: new Date().toISOString() })
        .eq('id', intent_id)
        .eq('status', 'pending')
        .select('id')
        .single()
      if (providerUpdateError || !providerUpdate) {
        return rejectPayment('This payment link is no longer payable.', 409)
      }
    } else {
      if (!bookingRequestId && !bookingId) {
        return rejectPayment('Provide a booking request or confirmed booking target.', 400)
      }

      // IMPORTANT: this Edge Function uses service_role. It MUST authorize the
      // end user before reading another client's target or calling a money RPC.
      const bearer = req.headers.get('authorization')?.match(/^Bearer\s+(.+)$/i)?.[1]
      if (!bearer) return rejectPayment('Sign in before creating a payment intent.', 401)

      const { data: authResult, error: authError } = await supabase.auth.getUser(bearer)
      const userId = authResult?.user?.id
      if (authError || !userId || authResult.user?.is_anonymous === true) {
        return rejectPayment('Valid authentication is required.', 401)
      }

      const { data: staff, error: staffError } = await supabase
        .from('users')
        .select('primary_role, is_active')
        .eq('id', userId)
        .maybeSingle()
      if (staffError) return rejectPayment('Unable to verify caller permissions.', 503)
      const moneyStaff = staff?.is_active === true
        && ['Owner', 'Admin', 'Manager', 'Accounts'].includes(staff.primary_role)

      if (bookingRequestId) {
        const { data: request, error: targetError } = await supabase
          .from('booking_requests')
          .select('id, requester_auth_uid, booking_id, status')
          .eq('id', bookingRequestId)
          .maybeSingle()
        if (targetError) return rejectPayment('Unable to verify booking request ownership.', 503)
        if (!request || (!moneyStaff && request.requester_auth_uid !== userId)) {
          return rejectPayment('Payment target is not available to this account.', 403)
        }
        if (request.status === 'confirmed') {
          // Both IDs are required to prove the displayed booking belongs to
          // the signed-in client's confirmed request; never trust either alone.
          if (!bookingId || request.booking_id !== bookingId) {
            return rejectPayment('Confirmed booking does not match this request.', 403)
          }
        } else if (bookingId) {
          return rejectPayment('Only confirmed requests can pay a booking balance.', 403)
        }
      } else if (!moneyStaff) {
        // A client pays an existing booking through its issued high-entropy
        // payment link; arbitrary booking IDs are not an ownership proof.
        return rejectPayment('Booking payment requires an authorized payment link.', 403)
      }

      // Idempotency keys cannot be reused to obtain an intent for another target.
      const { data: existing, error: existingError } = await supabase
        .from('payment_intents')
        .select('booking_id, booking_request_id, requester_auth_uid')
        .eq('client_uuid', clientUuid)
        .maybeSingle()
      if (existingError) return rejectPayment('Could not verify payment idempotency.', 503)
      if (existing &&
        (existing.booking_request_id !== (bookingRequestId || null)
          || (bookingId && existing.booking_id !== bookingId)
          || (!moneyStaff && existing.requester_auth_uid !== userId))) {
        return rejectPayment('Payment idempotency key belongs to another target.', 409)
      }

      // The server RPC computes authoritative totals; the browser sends no amount.
      // The booking+request pair is ownership proof only. When a confirmed
      // request is provided, the DB resolves its invoice by the request link.
      // Passing only p_booking_id would lose tenant context.
      const { data: intentRes, error: intentError } = await supabase.rpc('create_payment_intent', {
        p_client_uuid: clientUuid,
        p_booking_id: bookingRequestId ? null : (bookingId || null),
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
    const siteUrl = Deno.env.get('SITE_URL') || 'https://babinrentals.com'
    // Never accept an arbitrary browser-supplied return URL for a hosted payment.
    const finalReturnUrl = `${siteUrl}/pay/callback?intent_id=${intent_id}&provider=${provider}`

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

      // A retry may reuse the SAME provider checkout, never mint a second
      // provider-issued pidx for an already-bound intent.
      const { data: existingCheckout, error: existingCheckoutError } = await supabase
        .from('payment_intents')
        .select('status, provider, provider_response')
        .eq('id', intent_id)
        .single()
      if (existingCheckoutError || !existingCheckout || existingCheckout.status !== 'pending'
          || existingCheckout.provider !== 'khalti') {
        return rejectPayment('Khalti payment attempt cannot be resumed.', 409)
      }
      const saved = existingCheckout.provider_response as Record<string, unknown> | null
      if (saved?.initiated_pidx) {
        if (typeof saved.initiated_pidx !== 'string'
            || typeof saved.initiated_payment_url !== 'string'
            || !saved.initiated_payment_url.startsWith('https://')) {
          return rejectPayment('The original Khalti checkout requires reconciliation.', 409)
        }
        return new Response(
          JSON.stringify({
            success: true,
            intent_id,
            amount_paisa,
            amount_rupees: amountRupees,
            provider: 'khalti',
            pidx: saved.initiated_pidx,
            payment_url: saved.initiated_payment_url,
            is_sandbox: false,
            is_existing: true,
          }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }
      if (saved && Object.keys(saved).length > 0) {
        return rejectPayment('The Khalti checkout binding requires reconciliation.', 409)
      }

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
              provider_response: {
                initiated_pidx: khaltiData.pidx,
                initiated_payment_url: khaltiData.payment_url,
                checkout_issued_at: new Date().toISOString(),
              },
              updated_at: new Date().toISOString(),
            })
            .eq('id', intent_id)
            .eq('provider', 'khalti')
            .eq('status', 'pending')
            .is('provider_response', null)
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
