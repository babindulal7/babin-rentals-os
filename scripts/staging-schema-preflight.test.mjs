import test from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

test('staging-schema-preflight checks 2026-11-22 inventory with zero errors and passes', () => {
  const child = spawnSync(process.execPath, ['scripts/staging-schema-preflight.mjs', '--current'], {
    cwd: process.cwd(),
    encoding: 'utf8',
    timeout: 60000,
  })
  assert.equal(child.error, undefined)
  assert.equal(child.status, 0, `Preflight exited with non-zero: ${child.stderr || child.stdout}`)
  const result = JSON.parse(child.stdout)
  assert.equal(result.mode, 'READ_ONLY_PINNED_SOURCE_INTEGRITY')
  assert.equal(result.localFileCount, 261)
  assert.equal(result.pinnedFileCount, 261)
  assert.equal(result.sourceIdentityVerified, true)
  assert.equal(result.status, 'SOURCE_IDENTITY_VERIFIED_REVIEW_STILL_REQUIRED')
  assert.deepEqual(result.errors, [])
  assert.equal(result.approvalToApplyStaging, false)
  assert.equal(result.databaseConnected, false)
  assert.equal(result.sqlExecuted, false)
})

test('staging-schema-preflight historical default detects drift from 2026-11-16 snapshot', () => {
  const child = spawnSync(process.execPath, ['scripts/staging-schema-preflight.mjs'], {
    cwd: process.cwd(),
    encoding: 'utf8',
    timeout: 60000,
  })
  assert.equal(child.error, undefined)
  assert.equal(child.status, 2)
  const result = JSON.parse(child.stdout)
  assert.equal(result.mode, 'READ_ONLY_PINNED_SOURCE_INTEGRITY')
  assert.equal(result.pinnedFileCount, 240)
  assert.equal(result.sourceIdentityVerified, false)
  assert.equal(result.status, 'BLOCKED_SOURCE_DRIFT')
  assert.ok(result.errors.length > 0)
})
