// =============================================================================
// rider-link/index.ts — Supabase Edge Function for One-Time Rider Links (T4-08, W49)
//
// Rulings:
//   - W49: One-time, job-scoped delivery link for hired riders without login.
//   - Law 6: Zero money figures exposed.
//   - Tokens stored hashed (SHA-256); raw token never stored in database.
//   - RPC execution mediated via service_role client.
// =============================================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

async function sha256Hex(message: string): Promise<string> {
  const msgUint8 = new TextEncoder().encode(message)
  const hashBuffer = await crypto.subtle.digest('SHA-256', msgUint8)
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('')
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

    const body = await req.json().catch(() => ({}))
    const action = body.action || 'get_job'

    if (action === 'issue') {
      // Public token endpoints are no-login; issuance is NOT. Verify the
      // calling user's JWT explicitly before any service-role database call.
      if (req.method !== 'POST') {
        return new Response(JSON.stringify({ error: 'Method not allowed' }), {
          status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      const bearer = req.headers.get('authorization')?.match(/^Bearer\\s+([^\\s]+)$/i)?.[1]
      if (!bearer) {
        return new Response(JSON.stringify({ error: 'Staff sign-in required' }), {
          status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      const { data: verified, error: authError } = await supabase.auth.getUser(bearer)
      if (authError || !verified.user) {
        return new Response(JSON.stringify({ error: 'Staff sign-in required' }), {
          status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      const { job_id, rider_name, rider_phone, request_key } = body
      const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
      if (typeof job_id !== 'string' || !uuid.test(job_id) ||
          typeof request_key !== 'string' || !uuid.test(request_key) ||
          typeof rider_name !== 'string' || rider_name.trim().length < 2 ||
          typeof rider_phone !== 'string' || rider_phone.trim().length < 7) {
        return new Response(JSON.stringify({ error: 'Invalid rider issuance request' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      // Only this trusted Edge function mints the raw 128-bit bearer token.
      // Never persist/log the raw token and never accept a client-selected hash.
      const bytes = crypto.getRandomValues(new Uint8Array(16))
      const rawToken = Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('')
      const tokenHash = await sha256Hex(rawToken)
      const { data, error } = await supabase.rpc('issue_rider_link_server', {
        p_job_id: job_id,
        p_token_hash: tokenHash,
        p_rider_name: rider_name.trim(),
        p_rider_phone: rider_phone.trim(),
        p_actor_id: verified.user.id,
        p_request_key: request_key,
      })

      if (error) {
        // Do not leak branch membership, client/job existence or DB internals.
        return new Response(JSON.stringify({ error: 'Rider link could not be issued. Check permissions or existing links.' }), {
          status: 409,
          headers: { ...corsHeaders, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
        })
      }

      const issued = Array.isArray(data) ? data[0] : null
      if (!issued || issued.was_created !== true || !issued.link_id || !issued.link_expires_at) {
        // A replay returns only metadata from Postgres, never a second token.
        return new Response(JSON.stringify({ error: 'Link already issued. Revoke the existing link before trying again.' }), {
          status: 409,
          headers: { ...corsHeaders, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
        })
      }

      return new Response(JSON.stringify({
        data: { linkId: issued.link_id, rawToken, expiresAt: issued.link_expires_at },
      }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
      })
    }

    const token = body.token || new URL(req.url).searchParams.get('token')
    if (!token || typeof token !== 'string') {
      return new Response(
        JSON.stringify({ error: 'A valid rider delivery token is required.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const tokenHash = await sha256Hex(token.trim())

    if (action === 'get_job') {
      const { data, error } = await supabase.rpc('get_rider_job_by_token', {
        p_token_hash: tokenHash,
      })

      if (error) {
        const status = error.message.includes('expired') || error.message.includes('revoked') || error.message.includes('already been completed')
          ? 410
          : 404
        return new Response(
          JSON.stringify({ error: error.message }),
          { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      return new Response(
        JSON.stringify({ data }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    if (action === 'pickup') {
      const { data, error } = await supabase.rpc('rider_mark_picked_up', {
        p_token_hash: tokenHash,
      })

      if (error) {
        return new Response(
          JSON.stringify({ error: error.message }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      return new Response(
        JSON.stringify({ success: true, data }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    if (action === 'deliver') {
      const { receiver_name, signature_svg, photo_url } = body

      if (!receiver_name || typeof receiver_name !== 'string' || receiver_name.trim().length < 2) {
        return new Response(
          JSON.stringify({ error: 'Receiver name is required (minimum 2 characters).' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      const { data, error } = await supabase.rpc('rider_complete_delivery', {
        p_token_hash: tokenHash,
        p_receiver_name: receiver_name.trim(),
        p_signature_svg: signature_svg || null,
        p_photo_url: photo_url || null,
      })

      if (error) {
        return new Response(
          JSON.stringify({ error: error.message }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      return new Response(
        JSON.stringify({ success: true, data }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    return new Response(
      JSON.stringify({ error: `Unknown action "${action}"` }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal Server Error'
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
