import { test } from 'node:test'
import assert from 'node:assert/strict'
import { stagingConfiguration, verifyStaging, STAGING_ROLES } from './verify-staging-readonly.mjs'

const environment = {
  BABIN_STAGING_PROJECT_REF: 'isolatedtest', BABIN_STAGING_SUPABASE_URL: 'https://isolatedtest.supabase.co',
  BABIN_STAGING_ANON_KEY: 'public-placeholder', BABIN_STAGING_FIXTURES: 'fixtures.json',
  ...Object.fromEntries(STAGING_ROLES.map((role) => [`BABIN_STAGING_JWT_${role.toUpperCase()}`, `test-${role}`])),
}
test('requires an isolated project and all nine identities', () => {
  assert.equal(stagingConfiguration(environment).reference, 'isolatedtest')
  for (const change of [
    { BABIN_STAGING_PROJECT_REF: 'sxguwvgoserhdolewibb', BABIN_STAGING_SUPABASE_URL: 'https://sxguwvgoserhdolewibb.supabase.co' },
    { BABIN_STAGING_SUPABASE_URL: 'https://isolatedtest.supabase.co.evil.invalid' },
    { BABIN_STAGING_JWT_CLIENT: '' },
  ]) assert.throws(() => stagingConfiguration({ ...environment, ...change }))
})
test('missing fixtures and transport failures cannot be certified; network uses GET only', async () => {
  let reads = 0
  const report = await verifyStaging(stagingConfiguration(environment), {}, async (url, options) => {
    reads++
    assert.equal(options.method, 'GET')
    assert.equal(options.redirect, 'error')
    throw new Error('secret-token')
  })
  assert.equal(report.status, 'FAIL')
  assert.equal(reads, 3)
  assert.ok(!JSON.stringify(report).includes('secret-token'))
  assert.ok(report.checks.some((check) => check.status === 'INCOMPLETE'))
})
