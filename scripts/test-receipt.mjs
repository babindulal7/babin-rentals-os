import { createHash, randomUUID } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, writeFileSync } from 'node:fs'
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

export function beginVerification(root, command, environment) {
  return { schemaVersion: 1, valid: false, success: false,
    runId: randomUUID(),
    sha: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root }).toString().trim(),
    command, environment, node: process.version, platform: process.platform,
    at: new Date().toISOString(), startedMs: Date.now(), sourceHash: verificationSourceHash(root) }
}

/** Concurrent runs retain separate receipts. Completion reads the newest
 * attempt, so an older slow green run cannot overwrite a later failure.
 */
export function latestTestReceipt(root) {
  const dir = join(root, 'artifacts', 'test-receipts')
  const paths = existsSync(dir) ? readdirSync(dir).filter(name => name.endsWith('.json')).map(name => join(dir, name)) : []
  paths.push(join(root, '.test-result.json'))
  const receipts = paths.flatMap(path => {
    try { return [JSON.parse(readFileSync(path, 'utf8'))] } catch { return [] }
  })
  return receipts.sort((a, b) => (b.startedMs ?? 0) - (a.startedMs ?? 0))[0] ?? null
}

export function writeTestReceipt(root, receipt) {
  if (!/^[a-zA-Z0-9-]+$/.test(receipt.runId ?? '')) throw new Error('Receipt requires a safe run ID')
  const dir = join(root, 'artifacts', 'test-receipts')
  mkdirSync(dir, { recursive: true })
  const atomicWrite = path => {
    const temp = `${path}.${process.pid}.tmp`
    writeFileSync(temp, JSON.stringify(receipt, null, 2))
    renameSync(temp, path)
  }
  atomicWrite(join(dir, `${receipt.runId}.json`))
  if (latestTestReceipt(root)?.runId === receipt.runId) {
    atomicWrite(join(root, '.test-result.json'))
  }
}

export function finishVerification(start, root, success) {
  return { ...start, valid: true, success, at: new Date().toISOString(),
    elapsedMs: Date.now() - start.startedMs, sourceChanged: start.sourceHash !== verificationSourceHash(root) }
}

export function isCurrentVerification(receipt, currentHash) {
  return receipt?.schemaVersion === 1 && receipt.valid === true && receipt.sourceHash === currentHash
    && receipt.sourceChanged === false && typeof receipt.sha === 'string' && receipt.sha.length > 0
    && typeof receipt.command === 'string' && receipt.command.length > 0
    && typeof receipt.environment === 'string' && receipt.environment.length > 0
    && Number.isSafeInteger(receipt.elapsedMs) && receipt.elapsedMs >= 0
}

export function testReceipt(report, exitCode, before, after, at = new Date().toISOString(), context = {}) {
  const keys = ['numTotalTests', 'numPassedTests', 'numFailedTests', 'numPendingTests']
  if (!report || keys.some(key => !Number.isSafeInteger(report[key]) || report[key] < 0)
    || report.numPassedTests + report.numFailedTests + report.numPendingTests !== report.numTotalTests
    || typeof report.success !== 'boolean') throw new Error('Missing or invalid structured test result')
  return { ...context, schemaVersion: 1, valid: true, at, total: report.numTotalTests, passed: report.numPassedTests,
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
  if (!isCurrentVerification(receipt, currentHash)) {
    return `Historical suite: ${figures}; current source NOT VERIFIED`
  }
  if (receipt.success === true && receipt.scope !== 'full-suite') return `NOT VERIFIED — focused or unspecified run: ${figures}`
  return receipt.success === true && receipt.total > 0 && receipt.failed === 0
    ? `PASS — ${figures}; source fingerprint matches`
    : `NOT PASSING — ${figures}; source fingerprint matches`
}
