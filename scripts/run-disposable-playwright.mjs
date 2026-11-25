// Disposable CI only. No hosted project or permanent credentials are used.
import { execFileSync, spawnSync } from 'node:child_process'
import { randomBytes, randomUUID } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'
import pg from 'pg'
import { requirePublicClientKey } from './local-api-guard.mjs'

const API = 'http://127.0.0.1:54321'
const options = { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } }
async function run() {
  if (process.env.GITHUB_ACTIONS !== 'true' || process.env.RUNNER_ENVIRONMENT !== 'github-hosted' || process.env.RUNNER_OS !== 'Linux') {
    throw new Error('Disposable auth bootstrap requires a hosted Linux CI runner')
  }
  if (process.env.DOCKER_HOST || process.env.DOCKER_CONTEXT) throw new Error('Remote Docker context refused')
  // status reads the locally running CLI project only; never call link or db push.
  const status = JSON.parse(execFileSync('supabase', ['status', '-o', 'json'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }))
  const api = new URL(status.API_URL)
  const db = new URL(status.DB_URL)
  if (!['127.0.0.1', 'localhost'].includes(api.hostname) || api.protocol !== 'http:' || api.port !== '54321' || api.pathname !== '/' || api.search || api.hash || api.username || api.password ||
      !['127.0.0.1', 'localhost'].includes(db.hostname) || db.port !== '54322' || db.protocol !== 'postgresql:' || db.pathname !== '/postgres' || db.search || db.hash) {
    throw new Error('Non-local Supabase status refused')
  }
  const publicKey = requirePublicClientKey(status.PUBLISHABLE_KEY || status.ANON_KEY)
  const adminKey = status.SERVICE_ROLE_KEY || status.SECRET_KEY
  if (!adminKey) throw new Error('Local admin key missing')
  const admin = createClient(API, adminKey, options)
  const conn = new pg.Client({ connectionString: status.DB_URL })
  await conn.connect()
  const env = { ...process.env, BABIN_E2E_DISPOSABLE: '1', E2E_LOCAL_URL: API, E2E_LOCAL_ANON_KEY: publicKey }
  try {
    const branch = (await conn.query('select id from public.branches where is_active order by is_headquarters desc, created_at asc limit 1')).rows[0]?.id
    if (!branch) throw new Error('No seeded active branch; migration/fixture prerequisite missing')
    for (const [prefix, role] of [['OWNER', 'Owner'], ['MANAGER', 'Manager'], ['STAFF', 'Warehouse']]) {
      const email = 'disposable-' + prefix.toLowerCase() + '-' + randomUUID() + '@example.test'
      const password = randomBytes(32).toString('base64url')
      const created = await admin.auth.admin.createUser({ email, password, email_confirm: true })
      if (created.error || !created.data.user) throw new Error('Local Auth user creation failed: ' + role)
      const uid = created.data.user.id
      await conn.query('insert into public.users (id, client_uuid, employee_code, email, full_name, mobile, primary_role, branch_id, is_active) values ($1,$2,$3,$4,$5,$6,$7,$8,true)', [uid, randomUUID(), 'CI-' + prefix + '-' + randomBytes(4).toString('hex'), email, 'Disposable ' + role, '+977-9800000000', role, branch])
      const client = createClient(API, publicKey, options)
      const auth = await client.auth.signInWithPassword({ email, password })
      if (auth.error || auth.data.user?.id !== uid) throw new Error('Local Auth preflight failed: ' + role)
      const profile = await client.from('users').select('id,primary_role').eq('id', uid).single()
      if (profile.error || profile.data?.primary_role !== role) throw new Error('Local role preflight failed: ' + role)
      await client.auth.signOut()
      env['E2E_' + prefix + '_EMAIL'] = email
      env['E2E_' + prefix + '_PASSWORD'] = password
      console.log('Verified disposable role: ' + role)
    }
  } finally {
    await conn.end()
  }
  // Do not expose admin keys to the browser or persist credentials to files.
  const suite = process.env.E2E_TARGET_SUITE ?? 'all'
  if (!['all', 'rental-draft'].includes(suite)) throw new Error('Unknown disposable E2E target suite')
  const target = suite === 'rental-draft' ? ['tests/e2e/rental-draft-persistence.spec.ts'] : []
  const result = spawnSync(process.execPath, ['node_modules/@playwright/test/cli.js', 'test', '--config=playwright.disposable.config.ts', ...target], { env, stdio: 'inherit' })
  if (result.status !== 0) throw new Error('Disposable Playwright run failed')
}
run().catch(() => { console.error('Disposable E2E failed. Inspect the failing step and role preflight; no credentials printed.'); process.exitCode = 1 })
