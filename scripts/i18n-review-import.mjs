import fs from 'node:fs'
import path from 'node:path'

/**
 * Robust RFC 4180 CSV parser.
 */
export function parseCsv(text) {
  const rows = []
  let currentRow = []
  let currentField = ''
  let inQuotes = false

  for (let i = 0; i < text.length; i++) {
    const char = text[i]
    const nextChar = text[i + 1]

    if (inQuotes) {
      if (char === '"') {
        if (nextChar === '"') {
          currentField += '"'
          i++
        } else {
          inQuotes = false
        }
      } else {
        currentField += char
      }
    } else {
      if (char === '"') {
        inQuotes = true
      } else if (char === ',') {
        currentRow.push(currentField)
        currentField = ''
      } else if (char === '\r') {
        if (nextChar === '\n') i++
        currentRow.push(currentField)
        rows.push(currentRow)
        currentRow = []
        currentField = ''
      } else if (char === '\n') {
        currentRow.push(currentField)
        rows.push(currentRow)
        currentRow = []
        currentField = ''
      } else {
        currentField += char
      }
    }
  }

  if (currentField.length > 0 || currentRow.length > 0) {
    currentRow.push(currentField)
    rows.push(currentRow)
  }

  return rows
}

/**
 * Normalizes input string or structured rows into row objects.
 */
export function normalizeReviewRows(input) {
  if (Array.isArray(input)) return input

  const trimmed = input.trim()
  if (trimmed.startsWith('[') || trimmed.startsWith('{')) {
    const parsed = JSON.parse(trimmed)
    return Array.isArray(parsed) ? parsed : [parsed]
  }

  const rawRows = parseCsv(trimmed)
  if (rawRows.length === 0) return []

  const headers = rawRows[0].map((h) => h.trim().toLowerCase().replace(/\s+/g, '_'))
  const rowObjects = []

  for (let i = 1; i < rawRows.length; i++) {
    const raw = rawRows[i]
    if (raw.length === 1 && raw[0].trim() === '') continue

    const obj = {}
    for (let h = 0; h < headers.length; h++) {
      const header = headers[h]
      obj[header] = raw[h] !== undefined ? raw[h].trim() : ''
    }
    rowObjects.push(obj)
  }

  return rowObjects
}

/**
 * Imports reviewed strings back into `src/i18n/ne/*.json`.
 *
 * Strict invariants:
 * 1. Refuses any row whose status is not explicitly "OK" or "Approved".
 * 2. Refuses any text containing Devanagari digits [०-९] (Law 6, R-21, S11: Latin digits only).
 * 3. Uses Babin's fix (babin_fix) when present, falling back to nepali_draft.
 */
export function importReviewRows(input, options = {}) {
  const {
    i18nDir = 'src/i18n',
    dryRun = false,
  } = options

  const rows = normalizeReviewRows(input)
  const neDir = path.join(i18nDir, 'ne')

  const rejections = []
  const approvedByModule = {}

  for (const row of rows) {
    const key = row.key
    const moduleName = row.module || key.split('.')[0]
    const status = (row.status || '').trim().toUpperCase()

    // Invariant 1: Row must be approved (OK)
    if (status !== 'OK' && status !== 'APPROVED') {
      rejections.push({
        key,
        status: row.status,
        reason: `Row is not approved (status: "${row.status || 'empty'}"). Only "OK" rows are imported.`,
      })
      continue
    }

    // Invariant 2: Candidate text selection
    const candidateText = (row.babin_fix && row.babin_fix.trim().length > 0)
      ? row.babin_fix.trim()
      : (row.nepali_draft ? row.nepali_draft.trim() : '')

    if (!candidateText) {
      rejections.push({
        key,
        status: row.status,
        reason: 'Empty translation text provided.',
      })
      continue
    }

    // Invariant 3: No Devanagari digits
    if (/[०-९]/.test(candidateText)) {
      rejections.push({
        key,
        status: row.status,
        reason: `Contains forbidden Devanagari digits [०-९]: "${candidateText}". Digits must remain Latin.`,
      })
      continue
    }

    if (!approvedByModule[moduleName]) {
      approvedByModule[moduleName] = []
    }

    approvedByModule[moduleName].push({
      key,
      text: candidateText,
    })
  }

  const updatedModules = []

  if (!dryRun) {
    for (const [moduleName, items] of Object.entries(approvedByModule)) {
      const filePath = path.join(neDir, `${moduleName}.json`)
      let currentData = {}

      if (fs.existsSync(filePath)) {
        try {
          currentData = JSON.parse(fs.readFileSync(filePath, 'utf8'))
        } catch (err) {
          throw new Error(`Failed to read catalogue ${filePath}: ${err.message}`)
        }
      }

      for (const item of items) {
        currentData[item.key] = item.text
      }

      fs.mkdirSync(path.dirname(filePath), { recursive: true })
      fs.writeFileSync(filePath, JSON.stringify(currentData, null, 2) + '\n', 'utf8')
      updatedModules.push(moduleName)
    }
  }

  const importedCount = Object.values(approvedByModule).reduce((sum, list) => sum + list.length, 0)

  return {
    totalRows: rows.length,
    importedCount,
    rejectedCount: rejections.length,
    rejections,
    updatedModules: dryRun ? Object.keys(approvedByModule) : updatedModules,
  }
}

// CLI runner
if (process.argv[1]?.endsWith('i18n-review-import.mjs')) {
  const args = process.argv.slice(2)
  const fileArg = args.find((a) => a.startsWith('--file='))?.split('=')[1]
  const strict = args.includes('--strict')

  if (!fileArg) {
    console.error('Usage: node scripts/i18n-review-import.mjs --file=<path> [--strict]')
    process.exit(1)
  }

  const content = fs.readFileSync(fileArg, 'utf8')
  const result = importReviewRows(content)

  console.log(`\nImport Summary:`)
  console.log(`- Total rows: ${result.totalRows}`)
  console.log(`- Successfully imported: ${result.importedCount}`)
  console.log(`- Refused/rejected: ${result.rejectedCount}`)

  if (result.rejectedCount > 0) {
    console.log(`\nRejections:`)
    for (const r of result.rejections) {
      console.log(`  ✗ [${r.key}] ${r.reason}`)
    }
  }

  if (strict && result.rejectedCount > 0) {
    process.exit(1)
  }
}
