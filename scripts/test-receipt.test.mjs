import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { coverageRunDirectory, describeTestReceipt, isCurrentVerification, latestCoverageReceipt, latestTestReceipt, testReceipt as createTestReceipt, writeTestReceipt } from './test-receipt.mjs'

const context = { sha: 'test-sha', command: 'npm run test', environment: 'isolated test', elapsedMs: 100, scope: 'full-suite' }
const testReceipt = (report, code, before, after) => createTestReceipt(report, code, before, after, '2026-10-21', context)

const green = { success: true, numTotalTests: 10, numPassedTests: 10, numFailedTests: 0, numPendingTests: 0 }
test('old receipts cannot certify current source', () => {
  assert.match(describeTestReceipt({ total: 4646, passed: 4646, failed: 0, at: '2026-10-16' }, 'today'), /Historical.*current source NOT VERIFIED/)
})
test('matching successful structured receipt certifies only its source', () => {
  const receipt = testReceipt(green, 0, 'same', 'same')
  assert.match(describeTestReceipt(receipt, 'same'), /^PASS/)
  assert.match(describeTestReceipt(receipt, 'changed'), /current source NOT VERIFIED/)
})
test('source changes during tests invalidate a green run', () => {
  assert.match(describeTestReceipt(testReceipt(green, 0, 'old', 'new'), 'old'), /NOT VERIFIED/)
})
test('failure and process exit cannot be overwritten by old success', () => {
  assert.match(describeTestReceipt(testReceipt(green, 1, 'same', 'same'), 'same'), /^NOT PASSING/)
  const failed = { ...green, success: false, numPassedTests: 9, numFailedTests: 1 }
  assert.match(describeTestReceipt(testReceipt(failed, 1, 'same', 'same'), 'same'), /9\/10 passed, 1 failed/)
})
test('missing, malformed and empty output never prove success', () => {
  assert.throws(() => testReceipt({}, 0, 'same', 'same'), /structured/)
  assert.throws(() => testReceipt({ ...green, numTotalTests: 1 }, 0, 'same', 'same'), /structured/)
  assert.match(describeTestReceipt(null, 'same'), /NOT VERIFIED/)
  assert.match(describeTestReceipt(testReceipt({ ...green, numTotalTests: 0, numPassedTests: 0 }, 0, 'same', 'same'), 'same'), /^NOT PASSING/)
})

test('an incomplete test count cannot certify a suite', () => {
  assert.throws(() => testReceipt({ ...green, numTotalTests: 11 }, 0, 'same', 'same'), /structured/)
  const receipt = testReceipt(green, 0, 'same', 'same')
  assert.match(describeTestReceipt({ ...receipt, total: 11 }, 'same'), /NOT VERIFIED/)
  assert.match(describeTestReceipt({ ...receipt, valid: undefined }, 'same'), /NOT VERIFIED/)
})

test('source-bound evidence still requires command, commit, elapsed time and environment', () => {
  const receipt = testReceipt(green, 0, 'same', 'same')
  assert.equal(isCurrentVerification(receipt, 'same'), true)
  for (const field of ['sha', 'command', 'environment', 'elapsedMs']) {
    const incomplete = { ...receipt, [field]: undefined }
    assert.equal(isCurrentVerification(incomplete, 'same'), false)
    assert.match(describeTestReceipt(incomplete, 'same'), /NOT VERIFIED/)
  }
  assert.equal(isCurrentVerification({ ...receipt, valid: false }, 'same'), false)
})

test('a focused passing run does not certify the full suite', () => {
  assert.match(describeTestReceipt({ ...testReceipt(green, 0, 'same', 'same'), scope: 'focused' }, 'same'), /NOT VERIFIED/)
})

test('an older run finishing green cannot hide a newer failed attempt', () => {
  const root = mkdtempSync(join(tmpdir(), 'babin-receipt-regression-'))
  try {
    const old = { ...testReceipt(green, 0, 'same', 'same'), runId: 'older', startedMs: 100 }
    const failed = { ...old, runId: 'newer', startedMs: 200, success: false, passed: 9, failed: 1 }
    writeTestReceipt(root, { ...old, valid: false })
    writeTestReceipt(root, failed)
    writeTestReceipt(root, old)
    assert.equal(latestTestReceipt(root).runId, 'newer')
    assert.match(describeTestReceipt(latestTestReceipt(root), 'same'), /^NOT PASSING/)
  } finally { rmSync(root, { recursive: true, force: true }) }
})

test('concurrent coverage runs have separate cleanup and temporary directories', () => {
  const root = join(tmpdir(), 'babin-coverage-paths')
  assert.notEqual(coverageRunDirectory(root, 'run-a'), coverageRunDirectory(root, 'run-b'))
  assert.equal(coverageRunDirectory(root, 'run-a'), join(root, 'artifacts', 'coverage-runs', 'run-a'))
  assert.throws(() => coverageRunDirectory(root, '../shared'), /safe run/)
})

test('a later plain test success cannot hide an incomplete or failed coverage run', () => {
  const root = mkdtempSync(join(tmpdir(), 'babin-coverage-receipt-'))
  try {
    const older = {...testReceipt(green,0,'same','same'),runId:'old-coverage',startedMs:100,kind:'coverage'}
    const current = {...older,runId:'new-coverage',startedMs:200,valid:false,success:false}
    writeTestReceipt(root, older)
    writeTestReceipt(root, current)
    writeTestReceipt(root, {...older,runId:'plain-success',startedMs:300,kind:'test'})
    writeTestReceipt(root, older)
    assert.equal(latestCoverageReceipt(root).runId,'new-coverage')
    assert.match(describeTestReceipt(latestCoverageReceipt(root),'same'),/NOT VERIFIED/)
    assert.equal(latestTestReceipt(root).runId,'plain-success')
    writeTestReceipt(root,{...current,valid:true,failed:1,passed:9})
    assert.match(describeTestReceipt(latestCoverageReceipt(root),'same'),/NOT PASSING/)
  } finally { rmSync(root,{recursive:true,force:true}) }
})
