import { test } from 'node:test'
import assert from 'node:assert/strict'
import { STAGING_URL, assertStagingEnvironment } from './staging-guard.mjs'

const jwt = (role, ref) => 'header.' + Buffer.from(JSON.stringify({ role, ref })).toString('base64url') + '.signature'
test('accepts exact staging and a public key', () => {
  assert.doesNotThrow(() => assertStagingEnvironment(STAGING_URL, 'sb_publishable_example'))
  assert.doesNotThrow(() => assertStagingEnvironment(STAGING_URL + '/', jwt('anon', 'klhmsrunqrdxjudyhnkm')))
})
test('rejects production, arbitrary projects and malformed URLs', () => {
  for (const url of [undefined, 'https://sxguwvgoserhdolewibb.supabase.co', 'https://other.supabase.co', STAGING_URL + '.evil.example', STAGING_URL + '/rest/v1', STAGING_URL + '?x=1']) {
    assert.throws(() => assertStagingEnvironment(url, 'sb_publishable_example'))
  }
})
test('rejects secrets, wrong project JWTs and missing keys', () => {
  for (const key of [undefined, '', 'sb_secret_example', jwt('service_role', 'klhmsrunqrdxjudyhnkm'), jwt('anon', 'sxguwvgoserhdolewibb'), 'not-a-key']) {
    assert.throws(() => assertStagingEnvironment(STAGING_URL, key))
  }
})
