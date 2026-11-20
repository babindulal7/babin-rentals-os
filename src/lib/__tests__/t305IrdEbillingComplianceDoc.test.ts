import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const read = (file: string) => readFileSync(join(process.cwd(), file), 'utf8')

describe('T3-05 billing compliance decision checklist', () => {
  it('honors current paper VAT invoices without claiming IRD certification or automatic filing', () => {
    const doc = read('docs/compliance/IRD_EBILLING_COMPLIANCE_BRIEF.md')
    expect(doc).toContain('T3-05 · Paper invoice, VAT register and electronic billing assessment')
    expect(doc).toContain('pre-printed, sequentially numbered paper VAT invoices')
    expect(doc).toContain('CBMS')
    expect(doc).toContain('No automatic tax filing.')
    expect(doc).toContain('No live settings changed.')
    expect(doc).not.toContain('NPR 50 Million (5 Crore)')
  })
})
