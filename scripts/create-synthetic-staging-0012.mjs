#!/usr/bin/env node
/**
 * Produce a synthetic copy of the 0012 seed for STAGING REVIEW ONLY.
 *
 * It neither contacts Supabase nor applies SQL. Without --write it is purely
 * read-only. With --write it creates a git-ignored file under .localdb/.
 *
 * node scripts/create-synthetic-staging-0012.mjs
 * node scripts/create-synthetic-staging-0012.mjs --write
 */
import { createHash } from 'node:crypto'
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const name = '0012_seed_data.sql'
const srcPath = join(root, 'supabase', 'migrations', name)
const manifestPath = join(root, 'docs', 'verification', 'STAGING_SQL_INVENTORY_2026-11-16.json')
const output = join(root, '.localdb', 'staging-fixtures', '0012_seed_data.synthetic.sql')
const flags = process.argv.slice(2)
if (flags.some((flag) => flag !== '--write') || flags.filter((flag) => flag === '--write').length > 1) {
  console.error('Usage: node scripts/create-synthetic-staging-0012.mjs [--write]')
  process.exit(2)
}

const sourceBytes = readFileSync(srcPath)
const inventory = JSON.parse(readFileSync(manifestPath, 'utf8'))
const pinned = inventory.files.find((file) => file.filename === name)
const blobSha = createHash('sha1').update(`blob ${sourceBytes.length}\0`).update(sourceBytes).digest('hex')
if (!pinned || pinned.git_blob_sha !== blobSha || pinned.bytes !== sourceBytes.length) {
  console.error('BLOCKED: source 0012 differs from the pinned Git inventory. Review source changes first.')
  process.exit(2)
}

const replacements = [
  ['hq@babinrentals.com', 'staging-hq@example.invalid'],
  ['pokhara@babinrentals.com', 'staging-branch@example.invalid'],
  ['owner@babinrentals.com', 'staging-owner@example.invalid'],
  ['manager@babinrentals.com', 'staging-manager@example.invalid'],
  ['warehouse@babinrentals.com', 'staging-warehouse@example.invalid'],
  ['billing@babinrentals.com', 'staging-billing@example.invalid'],
  ['+977-1-4770000', 'STAGING-PHONE-HQ'],
  ['+977-61-530000', 'STAGING-PHONE-BRANCH'],
  ['+977-9800000001', 'STAGING-MOBILE-OWNER'],
  ['+977-9800000002', 'STAGING-MOBILE-MANAGER'],
  ['+977-9800000003', 'STAGING-MOBILE-WAREHOUSE'],
  ['+977-9800000004', 'STAGING-MOBILE-BILLING'],
  ['623587106', 'STAGING-PAN-INVALID'],
  ['01201017500001', 'STAGING-ACCOUNT-001'],
  ['9800000001', 'STAGING-WALLET-001'],
  ['Nabil Bank Ltd.', 'Fixture Bank (NO PAYMENTS)'],
  ['eSewa Digital Wallet', 'Fixture Wallet (NO PAYMENTS)'],
  ['Babin Shrestha', 'Staging Test Owner'],
  ['Babin Rentals Pvt. Ltd.', 'Fixture Rental Company'],
  ['Babin Rentals Corporate', 'Fixture Rental Company Wallet'],
]

let sql = sourceBytes.toString('utf8')
let replacementsApplied = 0
for (const [oldValue, newValue] of replacements) {
  const count = sql.split(oldValue).length - 1
  if (!count) {
    console.error('BLOCKED: expected source seed token is missing; source may have changed.')
    process.exit(2)
  }
  sql = sql.replaceAll(oldValue, newValue)
  replacementsApplied += count
}

// This file is a review fixture, not a migration release artifact.
const allEmails = sql.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi) ?? []
if (allEmails.length !== 6 || allEmails.some((email) => !email.endsWith('@example.invalid'))) {
  console.error('BLOCKED: synthetic seed has an unreviewed or deliverable email address.')
  process.exit(2)
}
if (/@babinrentals\.com|\+977[- ]\d|\b01201017500001\b|\b623587106\b|\b9800000001\b|Nabil Bank|eSewa Digital Wallet/i.test(sql)) {
  console.error('BLOCKED: synthetic seed still contains a known business contact, PAN or payment identifier.')
  process.exit(2)
}
const fixture = [
  '-- SYNTHETIC STAGING FIXTURE ONLY. NOT AN APPROVED PERMANENT MIGRATION.',
  '-- OUTBOUND EMAIL, SMS, PAYMENT AND WEBHOOKS MUST BE DISABLED ON STAGING.',
  '-- NEVER USE WITH PRODUCTION. DO NOT RUN WITHOUT AN APPROVED APPLY MANIFEST.',
  '-- Source blob: ' + blobSha,
  sql,
].join('\n')
const sha256 = createHash('sha256').update(fixture).digest('hex')
if (flags.includes('--write')) {
  mkdirSync(dirname(output), { recursive: true })
  writeFileSync(output, fixture, { encoding: 'utf8', mode: 0o600, flag: 'wx' })
}
console.log(JSON.stringify({
  mode: 'SYNTHETIC_SEED_PREPARATION_ONLY',
  databaseConnected: false,
  sqlExecuted: false,
  sourceBlob: blobSha,
  replacementsApplied,
  emailAddresses: allEmails.length,
  fixtureSha256: sha256,
  writtenToIgnoredLocalPath: flags.includes('--write'),
  requiresReviewBeforeRemoteApply: true,
}, null, 2))
