#!/usr/bin/env node
/**
 * T1-02 Staging ledger fingerprint comparison — local read-only audit.
 *
 * Compares:
 *   (a) Current supabase/migrations/*.sql files hashed with SHA-256 from local disk
 *   (b) Staging ledger metadata captured read-only from klhmsrunqrdxjudyhnkm on 20-21 Nov 2026
 *       stored in docs/verification/STAGING_SQL_SOURCE_SNAPSHOT_2026-11-20.json
 *
 * Does NOT:
 *   - Connect to any database (remote or local)
 *   - Execute SQL
 *   - Read or export application data, auth tokens, credentials or PII
 *   - Authorize migration deployment
 *
 * Usage:
 *   node scripts/t1-02-ledger-fingerprint-compare.mjs
 *   node scripts/t1-02-ledger-fingerprint-compare.mjs --json
 *   node scripts/t1-02-ledger-fingerprint-compare.mjs --gate   # exits nonzero on any mismatch/unresolved
 *
 * Output: sanitized comparison table + JSON. No SQL content, no personal records.
 */

import { createHash } from 'node:crypto'
import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { dirname, join, basename } from 'node:path'
import { fileURLToPath } from 'node:url'

const args = process.argv.slice(2)
const jsonMode = args.includes('--json')
const gateMode = args.includes('--gate')
const unknownArgs = args.filter(a => !['--json','--gate'].includes(a))
if (unknownArgs.length) { console.error(`Unknown flags: ${unknownArgs.join(', ')}`); process.exit(2) }

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const migrationsDir = join(root, 'supabase', 'migrations')

// ── 1. Source manifest from disk ────────────────────────────────────────────
const sourceFiles = readdirSync(migrationsDir).filter(f => f.endsWith('.sql')).sort()
const sourceMap = new Map() // filename → { sha256, bytes }
for (const filename of sourceFiles) {
  const content = readFileSync(join(migrationsDir, filename))
  sourceMap.set(filename, {
    sha256: createHash('sha256').update(content).digest('hex'),
    bytes: content.length,
  })
}

// ── 2. Staging ledger from read-only captured JSON ───────────────────────────
// The JSON was produced by a read-only Supabase catalog/metadata query on 20 Nov 2026.
// It records git blob SHA-1 values (not SQL SHA-256), plus review flags and byte counts.
// We also read from STAGING_SQL_SOURCE_SNAPSHOT for the ledger side.
//
// The plan calls for comparing the staging supabase_migrations.schema_migrations export.
// We use the best available captured evidence: the SQL source snapshot from 20 Nov 2026.
// This records which files were enumerated and their git blob SHA-1, NOT their SQL SHA-256.
//
// For the ACTUAL staging migration version/sha fingerprint matching, we use the data
// established in STAGING_PRODUCTION_LEDGER_READONLY_2026-11-20.md and the reconciliation
// document which records 242 staging ledger entries through 0244.
//
// The comparison we CAN do with local data:
//   - Enumerate current source (253 files) vs the 242-file manifest in the snapshot
//   - Identify SOURCE_ONLY files (those not in the 242-file snapshot = 0245–0255 + others)
//   - Validate staging treatment exceptions (0012, 0047, 0082, 0188 pair)
//   - Flag all 11-char placeholder hashes as MISSING_FINGERPRINT

const snapshotPath = join(root, 'docs', 'verification', 'STAGING_SQL_SOURCE_SNAPSHOT_2026-11-20.json')
if (!existsSync(snapshotPath)) {
  console.error('Ledger snapshot not found: ' + snapshotPath)
  process.exit(2)
}

const snapshot = JSON.parse(readFileSync(snapshotPath, 'utf8'))
const snapshotSourceSha = snapshot.source_main_full_sha  // b6b08fc... (242-file main)
const snapshotFiles = snapshot.files ?? []  // array of { filename, git_blob_sha1, bytes }

// Build ledger map: filename → snapshot entry
const ledgerMap = new Map()
for (const entry of snapshotFiles) {
  ledgerMap.set(entry.filename, entry)
}

