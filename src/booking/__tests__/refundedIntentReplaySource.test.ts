import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

// Static source regression guard only. The real no-double-credit guarantee
// requires a synthetic database/provider callback replay test on a safe runner.
const allocSource = readFileSync(
  new URL('../../../supabase/migrations/0251_payment_intents_and_fonepay.sql', import.meta.url),
  'utf8',
)
const verifySource = readFileSync(
  new URL('../../../supabase/functions/pay-verify/index.ts', import.meta.url),
  'utf8',
)
const allocation = allocSource.split('create or replace function public.allocate_payment_intent(')[1]
  ?.split('revoke all on function public.allocate_payment_intent(')[0] ?? ''

describe('T7-07 terminal refund replay guard', () => {
  it('checks refund state before paid/allocated replay or ledger changes', () => {
    const terminalCheck = allocation.indexOf("if v_intent.status = 'refunded' then")
    const priorReplayGuard = allocation.indexOf("if v_intent.status = 'allocated'")
    const markPaid = allocation.indexOf("status = 'paid'")
    expect(terminalCheck).toBeGreaterThan(0)
    expect(priorReplayGuard).toBeGreaterThan(terminalCheck)
    expect(markPaid).toBeGreaterThan(terminalCheck)
    expect(allocation).toMatch(/refunded_terminal/)
  })

  it('refuses refunded callbacks before asking the provider or allocating again', () => {
    const terminalCheck = verifySource.indexOf("if (intent.status === 'refunded')")
    const verification = verifySource.indexOf("const secretKey = Deno.env.get('FONEPAY_SECRET_KEY')")
    const allocationCall = verifySource.indexOf("supabase.rpc('allocate_payment_intent'")
    expect(terminalCheck).toBeGreaterThan(0)
    expect(verification).toBeGreaterThan(terminalCheck)
    expect(allocationCall).toBeGreaterThan(terminalCheck)
    expect(verifySource).toMatch(/status: 409/)
  })
})
