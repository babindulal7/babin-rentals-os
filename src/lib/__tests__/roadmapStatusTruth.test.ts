import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const read = (path: string) => readFileSync(join(process.cwd(), path), 'utf8')

describe('Roadmap status truth across merged tracks', () => {
  it('T0 repo hygiene reflects merged PR #165 as acceptance_pending', () => {
    const t0 = read('docs/plans/T0_REPO_HYGIENE.md')
    const heading = t0.split('\n').find((l) => l.startsWith('### T0-03 ·'))
    expect(heading).toBeDefined()
    expect(heading).toContain('status: acceptance_pending')
    expect(heading).toContain('PR #165 merged')
  })

  it('T1 release track reflects merged PRs as acceptance_pending', () => {
    const t1 = read('docs/plans/T1_RELEASE.md')
    const cards: Record<string, string> = {
      'T1-05': 'PR #173 merged',
      'T1-17': 'PR #203 merged',
      'T1-18': 'PR #204 merged',
    }
    for (const [key, prRef] of Object.entries(cards)) {
      const heading = t1.split('\n').find((l) => l.startsWith(`### ${key} ·`))
      expect(heading).toBeDefined()
      expect(heading).toContain('status: acceptance_pending')
      expect(heading).toContain(prRef)
    }
  })

  it('T2 floor track reflects all merged floor features as acceptance_pending', () => {
    const t2 = read('docs/plans/T2_FLOOR.md')
    const cards: Record<string, string> = {
      'T2-06': 'merged',
      'T2-13': 'merged',
      'T2-14': 'merged',
      'T2-15': 'merged',
      'T2-18': 'merged',
      'T2-19': 'merged',
      'T2-20': 'merged',
      'T2-21': 'merged',
      'T2-22': 'merged',
    }
    for (const [key, ref] of Object.entries(cards)) {
      const heading = t2.split('\n').find((l) => l.startsWith(`### ${key} ·`))
      expect(heading).toBeDefined()
      expect(heading).toContain('status: acceptance_pending')
      expect(heading).toContain(ref)
      expect(heading).not.toContain('status: todo')
      expect(heading).not.toContain('status: ready — awaiting merge')
    }
  })

  it('T3 booking money track reflects all merged cards as acceptance_pending or done', () => {
    const t3 = read('docs/plans/T3_BOOKING_MONEY.md')
    const pendingCards: Record<string, string> = {
      'T3-13': 'PR #182 merged',
      'T3-20': 'PR #190 merged',
      'T3-23': 'PR #191 merged',
    }
    for (const [key, prRef] of Object.entries(pendingCards)) {
      const heading = t3.split('\n').find((l) => l.startsWith(`### ${key} ·`))
      expect(heading).toBeDefined()
      expect(heading).toContain('status: acceptance_pending')
      expect(heading).toContain(prRef)
      expect(heading).not.toContain('status: todo')
    }

    // T3-10, T3-11, T3-16, T3-19, and T3-31 are fully verified with green suites; physical device testing deferred post-live per Babin ruling (20 Nov)
    const doneCards: Record<string, string> = {
      'T3-10': 'PR #188 merged',
      'T3-11': 'PR #210 merged',
      'T3-16': 'PR #181 merged',
      'T3-19': 'PR #163 merged',
    }
    for (const [key, prRef] of Object.entries(doneCards)) {
      const heading = t3.split('\n').find((l) => l.startsWith(`### ${key} ·`))
      expect(heading).toBeDefined()
      expect(heading).toContain('status: done')
      expect(heading).toContain(prRef)
      expect(heading).not.toContain('status: acceptance_pending')
    }

    // T3-31 was verified green across PR #234 and PR #240, and physical device testing was explicitly deferred post-live by Babin ruling (20 Nov)
    const t331Heading = t3.split('\n').find((l) => l.startsWith('### T3-31 ·'))
    expect(t331Heading).toBeDefined()
    expect(t331Heading).toContain('status: done')
    expect(t331Heading).toContain('PR #234')
    expect(t331Heading).toContain('PR #240')
  })

  it('T7 online booking track reflects merged PRs as acceptance_pending', () => {
    const t7 = read('docs/plans/T7_ONLINE_BOOKING.md')
    const cards: Record<string, string> = {
      'T7-09': 'PR #201 merged',
      'T7-12': 'PR #196 merged',
      'T7-13': 'PR #197 merged',
      'T7-14': 'PR #200 merged',
      'T7-17': 'PR #198 merged',
    }
    for (const [key, prRef] of Object.entries(cards)) {
      const heading = t7.split('\n').find((l) => l.startsWith(`### ${key} ·`))
      expect(heading).toBeDefined()
      expect(heading).toContain('status: acceptance_pending')
      expect(heading).toContain(prRef)
      expect(heading).not.toContain('status: todo')
    }
  })

  it('T9 cutover track reflects merged PRs as acceptance_pending', () => {
    const t9 = read('docs/plans/T9_CUTOVER.md')
    const cards: Record<string, string> = {
      'T9-01': 'PR #195 merged',
      'T9-02': 'PR #202 merged',
      'T9-07': 'PR #199 merged',
    }
    for (const [key, prRef] of Object.entries(cards)) {
      const heading = t9.split('\n').find((l) => l.startsWith(`### ${key} ·`))
      expect(heading).toBeDefined()
      expect(heading).toContain('status: acceptance_pending')
      expect(heading).toContain(prRef)
      expect(heading).not.toContain('status: todo')
    }
  })
})
