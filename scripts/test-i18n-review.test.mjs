import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import {
  exportReviewRows,
  exportReviewCsv,
  exportReviewJson,
  toCsvRow,
  CSV_HEADERS,
} from './i18n-review-export.mjs'
import {
  parseCsv,
  normalizeReviewRows,
  importReviewRows,
} from './i18n-review-import.mjs'

test('exporting drafts never manufactures approval', () => {
  const rows = exportReviewRows({ wave: 2 })
  assert.ok(rows.length > 0)
  assert.ok(rows.every(row => row.status === 'PENDING'))
  assert.ok(rows.every(row => row.reviewed_by === '' && row.reviewed_at === ''))
})

test('import refuses approval without reviewer/date and blocks stale or foreign catalogue keys', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'i18n-review-validation-'))
  try {
    fs.mkdirSync(path.join(tempDir, 'en'))
    fs.mkdirSync(path.join(tempDir, 'ne'))
    fs.writeFileSync(path.join(tempDir, 'en', 'tools.json'), JSON.stringify({ 'tools.title': 'Tools' }))
    const row = { key: 'tools.title', module: 'tools', english: 'Tools', nepali_draft: 'औजार', status: 'OK', reviewed_by: 'Babin', reviewed_at: '2026-11-05' }
    const result = importReviewRows([
      { ...row, reviewed_by: '' }, { ...row, reviewed_at: '' }, { ...row, reviewed_at: '2026-02-30' },
      { ...row, module: '../../outside' }, { ...row, key: 'tools.unknown' }, { ...row, english: 'Old wording' },
    ], { i18nDir: tempDir })
    assert.equal(result.importedCount, 0)
    assert.equal(result.rejectedCount, 6)
    assert.equal(fs.existsSync(path.join(tempDir, 'review-approvals.json')), false)
    assert.deepEqual(fs.readdirSync(path.join(tempDir, 'ne')), [])
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true })
  }
})

test('i18n review export generates structured rows for at least 20 strings', () => {
  const rows = exportReviewRows()
  assert.ok(rows.length >= 20, `Expected at least 20 strings, found ${rows.length}`)

  for (const row of rows) {
    assert.ok(row.key, 'Row must have a key')
    assert.ok(row.module, 'Row must have a module')
    assert.ok(row.screen, 'Row must have a screen')
    assert.ok(row.english, 'Row must have English text')
    assert.equal(row.screenshot_link, '', 'Screenshot evidence is absent until a real capture is linked')
    assert.ok(['OK', 'PENDING'].includes(row.status), `Status must be OK or PENDING, got ${row.status}`)
  }
})

test('CSV exporter produces valid headers and preserves fields', () => {
  const csv = exportReviewCsv()
  const parsed = parseCsv(csv)
  assert.ok(parsed.length >= 21) // Header + 20+ rows

  const headerRow = parsed[0]
  assert.deepEqual(headerRow, CSV_HEADERS)
})

test('RFC 4180 CSV parser handles quotes, commas, and newlines', () => {
  const sample = 'key,english,notes\n"tools.test","Price, with comma","Note with ""quotes"" and\nnewline"'
  const rows = parseCsv(sample)
  assert.equal(rows.length, 2)
  assert.equal(rows[1][0], 'tools.test')
  assert.equal(rows[1][1], 'Price, with comma')
  assert.equal(rows[1][2], 'Note with "quotes" and\nnewline')
})

