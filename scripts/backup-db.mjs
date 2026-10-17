import { spawnSync } from 'node:child_process'
import { closeSync, fsyncSync, linkSync, mkdirSync, openSync, readFileSync, statSync, unlinkSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { dirname, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const scriptDirectory = dirname(fileURLToPath(import.meta.url))

// RULING 2026-10-16: credentials stay in child environment; diagnostics never include connection values (N-8).
export function backupEnvironment(connection, inherited = process.env) {
  let target
  try { target = new URL(connection) } catch { throw new Error('A valid PostgreSQL connection URI is required.') }
  if (!['postgres:', 'postgresql:'].includes(target.protocol) || !target.hostname || !target.username) {
    throw new Error('A valid PostgreSQL connection URI is required.')
  }
  if ([...target.searchParams.keys()].some((key) => key !== 'sslmode')
      || (target.searchParams.has('sslmode') && !['require', 'verify-ca', 'verify-full'].includes(target.searchParams.get('sslmode')))) {
    throw new Error('Only a secure sslmode query parameter is supported. Remove other connection options.')
  }
  const environment = Object.fromEntries(Object.entries(inherited).filter(([key]) => !key.startsWith('PG') && key !== 'SUPABASE_DB_URL'))
  return {
    ...environment,
    PGHOST: target.hostname.replace(/^\[|\]$/g, ''),
    PGPORT: target.port || '5432',
    PGUSER: decodeURIComponent(target.username),
    PGPASSWORD: decodeURIComponent(target.password),
    PGDATABASE: decodeURIComponent(target.pathname.slice(1)) || 'postgres',
    PGSSLMODE: target.searchParams.get('sslmode') || 'require',
    PGCONNECT_TIMEOUT: '20',
  }
}

export function runBackup({ connection, output, run = spawnSync }) {
  const environment = backupEnvironment(connection)
  const destination = resolve(output)
  mkdirSync(dirname(destination), { recursive: true })
  if (statExists(destination) || statExists(`${destination}.incomplete`)) throw new Error('Backup output already exists. Choose a new filename.')
  const partial = `${destination}.incomplete`
  const descriptor = openSync(partial, 'wx', 0o600)
  try {
    const result = run('pg_dump', ['--no-password', '--clean', '--if-exists', '--quote-all-identifiers'], {
      env: environment, stdio: ['ignore', descriptor, 'pipe'], encoding: 'utf8', maxBuffer: 1024 * 1024,
    })
    if (result.error || result.status !== 0) throw new Error('pg_dump failed. Check client installation, network access and database credentials. Partial output remains marked incomplete.')
    fsyncSync(descriptor)
  } finally {
    closeSync(descriptor)
  }
  const validation = run(process.execPath, [resolve(scriptDirectory, 'check-dump.mjs'), partial], {
    env: Object.fromEntries(Object.entries(process.env).filter(([key]) => key !== 'SUPABASE_DB_URL' && key !== 'PGPASSWORD')),
    stdio: ['ignore', 'pipe', 'pipe'], encoding: 'utf8', maxBuffer: 1024 * 1024,
  })
  if (validation.error || validation.status !== 0) throw new Error('Dump validation failed. The file remains marked incomplete; no backup is certified.')
  const contents = readFileSync(partial)
  if (!/--\s*PostgreSQL database dump complete\b/.test(contents.toString('utf8'))) throw new Error('The dump completion marker is missing.')
  const sha256 = createHash('sha256').update(contents).digest('hex')
  linkSync(partial, destination)
  unlinkSync(partial)
  return { file: destination, bytes: contents.length, sha256, validation: 'PASS', restore: 'NOT VERIFIED' }
}

function statExists(path) {
  try { statSync(path); return true } catch (error) { if (error.code === 'ENOENT') return false; throw error }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const stamp = new Date().toISOString().replace(/[:.]/g, '-')
    const result = runBackup({ connection: process.env.SUPABASE_DB_URL || '', output: process.env.BABIN_BACKUP_FILE || resolve(scriptDirectory, '../backups', `production_backup_${stamp}.sql`) })
    console.log(JSON.stringify(result, null, 2))
    console.log('Store the checksum with the secure off-site copy. Restoration must be rehearsed on an isolated target.')
  } catch {
    console.error('Backup failed. No verified backup was produced. Check PostgreSQL client availability, SSL, credentials, output permissions and any .incomplete file. Connection details are suppressed.')
    process.exitCode = 1
  }
}
