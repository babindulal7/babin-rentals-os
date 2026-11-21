import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const read = (path: string) => readFileSync(join(process.cwd(), path), 'utf8')

describe('T3 roadmap reconciliation reflects merged PRs as acceptance_pending', () => {
  const plan = read('docs/plans/T3_BOOKING_MONEY.md')
  const verification = read('docs/verification/T3_ROADMAP_RECONCILIATION_2026-11-19.md')

  it('marks T3-13, T3-16, T3-19, and T3-20 as done with merged PR references', () => {
    const doneChecks: Record<string, string> = {
      'T3-13': 'PR #182 merged',
      'T3-16': 'PR #181 merged',
      'T3-19': 'PR #163 merged',
      'T3-20': 'PR #190 merged',
    }

    for (const [key, prRef] of Object.entries(doneChecks)) {
      const heading = plan.split('\n').find(line => line.startsWith(`### ${key} ·`))
      expect(heading).toBeDefined()
      expect(heading).toContain('status: done')
      expect(heading).toContain(prRef)
      expect(heading).not.toContain('status: acceptance_pending')
    }
  })

  it('keeps T3-23 pending until the actual app-generated accountant export is accepted', () => {
    const heading = plan.split('\n').find(line => line.startsWith('### T3-23 ·'))
    expect(heading).toBeDefined()
    expect(heading).toContain('status: acceptance_pending')
    expect(heading).toContain('PR #191 merged')
  })

  it('verifies reconciliation documentation exists and details test evidence and pending acceptance', () => {
    expect(verification).toContain('T3 Roadmap Reconciliation — 19 November 2026')
    for (const key of ['T3-13', 'T3-16', 'T3-19', 'T3-20', 'T3-23']) {
      expect(verification).toContain(key)
    }
  })

  it('verifies 20 November acceptance reconciliation documentation exists for T3-10, T3-11, T3-16, and T3-19', () => {
    const acceptance = read('docs/verification/T3_ACCEPTANCE_RECONCILIATION_2026-11-20.md')
    expect(acceptance).toContain('T3 Acceptance Reconciliation — 20 November 2026')
    for (const key of ['T3-10', 'T3-11', 'T3-16', 'T3-19']) {
      expect(acceptance).toContain(key)
    }
  })
})
