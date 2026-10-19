// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { clearFloorScan, loadFloorScan, saveFloorScan, recordFloorScanEvent } from '../floorScanStorage'

describe('floorScanStorage', () => {
  beforeEach(() => {
    window.localStorage.clear()
  })

  afterEach(() => {
    window.localStorage.clear()
  })

  it('saves and restores a floor scan payload correctly', () => {
    const bookingId = 'booking-123'
    const payload = {
      marks: { 'unit-1': { state: 'Packed', via: 'scan' } },
      notes: 'Pack fragile camera in Peli case',
    }

    saveFloorScan('pack', bookingId, payload)
    const restored = loadFloorScan<typeof payload>('pack', bookingId)

    expect(restored).not.toBeNull()
    expect(restored?.bookingId).toBe(bookingId)
    expect(restored?.verb).toBe('pack')
    expect(restored?.payload.marks['unit-1'].state).toBe('Packed')
    expect(restored?.payload.notes).toBe('Pack fragile camera in Peli case')
  })

  it('differentiates between pack and return verbs for the same booking', () => {
    const bookingId = 'booking-456'
    saveFloorScan('pack', bookingId, { status: 'packed' })
    saveFloorScan('return', bookingId, { status: 'returned' })

    const packRecord = loadFloorScan<{ status: string }>('pack', bookingId)
    const returnRecord = loadFloorScan<{ status: string }>('return', bookingId)

    expect(packRecord?.payload.status).toBe('packed')
    expect(returnRecord?.payload.status).toBe('returned')
  })

  it('clears persisted session when clearFloorScan is called', () => {
    const bookingId = 'booking-789'
    saveFloorScan('pack', bookingId, { key: 'value' })
    expect(loadFloorScan('pack', bookingId)).not.toBeNull()

    clearFloorScan('pack', bookingId)
    expect(loadFloorScan('pack', bookingId)).toBeNull()
  })

  it('gracefully handles corrupted storage entries', () => {
    const bookingId = 'booking-corrupt'
    window.localStorage.setItem(`babin-rentals:floor-scan:pack:${bookingId}`, 'invalid-json{{{')

    const result = loadFloorScan('pack', bookingId)
    expect(result).toBeNull()
  })

  it('records floor scan event into offline outbox gracefully', async () => {
    const result = await recordFloorScanEvent({
      bookingId: 'booking-scan-1',
      context: 'packing',
      code: 'CAM-A7S3-01',
      result: 'accepted',
      resolvedUnitId: 'unit-101',
    })
    // In JSDOM test environment without indexedDB, safely handles and returns boolean
    expect(typeof result).toBe('boolean')
  })

  it('normalizes scan_events payload to match Postgres schema constraints and enums', async () => {
    const offlineQueue = await import('../offlineQueue')
    const spy = vi.spyOn(offlineQueue, 'enqueueMutation').mockResolvedValue(true)

    // 1. Packing with barcode and warning -> Barcode 1D, Duplicate
    await recordFloorScanEvent({
      bookingId: '00000000-0000-4000-8000-000000000010',
      sessionId: '00000000-0000-4000-8000-000000000020',
      context: 'packing',
      code: 'CAM-01',
      codeType: 'barcode',
      result: 'warning',
      userId: '00000000-0000-4000-8000-000000000001',
    })

    expect(spy).toHaveBeenCalledWith(
      'scan_events',
      'insert',
      expect.objectContaining({
        context: 'packing',
        booking_id: '00000000-0000-4000-8000-000000000010',
        session_id: '00000000-0000-4000-8000-000000000020',
        code: 'CAM-01',
        code_type: 'Barcode 1D',
        result: 'Duplicate',
        created_by: '00000000-0000-4000-8000-000000000001',
      }),
      expect.any(String),
    )

    // 2. Stock check context -> booking_id and session_id MUST be null per scan_events_lookup_carries_no_job
    await recordFloorScanEvent({
      bookingId: 'some-booking',
      sessionId: 'some-session',
      context: 'stock_check',
      code: 'LENS-85MM',
      codeType: 'qr_code',
      result: 'rejected',
      userId: '00000000-0000-4000-8000-000000000001',
    })

    expect(spy).toHaveBeenCalledWith(
      'scan_events',
      'insert',
      expect.objectContaining({
        context: 'stock_check',
        booking_id: null,
        session_id: null,
        code: 'LENS-85MM',
        code_type: 'QR',
        result: 'Not expected here',
        created_by: '00000000-0000-4000-8000-000000000001',
      }),
      expect.any(String),
    )

    // 3. Reset context -> session_id must be null per scan_events_session_only_where_a_session_exists
    await recordFloorScanEvent({
      bookingId: '00000000-0000-4000-8000-000000000010',
      sessionId: 'should-be-cleared',
      context: 'reset',
      code: 'MON-01',
      result: 'Accepted',
      userId: '00000000-0000-4000-8000-000000000001',
    })

    expect(spy).toHaveBeenCalledWith(
      'scan_events',
      'insert',
      expect.objectContaining({
        context: 'reset',
        booking_id: '00000000-0000-4000-8000-000000000010',
        session_id: null,
        result: 'Accepted',
      }),
      expect.any(String),
    )

    spy.mockRestore()
  })
})

