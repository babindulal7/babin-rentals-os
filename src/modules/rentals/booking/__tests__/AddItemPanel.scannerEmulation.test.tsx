// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  processScanToAddEquipment,
  resetScanToAddCache,
  type ScanToAddOptions,
} from '../../../../lib/scanToAddEquipment'
import * as scannerLookupModule from '../../../../lib/scannerLookup'
import type { BookingLineDraft } from '../itemCatalogue'
import { rupees } from '../../../../lib/money'

describe('T3-19 Hardware Barcode & Bluetooth Scanner Emulation', () => {
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

    // Default mock implementation for scannerLookupModule.resolveScannedCode
    vi.spyOn(scannerLookupModule, 'resolveScannedCode').mockImplementation(async (rawCode) => {
      const code = rawCode.trim().toUpperCase()
      if (code === 'FX3-SN-001') {
        return {
          status: 'unit_matched',
          code: 'FX3-SN-001',
          label: 'Sony FX3 Body',
          unitId: 'unit-fx3-1',
          serialNo: 'FX3-SN-001',
          assetTag: 'TAG-FX3',
          productName: 'Sony FX3 Cinema Camera',
          unitStatus: 'Available',
        }
      }
      if (code === 'LNS-2470-01') {
        return {
          status: 'unit_matched',
          code: 'LNS-2470-01',
          label: 'Sony 24-70mm GM II',
          unitId: 'unit-lns-1',
          serialNo: 'SN-2470-01',
          assetTag: 'TAG-2470',
          productName: 'Sony FE 24-70mm GM II',
          unitStatus: 'Available',
        }
      }
      if (code === 'RED-KOMODO-9') {
        return {
          status: 'unit_matched',
          code: 'RED-KOMODO-9',
          label: 'RED Komodo 6K',
          unitId: 'unit-red-9',
          serialNo: 'SN-RED-9',
          assetTag: 'TAG-RED',
          productName: 'RED Komodo 6K Camera',
          unitStatus: 'On Rent',
        }
      }
      return {
        status: 'unknown_code',
        code: rawCode,
        message: `Unknown equipment code ${rawCode}`,
      }
    })
  })

  it('suppresses duplicate burst scans of the same barcode within 1.5 seconds without general debouncing', async () => {
    // First scan of FX3
    const res1 = await processScanToAddEquipment('FX3-SN-001', mockOptions)
    expect(res1.success).toBe(true)
    expect(res1.action).toBe('added')
    expect(addedLines.length).toBe(1)
    expect(addedLines[0]?.serial).toBe('FX3-SN-001')

    // Immediate second scan of exact same code (< 1500ms)
    const res2 = await processScanToAddEquipment('FX3-SN-001', mockOptions)
    expect(res2.success).toBe(false)
    expect(res2.action).toBe('ignored_duplicate')
    // Length remains 1
    expect(addedLines.length).toBe(1)

    // Immediate scan of a DIFFERENT code (different accessory/lens) must NOT be debounced
    const res3 = await processScanToAddEquipment('LNS-2470-01', mockOptions)
    expect(res3.success).toBe(true)
    expect(res3.action).toBe('added')
    // Length increments to 2
    expect(addedLines.length).toBe(2)
    expect(addedLines[1]?.serial).toBe('SN-2470-01')
  })

  it('trims whitespace and performs case-insensitive code matching', async () => {
    const res = await processScanToAddEquipment('\n  lns-2470-01 \t ', mockOptions)
    expect(res.success).toBe(true)
    expect(res.action).toBe('added')
    expect(addedLines.length).toBe(1)
    expect(addedLines[0]?.name).toBe('Sony FE 24-70mm GM II')
  })

  it('refuses already booked/unavailable asset and signals conflict with holding booking', async () => {
    // Scanning RED-KOMODO-9 which is seeded as On Rent / Booked
    const res = await processScanToAddEquipment('RED-KOMODO-9', mockOptions)
    expect(res.success).toBe(false)
    expect(res.action).toBe('conflict')
    expect(res.message).toContain('On Rent')
    expect(addedLines.length).toBe(0)
    expect(conflicts.length).toBe(1)
    expect(conflicts[0]?.reason).toContain('On Rent')
  })

  it('prevents duplicate lines when equipment is already present in draft lines', async () => {
    mockOptions.existingLines = [
      {
        id: 'unit-fx3-1',
        clientUuid: 'u-1',
        name: 'Sony FX3 Cinema Camera',
        serial: 'FX3-SN-001',
        qty: 1,
        ratePaisa: rupees(2500),
        days: 2,
        discountPct: 0,
        location: 'Boudha Hub',
        committedTo: 'Stock',
        lineType: 'Equipment',
        category: 'Camera',
      },
    ]

    const res = await processScanToAddEquipment('FX3-SN-001', mockOptions)
    expect(res.success).toBe(false)
    expect(res.action).toBe('already_in_draft')
    expect(addedLines.length).toBe(0)
  })

  it('handles query failure / database offline gracefully without corrupting draft', async () => {
    vi.spyOn(scannerLookupModule, 'resolveScannedCode').mockResolvedValue({
      status: 'query_failed',
      code: 'FAIL-CODE-01',
      error: 'Network connection error / Postgres timeout',
    })

    const res = await processScanToAddEquipment('FAIL-CODE-01', mockOptions)
    expect(res.success).toBe(false)
    expect(res.action).toBe('unrecognized')
    expect(res.message).toContain('Network connection error')
    expect(addedLines.length).toBe(0)
    expect(conflicts.length).toBe(1)
  })
})
