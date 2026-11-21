import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

// Source guards only: runtime DB GRANT/role and callback behavior remain pending.
const sql = readFileSync(
  new URL('../../../../supabase/migrations/0251_payment_intents_and_fonepay.sql', import.meta.url),
  'utf8',
)
const api = readFileSync(new URL('../payApi.ts', import.meta.url), 'utf8')
const accessRules = sql.split('revoke all on function public.allocate_payment_intent(')[1]
  ?.split('-- 6. Update confirm_booking_request')[0] ?? ''

describe('T7: payment allocation service-only authority', () => {
  it('revokes public, anonymous and authenticated EXECUTE', () => {
    expect(accessRules).toMatch(/from public, anon, authenticated/)
    expect(accessRules).toMatch(/grant execute on function public\.allocate_payment_intent\(uuid, text, jsonb\) to service_role/)
    expect(accessRules).not.toMatch(/to authenticated/)
  })

  it('does not invoke the ledger allocation RPC directly from browser', () => {
    expect(api).not.toMatch(/supabase\.rpc\('allocate_payment_intent'/)
    expect(api).toMatch(/supabase\.functions\.invoke<PayVerifyResponse>\('pay-verify'/)
  })

  it('refuses an Edge failure instead of treating a client callback as payment proof', () => {
    expect(api).toMatch(/if \(error \|\| !data\?\.success\)/)
    expect(api).toMatch(/Payment verification unavailable/)
  })
})
