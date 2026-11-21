import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

// Source-only regression checks. These do NOT replace synthetic role/RLS tests,
// PGlite migration tests or a provider-sandbox verification of the checkout.
const migration = readFileSync(
  new URL('../../../supabase/migrations/0258_payment_intents_and_fonepay.sql', import.meta.url),
  'utf8',
)
const payInit = readFileSync(
  new URL('../../../supabase/functions/pay-init/index.ts', import.meta.url),
  'utf8',
)
const payApi = readFileSync(new URL('../pay/payApi.ts', import.meta.url), 'utf8')

const createIntent = migration.split('create or replace function public.create_payment_intent(')[1]
  ?.split('revoke all on function public.create_payment_intent(')[0] ?? ''

describe('T7 online payment source authorization', () => {
  it('rejects missing or staff client sessions before any target lookup', () => {
    expect(createIntent).toMatch(/v_actor_uid := auth\.uid\(\)/)
    expect(createIntent).toMatch(/auth_user_role\(\) <> 'Client'/)
    expect(createIntent.indexOf('v_actor_uid := auth.uid()')).toBeLessThan(
      createIntent.indexOf('select id, client_id, requester_auth_uid'),
    )
  })

  it('checks own request and bound booking before returning money', () => {
    expect(createIntent).toMatch(/v_req\.requester_auth_uid is distinct from v_actor_uid/)
    expect(createIntent).toMatch(/v_bk\.client_id is distinct from public\.auth_client_id\(\)/)
    expect(createIntent.indexOf('v_req.requester_auth_uid is distinct from v_actor_uid')).toBeLessThan(
      createIntent.indexOf('v_amount_paisa := v_req.advance_due_paisa'),
    )
  })

  it('checks target ownership before an idempotency key can return a payment', () => {
    const keyLookup = createIntent.indexOf('select * into v_existing from public.payment_intents')
    expect(keyLookup).toBeGreaterThan(createIntent.indexOf('v_bk.client_id is distinct from public.auth_client_id()'))
    expect(createIntent).toMatch(/v_existing\.requester_auth_uid is distinct from v_actor_uid/)
  })

  it('uses a verified user JWT, not the service-role client, to create intents', () => {
    expect(payInit).toMatch(/auth\.getUser\(accessToken\)/)
    expect(payInit).toMatch(/userSupabase\.rpc\('create_payment_intent'/)
    expect(payInit).not.toMatch(/\bsupabase\.rpc\('create_payment_intent'/)
  })

  it('never falls back to fake checkout in non-mock mode', () => {
    expect(payApi).toMatch(/import\.meta\.env\.VITE_DATA_SOURCE !== 'mock'/)
    expect(payApi).toMatch(/Secure checkout is unavailable/)
  })
})
