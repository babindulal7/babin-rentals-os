#!/usr/bin/env node
/**
 * Read-only SHA-256 source integrity manifest for staging planning.
 * Does NOT connect to any database, send network requests, write files,
 * execute SQL, or authorize migration deployment.
 *
 * node scripts/verify-staging-source-hashes.mjs --json
 */
import { createHash } from 'node:crypto'
import { readFileSync, readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

if (process.argv.slice(2).some(flag => flag !== '--json')) {
  console.error('Only the read-only --json option is supported')
  process.exit(2)
}

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const dir = join(root, 'supabase', 'migrations')
const files = readdirSync(dir).filter(name => name.endsWith('.sql')).sort()
const prefixToFiles = new Map()
const rows = files.map(filename => {
  const content = readFileSync(join(dir, filename))
  const prefix = /^(\d{4})_/.exec(filename)?.[1] ?? 'UNKNOWN'
  prefixToFiles.set(prefix, [...(prefixToFiles.get(prefix) ?? []), filename])
  const flags = ['REVIEW_REQUIRED_NO_AUTO_APPLY']
  if (/^(0012|0047|0082)_/.test(filename)) flags.push('SEED_PRIVACY_ONE_SHOT_REVIEW')
  if (/^0241_/.test(filename)) flags.push('P0_RBAC_SOURCE_AND_STAGING_TEST_REQUIRED')
  if (/^0188_/.test(filename)) flags.push('DUPLICATE_PREFIX_DEPENDENCY_ORDER_REVIEW')
  if (/security definer/i.test(content.toString('utf8'))) flags.push('SECURITY_DEFINER_MANUAL_REVIEW')
  return {
    filename, numeric_prefix: prefix, bytes: content.length,
    sha256: createHash('sha256').update(content).digest('hex'),
    flags, apply_approved: false,
  }
})
const duplicatePrefixes = [...prefixToFiles].filter(([, items]) => items.length > 1)
  .map(([prefix, names]) => ({ prefix, files: names }))
const incompleteNames = rows.filter(r => r.numeric_prefix === 'UNKNOWN').map(r => r.filename)
const result = {
  tool: 'verify-staging-source-hashes.mjs', mode: 'READ_ONLY_LOCAL_SOURCE',
  file_count: rows.length,
  total_bytes: rows.reduce((n, r) => n + r.bytes, 0),
  duplicate_numeric_prefixes: duplicatePrefixes,
  invalid_source_filenames: incompleteNames,
  seed_review_required: rows.filter(r => r.flags.includes('SEED_PRIVACY_ONE_SHOT_REVIEW')).map(r => r.filename),
  status: 'NOT_AN_APPLY_MANIFEST',
  authorized_staging_writes: false,
  authorized_production_writes: false,
  files: rows,
}
process.stdout.write(JSON.stringify(result, null, 2) + '\n')
if (incompleteNames.length) process.exitCode = 2
