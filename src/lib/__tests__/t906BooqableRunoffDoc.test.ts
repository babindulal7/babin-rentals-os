import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const read = (file: string) => readFileSync(join(process.cwd(), file), 'utf8')

describe('T9-06 Booqable run-off tracking documentation', () => {
  it('documents run-off principles, daily countdown, and escalation', () => {
    const doc = read('docs/runbooks/BOOQABLE_RUNOFF_TRACKING.md')
    expect(doc).toContain('T9-06 · Run-off')
    expect(doc).toContain('Principles of Run-Off')
    expect(doc).toContain('Custody in Booqable')
    expect(doc).toContain('Target Zero (N = 0)')
    expect(doc).toContain('1 March 2027')
  })
})
