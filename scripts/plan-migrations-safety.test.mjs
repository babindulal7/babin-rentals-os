import test from 'node:test'
import assert from 'node:assert/strict'
import { copyFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'

const HERE = dirname(fileURLToPath(import.meta.url))
const SCRIPT = join(HERE, 'plan-migrations.mjs')

/**
 * Create an isolated fake repository. Never connect to Supabase or real git
 * checkout data: the planner consumes ONLY supplied files on disk.
 */
function runFixture({ migrations, history, flags = [] }) {
  const root = mkdtempSync(join(tmpdir(), 'babin-migration-plan-safety-'))
  try {
    const scriptDir = join(root, 'scripts')
    const migrationDir = join(root, 'supabase', 'migrations')
    const liveDir = join(root, 'docs', 'live')
    mkdirSync(scriptDir, { recursive: true })
    mkdirSync(migrationDir, { recursive: true })
    mkdirSync(liveDir, { recursive: true })
    copyFileSync(SCRIPT, join(scriptDir, 'plan-migrations.mjs'))
    for (const name of migrations) {
      writeFileSync(join(migrationDir, name), [
        '-- synthetic local unit-test fixture, never for real application',
        '-- seed files are one-shot and must not be deployed',
        'select 1;',
        '',
      ].join('\n'))
    }
    const snapshot = join(liveDir, 'schema_migrations_fixture.txt')
    writeFileSync(snapshot, history.map((name, i) =>
      `${20261101000000 + i} ${name}`,
    ).join('\n') + '\n')
    const result = spawnSync(process.execPath, [
      join(scriptDir, 'plan-migrations.mjs'),
      ...flags,
      snapshot,
    ], {
      cwd: root,
      encoding: 'utf8',
      timeout: 10000,
    })
    if (result.error) throw result.error
    return { status: result.status, text: result.stdout + result.stderr }
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
}

test('default planner refuses a rename even when it is on the reviewed allow-list', () => {
  const result = runFixture({
    migrations: ['0059_users_self_read_accepts_auth_uid.sql'],
    history: ['0057_users_self_read_accepts_auth_uid'],
  })
  assert.equal(result.status, 2, result.text)
  assert.match(result.text, /Rename acceptance is OFF by default/)
})

test('explicit reviewed mode accepts ONLY the matching reviewed rename', () => {
  const result = runFixture({
    migrations: ['0059_users_self_read_accepts_auth_uid.sql'],
    history: ['0057_users_self_read_accepts_auth_uid'],
    flags: ['--accept-rename'],
  })
  assert.equal(result.status, 0, result.text)
  assert.match(result.text, /exact reviewed match/)
})

test('explicit reviewed mode refuses an unknown lookalike rename', () => {
  const result = runFixture({
    migrations: ['0300_test_identity_guard.sql'],
    history: ['0299_test_identity_guard'],
    flags: ['--accept-rename'],
  })
  assert.equal(result.status, 2, result.text)
  assert.match(result.text, /UNREVIEWED — MUST INVESTIGATE/)
  assert.match(result.text, /NO PLAN ISSUED/)
})

test('a quarantined seed cannot mask a different hazardous pending seed', () => {
  const result = runFixture({
    migrations: ['0001_base.sql', '0047_seed_reference_corpus.sql', '0300_seed_unreviewed.sql'],
    history: ['0001_base'],
    flags: ['--accept-rename'],
  })
  assert.equal(result.status, 2, result.text)
  assert.match(result.text, /QUARANTINED HAZARDS/)
  assert.match(result.text, /unreviewed pending hazard/)
  assert.match(result.text, /0300_seed_unreviewed\.sql/)
})

test('explicit reviewed mode excludes only the specifically quarantined 0047 seed', () => {
  const result = runFixture({
    migrations: ['0001_base.sql', '0047_seed_reference_corpus.sql'],
    history: ['0001_base'],
    flags: ['--accept-rename'],
  })
  assert.equal(result.status, 0, result.text)
  assert.match(result.text, /QUARANTINED HAZARDS/)
  assert.match(result.text, /Plan complete: 0 file\(s\) to apply/)
})
