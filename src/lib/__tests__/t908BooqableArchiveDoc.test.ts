import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const read = (file: string) => readFileSync(join(process.cwd(), file), 'utf8')

describe('T9-08 Booqable archival and cancellation protocol documentation', () => {
  it('documents full archival export and safe cancellation timeline', () => {
    const doc = read('docs/runbooks/BOOQABLE_ARCHIVAL_AND_CANCELLATION.md')
    expect(doc).toContain('T9-08 · Archive Booqable, then cancel')
    expect(doc).toContain('Law 3 Spirit — Nothing Deleted')
    expect(doc).toContain('18 February 2027')
    expect(doc).toContain('separate owner decision')
    expect(doc).toContain('Orders & Rentals')
    expect(doc).toContain('Invoices & Payments')
  })
})
