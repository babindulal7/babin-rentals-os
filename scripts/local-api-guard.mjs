/** Pure fail-closed guards; importable without starting any network request. */
export function requireLocalApiUrl(raw) {
  if (typeof raw !== 'string' || !raw.trim()) throw new Error('Local Supabase URL is missing')
  let url
  try { url = new URL(raw) } catch { throw new Error('Invalid local Supabase URL') }
  const allowed = new Set(['localhost', '127.0.0.1', '[::1]'])
  if (!allowed.has(url.hostname) || !['http:', 'https:'].includes(url.protocol)
      || url.username || url.password || url.search || url.hash || url.pathname !== '/') {
    throw new Error('SAFETY BLOCK: Supabase API must be a bare localhost/loopback URL')
  }
  return url.origin
}
export function requirePublicClientKey(raw) {
  if (typeof raw !== 'string' || !raw.trim()) throw new Error('Local anon/publishable key is missing')
  const key = raw.trim()
  if (key.startsWith('sb_secret_') || key.startsWith('sb_service_')) {
    throw new Error('SAFETY BLOCK: secret/service-role key may not be used by this checker')
  }
  if (key.startsWith('sb_publishable_')) return key
  const parts = key.split('.')
  if (parts.length !== 3) throw new Error('Expected a local publishable/anon key, never a service key')
  let payload
  try { payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8')) }
  catch { throw new Error('Cannot validate the supplied JWT API key role') }
  if (payload.role !== 'anon') throw new Error('SAFETY BLOCK: API key JWT must have anon role')
  return key
}
export function readGateResult({ count, error }, label, expected) {
  if (error) {
    if (error.code === '42501') {
      if (expected === 'empty-or-denied') return { kind: 'denied', count: 0 }
      throw new Error(label + ': denied, but expected an authorized populated view')
    }
    throw new Error(label + ': API error (' + (error.code || 'unknown') + ')')
  }
  if (!Number.isInteger(count) || count < 0) {
    throw new Error(label + ': missing/invalid exact count; cannot claim access was checked')
  }
  if (expected === 'populated' && count === 0) {
    throw new Error(label + ': zero owner-visible rows; seed local synthetic fixtures first')
  }
  if (expected === 'empty-or-denied' && count !== 0) {
    throw new Error(label + ': unauthorized row exposure detected; count=' + count)
  }
  return { kind: 'count', count }
}
