import { describe, it, expect, vi, beforeEach } from 'vitest'

const { idempotentInsertMock, logAuditEventMock, captureErrorMock } = vi.hoisted(() => ({
  idempotentInsertMock: vi.fn(),
  logAuditEventMock: vi.fn(),
  captureErrorMock: vi.fn(),
}))

vi.mock('../dataAccess', () => ({
  idempotentInsert: idempotentInsertMock,
}))

vi.mock('../audit', () => ({
  logAuditEvent: logAuditEventMock,
}))

vi.mock('../monitoring', () => ({
  captureError: captureErrorMock,
}))

import { applyBookingTransition, OS_TRANSITION_SOURCE } from '../bookingTransition'

describe('applyBookingTransition', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    idempotentInsertMock.mockResolvedValue({ data: { id: 'tr-1' }, error: null })
    logAuditEventMock.mockResolvedValue({ ok: true })
  })

  it('refuses illegal stage jumps without writing to database or audit', async () => {
    const res = await applyBookingTransition({
      bookingId: 'bk-1',
      branchId: 'br-1',
      from: 'Quote',
      to: 'On Rent',
      actorId: 'usr-1',
      actorRole: 'Coordinator',
      clientUuid: 'uuid-1',
    })

    expect(res.ok).toBe(false)
    expect(res.plan.allowed).toBe(false)
    expect(res.plan.blockers.length).toBeGreaterThan(0)
    expect(idempotentInsertMock).not.toHaveBeenCalled()
    expect(logAuditEventMock).not.toHaveBeenCalled()
  })

  it('writes booking_stage_transitions with queueOnFailure: false and logs audit on legal transition', async () => {
    const res = await applyBookingTransition({
      bookingId: 'bk-1',
      branchId: 'br-1',
      from: 'Quote',
      to: 'Booked',
      actorId: 'usr-1',
      actorRole: 'Coordinator',
      clientUuid: 'uuid-2',
      occurredAt: '2026-11-20T06:00:00.000Z',
      reason: 'Confirmed by client',
    })

    expect(res.ok).toBe(true)
    expect(idempotentInsertMock).toHaveBeenCalledWith(
      'booking_stage_transitions',
      expect.objectContaining({
        client_uuid: 'uuid-2',
        booking_id: 'bk-1',
        branch_id: 'br-1',
        from_stage: 'Quote',
        to_stage: 'Booked',
        is_reversal: false,
        source: OS_TRANSITION_SOURCE,
      }),
      { queueOnFailure: false },
    )
    expect(logAuditEventMock).toHaveBeenCalledWith(
      expect.objectContaining({
        tableName: 'bookings',
        recordId: 'bk-1',
        oldValues: { stage: 'Quote' },
        newValues: { stage: 'Booked' },
      }),
    )
  })

  it('captures audit errors without failing the already-committed transition', async () => {
    logAuditEventMock.mockRejectedValueOnce(new Error('audit down'))

    const res = await applyBookingTransition({
      bookingId: 'bk-1',
      branchId: 'br-1',
      from: 'Quote',
      to: 'Booked',
      actorId: 'usr-1',
      actorRole: 'Coordinator',
      clientUuid: 'uuid-3',
    })

    expect(res.ok).toBe(true)
    expect(captureErrorMock).toHaveBeenCalledTimes(1)
  })
})
