import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { PGlite } from '@electric-sql/pglite'
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto'
import { btree_gist } from '@electric-sql/pglite/contrib/btree_gist'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { FILES, PROJECT, prepareMigration, pendingMigrations, cutoverConnection, applyPending, verifyBackup } from './cutover-user-run.mjs'
const baseline = [{ version: 'V0', name: '0156_operation_session_audit_actor' }]
const prepared = FILES.map(file => prepareMigration(file, readFileSync(new URL(`../supabase/migrations/${file}`, import.meta.url), 'utf8')))

test('direct CLI invocation refuses missing human confirmation before database access', () => {
  const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith('BABIN_CUTOVER_')))
  env.BABIN_CUTOVER_DB_URL = 'postgresql://postgres:sentinel-secret@missing.invalid/postgres'
  const result = spawnSync(process.execPath, [fileURLToPath(new URL('./cutover-user-run.mjs', import.meta.url))], { env, encoding: 'utf8', timeout: 20000 })
  assert.equal(result.status, 1)
  assert.ok(result.stderr.includes('Cutover stopped'))
  assert.ok(!`${result.stdout}${result.stderr}`.includes('sentinel-secret'))
})

test('all reviewed files preserve their bodies; seeds and unknown files are refused', () => {
  assert.equal(prepared.length, 13)
  assert.ok(prepared.every(row => row.sha256.length === 64 && row.body.trim().length > 0))
  assert.throws(() => prepareMigration('0047_seed_reference_corpus.sql', 'begin; select 1; commit;'))
  assert.throws(() => prepareMigration(FILES[0], 'select 1;'))
  const sql = '-- note\nBEGIN; DO $$ BEGIN PERFORM 1; END $$; COMMIT;'
  assert.equal(prepareMigration(FILES[0], sql).body, '-- note\n DO $$ BEGIN PERFORM 1; END $$; ')
})

test('actual snapshot skips 0164, retains all twelve pending files and requires the baseline', () => {
  const snapshot = readFileSync(new URL('../docs/live/schema_migrations_2026-10-17.txt', import.meta.url), 'utf8')
  const ledger = snapshot.split(/\r?\n/).filter(line => !line.startsWith('#') && line.trim()).map(line => {
    const [version, name] = line.trim().split(/\s+/)
    return { version, name }
  })
  const pending = pendingMigrations(prepared, ledger)
  assert.equal(pending.length, 12)
  assert.ok(!pending.some(row => row.file.startsWith('0164')))
  assert.throws(() => pendingMigrations(prepared, []), /baseline/)
  assert.equal(pendingMigrations(prepared, [...baseline, ...prepared.map(row => ({ name: row.name }))]).length, 0)
})

test('connection is pinned to Babin with verified TLS and refuses transaction pooling', () => {
  const direct = `postgresql://postgres:sentinel@db.${PROJECT}.supabase.co:5432/postgres`
  assert.equal(cutoverConnection(direct).ssl.rejectUnauthorized, true)
  assert.equal(cutoverConnection(direct).options, '-c search_path=public,pg_temp')
  assert.equal(cutoverConnection(`postgresql://postgres.${PROJECT}:sentinel@aws-0-region.pooler.supabase.com:5432/postgres`).port, 5432)
  for (const uri of [direct.replace(':5432', ':6543'), direct.replace(PROJECT, 'other'), `${direct}?sslmode=disable`, direct.replace('/postgres', '/other')]) {
    assert.throws(() => cutoverConnection(uri), error => !error.message.includes('sentinel'))
  }
})

test('backup checksum, validation failure and missing proof all stop execution', () => {
  const file = join(mkdtempSync(join(tmpdir(), 'babin-cutover-')), 'dump.sql')
  writeFileSync(file, 'backup fixture')
  const hash = createHash('sha256').update('backup fixture').digest('hex')
  let calls = 0
  assert.equal(verifyBackup(file, hash, (_cmd, args, options) => {
    calls++
    assert.ok(args[0].endsWith('check-dump.mjs'))
    assert.equal(options.env.BABIN_CUTOVER_DB_URL, undefined)
    return { status: 0 }
  }), hash)
  assert.equal(calls, 1)
  assert.throws(() => verifyBackup(file, '0'.repeat(64)), /checksum/)
  assert.throws(() => verifyBackup(file, hash, () => ({ status: 1, stderr: 'secret' })), /validation/)
  assert.throws(() => verifyBackup('', ''), /required/)
  assert.throws(() => verifyBackup(`${file}.incomplete`, hash), /required/)
})

