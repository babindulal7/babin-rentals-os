#!/usr/bin/env node
/**
 * BABIN RENTALS OS — SUPABASE SECURITY ADVISOR INTROSPECTION & AUDIT TOOL
 * Replicates Supabase Database Linter rules against local PGlite:
 * - 0002_auth_users_exposed
 * - 0010_security_definer_view
 * - 0028_anon_security_definer_function_executable
 * - 0029_authenticated_security_definer_function_executable
 * - 0007_function_search_path_mutable
 * - 0008_rls_enabled_no_policy
 */

import { PGlite } from '@electric-sql/pglite'
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto'
import { btree_gist } from '@electric-sql/pglite/contrib/btree_gist'
import { readdirSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')

console.log('[audit-linter] Initializing PGlite instance...')
const db = await PGlite.create({ extensions: { pgcrypto, btree_gist } })

console.log('[audit-linter] Applying prelude...')
await db.exec(readFileSync(join(ROOT, 'supabase/pglite-prelude.sql'), 'utf8'))

const migrationsDir = join(ROOT, 'supabase/migrations')
const migrationFiles = readdirSync(migrationsDir).filter((f) => f.endsWith('.sql')).sort()

console.log(`[audit-linter] Applying ${migrationFiles.length} migration files...`)
let count = 0
for (const file of migrationFiles) {
  try {
    await db.exec(readFileSync(join(migrationsDir, file), 'utf8'))
    count++
  } catch (err) {
    console.error(`[audit-linter] Error applying ${file}:`, err.message)
    throw err
  }
}
console.log(`[audit-linter] Successfully applied ${count} migrations. Running audit queries...`)

const q = async (sql) => (await db.query(sql)).rows

// 1. auth_users_exposed (0002_auth_users_exposed)
// Views that reference auth.users in their definition where anon or authenticated has SELECT
const authUsersViews = await q(`
  select 
    c.relname as view_name,
    pg_get_viewdef(c.oid, true) as view_def,
    has_table_privilege('anon', c.oid, 'select') as anon_select,
    has_table_privilege('authenticated', c.oid, 'select') as authenticated_select,
    coalesce(c.reloptions::text[] @> array['security_invoker=true'], false) as is_security_invoker
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind in ('v', 'm')
    and (pg_get_viewdef(c.oid, true) ilike '%auth.users%' or pg_get_viewdef(c.oid, true) ilike '%auth."users"%')
`)

console.log(`\n--- 1. AUTH_USERS_EXPOSED (${authUsersViews.length} findings) ---`)
for (const v of authUsersViews) {
  console.log(`View: ${v.view_name} | anon_select: ${v.anon_select} | auth_select: ${v.authenticated_select} | invoker: ${v.is_security_invoker}`)
}

// 2. security_definer_view (0010_security_definer_view)
// Views in public schema where security_invoker is false or not set
const securityDefinerViews = await q(`
  select 
    c.relname as view_name,
    has_table_privilege('anon', c.oid, 'select') as anon_select,
    has_table_privilege('authenticated', c.oid, 'select') as authenticated_select,
    coalesce(c.reloptions::text[] @> array['security_invoker=true'], false) as is_security_invoker,
    pg_get_viewdef(c.oid, true) as view_def
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind in ('v', 'm')
    and not coalesce(c.reloptions::text[] @> array['security_invoker=true'], false)
  order by c.relname
`)
console.log(`\n--- 2. SECURITY_DEFINER_VIEW (${securityDefinerViews.length} findings) ---`)
console.log(`Total views with security_invoker=false: ${securityDefinerViews.length}`)

// 3. anon_security_definer_function_executable (0028)
// Functions in public schema where prosecdef = true and anon has EXECUTE
const anonDefinerFns = await q(`
  select 
    p.proname,
    p.oid::regprocedure::text as signature,
    pg_get_function_arguments(p.oid) as args,
    pg_get_functiondef(p.oid) as def,
    coalesce(p.proconfig::text[], array[]::text[]) as config
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.prosecdef = true
    and p.prokind = 'f'
    and p.prorettype <> 'trigger'::regtype
    and has_function_privilege('anon', p.oid, 'execute')
  order by p.proname
`)
console.log(`\n--- 3. ANON_SECURITY_DEFINER_FUNCTION_EXECUTABLE (${anonDefinerFns.length} findings) ---`)

// 4. authenticated_security_definer_function_executable (0029)
// Functions in public schema where prosecdef = true and authenticated has EXECUTE
const authDefinerFns = await q(`
  select 
    p.proname,
    p.oid::regprocedure::text as signature,
    pg_get_function_arguments(p.oid) as args,
    coalesce(p.proconfig::text[], array[]::text[]) as config
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.prosecdef = true
    and p.prokind = 'f'
    and p.prorettype <> 'trigger'::regtype
    and has_function_privilege('authenticated', p.oid, 'execute')
  order by p.proname
`)
console.log(`\n--- 4. AUTHENTICATED_SECURITY_DEFINER_FUNCTION_EXECUTABLE (${authDefinerFns.length} findings) ---`)

// 5. function_search_path_mutable (0007)
// Privileged functions where proconfig is null or lacks search_path
const mutableSearchPathFns = await q(`
  select 
    p.proname,
    p.oid::regprocedure::text as signature,
    p.prosecdef,
    coalesce(p.proconfig::text[], array[]::text[]) as config
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.prosecdef = true
    and (
      p.proconfig is null 
      or not exists (select 1 from unnest(p.proconfig) c where c ilike 'search_path=%')
    )
  order by p.proname
`)
console.log(`\n--- 5. FUNCTION_SEARCH_PATH_MUTABLE (${mutableSearchPathFns.length} findings) ---`)
for (const f of mutableSearchPathFns) {
  console.log(`  Mutable search path: ${f.signature}`)
}

// 6. rls_enabled_no_policy (0008)
// Tables in public schema with relrowsecurity = true but no policies in pg_policy
const rlsNoPolicyTables = await q(`
  select 
    c.relname as table_name,
    has_table_privilege('anon', c.oid, 'select') as anon_select,
    has_table_privilege('authenticated', c.oid, 'select') as auth_select
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind = 'r'
    and c.relrowsecurity = true
    and not exists (
      select 1 from pg_policy p where p.polrelid = c.oid
    )
  order by c.relname
`)
console.log(`\n--- 6. RLS_ENABLED_NO_POLICY (${rlsNoPolicyTables.length} findings) ---`)
for (const t of rlsNoPolicyTables) {
  console.log(`  Table: ${t.table_name} | anon_select: ${t.anon_select} | auth_select: ${t.auth_select}`)
}

// Write detailed audit JSON artifact
const results = {
  timestampISO: new Date().toISOString(),
  counts: {
    auth_users_exposed: authUsersViews.length,
    security_definer_view: securityDefinerViews.length,
    anon_security_definer_function_executable: anonDefinerFns.length,
    authenticated_security_definer_function_executable: authDefinerFns.length,
    function_search_path_mutable: mutableSearchPathFns.length,
    rls_enabled_no_policy: rlsNoPolicyTables.length,
  },
  authUsersViews,
  securityDefinerViews: securityDefinerViews.map((v) => ({
    name: v.view_name,
    anon: v.anon_select,
    auth: v.authenticated_select,
  })),
  anonDefinerFns: anonDefinerFns.map((f) => ({
    name: f.proname,
    sig: f.signature,
  })),
  authDefinerFns: authDefinerFns.map((f) => ({
    name: f.proname,
    sig: f.signature,
  })),
  mutableSearchPathFns: mutableSearchPathFns.map((f) => ({
    name: f.proname,
    sig: f.signature,
  })),
  rlsNoPolicyTables,
}

const artifactsDir = join(ROOT, 'artifacts')
mkdirSync(artifactsDir, { recursive: true })
const outputPath = join(artifactsDir, 'supabase-linter-audit.json')
writeFileSync(outputPath, JSON.stringify(results, null, 2))
console.log(`\nAudit results written to ${outputPath}`)
