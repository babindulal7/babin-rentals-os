import assert from 'node:assert/strict'
import { test } from 'node:test'
import { configureTestDataSource } from './test-data-source.mjs'

test('default tests mask live credentials inherited from the machine', () => {
  const env = {
    VITE_DATA_SOURCE: 'live',
    VITE_SUPABASE_URL: 'https://production.supabase.co',
    VITE_SUPABASE_ANON_KEY: 'real-anon-key',
    VITE_DEV_AUTH_BYPASS: 'true',
  }
  const result = configureTestDataSource(['--coverage', '--reporter=default'], env)
  assert.deepEqual(result, {
    args: ['--coverage', '--reporter=default'], source: 'mock', explicitLive: false,
  })
  assert.equal(env.VITE_DATA_SOURCE, 'mock')
  assert.equal(env.VITE_SUPABASE_URL, 'http://mock.local')
  assert.equal(env.VITE_SUPABASE_ANON_KEY, 'mock-anon-key')
  assert.equal(env.VITE_DEV_AUTH_BYPASS, 'false')
})

test('default tests select mock even without environment settings', () => {
  const env = {}
  const result = configureTestDataSource([], env)
  assert.equal(result.source, 'mock')
  assert.equal(env.VITE_SUPABASE_URL, 'http://mock.local')
})

test('explicit --live opts in and is not forwarded as an invalid Vitest flag', () => {
  const env = { VITE_SUPABASE_URL: 'https://production.supabase.co', VITE_SUPABASE_ANON_KEY: 'real' }
  const result = configureTestDataSource(['--live', '--coverage', 'src/lib/example.test.ts'], env)
  assert.deepEqual(result, {
    args: ['--coverage', 'src/lib/example.test.ts'], source: 'live', explicitLive: true,
  })
  assert.equal(env.VITE_DATA_SOURCE, 'live')
  assert.equal(env.VITE_SUPABASE_URL, 'https://production.supabase.co')
  assert.equal(env.VITE_SUPABASE_ANON_KEY, 'real')
})
