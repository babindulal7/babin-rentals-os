import { spawnSync } from 'node:child_process'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const root = process.cwd()
const script = join(root, 'scripts/verify-staging-source-hashes.mjs')
function run(args: string[]) {
  return spawnSync(process.execPath, [script, ...args], { cwd: root, encoding: 'utf8', maxBuffer: 4 * 1024 * 1024 })
}
describe('T1-02 staging source classification is read-only and fail-closed', () => {
  it('classifies special seeds without exposing SQL contents', () => {
    const result = run(['--json'])
    expect(result.status).toBe(0)
    const manifest = JSON.parse(result.stdout) as {
      files: Array<{filename:string,staging_treatment:string,flags:string[],bytes:number}>
      staging_treatment_holds: Array<{filename:string,treatment:string}>
      blockers:string[], filename_sorted_reference_only:boolean
      independently_reviewed_dependency_order:boolean
      authorized_staging_writes:boolean
    }
    const expected = readdirSync(join(root, 'supabase/migrations')).filter(x => x.endsWith('.sql'))
    expect(manifest.files).toHaveLength(expected.length)
    for (const [prefix, marker] of [
      ['0012_', 'SYNTHETIC_FIXTURE_ONLY_AFTER_INDEPENDENT_REVIEW'],
      ['0047_', 'QUARANTINE_GENERATED_DATA_SELECT_MINIMAL_SAFE_FIXTURES'],
      ['0082_', 'QUARANTINE_DYNAMIC_BOOKING_FIXTURES'],
    ] as const) {
      expect(manifest.files.find(x => x.filename.startsWith(prefix))?.staging_treatment).toBe(marker)
    }
    expect(manifest.files.filter(x => x.filename.startsWith('0188_'))).toHaveLength(2)
    expect(manifest.files.filter(x => x.filename.startsWith('0188_')).every(x =>
      x.flags.includes('DUPLICATE_PREFIX_DEPENDENCY_ORDER_REVIEW')
    )).toBe(true)
    expect(manifest.files.find(x => x.filename.startsWith('0047_'))?.bytes).toBeGreaterThan(1_000_000)
    expect(manifest.files.find(x => x.filename.startsWith('0013_'))?.flags).toContain('ENUM_CHANGE_DEPENDENCY_MANUAL_REVIEW')
    expect(manifest.filename_sorted_reference_only).toBe(true)
    expect(manifest.independently_reviewed_dependency_order).toBe(false)
    expect(manifest.authorized_staging_writes).toBe(false)
    expect(manifest.blockers.length).toBeGreaterThan(4)
    expect(result.stdout).not.toContain('hq@babinrentals.com')
    expect(result.stdout).not.toContain('owner@babinrentals.com')
  })

  it('requires the Coordinator monetary resolution guard in current 0241 source', () => {
    const currentSql = readFileSync(join(root, 'supabase/migrations/0241_extension_clash_manager_decision_and_at_risk.sql'), 'utf8')
    expect(currentSql).toContain("v_resolution in ('credit', 'refund') or v_credit_amount > 0")
    const manifest = JSON.parse(run(['--json']).stdout) as {files:Array<{filename:string,flags:string[]}>}
    const entry = manifest.files.find(x => x.filename.startsWith('0241_'))
    expect(entry).toBeDefined()
    expect(entry?.flags).not.toContain('P0_MONETARY_GUARD_NOT_VERIFIED')
    expect(entry?.flags).toContain('P0_RBAC_SOURCE_AND_STAGING_TEST_REQUIRED')
  })

  it('refuses to authorize a staging or production apply through --gate', () => {
    const blocked = run(['--gate'])
    expect(blocked.status).toBe(2)
    const details = JSON.parse(blocked.stdout) as {status:string,authorized_staging_writes:boolean,authorized_production_writes:boolean}
    expect(details.status).toBe('NOT_AN_APPLY_MANIFEST')
    expect(details.authorized_staging_writes).toBe(false)
    expect(details.authorized_production_writes).toBe(false)
  })
})