// ── 3. Known staging ledger treatment exceptions ─────────────────────────────
// Source: plan document, STAGING_PRODUCTION_LEDGER_READONLY_2026-11-20.md, 
//         STAGING_READONLY_RECONCILIATION_2026-11-21.md
// The staging ledger (klhmsrunqrdxjudyhnkm) recorded 242 entries as of 20-21 Nov 2026.
// Last staging ledger version: 0244_counter_sale.sql
// Known ledger treatment exceptions:
const LEDGER_TREATMENT = {
  '0012_seed_data.sql':                     'SYNTHETIC_FIXTURE_REPLACE',  // plausible 64-char fingerprint, NOT verified
  '0047_seed_reference_corpus.sql':         'QUARANTINED_MARKER_11CHAR',  // 11-char placeholder, NOT a valid SHA
  '0082_seed_operational_stage_corpus.sql': 'QUARANTINED_MARKER_11CHAR',  // 11-char placeholder, NOT a valid SHA
}

// Files in source not expected in staging ledger (ledger ends at 0244; 0245+ are SOURCE_ONLY)
const KNOWN_LEDGER_CEILING = '0244_counter_sale.sql'
const KNOWN_LEDGER_COUNT = 242

// ── 4. Special migration rules ───────────────────────────────────────────────
const SHA256_RE = /^[0-9a-f]{64}$/
const SPECIAL_CASES = {
  '0012_seed_data.sql': {
    rule: 'SYNTHETIC_REPLACEMENT_REQUIRED',
    note: 'Fixed identifiers in source; must not apply original. Verify synthetic generator hash vs ledger claimed fingerprint.',
  },
  '0047_seed_reference_corpus.sql': {
    rule: 'QUARANTINED_EXCEPTION_MARKER',
    note: '11-char ledger placeholder is NOT a SHA-256. 1.87 MB corpus; must NOT be replayed. Quarantine or replace with minimal safe fixtures.',
  },
  '0082_seed_operational_stage_corpus.sql': {
    rule: 'QUARANTINED_EXCEPTION_MARKER',
    note: '11-char ledger placeholder is NOT a SHA-256. Historical booking corpus applied live as 0076. Must NOT be replayed in staging.',
  },
  '0013_business_8_roles.sql': {
    rule: 'TRANSACTION_BARRIER_PREREQUISITE',
    note: 'Must be committed in its own transaction before 0014 uses the new enum values.',
  },
  '0014_business_8_policies.sql': {
    rule: 'TRANSACTION_BARRIER_PREREQUISITE',
    note: 'Uses enum values from 0013; requires 0013 committed first in a separate transaction.',
  },
  '0188_smart_reservation_holds.sql': {
    rule: 'DUPLICATE_PREFIX_MUST_PRESERVE_ORDER',
    note: 'First of two 0188_* files. Must apply before 0188_staff_renting_gear.sql. Do not rename or deduplicate.',
  },
  '0188_staff_renting_gear.sql': {
    rule: 'DUPLICATE_PREFIX_MUST_PRESERVE_ORDER',
    note: 'Second of two 0188_* files. Must apply after 0188_smart_reservation_holds.sql. Do not rename or deduplicate.',
  },
  '0241_extension_clash_manager_decision_and_at_risk.sql': {
    rule: 'P0_RBAC_HOSTED_TEST_REQUIRED',
    note: 'P0 monetary guard. Coordinator credit/refund block must be tested with real JWT in hosted environment.',
  },
}

// ── 5. Build comparison rows ─────────────────────────────────────────────────
const rows = []
const categories = {
  MATCHED_SOURCE_HASH: [],         // source SHA matches ledger claimed SHA (not proof of execution)
  MISMATCH_BYTES: [],              // bytes differ between snapshot and current source
  SOURCE_ONLY: [],                 // in current source but not in 242-file snapshot
  LEDGER_ONLY: [],                 // in 242-file snapshot but not in current source (should not exist)
  SYNTHETIC_REPLACEMENT_UNVERIFIED: [],
  QUARANTINED_MARKER_UNVERIFIED: [],
  MISSING_FINGERPRINT: [],         // ledger entry has no valid 64-char SHA
  LEDGER_AND_SOURCE_SIZE_MATCH: [], // git blob bytes match source bytes (note: git blob SHA1 ≠ file SHA256)
}

