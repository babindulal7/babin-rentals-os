#!/usr/bin/env node
/**
 * build-production-bundles.mjs
 *
 * Generates three idempotent, verifiable SQL bundles for Babin to execute in
 * Supabase SQL Editor for production project `sxguwvgoserhdolewibb`.
 *
 * Follows strict rules:
 * - Rule N-5: Antigravity never mutates live production; Babin executes.
 * - Rule N-8: Zero credentials or secrets in output.
 * - Quarantines 0047_seed_reference_corpus.sql.
 * - Skips already applied migrations (0164, 0225) on production.
 * - Records schema_migrations rows for every applied migration.
 */

import { readdirSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');
const MIGRATIONS_DIR = join(ROOT, 'supabase', 'migrations');
const OUTPUT_DIR = join(ROOT, 'docs', 'production', 'bundles');

mkdirSync(OUTPUT_DIR, { recursive: true });

// Live snapshot path
const LIVE_SNAPSHOT = join(ROOT, 'docs', 'live', 'schema_migrations_2026-11-20.txt');
const liveRaw = readFileSync(LIVE_SNAPSHOT, 'utf8');
const liveNames = new Set();
const liveVersions = new Set();

for (const line of liveRaw.split('\n')) {
  const t = line.trim();
  if (!t || t.startsWith('#')) continue;
  const m = t.match(/^(\S+)\s+(\S+)$/);
  if (m) {
    liveVersions.add(m[1]);
    liveNames.add(m[2]);
  }
}

// 7 reviewed renames from T1-03
const renames = new Map([
  ['0056_0_auth_role_falls_back_to_auth_uid.sql', '0056_auth_role_falls_back_to_auth_uid'],
  ['0059_users_self_read_accepts_auth_uid.sql', '0057_users_self_read_accepts_auth_uid'],
  ['0060_staff_row_for_the_current_owner_identity.sql', '0058_staff_row_for_babindulal7'],
  ['0069_purchase_approval_owner_manager_only.sql', 'purchase_approval_owner_manager_only'],
  ['0073_auth_role_resolves_without_pre_request_hook.sql', '0056_auth_role_resolves_without_pre_request_hook'],
  ['0081_ruled_sequences_completion.sql', 'ruled_sequences_completion'],
  ['0082_seed_operational_stage_corpus.sql', '0076_seed_operational_stage_corpus']
]);

const localFiles = readdirSync(MIGRATIONS_DIR)
  .filter((f) => f.endsWith('.sql'))
  .sort();

const pendingFiles = [];

for (const f of localFiles) {
  // Quarantine 0047
  if (f === '0047_seed_reference_corpus.sql') continue;

  const name = f.replace(/\.sql$/, '');
  if (liveNames.has(name)) continue;

  if (renames.has(f)) {
    const liveTarget = renames.get(f);
    if (liveNames.has(liveTarget)) continue;
  }

  pendingFiles.push(f);
}

console.log(`Discovered ${pendingFiles.length} pending migrations.`);
if (pendingFiles.length !== 102) {
  throw new Error(`Expected exactly 102 pending migrations, found ${pendingFiles.length}`);
}

const batches = [
  {
    num: 1,
    file: '01_PRODUCTION_BATCH_1_0157_TO_0177.sql',
    start: 157,
    end: 177,
    title: 'Batch 1 (0157 to 0177): Audit Triggers, Settings, Grants & Return Reservations',
    desc: 'Audit triggers, system settings table, saved views, pricing structures, operation grants, section saves, return reservations.'
  },
  {
    num: 2,
    file: '02_PRODUCTION_BATCH_2_0178_TO_0244.sql',
    start: 178,
    end: 244,
    title: 'Batch 2 (0178 to 0244): Operations Lifecycle, Shifts, Delivery Dispatch & Stock',
    desc: 'Quantity reset, floor gate overrides, team notes, shifts, delivery proof, email logs, push subscriptions, consumables, counter sale.'
  },
  {
    num: 3,
    file: '03_PRODUCTION_BATCH_3_0245_TO_0260.sql',
    start: 245,
    end: 260,
    title: 'Batch 3 (0245 to 0260): Fee Grid, Public Portal, Fonepay & Online Payments',
    desc: 'Delivery fee grid, outsourced vehicles, booking requests queue, client portal binding, Fonepay intents, payment links, refunds.'
  }
];

// Timestamp generator starting from 2026-11-22 03:00:00 UTC
let baseEpoch = Date.UTC(2026, 10, 22, 3, 0, 0);

function getNextVersion() {
  let v;
  do {
    v = new Date(baseEpoch).toISOString().replace(/\D/g, '').slice(0, 14);
    baseEpoch += 1000;
  } while (liveVersions.has(v));
  liveVersions.add(v);
  return v;
}

const batchSummaries = [];

for (const b of batches) {
  const filesInBatch = pendingFiles.filter((f) => {
    const m = f.match(/^(\d+)/);
    if (!m) return false;
    const num = parseInt(m[1], 10);
    return num >= b.start && num <= b.end;
  });

  console.log(`Processing ${b.file}: ${filesInBatch.length} files...`);

  let bundleSql = `-- =============================================================================\n` +
    `-- BABIN RENTALS OS — PRODUCTION MIGRATION BUNDLE ${b.num} OF 3\n` +
    `-- File: ${b.file}\n` +
    `-- Range: Migrations ${String(b.start).padStart(4, '0')} through ${String(b.end).padStart(4, '0')}\n` +
    `-- Total Migrations in Batch: ${filesInBatch.length}\n` +
    `-- Target: Production Project sxguwvgoserhdolewibb\n` +
    `-- Description: ${b.desc}\n` +
    `--\n` +
    `-- INSTRUCTIONS FOR BABIN:\n` +
    `-- 1. Open Supabase Dashboard -> Project sxguwvgoserhdolewibb -> SQL Editor.\n` +
    `-- 2. Create a new query, paste this entire file, and click 'RUN'.\n` +
    `-- 3. Verify 'Success. No rows returned' or query execution completed.\n` +
    `-- 4. Execute the verification query at the bottom to verify migration registration.\n` +
    `-- =============================================================================\n\n` +
    `-- Ensure migration session config can bypass money line triggers during setup\n` +
    `select set_config('app.in_create_booking', 'on', false);\n\n`;

  const migrationLedgerEntries = [];

  for (const f of filesInBatch) {
    const name = f.replace(/\.sql$/, '');
    const version = getNextVersion();
    const content = readFileSync(join(MIGRATIONS_DIR, f), 'utf8');
    const sha256 = createHash('sha256').update(content).digest('hex');

    migrationLedgerEntries.push({ file: f, name, version, sha256 });

    bundleSql += `-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>\n` +
      `-- START MIGRATION: ${f}\n` +
      `-- SHA-256: ${sha256}\n` +
      `-- Version: ${version}\n` +
      `-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>\n\n` +
      content.trim() + '\n\n' +
      `-- Record ${name} in schema_migrations\n` +
      `insert into supabase_migrations.schema_migrations (version, name)\n` +
      `values ('${version}', '${name}')\n` +
      `on conflict (version) do update set name = excluded.name;\n\n` +
      `-- <<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<\n` +
      `-- END MIGRATION: ${f}\n` +
      `-- <<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<\n\n`;
  }

  bundleSql += `-- Reset migration session config\n` +
    `select set_config('app.in_create_booking', 'off', false);\n\n` +
    `-- =============================================================================\n` +
    `-- BATCH ${b.num} VERIFICATION QUERY\n` +
    `-- Run this query immediately after running the batch to confirm registration:\n` +
    `-- =============================================================================\n` +
    `select 'BATCH ${b.num} VERIFICATION' as batch, count(*) as applied_count\n` +
    `from supabase_migrations.schema_migrations\n` +
    `where name in (\n` +
    filesInBatch.map((f) => `  '${f.replace(/\.sql$/, '')}'`).join(',\n') + '\n' +
    `);\n` +
    `-- Expected applied_count: ${filesInBatch.length}\n`;

  const outputPath = join(OUTPUT_DIR, b.file);
  writeFileSync(outputPath, bundleSql, 'utf8');
  console.log(`Wrote ${outputPath} (${(bundleSql.length / 1024).toFixed(1)} KB)`);

  batchSummaries.push({
    batch: b.num,
    file: b.file,
    count: filesInBatch.length,
    start: b.start,
    end: b.end,
    migrations: migrationLedgerEntries
  });
}

// Generate the Comprehensive Post-Cutover Verification SQL
const verificationSqlPath = join(OUTPUT_DIR, '04_PRODUCTION_POST_CUTOVER_VERIFICATION.sql');
let verifySql = `-- =============================================================================\n` +
  `-- BABIN RENTALS OS — COMPREHENSIVE PRODUCTION POST-CUTOVER VERIFICATION\n` +
  `-- Target: Production Project sxguwvgoserhdolewibb\n` +
  `-- Total Expected Pending Migrations: 102\n` +
  `-- Total Expected Schema Migrations: 259 (157 baseline + 102 pending)\n` +
  `-- =============================================================================\n\n` +
  `begin read only;\n\n` +
  `-- 1. Check that all 102 migrations are recorded in schema_migrations\n` +
  `with expected(name) as (\n` +
  `  values\n` +
  pendingFiles.map((f) => `    ('${f.replace(/\.sql$/, '')}')`).join(',\n') + '\n' +
  `)\n` +
  `select 'MISSING MIGRATIONS' as check_name, coalesce(count(expected.name), 0) as missing_count\n` +
  `from expected\n` +
  `left join supabase_migrations.schema_migrations m on m.name = expected.name\n` +
  `where m.name is null;\n` +
  `-- Expected missing_count: 0\n\n` +
  `-- 2. Verify total migrations count in schema_migrations\n` +
  `select 'TOTAL SCHEMA MIGRATIONS' as check_name, count(*) as total_count\n` +
  `from supabase_migrations.schema_migrations;\n` +
  `-- Expected total_count >= 259\n\n` +
  `-- 3. Verify Anonymous Business RPCs are strictly denied (0163 enforcement)\n` +
  `select 'UNAUTHORIZED ANON RPCS' as check_name, coalesce(count(*), 0) as unexpected_anon_rpcs\n` +
  `from pg_proc p\n` +
  `join pg_namespace n on n.oid = p.pronamespace\n` +
  `where n.nspname = 'public'\n` +
  `  and p.proname in (\n` +
  `    'adjust_stock', 'portal_claim_by_verified_email', 'read_quote_editor',\n` +
  `    'set_staff_active', 'set_staff_role', 'update_rental_quote'\n` +
  `  )\n` +
  `  and has_function_privilege('anon', p.oid, 'execute');\n` +
  `-- Expected unexpected_anon_rpcs: 0\n\n` +
  `-- 4. Verify public intake RPCs explicitly granted to anon (0256, 0257)\n` +
  `select 'PUBLIC INTAKE RPCS' as check_name, proname, has_function_privilege('anon', p.oid, 'execute') as anon_allowed\n` +
  `from pg_proc p\n` +
  `join pg_namespace n on n.oid = p.pronamespace\n` +
  `where n.nspname = 'public'\n` +
  `  and p.proname in ('submit_booking_request', 'set_request_context')\n` +
  `order by proname;\n` +
  `-- Expected: both submit_booking_request and set_request_context return anon_allowed = true\n\n` +
  `-- 5. Verify Critical Tables created by the cutover\n` +
  `select 'CORE CUTOVER TABLES' as check_name, table_name\n` +
  `from information_schema.tables\n` +
  `where table_schema = 'public'\n` +
  `  and table_name in (\n` +
  `    'settings', 'settings_history', 'delivery_jobs', 'delivery_zones', 'delivery_zone_rates',\n` +
  `    'team_notes', 'staff_shifts', 'staff_problem_reports', 'push_subscriptions',\n` +
  `    'product_aliases', 'booking_tags', 'booking_requests', 'client_portal_access',\n` +
  `    'payment_intents', 'online_payment_refunds'\n` +
  `  )\n` +
  `order by table_name;\n` +
  `-- Expected: 15 tables listed\n\n` +
  `-- 6. Verify Critical Column Extensions\n` +
  `select 'CRITICAL COLUMN EXTENSIONS' as check_name, table_name, column_name, data_type\n` +
  `from information_schema.columns\n` +
  `where table_schema = 'public' and (\n` +
  `  (table_name = 'bookings' and column_name in ('archived_at', 'project_name', 'shoot_location')) or\n` +
  `  (table_name = 'booking_lines' and column_name in ('line_total', 'price_breakdown')) or\n` +
  `  (table_name = 'inventory_units' and column_name in ('status', 'condition_grade'))\n` +
  `)\n` +
  `order by table_name, column_name;\n\n` +
  `rollback;\n`;

writeFileSync(verificationSqlPath, verifySql, 'utf8');
console.log(`Wrote ${verificationSqlPath} (${(verifySql.length / 1024).toFixed(1)} KB)`);

// Write manifest JSON
const manifestPath = join(OUTPUT_DIR, 'bundles_manifest.json');
writeFileSync(manifestPath, JSON.stringify(batchSummaries, null, 2), 'utf8');
console.log(`Wrote manifest to ${manifestPath}`);
