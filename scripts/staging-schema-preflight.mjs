#!/usr/bin/env node
/**
 * Staging migration source-integrity preflight.
 * READ ONLY: uses local files only; never connects to Supabase or executes SQL.
 *
 * node scripts/staging-schema-preflight.mjs
 *
 * This checks exact Git blob SHA-1 and byte size against the independently
 * pinned main-commit inventory. A hash mismatch BLOCKS schema promotion.
 * A hash match does not approve any migration for deployment.
 */
import { createHash } from 'node:crypto'
import { readFileSync, readdirSync } from 'node:fs'
import { join, dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const dir = join(root, 'supabase', 'migrations')

const args = process.argv.slice(2)
let inventoryFile = 'STAGING_SQL_INVENTORY_2026-11-16.json'
const invIdx = args.indexOf('--inventory')
if (invIdx !== -1 && args[invIdx + 1]) {
  inventoryFile = args[invIdx + 1]
} else if (args.includes('--current') || args.includes('--latest') || process.env.STAGING_INVENTORY === 'current') {
  inventoryFile = 'STAGING_SQL_INVENTORY_2026-11-23.json'
}

const inventoryPath = inventoryFile.startsWith('/') || inventoryFile.includes(':') || inventoryFile.startsWith('.')
  ? resolve(inventoryFile)
  : join(root, 'docs', 'verification', inventoryFile)

const fileNames = readdirSync(dir).filter((name) => name.endsWith('.sql')).sort()
const inventory = JSON.parse(readFileSync(inventoryPath, 'utf8'))
const expectedEntries = Array.isArray(inventory.files) ? inventory.files : []
const expectedByName = new Map(expectedEntries.map((entry) => [entry.filename, entry]))
const actualNames = new Set(fileNames)
const errors = []
const attention = []
const prefixes = new Map()
const manifestHash = createHash('sha256')
let totalBytes = 0

if (fileNames.length !== expectedEntries.length) {
  errors.push('migration file count differs from pinned inventory: local=' + fileNames.length + ', pinned=' + expectedEntries.length)
}
if (expectedByName.size !== expectedEntries.length) {
  errors.push('duplicate filename in pinned inventory')
}
for (const name of fileNames) {
  const content = readFileSync(join(dir, name))
  const sha1 = createHash('sha1').update('blob ' + content.length + '\0').update(content).digest('hex')
  const sha256 = createHash('sha256').update(content).digest('hex')
  const expected = expectedByName.get(name)
  totalBytes += content.length
  manifestHash.update(name).update('\0').update(sha256).update('\n')
  const number = /^(\d{4}|\d{14})_[a-z0-9_]+\.sql$/.exec(name)?.[1] ?? 'unknown'
  prefixes.set(number, [...(prefixes.get(number) || []), name])

  if (!expected) errors.push(name + ': absent from pinned inventory')
  else {
    if (expected.git_blob_sha !== sha1) errors.push(name + ': Git blob digest differs from pinned source')
    if (expected.bytes !== content.length) errors.push(name + ': byte length differs from pinned source')
  }
  if (!content.length) errors.push(name + ': empty SQL source')
  if (number === 'unknown') errors.push(name + ': nonstandard source filename')
  if (/^(0012|0047|0082)_/.test(name)) attention.push(name + ': seed/identity/corpus review required before permanent staging install')
  if (content.length > 500000) attention.push(name + ': large SQL file requires review')
}
for (const entry of expectedEntries) {
  if (!actualNames.has(entry.filename)) errors.push(entry.filename + ': pinned file is missing locally')
}
const collisions = [...prefixes.entries()].filter(([, names]) => names.length > 1)
for (const [number, names] of collisions) {
  if (number !== '0188' ||
      names.length !== 2 ||
      !names.includes('0188_smart_reservation_holds.sql') ||
      !names.includes('0188_staff_renting_gear.sql')) {
    errors.push(number + ': unreviewed numeric migration prefix collision')
  } else attention.push('0188: two distinct preserved files; explicit dependency order required')
}
const output = {
  mode: 'READ_ONLY_PINNED_SOURCE_INTEGRITY',
  target: 'LOCAL_FILES_ONLY',
  sqlExecuted: false,
  databaseConnected: false,
  sourceBaseline: inventory.source_main_commit,
  localFileCount: fileNames.length,
  pinnedFileCount: expectedEntries.length,
  totalBytes,
  sha256ManifestFingerprint: manifestHash.digest('hex'),
  sourceIdentityVerified: errors.length === 0,
  approvalToApplyStaging: false,
  status: errors.length ? 'BLOCKED_SOURCE_DRIFT' : 'SOURCE_IDENTITY_VERIFIED_REVIEW_STILL_REQUIRED',
  errors,
  attention,
  nextStep: errors.length
    ? 'Sync with the exact source baseline, then rerun this preflight. No database writes.'
    : 'Review SQL content/dependencies, seeds and backup plan before staged installation. No automatic apply.'
}
console.log(JSON.stringify(output, null, 2))
if (errors.length) process.exitCode = 2
