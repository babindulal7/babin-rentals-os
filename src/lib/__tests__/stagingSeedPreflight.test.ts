import { describe, expect, it } from 'vitest'
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

/**
 * Tests the read-only default only. This suite never enables --write and
 * never contacts staging/production. It verifies source integrity from the
 * pinned Git blob and the non-deliverable fixture redaction summary.
 */
describe('T1-02 synthetic staging seed preflight', () => {
  it('generates a deterministic, non-deployable 0012 fixture summary without writing files', () => {
    const projectRoot = process.cwd()
    const manifest = JSON.parse(readFileSync(resolve(projectRoot, 'docs/verification/STAGING_SQL_INVENTORY_2026-11-16.json'), 'utf8')) as {
      files: Array<{ filename: string; git_blob_sha: string }>
    }
    const pinned = manifest.files.find((file) => file.filename === '0012_seed_data.sql')
    expect(pinned).toBeDefined()

    const ignoredFixture = resolve(projectRoot, '.localdb/staging-fixtures/0012_seed_data.synthetic.sql')
    const existedBefore = existsSync(ignoredFixture)
    const stdout = execFileSync(process.execPath, ['scripts/create-synthetic-staging-0012.mjs'], {
      cwd: projectRoot,
      encoding: 'utf8',
      timeout: 10000,
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    const result = JSON.parse(stdout) as {
      mode: string
      sourceBlob: string
      databaseConnected: boolean
      sqlExecuted: boolean
      replacementsApplied: number
      emailAddresses: number
      writtenToIgnoredLocalPath: boolean
      requiresReviewBeforeRemoteApply: boolean
      fixtureSha256: string
    }
    expect(result.mode).toBe('SYNTHETIC_SEED_PREPARATION_ONLY')
    expect(result.sourceBlob).toBe(pinned?.git_blob_sha)
    expect(result.databaseConnected).toBe(false)
    expect(result.sqlExecuted).toBe(false)
    expect(result.replacementsApplied).toBe(21)
    expect(result.emailAddresses).toBe(6)
    expect(result.writtenToIgnoredLocalPath).toBe(false)
    expect(result.requiresReviewBeforeRemoteApply).toBe(true)
    expect(result.fixtureSha256).toMatch(/^[a-f0-9]{64}$/)
    expect(existsSync(ignoredFixture)).toBe(existedBefore)
  })
})
