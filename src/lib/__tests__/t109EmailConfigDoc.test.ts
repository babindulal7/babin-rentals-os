import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const read = (file: string) => readFileSync(join(process.cwd(), file), 'utf8')

describe('T1-09 Transactional email setup and DNS verification documentation', () => {
  it('documents DNS requirements, volume modeling and bounce/complaint handling', () => {
    const doc = read('docs/runbooks/TRANSACTIONAL_EMAIL_SETUP.md')
    expect(doc).toContain('T1-09 · Email from @babinrentals.com')
    expect(doc).toContain('3,000 to 4,000 emails/month')
    expect(doc).toContain('Sender Policy Framework (SPF)')
    expect(doc).toContain('DomainKeys Identified Mail (DKIM)')
    expect(doc).toContain('DMARC')
  })
})
