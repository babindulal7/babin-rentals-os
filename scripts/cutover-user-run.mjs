// USER-RUN ONLY (N-5). Agents may test with local clients, never execute this CLI against live.
import { readFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { dirname, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { backupEnvironment } from './backup-db.mjs'
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
export const PROJECT = 'sxguwvgoserhdolewibb'
export const FILES = [
  '0157_audit_triggers_for_trigger_less_tables.sql', '0158_settings_table.sql',
  '0159_saved_views.sql', '0160_pricing_structures.sql', '0161_grant_booking_project_type.sql',
  '0162_grant_non_money_columns.sql', '0163_close_six_anon_business_rpcs.sql',
  '0164_booking_discount_vat_payment_integrity.sql', '0165_delivery_jobs_and_event_rpc.sql',
  '0166_booking_transport_dispatch.sql', '0167_rental_revert_archive.sql',
  '0168_booking_line_totals_and_breakdown.sql',
  '0169_pin_intel_and_guard_search_paths.sql',
]
export function cutoverConnection(connection) {
  const env = backupEnvironment(connection, {})
  const direct = env.PGHOST === `db.${PROJECT}.supabase.co` && env.PGUSER === 'postgres'
  const pooler = env.PGHOST.endsWith('.pooler.supabase.com') && env.PGUSER === `postgres.${PROJECT}`
  if ((!direct && !pooler) || env.PGPORT !== '5432' || env.PGDATABASE !== 'postgres') throw new Error('Only the Babin direct connection or session pooler on port 5432 is accepted.')
  return { host: env.PGHOST, port: 5432, database: env.PGDATABASE, user: env.PGUSER,
    password: env.PGPASSWORD, ssl: { rejectUnauthorized: true }, options: '-c search_path=public,pg_temp', connectionTimeoutMillis: 20000 }
}
// Remove only the reviewed outer transaction, preserving dollar-quoted function bodies.
export function prepareMigration(file, sql) {
  if (!FILES.includes(file)) throw new Error('Migration is outside the reviewed cutover range.')
  const start = /^((?:\s|--[^\r\n]*(?:\r?\n|$)|\/\*[\s\S]*?\*\/)*)begin\s*;/i
  const end = /\bcommit\s*;\s*$/i
  if (!start.test(sql) || !end.test(sql)) throw new Error(`Expected explicit outer transaction: ${file}`)
  return { file, name: file.slice(0, -4), body: sql.replace(start, '$1').replace(end, ''),
    sha256: createHash('sha256').update(sql).digest('hex') }
}
export function pendingMigrations(migrations, ledger) {
  const applied = new Set(ledger.map(row => row.name))
  if (!applied.has('0156_operation_session_audit_actor')) throw new Error('Expected live baseline is missing. Refresh and review the migration plan.')
  return migrations.filter(migration => !applied.has(migration.name))
}
// Caller holds the cutover lock. Each body and ledger receipt share one transaction.
export async function applyPending(client, migrations, ledger, onApplied = () => {}, now = Date.now()) {
  const pending = pendingMigrations(migrations, ledger)
  const versions = new Set(ledger.map(row => row.version))
  let stamp = now
  const applied = []
  for (const migration of pending) {
    let version
    do { version = new Date(stamp).toISOString().replace(/\D/g, '').slice(0, 14); stamp += 1000 } while (versions.has(version))
    versions.add(version)
    try {
      await client.query('begin')
      await client.query("set local lock_timeout = '10s'")
      await client.query("set local statement_timeout = '120s'")
      await client.query(migration.body)
      await client.query('insert into supabase_migrations.schema_migrations(version, name) values ($1, $2)', [version, migration.name])
      await client.query('commit')
    } catch {
      await client.query('rollback').catch(() => {})
      throw new Error(`Stopped at ${migration.file}. Earlier committed files: ${applied.length}. Refresh the ledger before retrying; inspect an uncertain commit before proceeding.`)
    }
    applied.push({ file: migration.file, version, sha256: migration.sha256 })
    onApplied(applied.at(-1))
  }
  return applied
}
export function verifyBackup(file, checksum, run = spawnSync) {
  if (!file || file.endsWith('.incomplete') || !/^[a-f0-9]{64}$/i.test(checksum || '')) throw new Error('A verified backup file and recorded SHA-256 are required.')
  const hash = createHash('sha256').update(readFileSync(file)).digest('hex')
  if (hash !== checksum.toLowerCase()) throw new Error('Backup checksum does not match.')
  const cleanEnv = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith('PG') && !key.startsWith('BABIN_CUTOVER_') && key !== 'SUPABASE_DB_URL'))
  const result = run(process.execPath, [resolve(root, 'scripts/check-dump.mjs'), resolve(file)], {
    env: cleanEnv, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 1024 * 1024,
  })
  if (result.error || result.status !== 0) throw new Error('Backup validation failed; cutover refused.')
  return hash
}
async function main() {
  if (process.env.BABIN_CUTOVER_CONFIRM !== 'APPLY-LIVE') throw new Error('Use the interactive USER-RUN PowerShell wrapper.')
  verifyBackup(process.env.BABIN_CUTOVER_BACKUP, process.env.BABIN_CUTOVER_BACKUP_SHA256)
  const configuration = cutoverConnection(process.env.BABIN_CUTOVER_DB_URL || '')
  const migrations = FILES.map(file => prepareMigration(file, readFileSync(resolve(root, 'supabase/migrations', file), 'utf8')))
  const { Client } = await import('pg')
  const client = new Client(configuration)
  try {
    await client.connect()
    const lock = await client.query("select pg_try_advisory_lock(hashtext('babin-user-cutover')) as acquired")
    if (lock.rows[0]?.acquired !== true) throw new Error('Another cutover holds the migration lock.')
    const ledger = await client.query('select version, name from supabase_migrations.schema_migrations order by version')
    const pending = pendingMigrations(migrations, ledger.rows)
    console.log(JSON.stringify({ project: PROJECT, pending: pending.map(m => ({ file: m.file, sha256: m.sha256 })), skipped: migrations.length - pending.length }))
    const applied = await applyPending(client, migrations, ledger.rows, row => console.log(JSON.stringify({ committed: row })))
    console.log(`Committed ${applied.length} migration(s). Refresh the ledger and run post-cutover checks; application role acceptance is still required.`)
  } finally { await client.end().catch(() => {}) }
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch(() => {
    console.error('Cutover stopped. Credentials and server diagnostics are suppressed. Review committed-file receipts, refresh the live ledger, and inspect the first pending file before retrying.')
    process.exitCode = 1
  })
}
