import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
const PINNED_MAIN_SHA = '11253bf6a6ebeb292930926b09f1ad06715f9d11';
const TARGET_PROJECT_ID = 'klhmsrunqrdxjudyhnkm';
const migrationsDir = join(root, 'supabase', 'migrations');
const files = readdirSync(migrationsDir).filter(f => f.endsWith('.sql')).sort();

console.log(`Building draft staging manifest for ${files.length} migrations pinned at commit ${PINNED_MAIN_SHA}...`);

const fileEntries = files.map(filename => {
  const filepath = join(migrationsDir, filename);
  const buf = readFileSync(filepath);
  const sql = buf.toString('utf8');
  const bytes = buf.length;
  const sha256 = createHash('sha256').update(buf).digest('hex');
  const prefix = filename.match(/^(\d{4})_/)?.[1] ?? 'UNKNOWN';

  // Analysis
  const hasBegin = /^\s*begin\s*;/im.test(sql);
  const hasCommit = /^\s*commit\s*;/im.test(sql);
  const isConcurrent = /create\s+(?:unique\s+)?index\s+concurrently/i.test(sql);
  const hasEnumAdd = /alter\s+type\s+[a-zA-Z0-9_."]+\s+add\s+value/i.test(sql);

  let transactionClass = 'BEGIN_COMMIT_PRESENT_UNVERIFIED';
  if (isConcurrent) {
    transactionClass = 'NONTRANSACTIONAL_REVIEW';
  } else if (hasEnumAdd) {
    transactionClass = 'SEPARATE_COMMIT_REQUIRED';
  } else if (!hasBegin || !hasCommit) {
    transactionClass = 'NEEDS_MANUAL_REVIEW';
  }

  // DDL / Data Class
  const hasInsert = /\binsert\s+into\b/i.test(sql);
  const hasUpdate = /\bupdate\s+[a-zA-Z0-9_.]+\s+set\b/i.test(sql);
  const hasCreate = /\bcreate\s+(table|view|function|trigger|type|extension|index)\b/i.test(sql);
  const hasAlter = /\balter\s+(table|type|function|view)\b/i.test(sql);
  const hasDrop = /\bdrop\s+(table|view|function|trigger|type|index)\b/i.test(sql);
  const hasPolicy = /\bcreate\s+policy\b/i.test(sql) || /\benable\s+row\s+level\s+security\b/i.test(sql);
  const hasGrantRevoke = /\b(grant|revoke)\s+[a-zA-Z, ]+\s+on\b/i.test(sql);

  let ddlOrDataClass = 'SCHEMA';
  if (/^0012_|^0047_|^0082_/.test(filename)) {
    ddlOrDataClass = 'SEED';
  } else if (hasPolicy || (hasGrantRevoke && !hasCreate && !hasAlter)) {
    ddlOrDataClass = 'SECURITY';
  } else if ((hasInsert || hasUpdate) && (hasCreate || hasAlter)) {
    ddlOrDataClass = 'MIXED';
  } else if (hasInsert || hasUpdate) {
    ddlOrDataClass = 'BACKFILL';
  } else if (hasCreate || hasAlter || hasDrop) {
    ddlOrDataClass = 'SCHEMA';
  } else {
    ddlOrDataClass = 'UNKNOWN';
  }

  // Sensitive data risk
  let sensitiveDataRisk = 'NONE_SCHEMA_ONLY';
  if (/^0012_/.test(filename)) {
    sensitiveDataRisk = 'HIGH: fixed initial branch, warehouse, user, bank, PAN, contact, and number sequence data';
  } else if (/^0047_/.test(filename)) {
    sensitiveDataRisk = 'HIGH: ~1.87 MB generated reference corpus touching 15+ tables including clients, bookings, financial records';
  } else if (/^0082_/.test(filename)) {
    sensitiveDataRisk = 'MEDIUM_HIGH: historical dynamic date-relative booking and booking line inserts';
  } else if (hasInsert && /users|clients|payments|invoices|staff/i.test(sql)) {
    sensitiveDataRisk = 'LOW_MEDIUM: contains data modifications touching identity or transactional tables';
  }

  // Security review
  const securityFeatures = [];
  if (/\bsecurity\s+definer\b/i.test(sql)) securityFeatures.push('SECURITY DEFINER functions');
  if (/\benable\s+row\s+level\s+security\b/i.test(sql)) securityFeatures.push('RLS enabled');
  if (/\bcreate\s+policy\b/i.test(sql)) securityFeatures.push('RLS policies defined');
  if (hasGrantRevoke) securityFeatures.push('Grants/Revokes present');
  if (/^0163_/.test(filename)) securityFeatures.push('Explicit revocation of 6 anon RPC entrypoints');
  if (/^0241_/.test(filename)) securityFeatures.push('P0 Coordinator monetary credit/refund restriction in resolve_booking_at_risk');
  const securityReview = securityFeatures.length > 0 ? securityFeatures.join('; ') : 'none noted / not yet verified';

  // Staging treatment
  let stagingTreatment = 'KEEP_REVIEW';
  if (/^0012_/.test(filename)) {
    stagingTreatment = 'REPLACE_WITH_SYNTHETIC';
  } else if (/^0047_|^0082_/.test(filename)) {
    stagingTreatment = 'EXCLUDE_PENDING_DEPENDENCY_CHECK';
  } else if (prefix === '0188') {
    stagingTreatment = 'BLOCKED'; // Needs duplicate prefix resolution
  }

  // Recovery action
  let recoveryAction = 'UNVERIFIED';
  if (/^0012_/.test(filename)) {
    recoveryAction = 'STAGING_TRUNCATE_SYNTHETIC_FIXTURES: Truncate seeded records or execute verified rollback script';
  } else if (/^0047_|^0082_/.test(filename)) {
    recoveryAction = 'EXCLUDED_FROM_STAGING: No rollback needed if quarantined; if applied in error, requires clean staging database reset';
  } else if (ddlOrDataClass === 'SECURITY') {
    recoveryAction = 'REVERSE_POLICY_OR_SNAPSHOT: Drop created policies/grants or restore schema catalog snapshot';
  } else {
    recoveryAction = 'UNVERIFIED: forward-only schema migration; rollback requires full pre-install staging catalog snapshot restore';
  }

  // Identified dependencies
  const tables = [...sql.matchAll(/\b(?:from|join|into|table|update|on)\s+(?:public\.)?([a-zA-Z0-9_]+)/gi)]
    .map(m => m[1].toLowerCase())
    .filter(t => !['select', 'where', 'set', 'only', 'if', 'exists', 'is', 'not', 'null', 'and', 'or', 'case', 'when', 'then', 'else', 'end', 'as', 'using', 'values', 'on', 'conflict', 'do', 'nothing'].includes(t));
  const uniqueTables = [...new Set(tables)].slice(0, 8);

  const dependencies = {
    tables_referenced: uniqueTables,
    requires_prior_committed_enum: hasEnumAdd || filename.startsWith('0014_'),
    duplicate_prefix_conflict: prefix === '0188',
    notes: filename.startsWith('0014_') ? 'Requires 0013 system_role additions committed in prior transaction' : undefined,
  };

  return {
    filename,
    numeric_prefix: prefix,
    source_main_sha: PINNED_MAIN_SHA,
    sha256,
    bytes,
    proposed_sequence: null, // Blocked pending independent human review
    dependencies,
    transaction_class: transactionClass,
    ddl_or_data_class: ddlOrDataClass,
    sensitive_data_risk: sensitiveDataRisk,
    security_review: securityReview,
    staging_treatment: stagingTreatment,
    recovery_action: recoveryAction,
    review_state: 'BLOCKED', // Never APPROVED_TO_APPLY
  };
});

const unresolvedBlockers = [
  '001: Independent review of proposed execution order across all 242 migration files is not complete; proposed_sequence remains null for all files.',
  '002: Seed 0012 contains fixed production-like user, contact, and financial details; must be replaced by reviewed synthetic fixtures (scripts/create-synthetic-staging-0012.mjs) before any hosted execution.',
  '003: Seed 0047 is a ~1.87 MB generated reference corpus touching 15+ tables; quarantined from automated hosted staging apply pending minimal fixture selection.',
  '004: Seed 0082 contains historical dynamic booking data; quarantined from staging apply; synthetic lifecycle fixtures must be used instead.',
  '005: 0013 -> 0014 committed enum barrier: PostgreSQL requires enum additions in 0013_business_8_roles.sql to be committed before 0014_business_8_policies.sql can execute.',
  '006: Duplicate numeric prefix 0188: both 0188_smart_reservation_holds.sql and 0188_staff_renting_gear.sql exist; must be sequenced deliberately without renaming or deleting source files.',
  '007: 0163 anon RPC closure: must verify revocation of 6 business RPCs from anon without breaking authenticated staff workflows on hosted Supabase.',
  '008: 0241 Coordinator monetary resolution guard: PR #242 merged in source, but live hosted JWT/RLS negative tests are required in staging.',
  '009: Staging outbound isolation: all email, SMS, WhatsApp, payment webhooks, and third-party integrations must be hard-disabled before any testing.',
  '010: Backup and restore recovery procedure on staging target (klhmsrunqrdxjudyhnkm) has not been verified via live drill; marked NOT VERIFIED.',
  '011: Staging-only installation authorization: zero remote writes authorized; formal owner sign-off package required prior to any hosted run.'
];

const manifest = {
  document_status: 'DRAFT_NOT_AN_APPLY_MANIFEST',
  target_project_id: TARGET_PROJECT_ID,
  source_main_sha: PINNED_MAIN_SHA,
  file_count: fileEntries.length,
  total_bytes: fileEntries.reduce((acc, f) => acc + f.bytes, 0),
  authorized_staging_writes: false,
  authorized_production_writes: false,
  approved_execution_order: false,
  unresolved_blockers: unresolvedBlockers,
  files: fileEntries,
};

const outputPath = join(root, 'docs', 'verification', 'T1-02_STAGING_APPLY_MANIFEST_DRAFT_2026-11-20.json');
writeFileSync(outputPath, JSON.stringify(manifest, null, 2) + '\n', 'utf8');
console.log(`Wrote draft apply manifest to ${outputPath}`);
