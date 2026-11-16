#!/usr/bin/env node
/**
 * Read-only staging migration preflight for Babin Rentals OS.
 * NEVER connects to a database, executes SQL, or prints environment secrets.
 * Run: node scripts/staging-schema-preflight.mjs
 */
import { createHash } from 'node:crypto'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const dir = join(root, 'supabase', 'migrations')
const files = readdirSync(dir).filter(name => name.endsWith('.sql')).sort()
if (!files.length) {
  console.error('FAIL: No SQL migrations were found. Nothing was applied.')
  process.exitCode = 1
} else {
  const hashes = new Set()
  const prefixes = new Map()
  const suspicious = []
  const manifestHash = createHash('sha256')
  let totalBytes = 0
  for (const name of files) {
    const match = /^(\d{4})_[a-z0-9_]+\.sql$/.exec(name)
    if (!match) suspicious.push({ file: name, reason: 'nonstandard filename' })
    const prefix = match?.[1] ?? '(unknown)'
    prefixes.set(prefix, [...(prefixes.get(prefix) || []), name])
    if (hashes.has(name)) suspicious.push({ file: name, reason: 'duplicate filename' })
    hashes.add(name)
    const content = readFileSync(join(dir, name))
    const size = statSync(join(dir, name)).size
    totalBytes += size
    manifestHash.update(name).update('\0').update(createHash('sha256').update(content).digest('hex')).update('\n')
    if (size === 0) suspicious.push({ file: name, reason: 'empty migration' })
    if (/seed|corpus|fixture|import|backfill/i.test(name)) suspicious.push({ file: name, reason: 'review data seeding/backfill for staging privacy' })
    if (size > 500_000) suspicious.push({ file: name, reason: 'large SQL file; manually audit before hosted execution' })
  }
  const duplicatePrefixes = [...prefixes.entries()].filter(([, names]) => names.length > 1)
  const unexpectedDuplicates = duplicatePrefixes.filter(([prefix]) => prefix !== '0188')
  if (unexpectedDuplicates.length) {
    console.error('FAIL: Unexpected duplicate numeric migration prefixes; investigate before hosted staging deployment.')
    process.exitCode = 1
  }
  console.log(JSON.stringify({
    mode: 'READ_ONLY_LOCAL_MANIFEST',
    sqlExecuted: false,
    databaseConnected: false,
    migrationCount: files.length,
    totalBytes,
    manifestSha256: manifestHash.digest('hex'),
    duplicatePrefixes: duplicatePrefixes.map(([prefix, names]) => ({ prefix, names, expected: prefix === '0188' })),
    attentionRequired: suspicious,
    nextStep: 'Review manifest + staged DB isolation + source backup gate before applying any hosted staging migration. Never target production.',
  }, null, 2))
}
