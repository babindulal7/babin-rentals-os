import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const read = (file: string) => readFileSync(join(process.cwd(), file), 'utf8')

describe('T1-04 Batch 0 anonymous RPC lockdown documentation', () => {
  it('names the six actual 0163-targeted business RPC signatures', () => {
    const doc = read('docs/verification/T1-04_BATCH_0_ANON_RPCS.md')
    for (const signature of [
      'adjust_stock(uuid,integer,text,uuid,uuid)',
      'portal_claim_by_verified_email()',
      'read_quote_editor(text)',
      'set_staff_active(uuid,boolean)',
      'set_staff_role(uuid,system_role)',
      'update_rental_quote(uuid,text,uuid,jsonb)',
    ]) {
      expect(doc).toContain(signature)
    }
    expect(doc).toContain('0163_close_six_anon_business_rpcs.sql')
  })

  it('does not falsely equate local checks with hosted acceptance or production deployment', () => {
    const doc = read('docs/verification/T1-04_BATCH_0_ANON_RPCS.md')
    expect(doc).toContain('PRODUCTION CHANGE NOT APPLIED')
    expect(doc).toContain('NOT APPLIED')
    expect(doc).toContain('not proof')
    expect(doc).not.toContain('PASS (13/13 behavioural checks green)')
  })
})
