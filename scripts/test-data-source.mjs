/**
 * T0-10 — safe test data source boundary.
 *
 * Vite reads .env.local. Ordinary npm test/test:coverage must NEVER inherit
 * credentials from that file or from a shell configured to run production.
 * process.env wins over Vite's dotenv loader, so force both the data source
 * and its connection variables before launching Vitest.
 *
 * Only an explicit --live flag opts out; it is removed before Vitest sees it.
 * Reserve --live for an isolated test environment, never production.
 */
export function configureTestDataSource(argv, env) {
  const explicitLive = argv.includes('--live')
  const args = argv.filter(arg => arg !== '--live')

  if (explicitLive) {
    env.VITE_DATA_SOURCE = 'live'
    return { args, source: 'live', explicitLive: true }
  }

  env.VITE_DATA_SOURCE = 'mock'
  env.VITE_SUPABASE_URL = 'http://mock.invalid'
  env.VITE_SUPABASE_ANON_KEY = 'mock-anon-key'
  env.VITE_DEV_AUTH_BYPASS = 'false'

  return { args, source: 'mock', explicitLive: false }
}
