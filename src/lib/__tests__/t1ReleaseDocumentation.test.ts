import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const read = (path: string) => readFileSync(join(process.cwd(), path), 'utf8')

describe('T1 release card status follows merged PR progress, not invented hosted acceptance', () => {
  const release = read('docs/plans/T1_RELEASE.md')
  const audit = read('docs/verification/T1_RELEASE_PR_REVIEW_2026-11-16.md')

  it('marks T1-06 done with staging storage verification and remaining implementations doing', () => {
    const t106Heading = release.split('\n').find(line => line.startsWith('### T1-06 ·'))
    expect(t106Heading).toContain('status: done')
    expect(t106Heading).toContain('PR #174 merged')

    for (const key of ['T1-07', 'T1-08', 'T1-14']) {
      const heading = release.split('\n').find(line => line.startsWith(`### ${key} ·`))
      expect(heading).toContain('status: doing')
      expect(heading).toContain('merged')
    }
  })

  it('distinguishes dated historical PR snapshot from current accepted evidence', () => {
    expect(audit).toContain('Historical snapshot — 16 November 2026')
    expect(audit).toContain('Current repository reconciliation — 18 November 2026')
    for (const n of [174, 175, 176, 177]) expect(audit).toContain(`#${n}`)
    expect(audit).toContain('staging/physical-device acceptance')
    expect(audit).toContain('**not** a real staging Storage API')
  })
})
