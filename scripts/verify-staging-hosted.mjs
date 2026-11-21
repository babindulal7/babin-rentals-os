#!/usr/bin/env node
/**
 * scripts/verify-staging-hosted.mjs — Hosted Staging Verification Runner
 *
 * Runs Stage 2 Hosted PostgREST & Storage RLS Acceptance against babin-staging.
 * Safe read-only execution: GET requests only, zero database mutations.
 *
 * Usage:
 *   node scripts/verify-staging-hosted.mjs
 */

import { readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { stagingConfiguration, verifyStaging, STAGING_ROLES } from './verify-staging-readonly.mjs'

// 1. Load staging environment variables from candidate paths
const candidatePaths = [
  resolve('.env.staging.local'),
  resolve('.env.staging'),
  resolve('env.staging.local'),
  resolve('env.staging'),
  resolve('../env.staging'),
  resolve('../.env.staging.local'),
  'C:/Users/use/Desktop/babin-rentals-os/.env.staging.local',
  'C:/Users/use/Desktop/babin-rentals-os-staging-acceptance/.env.staging.local',
]

for (const p of candidatePaths) {
  if (existsSync(p)) {
    const lines = readFileSync(p, 'utf8').split(/\r?\n/)
    for (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith('#')) continue
      const eqIdx = trimmed.indexOf('=')
      if (eqIdx > 0) {
        const key = trimmed.slice(0, eqIdx).trim()
        let val = trimmed.slice(eqIdx + 1).trim()
        if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
          val = val.slice(1, -1)
        }
        if (val && !process.env[key]) process.env[key] = val
      }
    }
  }
}

// Fallback mappings if alternative naming was used
process.env.BABIN_STAGING_ANON_KEY = process.env.BABIN_STAGING_ANON_KEY || process.env.STAGING_ANON_KEY

// 2. Set defaults if missing
if (!process.env.BABIN_STAGING_PROJECT_REF) process.env.BABIN_STAGING_PROJECT_REF = 'klhmsrunqrdxjudyhnkm'
if (!process.env.BABIN_STAGING_SUPABASE_URL) process.env.BABIN_STAGING_SUPABASE_URL = 'https://klhmsrunqrdxjudyhnkm.supabase.co'
if (!process.env.BABIN_STAGING_FIXTURES) process.env.BABIN_STAGING_FIXTURES = 'docs/security/acceptance/staging_fixtures_manifest.json'

const anonKey = process.env.BABIN_STAGING_ANON_KEY
const authPassword = process.env.BABIN_STAGING_SYNTHETIC_PASSWORD || 'BabinSynthetic2026!'

if (!anonKey || anonKey === 'PASTE_STAGING_ANON_KEY_HERE') {
  console.error('\n[ERROR] Missing or placeholder BABIN_STAGING_ANON_KEY.')
  console.error('Searched paths: .env.staging.local, .env.staging, env.staging, etc.')
  console.error('Please specify where your env.staging file is, or set BABIN_STAGING_ANON_KEY in .env.staging.local.\n')
  process.exit(1)
}

// 3. Auto-mint JWTs via GoTrue if role tokens are not explicitly set
console.log('--- Babin Rentals OS: Stage 2 Hosted Staging Acceptance ---')
console.log(`Target: ${process.env.BABIN_STAGING_PROJECT_REF} (${process.env.BABIN_STAGING_SUPABASE_URL})`)

const roleEmails = {
  Owner: 'owner@babinrentals.test',
  Admin: 'admin@babinrentals.test',
  Manager: 'manager@babinrentals.test',
  Coordinator: 'coordinator@babinrentals.test',
  Warehouse: 'warehouse@babinrentals.test',
  Technician: 'technician@babinrentals.test',
  Accounts: 'accounts@babinrentals.test',
  Driver: 'driver@babinrentals.test',
  Client: 'client-a@babinrentals.test',
}

let allTokensPresent = true
for (const role of STAGING_ROLES) {
  if (!process.env[`BABIN_STAGING_JWT_${role.toUpperCase()}`]) {
    allTokensPresent = false
    break
  }
}

if (!allTokensPresent) {
  console.log('Authenticating 9 synthetic roles via GoTrue to mint session JWTs...')
  for (const role of STAGING_ROLES) {
    const envKey = `BABIN_STAGING_JWT_${role.toUpperCase()}`
    if (process.env[envKey]) continue

    const email = roleEmails[role]
    try {
      const authRes = await fetch(`${process.env.BABIN_STAGING_SUPABASE_URL}/auth/v1/token?grant_type=password`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': anonKey,
        },
        body: JSON.stringify({ email, password: authPassword }),
      })
      if (!authRes.ok) {
        const errText = await authRes.text()
        console.error(`[FAIL] Authentication failed for ${role} (${email}): ${authRes.status} ${errText}`)
        process.exit(2)
      }
      const authData = await authRes.json()
      process.env[envKey] = authData.access_token
      console.log(`  ✓ Authenticated ${role} (${email})`)
    } catch (err) {
      console.error(`[ERROR] Network error authenticating ${role}:`, err.message)
      process.exit(2)
    }
  }
}

// 4. Run verifyStaging via the official harness
const config = stagingConfiguration(process.env)
const fixtures = JSON.parse(readFileSync(resolve(config.manifest), 'utf8'))
const report = await verifyStaging(config, fixtures, fetch)

console.log('\n--- Verification Results ---')
for (const check of report.checks) {
  const icon = check.status === 'PASS' ? '✓' : '✗'
  console.log(`  ${icon} [${check.status}] ${check.name}`)
}

console.log(`\nOverall Staging Gate Status: ${report.status}`)
process.exit(report.status === 'PASS' ? 0 : 2)
