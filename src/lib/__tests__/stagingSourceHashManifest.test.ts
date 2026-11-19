import { execFileSync } from 'node:child_process'
import { readdirSync, readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const root = process.cwd()
const command = join(root, 'scripts/verify-staging-source-hashes.mjs')
const migrations = join(root, 'supabase/migrations')

function snapshot() {
  return JSON.parse(execFileSync(process.execPath, [command, '--json'], {
    cwd: root, encoding: 'utf8', maxBuffer: 4 * 1024 * 1024,
  })) as {
    file_count: number
    files: Array<{ filename: string; bytes: number; sha256: string; apply_approved: boolean }>
    duplicate_numeric_prefixes: Array<{ prefix: string; files: string[] }>
    seed_review_required: string[]
    authorized_staging_writes: boolean
    authorized_production_writes: boolean
    status: string
  }
}

describe('staging source-hash manifest (read only)', () => {
  it('matches every current SQL file and calculates actual SHA-256 bytes', () => {
    const result = snapshot()
    const names = readdirSync(migrations).filter(x => x.endsWith('.sql')).sort()
    expect(result.file_count).toBe(names.length)
    expect(result.files.map(x => x.filename)).toEqual(names)
    for (const entry of result.files) {
      const bytes = readFileSync(join(migrations, entry.filename))
      expect(entry.bytes).toBe(bytes.length)
      expect(entry.sha256).toBe(createHash('sha256').update(bytes).digest('hex'))
      expect(entry.apply_approved).toBe(false)
    }
  })

  it('flags migration prefix collisions and the three sensitive seed sources', () => {
    const result = snapshot()
    expect(result.duplicate_numeric_prefixes.some(x =>
      x.prefix === '0188' &&
      x.files.includes('0188_smart_reservation_holds.sql') &&
      x.files.includes('0188_staff_renting_gear.sql')
    )).toBe(true)
    for (const prefix of ['0012_', '0047_', '0082_']) {
      expect(result.seed_review_required.some(x => x.startsWith(prefix))).toBe(true)
    }
  })

  it('never authorizes staging or production application', () => {
    const result = snapshot()
    expect(result.status).toBe('NOT_AN_APPLY_MANIFEST')
    expect(result.authorized_staging_writes).toBe(false)
    expect(result.authorized_production_writes).toBe(false)
  })
})