test('PGlite: DDL and ledger commit atomically; failure rolls back and retry skips committed work', async () => {
  const db = new PGlite()
  await db.exec('create schema supabase_migrations; create table supabase_migrations.schema_migrations(version text primary key, name text);')
  await db.query('insert into supabase_migrations.schema_migrations values ($1,$2)', [baseline[0].version, baseline[0].name])
  const client = { query: (sql, params) => params ? db.query(sql, params) : db.exec(sql) }
  const one = prepareMigration(FILES[0], 'begin; create table cutover_one(id integer); commit;')
  const two = prepareMigration(FILES[1], 'begin; create table cutover_two(id integer); select 1/0; commit;')
  const receipts = []
  try {
    await assert.rejects(() => applyPending(client, [one, two], baseline, row => receipts.push(row)), /Stopped at 0158/)
    assert.equal(receipts.length, 1)
    assert.equal((await db.query("select to_regclass('cutover_two') as name")).rows[0].name, null)
    const ledger = (await db.query('select version,name from supabase_migrations.schema_migrations')).rows
    assert.ok(ledger.some(row => row.name === one.name))
    assert.ok(!ledger.some(row => row.name === two.name))
    const fixed = prepareMigration(FILES[1], 'begin; create table cutover_two(id integer); commit;')
    assert.equal((await applyPending(client, [one, fixed], ledger)).length, 1)
    const final = (await db.query('select version,name from supabase_migrations.schema_migrations')).rows
    assert.equal((await applyPending(client, [one, fixed], final)).length, 0)
  } finally { await db.close() }
})

test('PGlite: a ledger failure also rolls back the migration body', async () => {
  const db = new PGlite()
  await db.exec("create schema supabase_migrations; create table supabase_migrations.schema_migrations(version text primary key, name text check(name='denied')); ")
  try {
    const migration = prepareMigration(FILES[0], 'begin; create table must_rollback(id integer); commit;')
    await assert.rejects(() => applyPending({ query: (sql, params) => params ? db.query(sql, params) : db.exec(sql) }, [migration], baseline), /Stopped/)
    assert.equal((await db.query("select to_regclass('must_rollback') as name")).rows[0].name, null)
  } finally { await db.close() }
})

test('local rehearsal executes the actual curated batch and skips already-applied 0164', async () => {
  const db = await PGlite.create({ extensions: { pgcrypto, btree_gist } })
  const directory = new URL('../supabase/migrations/', import.meta.url)
  try {
    await db.exec(readFileSync(new URL('../supabase/pglite-prelude.sql', import.meta.url), 'utf8'))
    // Local fixture construction only: historical seeds never enter the runner manifest.
    for (const file of readdirSync(directory).filter(file => file.endsWith('.sql') && Number(file.slice(0, 4)) <= 156).sort()) {
      await db.exec(readFileSync(new URL(file, directory), 'utf8'))
    }
    await db.exec(readFileSync(new URL('0164_booking_discount_vat_payment_integrity.sql', directory), 'utf8'))
    await db.exec('create schema if not exists supabase_migrations; create table if not exists supabase_migrations.schema_migrations(version text primary key, name text);')
    const ledger = [...baseline, { version: 'V164', name: '0164_booking_discount_vat_payment_integrity' }]
    for (const row of ledger) await db.query('insert into supabase_migrations.schema_migrations values($1,$2)', [row.version, row.name])
    const receipts = await applyPending({ query: (sql, params) => params ? db.query(sql, params) : db.exec(sql) }, prepared, ledger)
    assert.equal(receipts.length, 12)
    assert.ok(!receipts.some(row => row.file.startsWith('0164')))
    const final = (await db.query('select version,name from supabase_migrations.schema_migrations')).rows
    assert.equal(pendingMigrations(prepared, final).length, 0)
    assert.equal((await db.query("select count(*)::int as n from information_schema.columns where table_schema='public' and table_name='booking_lines' and column_name in ('line_total','price_breakdown')")).rows[0].n, 2)
  } finally { await db.close() }
})
