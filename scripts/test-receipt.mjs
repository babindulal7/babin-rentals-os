import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/** Hash source and verification inputs, never environment files or business data. */
export function verificationSourceHash(root) {
  const files = execFileSync('git', ['ls-files', '-co', '--exclude-standard', '-z', '--',
    'src', 'scripts', 'supabase', 'packages', 'package.json', 'package-lock.json',
    'tsconfig*.json', 'vite.config.ts', 'vitest.config.ts', '.github/workflows'], { cwd: root })
    .toString('utf8').split('\0').filter(file => file && !file.startsWith('src/archive/'))
  const hash = createHash('sha256')
  for (const file of [...new Set(files)].sort()) {
    hash.update(file).update('\0')
    try { hash.update(readFileSync(join(root, file))) }
    catch (error) {
      if (error.code !== 'ENOENT') throw error
      hash.update('<deleted>')
    }
    hash.update('\0')
  }
  return hash.digest('hex')
}

export function testReceipt(report, exitCode, before, after, at = new Date().toISOString()) {
  const keys = ['numTotalTests', 'numPassedTests', 'numFailedTests', 'numPendingTests']
  if (!report || keys.some(key => !Number.isSafeInteger(report[key]) || report[key] < 0)
    || report.numPassedTests + report.numFailedTests + report.numPendingTests !== report.numTotalTests
    || typeof report.success !== 'boolean') throw new Error('Missing or invalid structured test result')
  return { schemaVersion: 1, valid: true, at, total: report.numTotalTests, passed: report.numPassedTests,
    failed: report.numFailedTests, skipped: report.numPendingTests,
    success: exitCode === 0 && report.success && report.numTotalTests > 0 && report.numFailedTests === 0,
    sourceHash: before, sourceChanged: before !== after }
}

export function describeTestReceipt(receipt, currentHash) {
  if (!receipt || receipt.valid === false || !Number.isSafeInteger(receipt.total) || !Number.isSafeInteger(receipt.passed)
    || !Number.isSafeInteger(receipt.failed) || receipt.total < 0 || receipt.passed < 0
    || receipt.failed < 0 || receipt.passed > receipt.total
    || (receipt.sourceHash && (receipt.schemaVersion !== 1 || receipt.valid !== true
      || !Number.isSafeInteger(receipt.skipped) || receipt.skipped < 0
      || receipt.passed + receipt.failed + receipt.skipped !== receipt.total))) {
    return 'NOT VERIFIED — invalid test receipt'
  }
  const figures = `${receipt.passed}/${receipt.total} passed, ${receipt.failed} failed (recorded ${receipt.at ?? 'unknown'})`
  if (!receipt.sourceHash || receipt.sourceHash !== currentHash || receipt.sourceChanged) {
    return `Historical suite: ${figures}; current source NOT VERIFIED`
  }
  return receipt.success === true && receipt.total > 0 && receipt.failed === 0
    ? `PASS — ${figures}; source fingerprint matches`
    : `NOT PASSING — ${figures}; source fingerprint matches`
}
