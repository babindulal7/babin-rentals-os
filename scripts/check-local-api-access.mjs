#!/usr/bin/env node
/**
 * LOCAL-ONLY Supabase Auth + PostgREST access check. Never targets a hosted URL.
 *
 * Uses two synthetic user credentials from gitignored .env.localdb.local, and
 * its LOCAL anon/publishable key (never a service key). Read-only data probes.
 * No production data, tokens, passwords, or row contents are printed.
 *
 * Scenarios are operator-provided labels, NOT proof of delivery-job state.
 * Re-run after arranging synthetic jobs locally; independently inspect state.
 */
import { existsSync, readFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'
import { requireLocalApiUrl, requirePublicClientKey, readGateResult } from './local-api-guard.mjs'

const args = process.argv.slice(2)
if (args.includes('--help')) {
  console.log('Usage: npm run check:local-api -- --phase unassigned|assigned|completed|failed')
  console.log('Requires .env.localdb.local with local URL, local anon key, and synthetic Owner/Driver login credentials.')
  process.exit(0)
}
const phaseIndex = args.indexOf('--phase')
const phase = phaseIndex < 0 ? 'unassigned' : args[phaseIndex + 1]
if (phaseIndex >= 0 && !['unassigned', 'assigned', 'completed', 'failed'].includes(phase)) {
  console.error('Invalid phase. Use unassigned, assigned, completed or failed.')
  process.exit(2)
}
if (args.some((x, i) => x.startsWith('--') && !(x === '--phase' && i === phaseIndex))) {
  console.error('Unsupported argument. Use --help for available options.')
  process.exit(2)
}

function configFromLocalFile() {
  const path = new URL('../.env.localdb.local', import.meta.url)
  if (!existsSync(path)) throw new Error('Missing .env.localdb.local; refusing fallback to .env.local (production)')
  const vars = {}
  for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Z_0-9]+)\s*=\s*(.*)\s*$/)
    if (!match) continue
    vars[match[1]] = match[2].trim().replace(/^["']|["']$/g, '')
  }
  return vars
}

async function login(url, anonKey, vars, prefix, expectedRole) {
  const email = vars[prefix + '_EMAIL']
  const password = vars[prefix + '_PASSWORD']
  if (!email || !password) throw new Error('Missing synthetic ' + prefix + ' credentials in .env.localdb.local')
  const client = createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  })
  const result = await client.auth.signInWithPassword({ email, password })
  if (result.error || !result.data.user) throw new Error(prefix + ': local Auth login failed')
  const uid = result.data.user.id
  const { data, error } = await client.from('users').select('id,primary_role').eq('id', uid).maybeSingle()
  if (error || !data) throw new Error(prefix + ': missing or inaccessible staff user row; no role verification')
  if (data.primary_role !== expectedRole) {
    throw new Error(prefix + ': expected ' + expectedRole + ' role in database; got another role')
  }
  return client
}

async function countView(client, name, actor, expectation) {
  const result = await client.from(name).select('id', { count: 'exact', head: true })
  const checked = readGateResult(result, actor + ' / ' + name, expectation)
  console.log('PASS ' + actor + ' / ' + name + ': ' +
    (checked.kind === 'denied' ? 'access denied' : checked.count + ' visible rows'))
  return checked.count
}

async function run() {
  // Validate local target and key before createClient or any network call.
  const vars = configFromLocalFile()
  const url = requireLocalApiUrl(vars.LOCAL_SUPABASE_URL || vars.VITE_SUPABASE_URL)
  const anonKey = requirePublicClientKey(vars.LOCAL_SUPABASE_ANON_KEY || vars.VITE_SUPABASE_ANON_KEY)
  console.log('LOCAL-ONLY Auth/PostgREST gate | ' + url + ' | phase label: ' + phase)
  console.log('Phase is manually labeled: this checker cannot establish local job assignment state.')
  let owner, driver
  try {
    owner = await login(url, anonKey, vars, 'LOCAL_OWNER', 'Owner')
    driver = await login(url, anonKey, vars, 'LOCAL_DRIVER', 'Driver')

    for (const view of ['clients_v', 'client_directory_v']) {
      await countView(owner, view, 'Owner', 'populated')
      await countView(driver, view, 'Driver', 'empty-or-denied')
    }

    // Zero money rows for a Driver are inconclusive without at least one
    // corresponding Owner-visible synthetic financial record.
    let financeWithFixture = 0
    for (const table of ['invoices', 'payments', 'expenses']) {
      const ownerCount = await countView(owner, table, 'Owner', 'any')
      await countView(driver, table, 'Driver', 'empty-or-denied')
      if (ownerCount > 0) financeWithFixture++
      else console.log('UNVERIFIED ' + table + ': no Owner-visible synthetic financial fixture')
    }
    if (financeWithFixture === 0) throw new Error('No synthetic financial fixture; money-blind access cannot be certified')

    console.log('LOCAL AUTH/REST checks passed for this one manually labeled scenario.')
    console.log('This does not establish hosted parity, job-state coverage, or production release readiness.')
  } finally {
    if (driver) await driver.auth.signOut().catch(() => {})
    if (owner) await owner.auth.signOut().catch(() => {})
  }
}
run().catch(e => { console.error('LOCAL GATE FAILED: ' + e.message); process.exitCode = 1 })
