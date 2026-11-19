import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('T1-02 source-only staging inventory', () => {
  const inventory = JSON.parse(readFileSync(join(process.cwd(), 'docs/verification/STAGING_SQL_INVENTORY_2026-11-16.json'), 'utf8')) as {
    migration_files: number
    source_main_commit: string
    current_live_ledger_rechecked: boolean
    source_drift_since_prior_snapshot: { added_files: string[]; changed_files: unknown[]; removed_files: string[] }
    files: Array<{ filename: string; review_state: string }>
  }
  it('pins current source and retains explicit review blockers', () => {
    expect(inventory.migration_files).toBe(241)
    expect(inventory.source_main_commit).toBe('44300a17e01705676cd0c21b9518edf23a9a0fda')
    expect(inventory.current_live_ledger_rechecked).toBe(false)
    expect(inventory.files).toHaveLength(241)
    expect(inventory.source_drift_since_prior_snapshot.added_files).toHaveLength(4)
    expect(inventory.source_drift_since_prior_snapshot.changed_files).toHaveLength(1)
    expect(inventory.source_drift_since_prior_snapshot.removed_files).toEqual([])
    for (const name of inventory.source_drift_since_prior_snapshot.added_files) {
      expect(inventory.files.find(f => f.filename === name)?.review_state).toBe('NEW_MIGRATION_REVIEW_REQUIRED')
    }
    expect(inventory.files.find(f => f.filename === '0239_consumables_pricing_restock_and_low_stock.sql')?.review_state).toBe('SOURCE_CONTENT_CHANGED_REVIEW_REQUIRED')
  })
  it('validates source blob fingerprints without SQL or database access', () => {
    const text = execFileSync(process.execPath, ['scripts/staging-schema-preflight.mjs'], {cwd:process.cwd(),encoding:'utf8',timeout:20000,stdio:['ignore','pipe','pipe']})
    const result = JSON.parse(text) as {mode:string;localFileCount:number;sourceBaseline:string;sourceIdentityVerified:boolean;approvalToApplyStaging:boolean;databaseConnected:boolean;sqlExecuted:boolean;errors:string[]}
    expect(result.mode).toBe('READ_ONLY_PINNED_SOURCE_INTEGRITY')
    expect(result.sourceBaseline).toBe(inventory.source_main_commit)
    expect(result.localFileCount).toBe(241)
    expect(result.sourceIdentityVerified).toBe(true)
    expect(result.approvalToApplyStaging).toBe(false)
    expect(result.databaseConnected).toBe(false)
    expect(result.sqlExecuted).toBe(false)
    expect(result.errors).toEqual([])
  })
})
