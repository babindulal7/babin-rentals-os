import fs from 'node:fs'
import path from 'node:path'

export const WAVE_MODULES = {
  1: ['core', 'auth', 'today', 'operations'],
  2: ['rentals', 'calendar', 'clients', 'crew'],
  3: ['finance', 'inventory', 'notes', 'tools', 'documents'],
  4: ['reports', 'settings', 'admin'],
}

export function getWaveForModule(moduleName) {
  for (const [wave, mods] of Object.entries(WAVE_MODULES)) {
    if (mods.includes(moduleName)) return Number(wave)
  }
  return 1
}

export function escapeCsvField(val) {
  if (val === undefined || val === null) return ''
  const str = String(val)
  if (/[",\n\r]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`
  }
  return str
}

export function toCsvRow(fields) {
  return fields.map(escapeCsvField).join(',')
}

export const CSV_HEADERS = [
  'key',
  'wave',
  'module',
  'screen',
  'english',
  'nepali_draft',
  'screenshot_link',
  'status',
  'babin_fix',
  'notes',
]

/**
 * Collects catalogue entries across modules into structured review rows.
 */
export function exportReviewRows(options = {}) {
  const {
    wave = 'all',
    module = null,
    i18nDir = 'src/i18n',
  } = options

  const enDir = path.join(i18nDir, 'en')
  const neDir = path.join(i18nDir, 'ne')

  if (!fs.existsSync(enDir)) {
    throw new Error(`English catalogue directory not found: ${enDir}`)
  }

  const enFiles = fs.readdirSync(enDir).filter((f) => f.endsWith('.json'))
  const rows = []

  for (const file of enFiles) {
    const modName = file.replace('.json', '')
    if (module && modName !== module) continue

    const modWave = getWaveForModule(modName)
    if (wave !== 'all' && Number(wave) !== modWave) continue

    const enPath = path.join(enDir, file)
    const nePath = path.join(neDir, file)

    const enData = JSON.parse(fs.readFileSync(enPath, 'utf8'))
    const neData = fs.existsSync(nePath) ? JSON.parse(fs.readFileSync(nePath, 'utf8')) : {}

    for (const [key, enText] of Object.entries(enData)) {
      const parts = key.split('.')
      const screenName = parts.length > 2 ? parts[1] : (parts.length === 2 ? parts[0] : 'general')
      const neText = neData[key] || ''

      const isVerified = Boolean(neText && neText.trim().length > 0)
      const screenshotLink = `https://os.babinrentals.com/screenshots/${modName}/${screenName}.png`

      let notes = 'S11 approved wording'
      if (/NPR|\$|%|\d/.test(enText)) {
        notes += ' · R-21: Latin numbers/currency stay Latin'
      }

      rows.push({
        key,
        wave: modWave,
        module: modName,
        screen: screenName,
        english: enText,
        nepali_draft: neText,
        screenshot_link: screenshotLink,
        status: isVerified ? 'OK' : 'PENDING',
        babin_fix: '',
        notes,
      })
    }
  }

  return rows
}

/**
 * Exports review rows as a CSV formatted string.
 */
export function exportReviewCsv(options = {}) {
  const rows = exportReviewRows(options)
  const lines = [toCsvRow(CSV_HEADERS)]

  for (const row of rows) {
    lines.push(toCsvRow([
      row.key,
      row.wave,
      row.module,
      row.screen,
      row.english,
      row.nepali_draft,
      row.screenshot_link,
      row.status,
      row.babin_fix,
      row.notes,
    ]))
  }

  return lines.join('\n')
}

/**
 * Exports review rows as formatted JSON.
 */
export function exportReviewJson(options = {}) {
  const rows = exportReviewRows(options)
  return JSON.stringify(rows, null, 2)
}

// CLI runner
if (process.argv[1]?.endsWith('i18n-review-export.mjs')) {
  const args = process.argv.slice(2)
  const waveArg = args.find((a) => a.startsWith('--wave='))?.split('=')[1] || 'all'
  const moduleArg = args.find((a) => a.startsWith('--module='))?.split('=')[1] || null
  const formatArg = args.find((a) => a.startsWith('--format='))?.split('=')[1] || 'csv'
  const outArg = args.find((a) => a.startsWith('--out='))?.split('=')[1] || null

  const output = formatArg === 'json'
    ? exportReviewJson({ wave: waveArg, module: moduleArg })
    : exportReviewCsv({ wave: waveArg, module: moduleArg })

  if (outArg) {
    fs.mkdirSync(path.dirname(outArg), { recursive: true })
    fs.writeFileSync(outArg, output, 'utf8')
    console.log(`Exported review sheet (${formatArg}) to: ${outArg}`)
  } else {
    process.stdout.write(output)
  }
}
