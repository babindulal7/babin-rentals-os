import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  processScanToAddEquipment,
  resetScanToAddCache,
  type ScanToAddOptions,
} from '../scanToAddEquipment'
import * as scannerLookupModule from '../scannerLookup'
import type { BookingLineDraft } from '../../modules/rentals/booking/itemCatalogue'
import { rupees } from '../money'

describe('processScanToAddEquipment (T3-19, W8)', () => {
  let existingLines: BookingLineDraft[] = []
  let addedLines: BookingLineDraft[] = []
  let conflicts: Array<{ code: string; name: string; reason: string }> = []

  const mockOptions: ScanToAddOptions = {
    days: 3,
    existingLines,
    onAddLine: (line) => addedLines.push(line),
    onConflict: (conf) => conflicts.push(conf),
  }

  beforeEach(() => {
    resetScanToAddCache()
    existingLines = []
    addedLines = []
    conflicts = []
    mockOptions.existingLines = existingLines
    vi.restoreAllMocks()
  })

  it('scans a free serialized unit and adds it with its exact unit allocation', async () => {
    vi.spyOn(scannerLookupModule, 'resolveScannedCode').mockResolvedValue({
      status: 'unit_matched',
      code: 'FX3-SN-001',
      label: 'Sony FX3 Body',
      unitId: 'unit-fx3-1',
      serialNo: 'FX3-SN-001',
      assetTag: 'TAG-FX3',
      productName: 'Sony FX3 Cinema Camera',
      unitStatus: 'Available',
    })

    const res = await processScanToAddEquipment('FX3-SN-001', mockOptions)

    expect(res.success).toBe(true)
    expect(res.action).toBe('added')
    expect(addedLines.length).toBe(1)
    expect(addedLines[0]?.name).toBe('Sony FX3 Cinema Camera')
    expect(addedLines[0]?.serial).toBe('FX3-SN-001')
    expect(addedLines[0]?.qty).toBe(1)
  })

  it('ignores duplicate burst scans of the same code within 1.5 seconds', async () => {
    vi.spyOn(scannerLookupModule, 'resolveScannedCode').mockResolvedValue({
      status: 'unit_matched',
      code: 'LNS-2470-01',
      label: 'Sony 24-70mm GM II',
      unitId: 'unit-lns-1',
      serialNo: 'SN-2470-01',
      assetTag: 'TAG-2470',
      productName: 'Sony FE 24-70mm GM II',
      unitStatus: 'Available',
    })

    // First scan succeeds
    const res1 = await processScanToAddEquipment('LNS-2470-01', mockOptions)
    expect(res1.success).toBe(true)
    expect(res1.action).toBe('added')

    // Immediate second scan of exact same code is ignored by 1.5s burst detector
    const res2 = await processScanToAddEquipment('LNS-2470-01', mockOptions)
    expect(res2.success).toBe(false)
    expect(res2.action).toBe('ignored_duplicate')
    expect(addedLines.length).toBe(1)
  })

  it('rejects adding equipment that is currently On Rent or Maintenance', async () => {
    vi.spyOn(scannerLookupModule, 'resolveScannedCode').mockResolvedValue({
      status: 'unit_matched',
      code: 'RED-KOMODO-9',
      label: 'RED Komodo 6K',
      unitId: 'unit-red-9',
      serialNo: 'SN-RED-9',
      assetTag: 'TAG-RED',
      productName: 'RED Komodo 6K Camera',
      unitStatus: 'On Rent',
    })

    const res = await processScanToAddEquipment('RED-KOMODO-9', mockOptions)

    expect(res.success).toBe(false)
    expect(res.action).toBe('conflict')
    expect(conflicts.length).toBe(1)
    expect(conflicts[0]?.reason).toContain('On Rent')
    expect(addedLines.length).toBe(0)
  })

  it('prevents adding the same item if already present in the draft lines', async () => {
    mockOptions.existingLines = [
      {
        id: 'unit-fx3-1',
        clientUuid: 'cuuid-1',
        name: 'Sony FX3 Cinema Camera',
        lineType: 'Equipment',
        category: 'Camera',
        qty: 1,
        ratePaisa: rupees(2500),
        days: 3,
        discountPct: 0,
        serial: 'FX3-SN-001',
        location: 'Boudha Hub',
        committedTo: 'Stock',
      },
    ]

    vi.spyOn(scannerLookupModule, 'resolveScannedCode').mockResolvedValue({
      status: 'unit_matched',
      code: 'FX3-SN-001',
      label: 'Sony FX3 Body',
      unitId: 'unit-fx3-1',
      serialNo: 'FX3-SN-001',
      assetTag: 'TAG-FX3',
      productName: 'Sony FX3 Cinema Camera',
      unitStatus: 'Available',
    })

    const res = await processScanToAddEquipment('FX3-SN-001', mockOptions)

    expect(res.success).toBe(false)
    expect(res.action).toBe('already_in_draft')
    expect(addedLines.length).toBe(0)
  })

  it('handles unknown or unrecognized QR/barcode gracefully', async () => {
    vi.spyOn(scannerLookupModule, 'resolveScannedCode').mockResolvedValue({
      status: 'unknown_code',
      code: 'UNKNOWN-BARCODE-999',
      message: 'No equipment or booking matches this code.',
    })

    const res = await processScanToAddEquipment('UNKNOWN-BARCODE-999', mockOptions)

    expect(res.success).toBe(false)
    expect(res.action).toBe('unrecognized')
    expect(conflicts.length).toBe(1)
    expect(conflicts[0]?.reason).toContain('No equipment')
    expect(addedLines.length).toBe(0)
  })
})
