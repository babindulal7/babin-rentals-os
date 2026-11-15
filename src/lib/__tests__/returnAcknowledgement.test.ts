import { describe, expect, it } from 'vitest'
import { formatReturnFlaggedItem, validateReturnAcknowledgement } from '../returnAcknowledgement'

describe('Return acknowledgement validation', () => {
  it('prints each flagged serial once with its captured description and retains quantity-only missing reasons', () => {
    expect(formatReturnFlaggedItem({ booking_line_id: 'line', description: 'Camera', condition: 'Damaged', state: 'Returned', note: null, reason: null,
      units: [{ unit_id: 'one', serial: 'SN-1', condition: 'Damaged', state: 'Returned' }, { unit_id: 'two', serial: 'SN-2', condition: null, state: 'Missing' }],
      findings: [{ unit_id: 'one', serial: 'SN-1', condition: 'Damaged', description: 'Cracked housing' }],
    }, 'Fallback')).toEqual(['Camera (SN-1): Damaged — Cracked housing', 'Camera (SN-2): Missing — '])
    expect(formatReturnFlaggedItem({ booking_line_id: 'cables', condition: null, state: 'Not Returned', note: null, reason: 'Left at location' }, 'Cables'))
      .toEqual(['Cables: Missing — Left at location'])
  })
  it('accepts one stored signature or a refusal with a trimmed ten-character reason', () => {
    expect(validateReturnAcknowledgement({ returningName: 'Courier', evidenceFileId: 'file-id' })).toBeNull()
    expect(validateReturnAcknowledgement({ returningName: 'Courier', refusalReason: '  Declined to sign  ' })).toBeNull()
  })
  it('refuses an empty signer, short refusal, unsigned acknowledgement and contradictory choices', () => {
    for (const input of [
      { returningName: ' ', evidenceFileId: 'file-id' },
      { returningName: 'Courier', refusalReason: '  short  ' },
      { returningName: 'Courier', refusalReason: '😀😀😀😀😀' },
      { returningName: 'Courier' },
      { returningName: 'Courier', evidenceFileId: 'file-id', refusalReason: 'Declined to sign' },
    ]) expect(validateReturnAcknowledgement(input)).toBeTypeOf('string')
  })
})
