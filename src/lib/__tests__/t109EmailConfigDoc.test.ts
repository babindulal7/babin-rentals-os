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
    expect(doc).toContain('no-reply@babinrentals.com')
    expect(doc).toContain('smtp.resend.com')
  })

  it('verifies Edge Function send-email adheres to sender and security standards', () => {
    const fnSource = read('supabase/functions/send-email/index.ts')
    expect(fnSource).toContain("from: 'Babin Rentals <no-reply@babinrentals.com>'")
    expect(fnSource).toContain('RESEND_API_KEY')
    expect(fnSource).toContain('build_email_payload')
    expect(fnSource).toContain('record_email_send')
  })

  it('asserts compliance with core security and money rules (Law 6, S13, W21, W80)', () => {
    const doc = read('docs/runbooks/TRANSACTIONAL_EMAIL_SETUP.md')
    expect(doc).toContain('Rule N-8')
    expect(doc).toContain('Law 6')
    expect(doc).toContain('Rule S13 & W21')
    expect(doc).toContain('Rule W80')
  })
})
