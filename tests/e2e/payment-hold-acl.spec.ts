import { randomUUID } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'
import { test, expect } from './fixture'

const API = 'http://127.0.0.1:54321'
const disposable = process.env.BABIN_E2E_DISPOSABLE === '1'
  && process.env.GITHUB_ACTIONS === 'true'
  && process.env.RUNNER_ENVIRONMENT === 'github-hosted'
  && process.env.RUNNER_OS === 'Linux'
  && process.env.E2E_LOCAL_URL === API

test.describe('Database-side online payment hold', () => {
  test.skip(!disposable, 'RPC probes are disposable CI only')
  test('public and real staff sessions cannot issue or allocate online payments', async () => {
    const key = process.env.E2E_LOCAL_ANON_KEY
    if (!disposable || !key) throw new Error('Disposable public API key required')
    for (const role of ['ANON', 'OWNER', 'MANAGER', 'STAFF'] as const) {
      const client = createClient(API, key, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } })
      if (role !== 'ANON') {
        const email = process.env['E2E_' + role + '_EMAIL']
        const password = process.env['E2E_' + role + '_PASSWORD']
        if (!email?.startsWith('disposable-') || !email.endsWith('@example.test') || !password) throw new Error('Synthetic role credentials required')
        const auth = await client.auth.signInWithPassword({ email, password })
        expect(auth.error).toBeNull()
        expect(auth.data.session).not.toBeNull()
      }
      try {
        const id = randomUUID()
        const results = [
          await client.rpc('create_payment_intent', { p_client_uuid: randomUUID(), p_booking_id: id, p_provider: 'fonepay' }),
          await client.rpc('create_booking_payment_link', { p_client_uuid: randomUUID(), p_booking_id: id }),
          await client.rpc('allocate_payment_intent', { p_intent_id: id, p_provider_ref: 'disposable-denial', p_provider_response: {} }),
        ]
        for (const result of results) {
          expect(result.data, role + ' must receive no payment result').toBeNull()
          expect(result.error?.code, role + ' must fail at the privilege boundary').toBe('42501')
        }
      } finally {
        if (role !== 'ANON') await client.auth.signOut({ scope: 'local' })
      }
    }
  })
})
