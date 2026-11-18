import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

// Regression gate: an owner-approved CI policy must not silently revert to W75.
const root = process.cwd()
const rulings = readFileSync(join(root, 'RULINGS-2026-11-09.md'), 'utf8')
const reconciliation = readFileSync(join(root, 'docs/verification/OWNER_RULINGS_RECONCILIATION_2026-11-18.md'), 'utf8')

describe('November owner-ruling documentation continuity', () => {
  it('preserves the earlier R-9.1 to R-9.4 decisions and their implementation notes', () => {
    for (const number of [1, 2, 3, 4]) {
      expect(rulings).toContain(`R-9.${number}`)
    }
    expect(rulings).toContain('0228_membership_change_keep_join_date.sql')
    expect(rulings).toContain('UpgradeTierModal.tsx')
  })

  it('records that CI is enabled and exact-PR-head verification gates a merge', () => {
    expect(rulings).toContain('R-9.9')
    expect(rulings).toContain('CI is **ON**')
    expect(rulings).toContain('exact PR head')
    expect(rulings).toContain('Mac and Windows')
  })

  it('labels unresolved pricing decisions as review-only, not activated policy', () => {
    expect(reconciliation).toContain('**not** a policy change')
    expect(reconciliation).toContain('Unresolved policy conflict')
    expect(reconciliation).toContain('Accountant-owned decisions')
    expect(reconciliation).toContain('No live change')
  })
})
