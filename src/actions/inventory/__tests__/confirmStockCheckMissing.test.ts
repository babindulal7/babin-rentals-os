import { describe, it, expect, vi, beforeEach } from 'vitest'

const { safeUpdateMock } = vi.hoisted(() => ({
  safeUpdateMock: vi.fn(),
}))

vi.mock('../../../lib/dataAccess', () => ({
  safeUpdate: safeUpdateMock,
  generateClientUuid: () => 'uuid-gen-1',
}))

import { confirmStockCheckMissing } from '../confirmStockCheckMissing'

const ctx = { userId: 'usr-wh', role: 'Warehouse' as const }

describe('confirmStockCheckMissing', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    safeUpdateMock.mockResolvedValue({ data: null, error: null })
  })

  it('requires auditId and itemId', async () => {
    await expect(confirmStockCheckMissing({ auditId: '', itemId: 'i1' }, ctx)).rejects.toThrow(/auditId is required/i)
    await expect(confirmStockCheckMissing({ auditId: 'a1', itemId: '' }, ctx)).rejects.toThrow(/itemId is required/i)
  })

  it('marks item Confirmed missing and supports reversal to Left unverified', async () => {
    const res = await confirmStockCheckMissing({ auditId: 'a1', itemId: 'i1', notes: 'Not on shelf', clientUuid: 'u1' }, ctx)
    expect(res.outcome).toBe('Confirmed missing')
    expect(res.reversal).toBe(false)
    expect(safeUpdateMock).toHaveBeenCalledWith(
      'stock_audit_items',
      'i1',
      expect.objectContaining({ outcome: 'Confirmed missing', discrepancy_notes: 'Not on shelf' }),
      'u1',
      { returnRow: false },
    )

    const rev = await confirmStockCheckMissing({ auditId: 'a1', itemId: 'i1', reversal: true, clientUuid: 'u2' }, ctx)
    expect(rev.outcome).toBe('Left unverified')
    expect(rev.reversal).toBe(true)
  })
})
