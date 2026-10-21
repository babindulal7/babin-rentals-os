import { test } from 'node:test'
import assert from 'node:assert/strict'
import { describeTestReceipt, isCurrentVerification, testReceipt as createTestReceipt } from './test-receipt.mjs'

const context = { sha: 'test-sha', command: 'npm run test', environment: 'isolated test', elapsedMs: 100 }
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
