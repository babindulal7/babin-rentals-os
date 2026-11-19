import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('T1-02 historical pinned staging inventory (no database writes)', () => {
  const inventory = JSON.parse(readFileSync(join(process.cwd(), 'docs/verification/STAGING_SQL_INVENTORY_2026-11-16.json'), 'utf8')) as {
    migration_files: number
    source_main_commit: string
    current_live_ledger_rechecked: boolean
    source_drift_since_prior_snapshot: { added_files: string[]; changed_files: unknown[]; removed_files: string[] }
    files: Array<{ filename: string; review_state: string }>
  }

  it('keeps the 18 Nov snapshot dated and explicitly not an approval for current migrations', () => {
    expect(inventory.migration_files).toBe(240)
    expect(inventory.source_main_commit).toBe('68c190842688da42536f224e3dfa6de5a36cc279')
    expect(inventory.current_live_ledger_rechecked).toBe(false)
    expect(inventory.files).toHaveLength(240)
    expect(inventory.source_drift_since_prior_snapshot.added_files).toHaveLength(3)
    expect(inventory.source_drift_since_prior_snapshot.changed_files).toHaveLength(1)
    expect(inventory.source_drift_since_prior_snapshot.removed_files).toEqual([])
    for (const name of inventory.source_drift_since_prior_snapshot.added_files) {
      expect(inventory.files.find(f => f.filename === name)?.review_state).toBe('NEW_MIGRATION_REVIEW_REQUIRED')
    }
  })

  it('read-only checker must FAIL CLOSED if current source diverged from the old snapshot', () => {
    const child = spawnSync(process.execPath, ['scripts/staging-schema-preflight.mjs'], {
      cwd: process.cwd(), encoding: 'utf8', timeout: 20000,
    })
    expect(child.error).toBeUndefined()
    const result = JSON.parse(child.stdout) as {
      mode: string; localFileCount: number; pinnedFileCount: number
      sourceBaseline: string; sourceIdentityVerified: boolean; approvalToApplyStaging: boolean
      databaseConnected: boolean; sqlExecuted: boolean; errors: string[]; status: string
    }
    expect(result.mode).toBe('READ_ONLY_PINNED_SOURCE_INTEGRITY')
    expect(result.sourceBaseline).toBe(inventory.source_main_commit)
    expect(result.pinnedFileCount).toBe(240)
    expect(result.approvalToApplyStaging).toBe(false)
    expect(result.databaseConnected).toBe(false)
    expect(result.sqlExecuted).toBe(false)
    if (result.errors.length > 0) {
      expect(result.status).toBe('BLOCKED_SOURCE_DRIFT')
      expect(result.sourceIdentityVerified).toBe(false)
      expect(child.status).toBe(2)
    } else {
      expect(result.sourceIdentityVerified).toBe(true)
      expect(result.status).toBe('SOURCE_IDENTITY_VERIFIED_REVIEW_STILL_REQUIRED')
      expect(child.status).toBe(0)
    }
  })
})
