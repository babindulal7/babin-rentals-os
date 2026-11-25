// Fail closed: this suite may only use the dedicated Babin staging backend.
export const STAGING_URL = 'https://klhmsrunqrdxjudyhnkm.supabase.co'

export function assertStagingEnvironment(url, key) {
  if (url !== STAGING_URL && url !== STAGING_URL + '/') {
    throw new Error('E2E refused: only the Babin staging project is permitted.')
  }
  if (typeof key !== 'string' || !key) {
    throw new Error('E2E refused: supply a staging public API key.')
  }
  if (key.startsWith('sb_publishable_') && key.length > 'sb_publishable_'.length) return
  // Legacy JWT keys must be anon keys for the exact staging project.
  try {
    const parts = key.split('.')
    if (parts.length === 3) {
      const claims = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'))
      if (claims.role === 'anon' && claims.ref === 'klhmsrunqrdxjudyhnkm') return
    }
  } catch {
    // Do not echo credentials in errors.
  }
  throw new Error('E2E refused: use a staging publishable or legacy anon key, never a secret key.')
}
