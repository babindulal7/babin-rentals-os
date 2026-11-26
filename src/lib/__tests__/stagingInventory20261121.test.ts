import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('T1-02 exact-head 21 Nov 2026 staging inventory (no database writes)', () => {
  const inventoryPath = join(process.cwd(), 'docs/verification/STAGING_SQL_INVENTORY_2026-11-21.json')
  const inventory = JSON.parse(readFileSync(inventoryPath, 'utf8')) as {
    migration_files: number
    source_main_commit: string
    current_live_ledger_rechecked: boolean
    target_staging_project_ref: string
    protected_production_project_ref: string
    must_not_run_automatically: string[]
    duplicate_numeric_prefix_exception: string[]
    source_drift_since_prior_snapshot: { added_files: string[]; changed_files: unknown[]; removed_files: string[] }
    files: Array<{ filename: string; git_blob_sha: string; bytes: number; live_exact_name_found: boolean; review_state: string }>
  }

  it('keeps the 21 Nov 2026 exact-head snapshot covering all 260 migrations', () => {
    expect(inventory.migration_files).toBe(260)
    expect(inventory.source_main_commit).toBe('3a8d90b9fa197d1a69326483a89140e404385b85')
    expect(inventory.target_staging_project_ref).toBe('klhmsrunqrdxjudyhnkm')
    expect(inventory.protected_production_project_ref).toBe('sxguwvgoserhdolewibb')
    expect(inventory.files).toHaveLength(260)
    expect(inventory.must_not_run_automatically).toEqual([
      '0012_seed_data.sql',
      '0047_seed_reference_corpus.sql',
      '0082_seed_operational_stage_corpus.sql',
    ])
    expect(inventory.duplicate_numeric_prefix_exception).toEqual([
      '0188_smart_reservation_holds.sql',
      '0188_staff_renting_gear.sql',
    ])
    expect(inventory.source_drift_since_prior_snapshot.added_files).toHaveLength(20)
    expect(inventory.source_drift_since_prior_snapshot.changed_files).toHaveLength(1)
    expect(inventory.source_drift_since_prior_snapshot.removed_files).toEqual([])
  })

  it('reports every migration added after this snapshot as blocked drift', () => {
    const child = spawnSync(process.execPath, ['scripts/staging-schema-preflight.mjs', '--inventory', 'STAGING_SQL_INVENTORY_2026-11-21.json'], {
      cwd: process.cwd(),
      encoding: 'utf8',
      timeout: 60000,
    })
    expect(child.error).toBeUndefined()
    const result = JSON.parse(child.stdout) as {
      mode: string
      localFileCount: number
      pinnedFileCount: number
      sourceBaseline: string
      sourceIdentityVerified: boolean
      approvalToApplyStaging: boolean
      databaseConnected: boolean
      sqlExecuted: boolean
      errors: string[]
      status: string
      attention: string[]
    }
    expect(result.mode).toBe('READ_ONLY_PINNED_SOURCE_INTEGRITY')
    expect(result.sourceBaseline).toBe('3a8d90b9fa197d1a69326483a89140e404385b85')
    expect(result.localFileCount).toBe(268)
    expect(result.pinnedFileCount).toBe(260)
    expect(result.approvalToApplyStaging).toBe(false)
    expect(result.databaseConnected).toBe(false)
    expect(result.sqlExecuted).toBe(false)
    expect(result.errors).toEqual([
      'migration file count differs from pinned inventory: local=268, pinned=260',
      '0263_product_families.sql: absent from pinned inventory',
      '0264_public_product_family_options.sql: absent from pinned inventory',
      '0265_submit_request_rates_in_paisa.sql: absent from pinned inventory',
      '0266_manager_approvals_to_owner.sql: absent from pinned inventory',
      '0267_database_enforced_aal2_money_roles.sql: absent from pinned inventory',
      '0268_sign_in_events_and_new_device.sql: absent from pinned inventory',
      '0269_mfa_provider_proof_and_session_safety.sql: absent from pinned inventory',
      '0270_email_rpc_least_privilege_and_disable_mock_payment_sends.sql: absent from pinned inventory',
    ])
    expect(result.sourceIdentityVerified).toBe(false)
    expect(result.status).toBe('BLOCKED_SOURCE_DRIFT')
  })
})