// All files in current source
for (const [filename, src] of sourceMap) {
  const ledgerEntry = ledgerMap.get(filename)
  const special = SPECIAL_CASES[filename]
  const treatment = LEDGER_TREATMENT[filename]
  const row = {
    filename,
    source_sha256: src.sha256,
    source_bytes: src.bytes,
    in_ledger_snapshot: !!ledgerEntry,
    ledger_git_blob_sha1: ledgerEntry?.git_blob_sha1 ?? null,
    ledger_bytes: ledgerEntry?.bytes ?? null,
    ledger_treatment: treatment ?? (ledgerEntry ? 'APPLIED_SOURCE' : 'NOT_IN_SNAPSHOT'),
    bytes_match: ledgerEntry ? ledgerEntry.bytes === src.bytes : null,
    // NOTE: ledger stores git blob SHA1, source has file SHA256 — these are inherently different
    // We can only compare byte counts, not SHA values, between snapshot and current source
    comparison_result: null,
    special_rule: special?.rule ?? null,
    note: special?.note ?? null,
  }

  if (!ledgerEntry) {
    row.comparison_result = 'SOURCE_ONLY'
    categories.SOURCE_ONLY.push(filename)
  } else if (treatment === 'SYNTHETIC_FIXTURE_REPLACE') {
    row.comparison_result = 'SYNTHETIC_REPLACEMENT_UNVERIFIED'
    categories.SYNTHETIC_REPLACEMENT_UNVERIFIED.push(filename)
  } else if (treatment === 'QUARANTINED_MARKER_11CHAR') {
    row.comparison_result = 'QUARANTINED_MARKER_UNVERIFIED'
    categories.QUARANTINED_MARKER_UNVERIFIED.push(filename)
  } else if (ledgerEntry.bytes === src.bytes) {
    row.comparison_result = 'LEDGER_AND_SOURCE_SIZE_MATCH'
    categories.LEDGER_AND_SOURCE_SIZE_MATCH.push(filename)
  } else {
    // Bytes differ between snapshot and current source
    row.comparison_result = 'MISMATCH_BYTES'
    categories.MISMATCH_BYTES.push(filename)
  }

  rows.push(row)
}

// Files in 242-file snapshot but NOT in current source (should be empty; flag if any)
for (const [filename] of ledgerMap) {
  if (!sourceMap.has(filename)) {
    categories.LEDGER_ONLY.push(filename)
    rows.push({
      filename,
      source_sha256: null,
      source_bytes: null,
      in_ledger_snapshot: true,
      ledger_git_blob_sha1: ledgerMap.get(filename)?.git_blob_sha1,
      ledger_bytes: ledgerMap.get(filename)?.bytes,
      ledger_treatment: 'LEDGER_ONLY_MISSING_FROM_SOURCE',
      bytes_match: null,
      comparison_result: 'LEDGER_ONLY',
      special_rule: null,
      note: 'File present in 20-Nov-2026 snapshot but not in current origin/main source',
    })
  }
}

// ── 6. Staging ledger beyond snapshot (0245–0255) ───────────────────────────
// The staging ledger ends at 0244; current source has 0245–0255.
// These are known SOURCE_ONLY by construction (ledger ceiling = 0244).
const sourceOnlyNewMigrations = categories.SOURCE_ONLY.filter(f => {
  const prefix = parseInt(f.split('_')[0], 10)
  return prefix >= 245
})
const sourceOnlyOther = categories.SOURCE_ONLY.filter(f => !sourceOnlyNewMigrations.includes(f))

// ── 7. Compile summary ───────────────────────────────────────────────────────
const currentMainSha = '0586865cf2a4ce2f6de64dc1d8da1548f91ec211'
const auditDate = '2026-11-21'

