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

  it('documents confirmed owner decision for pre-printed paper VAT invoices and digital operational documents', () => {
    const doc = read('docs/compliance/IRD_EBILLING_COMPLIANCE_BRIEF.md')
    expect(doc).toContain('pre-printed paper invoice forms')
    expect(doc).toContain('Paper Invoice Number Entry')
    expect(doc).toContain('Paper Invoice Scan Attachment')
    expect(doc).toContain('Digital quotations')
    expect(doc).toContain('Digital rental agreements')
    expect(doc).toContain('Digital packing lists')
    expect(doc).toContain('Payment receipts')
    expect(doc).toContain('Audit Trails')
    expect(doc).toContain('Duplicate Invoice-Number Prevention')
    expect(doc).toContain('No Automatic Second Official VAT Invoice')
    expect(doc).toContain('Accountant Review Requirements')
    expect(doc).toContain('TDS')
  })
})
