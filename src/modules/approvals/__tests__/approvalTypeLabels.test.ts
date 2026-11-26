import { describe, expect, it } from 'vitest'
import { APPROVAL_TYPE_LABELS, approvalTypeLabel } from '../approvalTypeLabels'
import type { ApprovalType } from '../../../lib/queries/approvals'

describe('approval type labels (sweep-A-floor-5)', () => {
  it('shows the late fee waiver as words, not as the stored underscore value', () => {
    expect(approvalTypeLabel('late_fee_waiver')).toBe('Late Fee Waiver')
  })

  it('gives every approval type a label with no underscore left in it', () => {
    const types: ApprovalType[] = [
      'damage_charge',
      'late_fee_waiver',
      'commercial_override',
      'purchase_request',
      'refund',
      'write_off',
    ]
    for (const type of types) {
      expect(APPROVAL_TYPE_LABELS[type]).toBeTruthy()
      expect(approvalTypeLabel(type)).not.toContain('_')
    }
  })

  it('reads an unmapped type as words rather than an identifier', () => {
    expect(approvalTypeLabel('future_kind_of_request' as ApprovalType)).toBe('future kind of request')
  })
})