const summary = {
  tool: 't1-02-ledger-fingerprint-compare.mjs',
  mode: 'LOCAL_READ_ONLY_COMPARISON',
  audit_date: auditDate,
  current_origin_main_sha: currentMainSha,
  snapshot_source_sha: snapshotSourceSha,
  staging_project_id: 'klhmsrunqrdxjudyhnkm',
  production_project_id: 'sxguwvgoserhdolewibb',
  note_about_production: 'Production project ID listed for identity reference only. No production data was read or compared.',

  // Counts
  current_source_file_count: sourceMap.size,
  snapshot_file_count: snapshotFiles.length,
  known_staging_ledger_entry_count: KNOWN_LEDGER_COUNT,
  known_staging_ledger_last_entry: KNOWN_LEDGER_CEILING,

  // Comparison methodology note — CRITICAL
  comparison_methodology: [
    'The snapshot records git blob SHA-1 values, NOT SQL SHA-256 file hashes.',
    'Direct SHA comparison between snapshot and source is NOT possible from this data.',
    'We compare: (a) filename presence, (b) byte counts, (c) special treatment exceptions.',
    'LEDGER_AND_SOURCE_SIZE_MATCH means bytes agree between snapshot and current source; it is NOT hash equivalence.',
    'MATCHED_SOURCE_HASH requires separate staging ledger supabase_migrations.sha256 column export which was NOT available in the read-only snapshot.',
    'The 239 "APPLIED_SOURCE" ledger entries with 64-char strings refer to supabase_migrations.sha256 values in the staging DB, not in this snapshot.',
  ],

  // Results
  ledger_and_source_size_match_count: categories.LEDGER_AND_SOURCE_SIZE_MATCH.length,
  mismatch_bytes_count: categories.MISMATCH_BYTES.length,
  source_only_total: categories.SOURCE_ONLY.length,
  source_only_post_0244_new_migrations: sourceOnlyNewMigrations.length,
  source_only_other_unexpected: sourceOnlyOther.length,
  ledger_only_missing_from_source: categories.LEDGER_ONLY.length,
  synthetic_replacement_unverified: categories.SYNTHETIC_REPLACEMENT_UNVERIFIED.length,
  quarantined_marker_unverified: categories.QUARANTINED_MARKER_UNVERIFIED.length,

  // Special cases
  special_cases: {
    '0012': {
      source_sha256: sourceMap.get('0012_seed_data.sql')?.sha256,
      source_bytes: sourceMap.get('0012_seed_data.sql')?.bytes,
      staging_ledger_treatment: 'SYNTHETIC_FIXTURE_REPLACE (claimed)',
      staging_ledger_fingerprint_format: '64-char hex (plausible but NOT matched against synthetic generator output)',
      status: 'SYNTHETIC_REPLACEMENT_UNVERIFIED',
      action_required: 'Inspect create-synthetic-staging-0012.mjs output hash vs ledger claimed SHA. Owner review required.',
    },
    '0047': {
      source_sha256: sourceMap.get('0047_seed_reference_corpus.sql')?.sha256,
      source_bytes: sourceMap.get('0047_seed_reference_corpus.sql')?.bytes,
      staging_ledger_treatment: 'QUARANTINED_MARKER_UNVERIFIED (11-char placeholder)',
      staging_ledger_fingerprint_format: '11-char string — NOT a valid SHA-256',
      status: 'QUARANTINED_MARKER_UNVERIFIED — investigate whether corpus was actually omitted',
      action_required: 'Seek evidence (staging DB table row counts for affected tables) that corpus was not applied. Do not replay.',
    },
    '0082': {
      source_sha256: sourceMap.get('0082_seed_operational_stage_corpus.sql')?.sha256,
      source_bytes: sourceMap.get('0082_seed_operational_stage_corpus.sql')?.bytes,
      staging_ledger_treatment: 'QUARANTINED_MARKER_UNVERIFIED (11-char placeholder)',
      staging_ledger_fingerprint_format: '11-char string — NOT a valid SHA-256',
      status: 'QUARANTINED_MARKER_UNVERIFIED — historical booking corpus; must NOT be replayed',
      action_required: 'Seek evidence that booking corpus was not applied to staging. Preserve current staging data as-is.',
    },
    '0013_0014_barrier': {
      status: 'TRANSACTION_BARRIER_PREREQUISITE — not independently tested in hosted staging',
      action_required: 'Staged install must commit 0013 before 0014 in a separate transaction. Document in apply plan.',
    },
    '0188_pair': {
      files: ['0188_smart_reservation_holds.sql', '0188_staff_renting_gear.sql'],
      source_sha256_smart_holds: sourceMap.get('0188_smart_reservation_holds.sql')?.sha256,
      source_sha256_staff_gear: sourceMap.get('0188_staff_renting_gear.sql')?.sha256,
      staging_ledger_ordering: '0188_smart_reservation_holds before 0188_staff_renting_gear (recorded)',
      status: 'ORDERING_RECORDED_BUT_NOT_INDEPENDENTLY_VERIFIED in hosted staging',
      action_required: 'Verify both are in staging ledger with correct order and distinct version keys before any new staging install.',
    },
  },

  // Source-only files (in current main, not in 242-file snapshot)
  source_only_post_0244: sourceOnlyNewMigrations,
  source_only_other: sourceOnlyOther,
  ledger_only: categories.LEDGER_ONLY,

  // Staging data provenance findings (from STAGING_READONLY_RECONCILIATION_2026-11-21.md)
  staging_provenance: {
    installation_window_utc: '2026-11-20 12:39:35 – 12:54:56',
    authorizing_agent: 'UNKNOWN — no independent owner approval receipt found',
    source_sha_at_install: 'UNKNOWN — staging ledger does not record source commit SHA',
    public_users_rows: 5,
    public_clients_rows: 1,
    auth_users_rows: 0,
    outbound_isolation_verified: false,
    note: 'Row provenance (synthetic vs real) not independently established. auth.users=0 means no JWT role seats can be tested.',
  },

  // Security / advisor findings (read-only, from plan document)
  security_advisor_findings: {
    auth_users_exposed_in_staff_directory_v: 1,
    security_definer_view_warnings: 41,
    anon_executable_security_definer_functions: 49,
    authenticated_executable_security_definer_functions: 200,
    mutable_search_path_warnings: 5,
    rls_enabled_without_policy_infos: 3,
    note: 'These are advisor errors/warnings only. JWT effectiveness, row/column masking and actual denial paths are NOT tested. See plan §8.',
  },

  // Nine-role acceptance matrix (Phase E)
  hosted_acceptance_matrix: {
    status: 'NOT_RUN',
    roles_required: ['Owner','Admin','Manager','Coordinator','Warehouse','Technician','Accounts','Driver','Client'],
    client_isolation_required: 'Client A cannot read Client B bookings, invoices, files, payment intents, or signed URLs',
    money_blind_roles: ['Warehouse','Technician','Driver','Client'],
    coordinator_monetary_guard: '0241 P0 guard must be tested with real JWT in hosted environment',
    storage_tests: 'NOT RUN — requires separately authorized staged writes',
    payment_callback_verification: 'NOT RUN — mocked payment systems only, no real gateway',
    physical_device_tests: 'PHASE_2_POST_LAUNCH — not a Phase 1 blocker',
  },

  // Disposition
  authorized_staging_writes: false,
  authorized_production_writes: false,
  t1_02_status: 'doing / HOLD',
  safe_next_step: [
    '1. Owner: explicitly authorize a new, separate staging operation with exact source SHA, reviewed manifest, synthetic fixtures and recovery plan.',
    '2. Establish auth.users seats (all 9 roles + Client A/B) in staging before any JWT/RLS testing.',
    '3. Export supabase_migrations.sha256 column from staging DB (read-only SQL) and compare each of the 239 APPLIED_SOURCE entries against current source SHA-256 values computed here.',
    '4. Investigate 0047/0082 11-char placeholders — read staging aggregate table counts for affected tables to determine if corpus was actually omitted.',
    '5. Verify 0012 synthetic generator hash against the ledger claimed fingerprint.',
    '6. Identify and document which agent ran the 20-Nov-2026 install, what source SHA it used, and where the owner authorization is recorded.',
    '7. Do NOT merge PR #255 until all unverified script claims and mass roadmap promotions are independently cleared.',
  ],
  status: 'AUDIT_COMPLETE_NO_WRITES_NO_APPROVALS',
}

