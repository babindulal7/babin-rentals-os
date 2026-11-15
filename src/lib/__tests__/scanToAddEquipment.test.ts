import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../supabase', async () => {
  const { mockSupabase } = await import('../__mocks__/client')
  return {
    supabase: mockSupabase,
    IS_MOCK: true,
    loadMockClient: vi.fn(),
  }
})

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

  it('allows deliberate rescan after cooldown when line was previously removed', async () => {
    vi.spyOn(scannerLookupModule, 'resolveScannedCode').mockResolvedValue({
      status: 'unit_matched',
      code: 'MIC-WL-1',
      label: 'DJI Mic 2 Set',
      unitId: 'unit-mic-1',
      serialNo: 'SN-MIC-1',
      assetTag: 'TAG-MIC',
      productName: 'DJI Mic 2 Wireless',
      unitStatus: 'Available',
    })

    // First scan adds
    const res1 = await processScanToAddEquipment('MIC-WL-1', mockOptions)
    expect(res1.success).toBe(true)
    expect(addedLines.length).toBe(1)

    // Wait past burst cooldown (simulated by advance or resetting cache)
    resetScanToAddCache()

    // Operator removed the line from draft (addedLines cleared, existingLines empty)
    addedLines = []

    // Deliberate rescan after cooldown succeeds
    const res2 = await processScanToAddEquipment('MIC-WL-1', mockOptions)
    expect(res2.success).toBe(true)
    expect(res2.action).toBe('added')
    expect(addedLines.length).toBe(1)
  })

  it('detects wrong-date stock when unit is already reserved for overlapping dates', async () => {
    vi.spyOn(scannerLookupModule, 'resolveScannedCode').mockResolvedValue({
      status: 'unit_matched',
      code: 'FX6-SN-002',
      label: 'Sony FX6 Cinema Camera',
      unitId: 'unit-fx6-2',
      serialNo: 'FX6-SN-002',
      assetTag: 'TAG-FX6',
      productName: 'Sony FX6 Cinema Camera',
      unitStatus: 'Available',
    })

    const optionsWithWindow: ScanToAddOptions = {
      ...mockOptions,
      window: {
        pickupAd: new Date('2026-11-20T10:00:00Z'),
        returnAd: new Date('2026-11-22T10:00:00Z'),
      },
    }

    // When unit is reserved on server for that window
    const supabaseModule = await import('../supabase')
    const selectMock = vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        is: vi.fn().mockReturnValue({
          overlaps: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValue({
              data: { booking: { booking_no: 'BK-2026-0042', stage: 'Booked' } },
              error: null,
            }),
          }),
        }),
      }),
    })
    vi.spyOn(supabaseModule.supabase, 'from').mockReturnValue({
      select: selectMock,
    } as unknown as ReturnType<typeof supabaseModule.supabase.from>)

    const res = await processScanToAddEquipment('FX6-SN-002', optionsWithWindow)

    expect(res.success).toBe(false)
    expect(res.action).toBe('conflict')
    expect(res.similarChoices).toBe(true)
    expect(res.message).toContain('BK-2026-0042')
    expect(conflicts[0]?.reason).toContain('BK-2026-0042')
    expect(addedLines.length).toBe(0)
  })

  it('uses catalog product rates and categories when catalogue is supplied', async () => {
    vi.spyOn(scannerLookupModule, 'resolveScannedCode').mockResolvedValue({
      status: 'unit_matched',
      code: 'A7S3-01',
      label: 'Sony A7S III',
      unitId: 'unit-a7s3-1',
      serialNo: 'A7S3-SN-001',
      assetTag: 'TAG-A7S3',
      productName: 'Sony Alpha A7S III',
      unitStatus: 'Available',
    })

    const optionsWithCatalog: ScanToAddOptions = {
      ...mockOptions,
      catalogue: [
        {
          id: 'unit-a7s3-1',
          name: 'Sony Alpha A7S III',
          kind: 'equipment',
          productKey: 'prod-a7s3',
          category: 'Mirrorless Camera',
          serial: 'A7S3-SN-001',
          ratePaisa: rupees(3500),
          location: 'Shelf A1',
          committedTo: '—',
          inBundles: [],
          haystack: [],
          availability: {
            level: 'available',
            icon: 'check',
            label: 'Available',
            tone: 'in',
            detail: '1 free',
            shortLines: [],
            freedLines: [],
          },
        },
      ],
    }

    const res = await processScanToAddEquipment('A7S3-01', optionsWithCatalog)

    expect(res.success).toBe(true)
    expect(res.action).toBe('added')
    expect(addedLines[0]?.category).toBe('Mirrorless Camera')
    expect(addedLines[0]?.ratePaisa).toBe(rupees(3500))
    expect(addedLines[0]?.serial).toBe('A7S3-SN-001')
  })

  it('rejects product scan when catalogue item is out of stock', async () => {
    vi.spyOn(scannerLookupModule, 'resolveScannedCode').mockResolvedValue({
      status: 'product_matched',
      code: 'PROD-RONIN-RS3',
      label: 'DJI RS3 Pro Gimbal',
      productId: 'prod-rs3',
      assetCode: 'PROD-RONIN-RS3',
      productName: 'DJI RS3 Pro Gimbal',
    })

    const optionsWithCatalog: ScanToAddOptions = {
      ...mockOptions,
      catalogue: [
        {
          id: 'prod-rs3',
          name: 'DJI RS3 Pro Gimbal',
          kind: 'equipment',
          productKey: 'prod-rs3',
          category: 'Gimbal',
          serial: '-',
          ratePaisa: rupees(1800),
          location: 'Floor B',
          committedTo: '—',
          inBundles: [],
          haystack: [],
          availability: {
            level: 'unavailable',
            icon: 'x',
            label: 'Unavailable',
            tone: 'danger',
            detail: 'All units booked',
            shortLines: [],
            freedLines: [],
          },
        },
      ],
    }

    const res = await processScanToAddEquipment('PROD-RONIN-RS3', optionsWithCatalog)

    expect(res.success).toBe(false)
    expect(res.action).toBe('conflict')
    expect(res.similarChoices).toBe(true)
    expect(conflicts[0]?.reason).toContain('out of stock')
    expect(addedLines.length).toBe(0)
  })

  it('handles offline / network errors without crashing or fabricating availability', async () => {
    vi.spyOn(scannerLookupModule, 'resolveScannedCode').mockResolvedValue({
      status: 'query_failed',
      code: 'OFFLINE-CODE-55',
      error: 'Network connection lost. Offline cached data unavailable.',
    })

    const res = await processScanToAddEquipment('OFFLINE-CODE-55', mockOptions)

    expect(res.success).toBe(false)
    expect(res.action).toBe('unrecognized')
    expect(res.message).toContain('Network connection lost')
    expect(addedLines.length).toBe(0)
  })
})
