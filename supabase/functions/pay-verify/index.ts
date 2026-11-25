// Online settlement is on HOLD pending an independently verified Fonepay
// merchant contract. Missing credentials or callback data must never
// produce a payment receipt. Mock simulation remains in the local frontend.
export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve((req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  return new Response(JSON.stringify({
    success: false,
    error: 'Online payment verification is temporarily unavailable. No payment has been recorded.',
  }), { status: 503, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
})
