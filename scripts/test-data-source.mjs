/**
 * Tests run against the local mock transport unless the developer explicitly
 * passes --live. Never infer permission to hit live services from .env.local,
 * VITE_DATA_SOURCE or inherited environment variables.
 *
 * Vite loads .env.local into import.meta.env, so mock tests also pin the
 * Supabase values to harmless placeholders. Vite gives process.env priority.
 */
export function configureTestDataSource(argv, env) {
  const explicitLive = argv.includes('--live')
  const args = argv.filter(arg => arg !== '--live')

  if (explicitLive) {
    env.VITE_DATA_SOURCE = 'live'
    return { args, source: 'live', explicitLive }
  }

  env.VITE_DATA_SOURCE = 'mock'
  env.VITE_SUPABASE_URL = 'http://mock.local'
  env.VITE_SUPABASE_ANON_KEY = 'mock-anon-key'
  env.VITE_DEV_AUTH_BYPASS = 'false'
  return { args, source: 'mock', explicitLive }
}
