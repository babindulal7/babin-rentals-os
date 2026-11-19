import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const read = (file: string) => readFileSync(join(process.cwd(), file), 'utf8')

describe('T9-05 Day X cutover runbook documentation', () => {
  it('documents Day X timeline, Cloudflare redirect, and zero Booqable new rentals', () => {
    const doc = read('docs/runbooks/DAY_X_CUTOVER_PROTOCOL.md')
    expect(doc).toContain('T9-05 · Day X')
    expect(doc).toContain('Zero new rentals in Booqable')
    expect(doc).toContain('18 February 2027')
    expect(doc).toContain('owner go/no-go')
    expect(doc).toContain('book.babinrentals.com')
  })
})
