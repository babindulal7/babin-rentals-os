import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const read = (file: string) => readFileSync(join(process.cwd(), file), 'utf8')

describe('T1-04 Batch 0 anonymous RPC lockdown documentation', () => {
  it('documents the 6 closed business RPCs', () => {
    const doc = read('docs/verification/T1-04_BATCH_0_ANON_RPCS.md')
    expect(doc).toContain('cancel_booking')
    expect(doc).toContain('extend_booking')
    expect(doc).toContain('void_invoice')
    expect(doc).toContain('create_booking')
    expect(doc).toContain('apply_booking_stage_transition')
    expect(doc).toContain('record_payment')
    expect(doc).toContain('0163_close_six_anon_business_rpcs.sql')
    expect(doc).toContain('PASS (13/13 behavioural checks green)')
  })
})