if (jsonMode) {
  process.stdout.write(JSON.stringify({ summary, rows }, null, 2) + '\n')
} else {
  // Print human-readable table
  console.log('# T1-02 Staging Ledger Fingerprint Comparison')
  console.log(`Audit date: ${auditDate}`)
  console.log(`Current origin/main SHA: ${currentMainSha}`)
  console.log(`Snapshot source SHA: ${snapshotSourceSha}`)
  console.log(`Staging project: ${summary.staging_project_id}`)
  console.log()
  console.log('## Summary')
  console.log(`Current source files:          ${summary.current_source_file_count}`)
  console.log(`Snapshot files (242-file main): ${summary.snapshot_file_count}`)
  console.log(`Known staging ledger entries:   ${summary.known_staging_ledger_entry_count} (last: ${summary.known_staging_ledger_last_entry})`)
  console.log()
  console.log('## Comparison results')
  console.log(`Size-match (bytes agree):       ${summary.ledger_and_source_size_match_count}`)
  console.log(`Byte mismatch (file changed):   ${summary.mismatch_bytes_count}`)
  console.log(`Source-only total:              ${summary.source_only_total}`)
  console.log(`  — post-0244 new migrations:   ${summary.source_only_post_0244_new_migrations}`)
  console.log(`  — other unexpected:           ${summary.source_only_other_unexpected}`)
  console.log(`Ledger-only (deleted from src): ${summary.ledger_only_missing_from_source}`)
  console.log(`Synthetic replacement unverif.: ${summary.synthetic_replacement_unverified}`)
  console.log(`Quarantined marker unverified:  ${summary.quarantined_marker_unverified}`)
  console.log()
  if (categories.MISMATCH_BYTES.length) {
    console.log('## ⚠ BYTE MISMATCHES (file changed between snapshot and current source)')
    for (const f of categories.MISMATCH_BYTES) {
      const src = sourceMap.get(f)
      const led = ledgerMap.get(f)
      console.log(`  ${f}: source=${src.bytes}B  snapshot=${led.bytes}B`)
    }
    console.log()
  }
  if (sourceOnlyOther.length) {
    console.log('## ⚠ SOURCE-ONLY (unexpected — in source but not in 242-file snapshot, pre-0245)')
    for (const f of sourceOnlyOther) console.log(`  ${f}`)
    console.log()
  }
  console.log('## Source-only post-0244 migrations (not yet in staging ledger)')
  for (const f of sourceOnlyNewMigrations) console.log(`  ${f}`)
  console.log()
  if (categories.LEDGER_ONLY.length) {
    console.log('## ⚠ LEDGER-ONLY (in snapshot but deleted from current source)')
    for (const f of categories.LEDGER_ONLY) console.log(`  ${f}`)
    console.log()
  }
  console.log('## Special case status')
  for (const [key, val] of Object.entries(summary.special_cases)) {
    console.log(`  ${key}: ${val.status}`)
  }
  console.log()
  console.log('## Disposition')
  console.log(`T1-02 status: ${summary.t1_02_status}`)
  console.log(`Authorized staging writes: ${summary.authorized_staging_writes}`)
  console.log(`Authorized production writes: ${summary.authorized_production_writes}`)
  console.log()
  console.log('## Safe next steps')
  for (const s of summary.safe_next_step) console.log(s)
}

// Gate: fail on any unresolved mismatch or unexpected source-only
const hasBlockers = categories.MISMATCH_BYTES.length > 0
  || sourceOnlyOther.length > 0
  || categories.LEDGER_ONLY.length > 0
  || gateMode  // --gate always exits nonzero (not yet independently approved)

if (hasBlockers) {
  process.exitCode = 2
  if (!jsonMode) console.error('\nEXIT 2: blockers present or --gate mode.')
}
