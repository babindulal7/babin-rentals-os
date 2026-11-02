import assert from 'node:assert/strict'
import { test } from 'node:test'
import { configureTestDataSource } from './test-data-source.mjs'

test('plain npm test overrides inherited live settings and credential variables', () => {
  const env = {
    VITE_DATA_SOURCE: 'live',
    VITE_SUPABASE_URL: 'https://live.example.supabase.co',
    VITE_SUPABASE_ANON_KEY: 'test-inherited-key',
    VITE_DEV_AUTH_BYPASS: 'true',
  }
  const result = configureTestDataSource(['--reporter=default'], env)
  assert.deepEqual(result, { args: ['--reporter=default'], source: 'mock', explicitLive: false })
  assert.equal(env.VITE_DATA_SOURCE, 'mock')
  assert.equal(env.VITE_SUPABASE_URL, 'http://mock.invalid')
  assert.equal(env.VITE_SUPABASE_ANON_KEY, 'mock-anon-key')
  assert.equal(env.VITE_DEV_AUTH_BYPASS, 'false')
})

test('no environment also results in mock mode, not live-by-default', () => {
  const env = {}
  const result = configureTestDataSource([], env)
  assert.equal(result.source, 'mock')
  assert.equal(result.explicitLive, false)
  assert.equal(env.VITE_DATA_SOURCE, 'mock')
  assert.equal(env.VITE_SUPABASE_URL, 'http://mock.invalid')
})

test('coverage and focused test invocation both mask inherited Supabase URL', () => {
  const env = { VITE_SUPABASE_URL: 'https://live.example.supabase.co', VITE_DATA_SOURCE: 'live' }
  const args = ['--coverage', 'src/lib/example.test.ts']
  const result = configureTestDataSource(args, env)
  assert.deepEqual(result.args, args)
  assert.equal(result.source, 'mock')
  assert.equal(env.VITE_SUPABASE_URL, 'http://mock.invalid')
})

test('only explicit --live opts into live; flag never reaches Vitest', () => {
  const env = {
    VITE_DATA_SOURCE: 'mock',
    VITE_SUPABASE_URL: 'https://staging.example.supabase.co',
    VITE_SUPABASE_ANON_KEY: 'test-staging-key',
  }
  const result = configureTestDataSource(['--live', '--coverage', 'src/lib/example.test.ts'], env)
  assert.deepEqual(result, {
    args: ['--coverage', 'src/lib/example.test.ts'],
    source: 'live',
    explicitLive: true,
  })
  assert.equal(env.VITE_DATA_SOURCE, 'live')
  assert.equal(env.VITE_SUPABASE_URL, 'https://staging.example.supabase.co')
  assert.equal(env.VITE_SUPABASE_ANON_KEY, 'test-staging-key')
})
