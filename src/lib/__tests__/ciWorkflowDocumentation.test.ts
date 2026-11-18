import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

// Protect the owner-approved CI-on policy in agent and roadmap instructions.
// Historical discussions about CI-off remain acceptable when clearly dated.
const read = (file: string) => readFileSync(join(process.cwd(), file), 'utf8')

describe('CI policy and runner documentation', () => {
  it('requires GitHub CI in AGENTS and no longer tells agents CI is off', () => {
    const agents = read('AGENTS.md')
    expect(agents).toContain('GitHub CI is a merge gate')
    expect(agents).not.toContain('(CI is off)')
    expect(agents).toContain('local checks and required GitHub CI')
  })

  it('requires exact-PR-head checks on configured Mac and Windows runners', () => {
    const claude = read('CLAUDE.md')
    expect(claude).toContain('CI is a merge gate')
    expect(claude).toContain('self-hosted runners (Mac and Windows)')
    expect(claude).toContain('exact PR head')
  })

  it('documents the superseding 9 Nov ruling without discarding historical context', () => {
    const plan = read('PLAN.md')
    const actions = read('docs/plans/BABIN_ACTIONS.md')
    expect(plan).toContain('Current policy (owner ruling of 9 Nov 2026, R-9.9)')
    expect(plan).toContain('CI is ON and an exact-head merge gate')
    expect(plan).toContain('CI on as merge gate')
    expect(actions).toContain('CI stays on as a merge gate')
    expect(actions).toContain('Do not disable the workflow')
  })
})
