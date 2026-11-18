import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const read = (file: string) => readFileSync(join(process.cwd(), file), 'utf8')

describe('T1-11 Multi-role live smoke test protocol documentation', () => {
  it('documents role inspection checklists and money blindness boundaries', () => {
    const doc = read('docs/live/SMOKE_TEST_PROTOCOL.md')
    expect(doc).toContain('T1-11 · Live smoke test per role')
    expect(doc).toContain('Role Check Matrix:')
    expect(doc).toContain('Role 1: Owner')
    expect(doc).toContain('Role 3: Warehouse (Money-Blindness Audit)')
    expect(doc).toContain('Accounts')
  })
})
