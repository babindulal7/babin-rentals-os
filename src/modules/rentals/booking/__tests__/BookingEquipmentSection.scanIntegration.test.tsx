// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { processScanToAddEquipment, resetScanToAddCache } from '../../../../lib/scanToAddEquipment'

vi.mock('../../../../lib/scannerLookup', () => ({
  resolveScannedCode: vi.fn(async (code: string) => {
    if (code === 'FX3-AVAIL') {
      return {
        status: 'unit_matched',
        unitId: 'u-1',
        productId: 'p-1',
        productName: 'Sony FX3 Cinema Line',
        serialNo: 'SN-FX3-001',
        assetTag: 'TAG-FX3',
        unitStatus: 'Available',
      }
    }
    if (code === 'FX3-RENTED') {
      return {
        status: 'unit_matched',
        unitId: 'u-2',
        productId: 'p-1',
        productName: 'Sony FX3 Cinema Line',
        serialNo: 'SN-FX3-002',
        assetTag: 'TAG-FX3-RENTED',
        unitStatus: 'Rented',
      }
    }
    return {
      status: 'unknown_code',
      code,
      message: `Unknown barcode or serial: ${code}`,
    }
  }),
}))

describe('T3-19 barcode scan integration and duplicate burst guard', () => {
  beforeEach(() => {
    resetScanToAddCache()
  })

  it('successfully resolves and adds an available unit line', async () => {
    const onAddLine = vi.fn()
    const res = await processScanToAddEquipment('FX3-AVAIL', {
      days: 2,
      existingLines: [],
      onAddLine,
    })

    expect(res.success).toBe(true)
    expect(res.action).toBe('added')
    expect(res.line?.name).toBe('Sony FX3 Cinema Line')
    expect(res.line?.serial).toBe('SN-FX3-001')
    expect(onAddLine).toHaveBeenCalledTimes(1)
  })

  it('enforces 1.5-second duplicate burst suppression for rapid physical scanner double-triggers', async () => {
    const onAddLine = vi.fn()
    const first = await processScanToAddEquipment('FX3-AVAIL', {
      days: 1,
      existingLines: [],
      onAddLine,
    })
    expect(first.success).toBe(true)

    // Immediate repeat scan (within 1500ms)
    const second = await processScanToAddEquipment('FX3-AVAIL', {
      days: 1,
      existingLines: [first.line!],
      onAddLine,
    })
    expect(second.success).toBe(false)
    expect(second.action).toBe('ignored_duplicate')
    expect(second.message).toContain('1.5s window')
    expect(onAddLine).toHaveBeenCalledTimes(1)
  })

  it('detects and reports unavailable / rented unit conflicts', async () => {
    const onConflict = vi.fn()
    const res = await processScanToAddEquipment('FX3-RENTED', {
      days: 1,
      existingLines: [],
      onAddLine: vi.fn(),
      onConflict,
    })

    expect(res.success).toBe(false)
    expect(res.action).toBe('conflict')
    expect(res.message).toContain('currently Rented')
    expect(onConflict).toHaveBeenCalledTimes(1)
  })
})
