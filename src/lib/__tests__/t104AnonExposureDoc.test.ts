import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const read = (file: string) => readFileSync(join(process.cwd(), file), 'utf8')

describe('T1-04 anonymous business RPC lockdown verification ledger', () => {
  it('names the six actual migration 0163 functions, not the obsolete audit list', () => {
    const doc = read('docs/verification/T1-04_BATCH_0_ANON_RPCS.md')
    const migration = read('supabase/migrations/0163_close_six_anon_business_rpcs.sql')
    const signatures = [
      'adjust_stock(uuid,integer,text,uuid,uuid)',
      'portal_claim_by_verified_email()',
      'read_quote_editor(text)',
      'set_staff_active(uuid,boolean)',
      'set_staff_role(uuid,system_role)',
      'update_rental_quote(uuid,text,uuid,jsonb)',
    ]
    for (const signature of signatures) {
      expect(doc).toContain(signature)
      expect(migration).toContain(signature.split('(')[0])
    }
    expect(doc).toContain('0163_close_six_anon_business_rpcs.sql')
    expect(doc).toContain('OPEN / PRODUCTION CHANGE NOT APPLIED')
    expect(doc).toContain('NOT APPLIED')
    expect(doc).toContain('read-only')
    expect(doc).toContain('not proof a business operation succeeds unauthenticated')
    expect(doc).toContain('Staging migration 0163 rehearsal')
    // The historical 13/13 count may appear as dated evidence, but never
    // becomes a current production permission/behavioral acceptance gate.
    expect(doc).toContain('not re-run in this read-only review')
  })
})
