import test from 'node:test'
import assert from 'node:assert/strict'
import { requireLocalApiUrl, requirePublicClientKey, readGateResult } from './local-api-guard.mjs'

test('only loopback URL accepted, never a hosted or look-alike URL', () => {
  for (const url of ['http://localhost:54321', 'http://127.0.0.1:54321', 'http://[::1]:54321']) {
    assert.equal(requireLocalApiUrl(url), new URL(url).origin)
  }
  for (const url of [
    'https://supabase.co', 'https://localhost.evil.tld:54321',
    'http://127.0.0.1.evil.tld:54321',
    'http://user:pass@localhost:54321', 'http://localhost:54321/path',
    'file:///etc/passwd', 'http://localhost:54321/?apikey=example',
  ]) assert.throws(() => requireLocalApiUrl(url), /SAFETY BLOCK/)
})
test('rejects service-role/secret API credentials', () => {
  assert.throws(() => requirePublicClientKey('sb_secret_abc'), /SAFETY BLOCK/)
  const jwt = (role) => ['e30', Buffer.from(JSON.stringify({ role })).toString('base64url'), 'sig'].join('.')
  assert.throws(() => requirePublicClientKey(jwt('service_role')), /SAFETY BLOCK/)
  assert.equal(requirePublicClientKey(jwt('anon')), jwt('anon'))
  assert.equal(requirePublicClientKey('sb_publishable_test-only'), 'sb_publishable_test-only')
  assert.throws(() => requirePublicClientKey('not-a-key'), /Expected/)
})
test('empty data never proves an owner fixture and API errors never become zero', () => {
  assert.throws(() => readGateResult({ count: 0, error: null }, 'Owner', 'populated'), /seed/)
  assert.throws(() => readGateResult({ count: null, error: null }, 'Driver', 'empty-or-denied'), /missing/)
  assert.throws(() => readGateResult({ count: 0, error: { code: 'PGRST301' } }, 'Driver', 'empty-or-denied'), /API error/)
  assert.deepEqual(readGateResult({ count: null, error: { code: '42501' } }, 'Driver', 'empty-or-denied'), {kind:'denied',count:0})
  assert.throws(() => readGateResult({ count: 1, error: null }, 'Driver', 'empty-or-denied'), /exposure/)
  assert.deepEqual(readGateResult({ count: 1, error: null }, 'Owner', 'populated'), {kind:'count',count:1})
})
