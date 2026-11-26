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

// Launch hold: only read-only link details are served. Independently verify
// the merchant contract before reintroducing hosted gateway initiation.
Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
    status, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
  try {
    const url = new URL(req.url)
    const body = req.method === 'POST' ? await req.json().catch(() => ({})) : {}
    const action = url.searchParams.get('action') || body?.action
    if (action === 'providers' || (req.method === 'GET' && !action)) {
      return json({ success: true, providers: [] })
    }
    if (action !== 'link_details') {
      return json({ success: false, error: 'Online payment is temporarily unavailable.' }, 503)
    }
    const token = url.searchParams.get('token') || body?.token
    if (typeof token !== 'string' || !token) return json({ error: 'Payment link is required.' }, 400)
    const supabaseUrl = Deno.env.get('SUPABASE_URL') || ''
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''

    if (!supabaseUrl || !supabaseServiceKey) {
      return new Response(
        JSON.stringify({ error: 'Server configuration error: missing service keys' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    const { data, error } = await supabase.rpc('get_payment_link_details', { p_token: token })
    if (error) return json({ error: 'Payment link could not be read.' }, 400)
    return json({ success: true, details: data })
  } catch {
    return json({ error: 'Payment service is temporarily unavailable.' }, 503)
  }
})
