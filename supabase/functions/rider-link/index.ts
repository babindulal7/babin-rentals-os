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
    const token = body.token || new URL(req.url).searchParams.get('token')
    const action = body.action || (req.method === 'GET' ? 'get_job' : 'get_job')

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
