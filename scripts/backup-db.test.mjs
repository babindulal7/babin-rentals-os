import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, writeSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { backupEnvironment, runBackup } from './backup-db.mjs'

const connection = 'postgresql://staff:sentinel%40password@staging.invalid:5432/postgres?sslmode=require'
test('credentials only enter environment and insecure options are rejected', () => {
  const environment = backupEnvironment(connection, { PGOPTIONS: 'unsafe', SUPABASE_DB_URL: connection, PATH: 'tools' })
  assert.equal(environment.PGPASSWORD, 'sentinel@password')
  assert.equal(environment.PGSSLMODE, 'require')
  assert.equal(environment.PGOPTIONS, undefined)
  assert.equal(environment.SUPABASE_DB_URL, undefined)
  for (const uri of ['invalid', connection.replace('require', 'disable'), `${connection}&password=leak`]) {
    assert.throws(() => backupEnvironment(uri), (error) => !error.message.includes('sentinel'))
  }
})
test('validated dump has a checksum, refuses overwrite, and passes no URI to pg_dump', () => {
  const output = join(mkdtempSync(join(tmpdir(), 'babin-backup-')), 'backup.sql')
  const run = (command, args, options) => {
    assert.ok(!args.some((argument) => argument.includes('sentinel') || argument.includes('postgresql://')))
    if (command === 'pg_dump') writeSync(options.stdio[1], '-- PostgreSQL database dump\n-- PostgreSQL database dump complete\n')
    return { status: 0 }
  }
  const result = runBackup({ connection, output, run })
  assert.equal(result.validation, 'PASS')
  assert.equal(result.restore, 'NOT VERIFIED')
  assert.equal(result.sha256.length, 64)
  assert.ok(readFileSync(output, 'utf8').includes('dump complete'))
  assert.throws(() => runBackup({ connection, output, run }), /already exists/)
})
test('dump and validation failures retain incomplete output and suppress diagnostics', () => {
  for (const failure of ['dump', 'validation']) {
    const output = join(mkdtempSync(join(tmpdir(), 'babin-backup-')), 'backup.sql')
    const run = (command, args, options) => {
      if (command === 'pg_dump') writeSync(options.stdio[1], '-- PostgreSQL database dump\n')
      return { status: (failure === 'dump' ? command === 'pg_dump' : command !== 'pg_dump') ? 1 : 0, stderr: connection }
    }
    assert.throws(() => runBackup({ connection, output, run }), (error) => !error.message.includes('sentinel'))
    assert.equal(existsSync(output), false)
    assert.equal(existsSync(`${output}.incomplete`), true)
  }
})
