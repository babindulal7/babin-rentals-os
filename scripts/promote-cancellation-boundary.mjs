#!/usr/bin/env node
// Local-only migration generation for #440; never connects to hosted databases.
// Run from the repair branch with the Supabase CLI installed and a clean worktree.
import { spawnSync } from 'node:child_process'
import { readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
const root = join(dirname(fileURLToPath(import.meta.url)), '..')
function run(bin, args) {
  const result = spawnSync(bin, args, { cwd: root, encoding: 'utf8', shell: false })
  if (result.error || result.status !== 0) throw new Error(result.error?.message || result.stderr || result.stdout || bin + ' failed')
  return result.stdout.trim()
}
const branch = run('git', ['branch', '--show-current'])
if (branch !== 'fix/cancellation-boundary-promotion-440') throw new Error('Run only on the isolated repair branch')
if (run('git', ['status', '--porcelain'])) throw new Error('Commit or stash unrelated changes before promotion')
const dir = join(root, 'supabase', 'migrations')
const before = new Set(readdirSync(dir))
const suffix = '_cancellation_branch_boundary.sql'
if ([...before].some(f => f.endsWith(suffix))) throw new Error('Migration already exists; review it rather than creating another')
const source = readFileSync(join(root, 'scripts', 'fixtures', 'cancellation-branch-boundary-candidate.sql'), 'utf8')
if (!source.includes('create or replace function public.cancel_booking(p_payload jsonb)') || !source.includes('for update;')) throw new Error('Unexpected candidate SQL')
run('supabase', ['migration', 'new', '--help'])
console.log(run('supabase', ['migration', 'new', 'cancellation_branch_boundary']))
const added = readdirSync(dir).filter(f => !before.has(f))
if (added.length !== 1 || !/^\d{14}_cancellation_branch_boundary\.sql$/.test(added[0])) throw new Error('Unexpected CLI-generated path: ' + added.join(', '))
const body = source.replace(/^--[^\n]*\n--[^\n]*\n/, '')
writeFileSync(join(dir, added[0]), '-- #440 forward-only cancellation authorization repair; no fee or refund changes.\nbegin;\n\n' + body + '\nrevoke execute on function public.cancel_booking(uuid, text, uuid) from anon, public;\ngrant execute on function public.cancel_booking(uuid, text, uuid) to authenticated;\n\ncommit;\n', 'utf8')
console.log('Generated LOCAL ONLY: supabase/migrations/' + added[0])
console.log('Review ledger ordering and run: node scripts/test-cancellation-branch-boundary.mjs')
console.log('Require both concurrent custody orderings and independent review before any hosted change.')
