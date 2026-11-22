// T9-01 review P2: a failed migration must abort the Booqable reconciliation before any report,
// CSV or pass status is written. Runs the real script against temporary fixtures; no real data is read.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { copyFileSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const SCRIPT = process.env.RECONCILE_TEST_SCRIPT ?? join(HERE, 'reconcile-booqable-backup.mjs')
const PRELUDE = join(HERE, '..', 'supabase', 'pglite-prelude.sql')

// The tables the reconciliation queries. A broken migration that comes after these exist is the
// case the original script treated as success.
const OS_TABLES = `
create table public.products (id uuid primary key, asset_code text, name text, slug text, daily_rate numeric, tracking_mode text, status text, is_active boolean);
create table public.clients (id uuid primary key, client_code text, name text, phone text, email text, status text);
create table public.external_refs (id uuid primary key, provider text);
`

function fixture(migrations) {
  const root = mkdtempSync(join(tmpdir(), 'reconcile-repo-'))
  mkdirSync(join(root, 'supabase', 'migrations'), { recursive: true })
  mkdirSync(join(root, 'docs', 'verification'), { recursive: true })
  copyFileSync(PRELUDE, join(root, 'supabase', 'pglite-prelude.sql'))
  for (const [name, sql] of Object.entries(migrations)) {
    writeFileSync(join(root, 'supabase', 'migrations', name), sql)
  }
  const backup = mkdtempSync(join(tmpdir(), 'reconcile-backup-'))
  mkdirSync(join(backup, 'src', 'data', 'exports', 'raw'), { recursive: true })
  writeFileSync(join(backup, 'src', 'data', 'exports', 'raw', 'products.json'), '[]')
  writeFileSync(join(backup, 'src', 'data', 'exports', 'raw', 'customers.json'), '[]')
  return { root, backup }
}

function run({ root, backup }) {
  return spawnSync(process.execPath, [SCRIPT], {
    encoding: 'utf8',
    timeout: 120000,
    env: { ...process.env, RECONCILE_REPO_ROOT: root, RECONCILE_BACKUP_ROOT: backup },
  })
}

function cleanup({ root, backup }) {
  rmSync(root, { recursive: true, force: true })
  rmSync(backup, { recursive: true, force: true })
}

test('a failing migration after the OS tables exist aborts before any report or CSV is written', () => {
  const f = fixture({
    '0001_os_tables.sql': OS_TABLES,
    '0002_broken.sql': 'create table public.broken (;',
  })
  try {
    const result = run(f)
    assert.notEqual(result.status, 0, 'a failed migration must exit nonzero')
    assert.match(result.stderr, /MIGRATION FAILED: 0002_broken\.sql/)
    assert.match(result.stderr, /INVALID/)
    assert.deepEqual(readdirSync(join(f.root, 'docs', 'verification')), [], 'no report, CSV or pass status may be written')
  } finally {
    cleanup(f)
  }
})

test('missing OS tables after migrations abort before any report or CSV is written', () => {
  const f = fixture({ '0001_ok.sql': 'create table public.probe (id int);' })
  try {
    const result = run(f)
    assert.notEqual(result.status, 0, 'a reconciliation against missing tables must not pass')
    assert.deepEqual(readdirSync(join(f.root, 'docs', 'verification')), [], 'no report, CSV or pass status may be written')
  } finally {
    cleanup(f)
  }
})
