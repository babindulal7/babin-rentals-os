import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  validateBackupFile,
  generateEvidenceReport,
  REQUIRED_CORE_TABLES,
} from './restore-sandbox-drill.mjs'

test('restore-sandbox-drill: validateBackupFile rejects missing file', () => {
  assert.throws(
    () => validateBackupFile('non_existent_file.sql'),
    /Backup file not found/
  )
})

test('restore-sandbox-drill: validateBackupFile rejects small files (< 10 MB)', () => {
  const dir = mkdtempSync(join(tmpdir(), 'babin-restore-test-'))
  const file = join(dir, 'tiny.sql')
  writeFileSync(file, 'SELECT 1;\n')
  assert.throws(
    () => validateBackupFile(file),
    /Backup file is suspiciously small/
  )
})

test('restore-sandbox-drill: validateBackupFile rejects files without header or completion marker', () => {
  const dir = mkdtempSync(join(tmpdir(), 'babin-restore-test-'))
  const file = join(dir, 'truncated.sql')
  // 10MB + 1KB of junk
  const buf = Buffer.alloc(10 * 1024 * 1024 + 1024, 65)
  writeFileSync(file, buf)

  assert.throws(
    () => validateBackupFile(file),
    /File does not start with a valid PostgreSQL dump header/
  )

  const withHeader = Buffer.concat([
    Buffer.from('-- PostgreSQL database dump\n'),
    buf,
  ])
  writeFileSync(file, withHeader)

  assert.throws(
    () => validateBackupFile(file),
    /Dump does not end with a completion marker/
  )
})

test('restore-sandbox-drill: validateBackupFile succeeds on valid synthetic 10MB dump with required tables', () => {
  const dir = mkdtempSync(join(tmpdir(), 'babin-restore-test-'))
  const file = join(dir, 'valid.sql')

  const header = '-- PostgreSQL database dump\n'
  const tables = `
CREATE TABLE public.bookings (id uuid);
CREATE TABLE public.clients (id uuid);
CREATE TABLE public.products (id uuid);
CREATE TABLE public.security_deposits (id uuid);
`
  const filler = Buffer.alloc(10 * 1024 * 1024, 32) // 10 MB spaces
  const footer = '\n-- PostgreSQL database dump complete\n'

  const content = Buffer.concat([
    Buffer.from(header + tables),
    filler,
    Buffer.from(footer),
  ])
  writeFileSync(file, content)

  const info = validateBackupFile(file)
  assert.equal(info.bytes, content.length)
  assert.equal(info.sha256.length, 64)
  assert.match(info.mb, /^\d+\.\d{2}$/)
})

test('restore-sandbox-drill: generateEvidenceReport produces compliant markdown', () => {
  const report = generateEvidenceReport({
    backupInfo: {
      path: 'backups/production_backup_test.sql',
      bytes: 23497610,
      mb: '22.41',
      sha256: '70d180d6dcac387bef4f7ede7276affdb806cb92d20a81bc3719f47890d276f7',
    },
    verificationInfo: {
      database: 'babin_restore_sandbox',
      rowCounts: {
        bookings: 246,
        clients: 40,
        products: 70,
        security_deposits: 18,
        invoices: 312,
        payments: 450,
      },
      financials: {
        totalPaymentsPaisa: 845000000,
        totalInvoicesPaisa: 910000000,
        totalDepositsPaisa: 125000000,
      },
    },
  })

  assert.ok(report.includes('Babin Rentals OS — P0-01 Disaster Recovery Restore Drill Evidence'))
  assert.ok(report.includes('DRILL PASSED — PHYSICAL RESTORE VERIFIED'))
  assert.ok(report.includes('Gate P0-01 is CLOSED'))
  assert.ok(report.includes('Law 5 Invariant'))
  assert.ok(report.includes('`public.bookings` | **246**'))
})