test('i18n review round trip on 20 strings works and strictly refuses unapproved rows (T6-03)', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'i18n-review-test-'))
  const mockI18nDir = path.join(tempDir, 'src', 'i18n')
  const mockNeDir = path.join(mockI18nDir, 'ne')
  fs.mkdirSync(mockNeDir, { recursive: true })
  const mockEnDir = path.join(mockI18nDir, 'en')
  fs.mkdirSync(mockEnDir, { recursive: true })

  try {
    // 1. Pick 20 distinct review rows
    const allRows = exportReviewRows()
    const testRows = allRows.slice(0, 20)
    assert.equal(testRows.length, 20)
    for (const row of testRows) {
      const file = path.join(mockEnDir, `${row.module}.json`)
      const data = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : {}
      data[row.key] = row.english
      fs.writeFileSync(file, JSON.stringify(data))
    }

    // 2. Prepare review sheet with varied statuses
    // 15 OK, 2 PENDING, 1 FIX, 1 empty status, 1 with Devanagari digit (forbidden)
    const reviewedRows = testRows.map((r, idx) => {
      const copy = { ...r, reviewed_by: 'Babin', reviewed_at: '2026-11-05' }
      if (idx < 14) {
        copy.status = 'OK'
      } else if (idx === 14) {
        // OK with Babin's override fix
        copy.status = 'OK'
        copy.babin_fix = 'परिमार्जित पाठ'
      } else if (idx === 15) {
        copy.status = 'PENDING' // unapproved
      } else if (idx === 16) {
        copy.status = 'FIX' // unapproved
      } else if (idx === 17) {
        copy.status = '' // unapproved
      } else if (idx === 18) {
        // Disallowed status string
        copy.status = 'REJECTED'
      } else if (idx === 19) {
        // Marked OK but contains forbidden Devanagari digits (e.g. "२०८३")
        copy.status = 'OK'
        copy.babin_fix = 'गलत अंक २०८३'
      }
      return copy
    })

    // 3. Convert reviewed rows to CSV
    const csvContent = [
      toCsvRow(CSV_HEADERS),
      ...reviewedRows.map((r) => toCsvRow([
        r.key,
        r.wave,
        r.module,
        r.screen,
        r.english,
        r.nepali_draft,
        r.screenshot_link,
        r.status,
        r.babin_fix,
        r.notes,
        r.reviewed_by,
        r.reviewed_at,
      ])),
    ].join('\n')

    // 4. Run import into the mock catalogue
    const result = importReviewRows(csvContent, { i18nDir: mockI18nDir })

    // 5. Invariant assertions
    assert.equal(result.totalRows, 20)
    // Exactly 15 rows were approved and valid
    assert.equal(result.importedCount, 15)
    // 5 rows were refused: 1 PENDING, 1 FIX, 1 empty, 1 REJECTED, 1 with Devanagari digits
    assert.equal(result.rejectedCount, 5)

    // Verify rejection reasons
    const unapprovedRejections = result.rejections.filter((rej) => rej.reason.includes('not approved'))
    assert.equal(unapprovedRejections.length, 4)

    const digitRejection = result.rejections.find((rej) => rej.reason.includes('Devanagari digits'))
    assert.ok(digitRejection, 'Must reject translation with Devanagari digits under R-21 / S11')
    assert.equal(digitRejection.key, reviewedRows[19].key)

    // Verify Babin's fix override was applied
    const targetModule = reviewedRows[14].module
    const targetCataloguePath = path.join(mockNeDir, `${targetModule}.json`)
    assert.ok(fs.existsSync(targetCataloguePath))

    const writtenCatalogue = JSON.parse(fs.readFileSync(targetCataloguePath, 'utf8'))
    assert.equal(writtenCatalogue[reviewedRows[14].key], 'परिमार्जित पाठ')

    // Verify unapproved keys were NEVER written
    assert.strictEqual(writtenCatalogue[reviewedRows[15].key], undefined)
    assert.strictEqual(writtenCatalogue[reviewedRows[16].key], undefined)
    assert.strictEqual(writtenCatalogue[reviewedRows[19].key], undefined)
    const reexported = exportReviewRows({ i18nDir: mockI18nDir })
    assert.equal(reexported.filter(row => row.status === 'OK').length, 15)
    assert.ok(reexported.filter(row => row.status === 'OK').every(row => row.reviewed_by === 'Babin'))
    const stale = JSON.parse(fs.readFileSync(targetCataloguePath, 'utf8'))
    stale[reviewedRows[14].key] = 'बदलिएको पाठ'
    fs.writeFileSync(targetCataloguePath, JSON.stringify(stale))
    assert.equal(exportReviewRows({ i18nDir: mockI18nDir }).find(row => row.key === reviewedRows[14].key).status, 'PENDING')
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true })
  }
})
