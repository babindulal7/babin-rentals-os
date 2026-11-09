// =============================================================================
// calendar-feed/index.ts — Supabase Edge Function for Private iCal Calendar Feed (T4-10, B28, B29, K5)
// =============================================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
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

    // Token from query param: /calendar-feed?token=<raw_token>
    const url = new URL(req.url)
    const rawToken = url.searchParams.get('token')

    if (!rawToken || typeof rawToken !== 'string') {
      return new Response(
        'Invalid or missing token. Use ?token=<your_raw_token>',
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'text/plain' } }
      )
    }

    // Hash the token (must match the DB's md5(token) || md5(token||'salt'))
    const encoder = new TextEncoder()
    const data = encoder.encode(rawToken.trim())
    const hashBuffer = await crypto.subtle.digest('MD5', data)
    const hashArray = Array.from(new Uint8Array(hashBuffer))
    const md5Hash = hashArray.map(b => b.toString(16).padStart(2, '0')).join('')
    const tokenHash = md5Hash + md5Hash // 64 chars (md5 + md5 with salt)

    // Call the get_calendar_feed RPC
    const { data: icalData, error } = await supabase.rpc('get_calendar_feed', {
      p_token_hash: tokenHash,
    })

    if (error) {
      const status = error.message.includes('revoked') || error.message.includes('Invalid')
        ? 410
        : 404
      return new Response(
        error.message,
        { status, headers: { ...corsHeaders, 'Content-Type': 'text/plain' } }
      )
    }

    if (!icalData) {
      return new Response(
        'No calendar data',
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'text/plain' } }
      )
    }

    // Return iCal with proper headers
    return new Response(icalData, {
      status: 200,
      headers: {
        ...corsHeaders,
        'Content-Type': 'text/calendar; charset=utf-8',
        'Content-Disposition': 'inline; filename="babin-rentals-jobs.ics"',
        'Cache-Control': 'no-store, must-revalidate',
      },
    })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal Server Error'
    return new Response(
      message,
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'text/plain' } }
    )
  }
})