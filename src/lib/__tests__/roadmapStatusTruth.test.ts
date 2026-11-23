import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const read = (path: string) => readFileSync(join(process.cwd(), path), 'utf8')

describe('Roadmap status truth across merged tracks', () => {
  it('T0 repo hygiene reflects reconciled cards as done', () => {
    const t0 = read('docs/plans/T0_REPO_HYGIENE.md')
    const doneCards: Record<string, string> = {
      'T0-03': 'PR #165 merged',
      'T0-12': 'merged on main',
    }
    for (const [key, ref] of Object.entries(doneCards)) {
      const heading = t0.split('\n').find((l) => l.startsWith(`### ${key} ·`))
      expect(heading).toBeDefined()
      expect(heading).toContain('status: done')
      expect(heading).toContain(ref)
      expect(heading).not.toContain('status: acceptance_pending')
    }
  })

  it('T1 release track distinguishes merged code from hosted acceptance', () => {
    const t1 = read('docs/plans/T1_RELEASE.md')
    const doneCards: Record<string, string> = {
      'T1-02': 'PR #292 merged',
      'T1-03': 'PR #260 merged',
      'T1-04': 'applied to production by Babin',
      'T1-05': 'PR #173 merged',
      'T1-06': 'PR #174 merged',
      'T1-09': 'PR #275 merged',
      'T1-15': 'PR #208 merged',
      'T1-17': 'PR #203 merged',
      'T1-18': 'PR #345 merged',
    }
    for (const [key, ref] of Object.entries(doneCards)) {
      const heading = t1.split('\n').find((l) => l.startsWith(`### ${key} ·`))
      expect(heading).toBeDefined()
      expect(heading).toContain('status: done')
      expect(heading).toContain(ref)
      expect(heading).not.toContain('status: ready')
      expect(heading).not.toContain('status: todo')
      expect(heading).not.toContain('status: acceptance_pending')
    }

    // Code may be merged without a verified hosted error-monitoring receipt.
    const hostedPendingCards: Record<string, string> = { 'T1-08': 'PR #176 merged' }
    for (const [key, ref] of Object.entries(hostedPendingCards)) {
      const heading = t1.split('\n').find((l) => l.startsWith(`### ${key} ·`))
      expect(heading).toBeDefined()
      expect(heading).toContain('status: doing')
      expect(heading).toContain(ref)
      expect(heading).toContain('hosted staging Sentry receipt pending')
    }

    const pendingCards: Record<string, string> = {}
    for (const [key, ref] of Object.entries(pendingCards)) {
      const heading = t1.split('\n').find((l) => l.startsWith(`### ${key} ·`))
      expect(heading).toBeDefined()
      expect(heading).toContain('status: acceptance_pending')
      expect(heading).toContain(ref)
      expect(heading).not.toContain('status: ready')
      expect(heading).not.toContain('status: todo')
    }
  })

  it('T2 floor track reflects all merged floor features as acceptance_pending or done', () => {
    const t2 = read('docs/plans/T2_FLOOR.md')
    const cards: Record<string, string> = {
      'T2-14': 'merged',
    }
    for (const [key, ref] of Object.entries(cards)) {
      const heading = t2.split('\n').find((l) => l.startsWith(`### ${key} ·`))
      expect(heading).toBeDefined()
      expect(heading).toContain('status: acceptance_pending')
      expect(heading).toContain(ref)
      expect(heading).not.toContain('status: todo')
      expect(heading).not.toContain('status: ready — awaiting merge')
    }

    const doneCards: Record<string, string> = {
      'T2-06': 'merged',
      'T2-13': 'merged 27 Oct',
      'T2-15': 'PR #30 merged',
      'T2-17': 'PR #90 merged',
      'T2-18': 'PR #80 merged',
      'T2-19': 'PR #209 merged',
      'T2-20': 'PR #189 merged',
      'T2-21': 'PR #170 merged',
      'T2-22': 'PR #184 merged',
      'T2-23': 'verified',
      'T2-24': 'PR #257 merged',
    }
    for (const [key, ref] of Object.entries(doneCards)) {
      const heading = t2.split('\n').find((l) => l.startsWith(`### ${key} ·`))
      expect(heading).toBeDefined()
      expect(heading).toContain('status: done')
      expect(heading).toContain(ref)
      expect(heading).not.toContain('status: doing')
      expect(heading).not.toContain('status: todo')
    }
  })

  it('T3 booking money track reflects all merged cards as done', () => {
    const t3 = read('docs/plans/T3_BOOKING_MONEY.md')
    const doneCards: Record<string, string> = {
      'T3-02': 'PR #183 merged',
      'T3-06': 'PR #169 merged',
      'T3-10': 'PR #188 merged',
      'T3-11': 'PR #210 merged',
      'T3-13': 'PR #182 merged',
      'T3-14': 'PR #259 merged',
      'T3-16': 'PR #181 merged',
      'T3-18': 'PR #224 merged',
      'T3-19': 'PR #163 merged',
      'T3-20': 'PR #190 merged',
      'T3-22': 'PR #161 merged',
      'T3-23': 'PR #191 merged',
      'T3-28': 'PR #211 merged',
      'T3-29': 'PR #208 merged',
      'T3-30': 'PR #185 merged',
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

  it('T8 membership and crew track reflects reconciled cards as done', () => {
    const t8 = read('docs/plans/T8_MEMBERSHIP_CREW.md')
    const doneCards: Record<string, string> = {
      'T8-02': 'PR #174 merged',
      'T8-04': 'PR #174 merged',
      'T8-07': 'PR #175 merged',
      'T8-08': 'ruled by Babin 20 Nov 2026',
      'T8-09': 'PR #177 merged',
    }
    for (const [key, ref] of Object.entries(doneCards)) {
      const heading = t8.split('\n').find((l) => l.startsWith(`### ${key} ·`))
      expect(heading).toBeDefined()
      expect(heading).toContain('status: done')
      expect(heading).toContain(ref)
      expect(heading).not.toContain('status: acceptance_pending')
    }
  })

  it('T7 online booking track reflects merged PRs as acceptance_pending or done', () => {
    const t7 = read('docs/plans/T7_ONLINE_BOOKING.md')
    const cards: Record<string, string> = {
      'T7-05': 'PR #276 merged',
      'T7-09': 'PR #201 merged',
    }
    for (const [key, prRef] of Object.entries(cards)) {
      const heading = t7.split('\n').find((l) => l.startsWith(`### ${key} ·`))
      expect(heading).toBeDefined()
      expect(heading).toContain('status: acceptance_pending')
      expect(heading).toContain(prRef)
      expect(heading).not.toContain('status: todo')
    }

    const t706 = t7.split('\n').find((l) => l.startsWith('### T7-06 ·'))
    expect(t706).toBeDefined()
    expect(t706).toContain('status: dropped_for_launch')
    expect(t706).toContain('R-22.9')

    const doneCards: Record<string, string> = {
      'T7-01': 'PR #301 merged',
      'T7-02': 'PR #276 merged',
      'T7-03': 'PR #276 merged',
      'T7-04': 'PR #276 merged',
      'T7-07': 'PR #266 merged',
      'T7-08': 'PR #276 merged',
      'T7-10': 'PR #299 merged',
      'T7-12': 'PR #196 merged',
      'T7-13': 'PR #197',
      'T7-14': 'PR #200',
      'T7-15': 'PR #276 merged',
      'T7-16': 'PR #276 merged',
      'T7-17': 'PR #198 merged',
    }
    for (const [key, prRef] of Object.entries(doneCards)) {
      const heading = t7.split('\n').find((l) => l.startsWith(`### ${key} ·`))
      expect(heading).toBeDefined()
      expect(heading).toContain('status: done')
      expect(heading).toContain(prRef)
      expect(heading).not.toContain('status: acceptance_pending')
      expect(heading).not.toContain('status: todo')
    }
  })

  it('T4 shared tools track reflects reconciled cards as done', () => {
    const t4 = read('docs/plans/T4_SHARED_TOOLS.md')
    const heading = t4.split('\n').find((l) => l.startsWith('### T4-08 ·'))
    expect(heading).toBeDefined()
    expect(heading).toContain('status: done')
    expect(heading).not.toContain('status: acceptance_pending')
  })

  it('T9 cutover track reflects merged PRs as acceptance_pending or done', () => {
    const t9 = read('docs/plans/T9_CUTOVER.md')
    const cards: Record<string, string> = {
      'T9-07': 'PR #199 merged',
    }
    for (const [key, prRef] of Object.entries(cards)) {
      const heading = t9.split('\n').find((l) => l.startsWith(`### ${key} ·`))
      expect(heading).toBeDefined()
      expect(heading).toContain('status: acceptance_pending')
      expect(heading).toContain(prRef)
      expect(heading).not.toContain('status: todo')
    }

    const doneCards: Record<string, string> = {
      'T9-02': 'PR #202 merged',
    }
    for (const [key, prRef] of Object.entries(doneCards)) {
      const heading = t9.split('\n').find((l) => l.startsWith(`### ${key} ·`))
      expect(heading).toBeDefined()
      expect(heading).toContain('status: done')
      expect(heading).toContain(prRef)
      expect(heading).not.toContain('status: acceptance_pending')
      expect(heading).not.toContain('status: todo')
    }
  })
  it('keeps review-blocked cards pending rather than equating merged PRs with acceptance', () => {
    const blocked: Array<[string, string, string]> = [
      ['docs/plans/T9_CUTOVER.md', 'T9-01', 'PR #195 merged'],
    ]
    for (const [path, id, implementationRef] of blocked) {
      const heading = read(path).split('\n').find((line) => line.startsWith(`### ${id} ·`))
      expect(heading).toBeDefined()
      expect(heading).toContain('status: acceptance_pending')
      expect(heading).toContain(implementationRef)
      expect(heading).toContain('unresolved evidence gate')
    }
  })

  it('T0-09 stays acceptance_pending until its enforcement is evidenced (22 Nov 2026 reconciliation)', () => {
    const pending: Array<[string, string, string]> = [
      ['docs/plans/T0_REPO_HYGIENE.md', 'T0-09', 'PR #289 merged'],
    ]
    for (const [file, key, ref] of pending) {
      const heading = read(file).split('\n').find((l) => l.startsWith(`### ${key} ·`))
      expect(heading).toBeDefined()
      expect(heading).toContain('status: acceptance_pending')
      expect(heading).not.toContain('status: done')
      expect(heading).toContain(ref)
    }
  })
})
