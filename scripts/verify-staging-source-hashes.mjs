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

const args = process.argv.slice(2)
if (args.some(flag => !['--json', '--gate'].includes(flag))) {
  console.error('Only the local read-only --json and fail-closed --gate options are supported')
  process.exit(2)
}

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const dir = join(root, 'supabase', 'migrations')
const files = readdirSync(dir).filter(name => name.endsWith('.sql')).sort()
const prefixToFiles = new Map()
const rows = files.map(filename => {
  const content = readFileSync(join(dir, filename))
  const sql = content.toString('utf8')
  const prefix = /^(\d{4})_/.exec(filename)?.[1] ?? 'UNKNOWN'
  prefixToFiles.set(prefix, [...(prefixToFiles.get(prefix) ?? []), filename])
  const flags = ['REVIEW_REQUIRED_NO_AUTO_APPLY']
  let stagingTreatment = 'REVIEW_SCHEMA_DEPENDENCIES'
  if (/^0012_/.test(filename)) {
    flags.push('SEED_PRIVACY_ONE_SHOT_REVIEW', 'SYNTHETIC_0012_REPLACEMENT_REQUIRED')
    stagingTreatment = 'SYNTHETIC_FIXTURE_ONLY_AFTER_INDEPENDENT_REVIEW'
  }
  if (/^0047_/.test(filename)) {
    flags.push('SEED_PRIVACY_ONE_SHOT_REVIEW', 'GENERATED_REFERENCE_CORPUS_NO_AUTO_REPLAY')
    stagingTreatment = 'QUARANTINE_GENERATED_DATA_SELECT_MINIMAL_SAFE_FIXTURES'
  }
  if (/^0082_/.test(filename)) {
    flags.push('SEED_PRIVACY_ONE_SHOT_REVIEW', 'HISTORICAL_BOOKING_CORPUS_NO_AUTO_REPLAY')
    stagingTreatment = 'QUARANTINE_DYNAMIC_BOOKING_FIXTURES'
  }
  if (/^0241_/.test(filename)) {
    flags.push('P0_RBAC_SOURCE_AND_STAGING_TEST_REQUIRED')
    if (!sql.includes("v_resolution in ('credit', 'refund') or v_credit_amount > 0")) {
      flags.push('P0_MONETARY_GUARD_NOT_VERIFIED')
    }
  }
  if (/^0188_/.test(filename)) flags.push('DUPLICATE_PREFIX_DEPENDENCY_ORDER_REVIEW')
  // Heuristic detection only. This does not parse PostgreSQL's grammar or
  // determine transactional safety, extensions, triggers or data dependencies.
  // Use no SQL content in the output: even historical seed data may contain PII.
  const looksTransactional = /^\s*begin\s*;/im.test(sql) && /^\s*commit\s*;/im.test(sql)
  if (!looksTransactional) flags.push('TRANSACTION_BOUNDARIES_MANUAL_REVIEW')
  if (/\bsecurity\s+definer\b/i.test(sql)) flags.push('SECURITY_DEFINER_MANUAL_REVIEW')
  if (/\balter\s+type\s+[\w."]+\s+add\s+value\b/i.test(sql)) flags.push('ENUM_CHANGE_DEPENDENCY_MANUAL_REVIEW')
  if (/\bcreate\s+(unique\s+)?index\s+concurrently\b/i.test(sql)) flags.push('NONTRANSACTIONAL_INDEX_MANUAL_REVIEW')
  if (content.length > 1_000_000) flags.push('LARGE_SQL_DATA_CONTENT_MANUAL_REVIEW')
  return {
    filename, numeric_prefix: prefix, bytes: content.length,
    sha256: createHash('sha256').update(content).digest('hex'),
    flags, staging_treatment: stagingTreatment,
    transaction_boundary_scan: looksTransactional ? 'BEGIN_COMMIT_PRESENT_UNVERIFIED' : 'NEEDS_MANUAL_REVIEW',
    apply_approved: false,
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
  staging_treatment_holds: rows.filter(r => r.staging_treatment !== 'REVIEW_SCHEMA_DEPENDENCIES').map(r => ({ filename: r.filename, treatment: r.staging_treatment })),
  filename_sorted_reference_only: true,
  independently_reviewed_dependency_order: false,
  manually_approved_seed_handling: false,
  tested_hosted_jwt_and_rls: false,
  tested_staging_backup_and_restore: false,
  expected_staging_project_id: 'klhmsrunqrdxjudyhnkm',
  blockers: [
    '002: current source hashes must be pinned to the exact intended staging installer commit',
    '0012: replace fixed branch/user/bank records with reviewed synthetic fixtures',
    '0013/0014: commit new system_role enum members before dependent policy use in a separate transaction',
    '0047: classify generated reference corpus and prove safe omission or replacement',
    '0082: prohibit replay of historical dynamic bookings and use synthetic workflow fixtures',
    '0188: review duplicate filename prefixes and all dependencies/transactions',
    '0241: require hosted role/RLS/definer negative-path tests in staging',
    'hosted: review outbound integrations, recovery, and explicit owner staging-only write approval',
  ],
  status: 'NOT_AN_APPLY_MANIFEST',
  authorized_staging_writes: false,
  authorized_production_writes: false,
  files: rows,
}
process.stdout.write(JSON.stringify(result, null, 2) + '\n')
// --gate is intentionally always blocked until a separate independent,
// owner-approved apply manifest and hosted acceptance procedure are written.
// An offline source inventory must NEVER become a remote apply authorization.
if (incompleteNames.length || args.includes('--gate')) process.exitCode = 2
