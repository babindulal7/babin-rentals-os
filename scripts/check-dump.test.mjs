import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const scriptPath = join(process.cwd(), 'scripts', 'check-dump.mjs')

function runCheckDump(args = []) {
  return spawnSync(process.execPath, [scriptPath, ...args], {
    encoding: 'utf8',
  })
}

test('check-dump: exits 2 when no argument provided', () => {
  const result = runCheckDump()
  assert.equal(result.status, 2)
  assert.match(result.stderr, /usage: npm run check:dump/)
})

test('check-dump: fails when file does not exist', () => {
  const result = runCheckDump(['non_existent_file.sql'])
  assert.equal(result.status, 1)
  assert.match(result.stdout, /FAIL  file exists/)
})

test('check-dump: fails on empty file', () => {
  const dir = mkdtempSync(join(tmpdir(), 'babin-check-dump-'))
  const file = join(dir, 'empty.sql')
  writeFileSync(file, '')

  const result = runCheckDump([file])
  assert.equal(result.status, 1)
  assert.match(result.stdout, /FAIL  size/)
})

test('check-dump: fails on truncated dump (missing complete marker)', () => {
  const dir = mkdtempSync(join(tmpdir(), 'babin-check-dump-'))
  const file = join(dir, 'truncated.sql')
  const content = [
    '-- PostgreSQL database dump',
    'CREATE TABLE public.bookings (id uuid);',
    'CREATE TABLE public.clients (id uuid);',
    'CREATE TABLE public.products (id uuid);',
    'CREATE TABLE public.security_deposits (id uuid);',
    'INSERT INTO public.bookings VALUES (gen_random_uuid());',
    '-- transfer interrupted',
  ].join('\n')
  writeFileSync(file, content)

  const result = runCheckDump([file])
  assert.equal(result.status, 1)
  assert.match(result.stdout, /FAIL  ends cleanly/)
})

test('check-dump: fails on missing required tables', () => {
  const dir = mkdtempSync(join(tmpdir(), 'babin-check-dump-'))
  const file = join(dir, 'missing_tables.sql')
  const content = [
    '-- PostgreSQL database dump',
    'CREATE TABLE public.other_table (id uuid);',
    'INSERT INTO public.other_table VALUES (gen_random_uuid());',
    '-- PostgreSQL database dump complete',
  ].join('\n')
  writeFileSync(file, content)

  const result = runCheckDump([file])
  assert.equal(result.status, 1)
  assert.match(result.stdout, /FAIL  contains bookings/)
  assert.match(result.stdout, /FAIL  contains clients/)
  assert.match(result.stdout, /FAIL  contains products/)
  assert.match(result.stdout, /FAIL  contains security_deposits/)
})

test('check-dump: fails on schema-only dump (no COPY or INSERT)', () => {
  const dir = mkdtempSync(join(tmpdir(), 'babin-check-dump-'))
  const file = join(dir, 'schema_only.sql')
  const content = [
    '-- PostgreSQL database dump',
    'CREATE TABLE public.bookings (id uuid);',
    'CREATE TABLE public.clients (id uuid);',
    'CREATE TABLE public.products (id uuid);',
    'CREATE TABLE public.security_deposits (id uuid);',
    '-- PostgreSQL database dump complete',
  ].join('\n')
  writeFileSync(file, content)

  const result = runCheckDump([file])
  assert.equal(result.status, 1)
  assert.match(result.stdout, /FAIL  contains row data/)
})

test('check-dump: succeeds (exit 0) on valid synthetic dump with all tables and data', () => {
  const dir = mkdtempSync(join(tmpdir(), 'babin-check-dump-'))
  const file = join(dir, 'valid_small.sql')
  // > 256KB to pass suspect check
  const padding = '-- '.padEnd(300 * 1024, 'x') + '\n'
  const content = [
    '-- PostgreSQL database dump',
    padding,
    'CREATE TABLE public.bookings (id uuid);',
    'CREATE TABLE public.clients (id uuid);',
    'CREATE TABLE public.products (id uuid);',
    'CREATE TABLE public.security_deposits (id uuid);',
    'COPY public.bookings (id) FROM stdin;',
    '11111111-1111-1111-1111-111111111111',
    '\\.',
    '-- PostgreSQL database dump complete',
  ].join('\n')
  writeFileSync(file, content)

  const result = runCheckDump([file])
  assert.equal(result.status, 0)
  assert.match(result.stdout, /PASS  is a PostgreSQL dump/)
  assert.match(result.stdout, /PASS  ends cleanly/)
  assert.match(result.stdout, /PASS  contains bookings/)
  assert.match(result.stdout, /PASS  contains clients/)
  assert.match(result.stdout, /PASS  contains products/)
  assert.match(result.stdout, /PASS  contains security_deposits/)
  assert.match(result.stdout, /PASS  contains row data/)
  assert.match(result.stdout, /Plausible|All checks passed/)
})
