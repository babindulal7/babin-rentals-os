import { readFileSync, mkdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

export const STAGING_ROLES = ['Owner', 'Admin', 'Manager', 'Coordinator', 'Warehouse', 'Technician', 'Accounts', 'Driver', 'Client']
const blind = new Set(['Warehouse', 'Technician', 'Driver', 'Client'])
const productionRef = 'sxguwvgoserhdolewibb'

export function stagingConfiguration(environment) {
  const reference = environment.BABIN_STAGING_PROJECT_REF
  const target = new URL(environment.BABIN_STAGING_SUPABASE_URL || 'https://missing.invalid')
  if (!reference || reference === productionRef || target.hostname !== `${reference}.supabase.co`
      || target.protocol !== 'https:' || target.username || target.password || target.search || target.pathname !== '/') {
    throw new Error('An explicit isolated staging Supabase project is required; production and URL overrides are refused.')
  }
  if (!environment.BABIN_STAGING_ANON_KEY || !environment.BABIN_STAGING_FIXTURES) throw new Error('Staging anon key and fixture manifest are required.')
  const tokens = Object.fromEntries(STAGING_ROLES.map((role) => [role, environment[`BABIN_STAGING_JWT_${role.toUpperCase()}`]]))
  if (Object.values(tokens).some((token) => !token)) throw new Error('All nine role JWTs are required; incomplete coverage cannot pass.')
  return { reference, url: target.origin, key: environment.BABIN_STAGING_ANON_KEY, tokens, manifest: environment.BABIN_STAGING_FIXTURES }
}

export async function verifyStaging(configuration, fixtures, request = fetch, inspectPrivileges) {
  const checks = []
  const record = (name, pass) => checks.push({ name, status: pass ? 'PASS' : 'FAIL' })
  const read = async (path, token = configuration.key) => {
    try {
      const response = await request(`${configuration.url}${path}`, {
        method: 'GET', headers: { apikey: configuration.key, Authorization: `Bearer ${token}` },
        redirect: 'error', signal: AbortSignal.timeout(20000),
      })
      return { status: response.status, body: await response.json() }
    } catch { return { status: 0, body: null } }
  }
  const rows = (response) => response.status === 200 && Array.isArray(response.body) ? response.body : null
  const denied = (response) => [401, 403].includes(response.status) || (rows(response)?.length === 0)
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
  for (const role of STAGING_ROLES) {
    const fixture = fixtures.roles?.[role]
    if (!fixture || ![fixture.userId, fixture.bookingId, fixture.lineId].every((value) => typeof value === 'string' && uuid.test(value))) {
      record(`${role}: known positive fixtures supplied`, false)
      continue
    }
    const token = configuration.tokens[role]
    const identity = await read('/auth/v1/user', token)
    record(`${role}: JWT identifies expected user`, identity.status === 200 && identity.body?.id === fixture.userId)
    const staff = await read(`/rest/v1/users?select=id,primary_role&id=eq.${fixture.userId}`, token)
    if (role !== 'Client') record(`${role}: database role matches expected role`, rows(staff)?.some((row) => row.primary_role === role) === true)
    const booking = await read(`/rest/v1/bookings?select=id&id=eq.${fixture.bookingId}`, token)
    record(`${role}: can read known permitted booking`, rows(booking)?.length === 1 && rows(booking)[0].id === fixture.bookingId)
    const line = await read(`/rest/v1/booking_lines_v?select=id,rate&id=eq.${fixture.lineId}`, token)
    if (blind.has(role)) {
      record(`${role}: line amounts suppressed`, denied(line) || (rows(line)?.length === 1 && rows(line)[0].rate === null))
      for (const table of ['payments', 'invoices', 'security_deposits', 'deposit_movements']) {
        record(`${role}: ${table} denied`, denied(await read(`/rest/v1/${table}?select=*&limit=1`, token)))
      }
      if (uuid.test(fixtures.productId || '')) {
        const product = await read(`/rest/v1/products_v?select=id,daily_rate&id=eq.${fixtures.productId}`, token)
        record(`${role}: catalogue amounts suppressed`, denied(product) || (rows(product)?.length === 1 && rows(product)[0].daily_rate === null))
      } else record(`${role}: catalogue fixture supplied`, false)
    } else {
      record(`${role}: positive financial fixture is readable`, rows(line)?.length === 1 && rows(line)[0].rate !== null)
    }
    if (role === 'Client') {
      if (!uuid.test(fixture.otherBookingId || '') || fixture.otherBookingId === fixture.bookingId) record('Client: cross-client fixture supplied', false)
      else record('Client: another client booking denied', denied(await read(`/rest/v1/bookings?select=id&id=eq.${fixture.otherBookingId}`, token)))
    }
    if (role === 'Driver') {
      if (!uuid.test(fixture.otherTransportId || '')) record('Driver: unassigned trip fixture supplied', false)
      else record('Driver: unassigned transport denied', denied(await read(`/rest/v1/booking_transport_v?select=id&id=eq.${fixture.otherTransportId}`, token)))
    }
  }
  for (const table of ['staff_directory_v', 'product_units_service_v', 'audit_logs']) {
    record(`anon: ${table} denied`, denied(await read(`/rest/v1/${table}?select=*&limit=1`)))
  }
  if (inspectPrivileges) {
    try { record('anon: mutating RPC execute privileges denied', await inspectPrivileges()) }
    catch { record('anon: mutating RPC privilege inspection', false) }
  } else checks.push({ name: 'anon: mutating RPC privilege inspection requires staging DB connection', status: 'INCOMPLETE' })
  return { project: configuration.reference, checks, status: checks.every((check) => check.status === 'PASS') ? 'PASS' : checks.some((check) => check.status === 'FAIL') ? 'FAIL' : 'INCOMPLETE' }
}

async function inspectStagingPrivileges(configuration, connection) {
  const target = new URL(connection)
  if (!['postgres:', 'postgresql:'].includes(target.protocol)
      || !(target.hostname === `db.${configuration.reference}.supabase.co`
        || (target.hostname.endsWith('.pooler.supabase.com') && decodeURIComponent(target.username) === `postgres.${configuration.reference}`))) {
    throw new Error('Staging database identity mismatch.')
  }
  target.search = ''
  const { Client } = await import('pg')
  const client = new Client({ connectionString: target.href, ssl: { rejectUnauthorized: true }, connectionTimeoutMillis: 20000 })
  try {
    await client.connect()
    await client.query('begin read only')
    await client.query("set local statement_timeout='20s'")
    const result = await client.query(`select p.proname from pg_proc p where p.pronamespace='public'::regnamespace
      and p.prokind='f' and p.prorettype<>'trigger'::regtype and p.provolatile='v'
      and p.proname not in ('set_request_context') and has_function_privilege('anon',p.oid,'execute')`)
    return result.rowCount === 0
  } finally { await client.query('rollback').catch(() => {}); await client.end() }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  let report
  try {
    const configuration = stagingConfiguration(process.env)
    const fixtures = JSON.parse(readFileSync(configuration.manifest, 'utf8'))
    const connection = process.env.BABIN_STAGING_DB_URL
    report = await verifyStaging(configuration, fixtures, fetch, connection ? () => inspectStagingPrivileges(configuration, connection) : undefined)
  } catch { report = { status: 'INCOMPLETE', checks: [{ name: 'Staging configuration, fixtures or connectivity unavailable. Credentials and response bodies are suppressed.', status: 'INCOMPLETE' }] } }
  const directory = resolve('artifacts/staging-verification', new Date().toISOString().replace(/[:.]/g, '-'))
  mkdirSync(directory, { recursive: true })
  const metadata = { ...report, at: new Date().toISOString(), environment: 'isolated staging', mode: 'GET requests and read-only SQL only' }
  writeFileSync(resolve(directory, 'REPORT.json'), JSON.stringify(metadata, null, 2))
  writeFileSync(resolve(directory, 'REPORT.md'), `# Staging verification: ${report.status}\n\n${metadata.at}\n\n${report.checks.map((check) => `- ${check.status}: ${check.name}`).join('\n')}\n`)
  console.log(`Staging verification ${report.status}. Redacted report: ${directory}`)
  process.exitCode = report.status === 'PASS' ? 0 : 2
}
