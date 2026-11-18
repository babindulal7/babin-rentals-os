import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const read = (file: string) => readFileSync(join(process.cwd(), file), 'utf8')

describe('T3-05 Nepal IRD electronic billing audit documentation', () => {
  it('documents CBMS integration assessment and invoice requirements', () => {
    const doc = read('docs/compliance/IRD_EBILLING_COMPLIANCE_BRIEF.md')
    expect(doc).toContain('T3-05 · IRD e-billing check')
    expect(doc).toContain('Central Billing Monitoring System - CBMS')
    expect(doc).toContain('Nepal Inland Revenue Department - IRD')
  })
})
