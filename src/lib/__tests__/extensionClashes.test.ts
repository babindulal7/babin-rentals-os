import { describe, it, expect, vi, beforeEach } from 'vitest'
import { canDecideClashingExtension } from '../rbac'
import {
  requestClashingExtension,
  requestClashingExtensionConfig,
} from '../../actions/rentals/requestClashingExtension'
import {
  decideClashingExtension,
  decideClashingExtensionConfig,
} from '../../actions/rentals/decideClashingExtension'
import {
  resolveAtRiskBooking,
  resolveAtRiskBookingConfig,
} from '../../actions/rentals/resolveAtRiskBooking'
import {
  fetchActiveAtRiskBookings,
  checkBookingAtRisk,
} from '../queries/atRiskBookings'
import { supabase } from '../supabase'
import { DomainEvents } from '../../events/eventBus'

vi.mock('../supabase', () => ({
  supabase: {
    rpc: vi.fn(),
    from: vi.fn(),
  },
  newClientUuid: () => 'mock-client-uuid-1',
}))

describe('T3-29: Extension Clash & Manager Decision (RBAC & Actions)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.spyOn(DomainEvents, 'emit').mockResolvedValue(undefined)
  })

  describe('RBAC: canDecideClashingExtension (gate.extend.clash)', () => {
    it('grants decision authority strictly to Owner, Admin, and Manager', () => {
      expect(canDecideClashingExtension('Owner')).toBe(true)
      expect(canDecideClashingExtension('Admin')).toBe(true)
      expect(canDecideClashingExtension('Manager')).toBe(true)
    })

    it('denies decision authority to Coordinator, Warehouse, Technician, Driver, and Accounts', () => {
      expect(canDecideClashingExtension('Coordinator')).toBe(false)
      expect(canDecideClashingExtension('Warehouse')).toBe(false)
      expect(canDecideClashingExtension('Technician')).toBe(false)
      expect(canDecideClashingExtension('Driver')).toBe(false)
      expect(canDecideClashingExtension('Accounts')).toBe(false)
      expect(canDecideClashingExtension('Client')).toBe(false)
      expect(canDecideClashingExtension(null)).toBe(false)
    })
  })

  describe('Action: requestClashingExtension', () => {
    it('declares implemented: true and permissions: [rental.extend_clash_request]', () => {
      expect(requestClashingExtensionConfig.implemented).toBe(true)
      expect(requestClashingExtensionConfig.permissions).toEqual(['rental.extend_clash_request'])
    })

    it('validates bookingId, days >= 1, and reason >= 10 chars', () => {
      expect(() =>
        requestClashingExtensionConfig.validate!({
          bookingId: '',
          days: 1,
          reason: 'Valid reason here',
        }),
      ).toThrow('Booking ID is required')

      expect(() =>
        requestClashingExtensionConfig.validate!({
          bookingId: 'bk-1',
          days: 0,
          reason: 'Valid reason here',
        }),
      ).toThrow('whole number of at least 1')

      expect(() =>
        requestClashingExtensionConfig.validate!({
          bookingId: 'bk-1',
          days: 2,
          reason: 'Too short',
        }),
      ).toThrow('at least 10 characters')
    })

    it('executes request_clashing_extension RPC and returns clashId', async () => {
      const mockRpc = vi.mocked(supabase.rpc)
      mockRpc.mockResolvedValueOnce({
        data: { success: true, clash_id: 'clash-uuid-1', status: 'Pending' },
        error: null,
      } as any)

      const result = await requestClashingExtension(
        {
          bookingId: 'bk-1',
          days: 2,
          reason: 'Shoot extended due to rain delay',
          conflictingBookingId: 'bk-2',
        },
        { userId: 'user-coord', role: 'Coordinator' },
      )

      expect(mockRpc).toHaveBeenCalledWith('request_clashing_extension', {
        p_payload: expect.objectContaining({
          booking_id: 'bk-1',
          requested_days: 2,
          reason: 'Shoot extended due to rain delay',
          conflicting_booking_id: 'bk-2',
        }),
      })

      expect(result.success).toBe(true)
      expect(result.clashId).toBe('clash-uuid-1')
      expect(result.status).toBe('Pending')
      expect(DomainEvents.emit).toHaveBeenCalledWith(
        'RENTAL_EXTENSION_CLASH_REQUESTED',
        expect.objectContaining({
          clashId: 'clash-uuid-1',
          bookingId: 'bk-1',
          days: 2,
        }),
      )
    })
  })

  describe('Action: decideClashingExtension', () => {
    it('declares implemented: true and permissions: [gate.extend.clash]', () => {
      expect(decideClashingExtensionConfig.implemented).toBe(true)
      expect(decideClashingExtensionConfig.permissions).toEqual(['gate.extend.clash'])
    })

    it('validates decision options and reason length', () => {
      expect(() =>
        decideClashingExtensionConfig.validate!({
          clashId: 'clash-1',
          decision: 'invalid_decision' as any,
          decisionReason: 'Valid decision reason here',
        }),
      ).toThrow("Invalid decision 'invalid_decision'")

      expect(() =>
        decideClashingExtensionConfig.validate!({
          clashId: 'clash-1',
          decision: 'extend_at_risk',
          decisionReason: 'short',
        }),
      ).toThrow('at least 10 characters')
    })

    it('executes decide_clashing_extension RPC for extend_at_risk', async () => {
      const mockRpc = vi.mocked(supabase.rpc)
      mockRpc.mockResolvedValueOnce({
        data: {
          success: true,
          clash_id: 'clash-1',
          status: 'Resolved_AtRisk',
          decision: 'extend_at_risk',
        },
        error: null,
      } as any)

      const result = await decideClashingExtension(
        {
          clashId: 'clash-1',
          decision: 'extend_at_risk',
          decisionReason: 'Approved extension, next booking will use backup kit',
        },
        { userId: 'user-mgr', role: 'Manager' },
      )

      expect(mockRpc).toHaveBeenCalledWith('decide_clashing_extension', {
        p_payload: expect.objectContaining({
          clash_id: 'clash-1',
          decision: 'extend_at_risk',
          decision_reason: 'Approved extension, next booking will use backup kit',
        }),
      })

      expect(result.success).toBe(true)
      expect(result.decision).toBe('extend_at_risk')
      expect(result.status).toBe('Resolved_AtRisk')
      expect(DomainEvents.emit).toHaveBeenCalledWith(
        'RENTAL_EXTENSION_CLASH_DECIDED',
        expect.objectContaining({
          clashId: 'clash-1',
          decision: 'extend_at_risk',
        }),
      )
    })

    it('refuses execution if caller is Coordinator (permission gate denial)', async () => {
      await expect(
        decideClashingExtension(
          {
            clashId: 'clash-1',
            decision: 'extend_at_risk',
            decisionReason: 'Coordinator attempting decision override',
          },
          { userId: 'user-coord', role: 'Coordinator' },
        ),
      ).rejects.toThrow(/cannot perform.*DECIDE_CLASHING_EXTENSION/i)
    })
  })

  describe('Action: resolveAtRiskBooking', () => {
    it('declares implemented: true and permissions: [rental.at_risk_resolve]', () => {
      expect(resolveAtRiskBookingConfig.implemented).toBe(true)
      expect(resolveAtRiskBookingConfig.permissions).toEqual(['rental.at_risk_resolve'])
    })

    it('executes resolve_at_risk_booking RPC', async () => {
      const mockRpc = vi.mocked(supabase.rpc)
      mockRpc.mockResolvedValueOnce({
        data: {
          success: true,
          at_risk_id: 'at-risk-1',
          status: 'Covered_Subrent',
        },
        error: null,
      } as any)

      const result = await resolveAtRiskBooking(
        {
          atRiskId: 'at-risk-1',
          resolutionType: 'Covered_Subrent',
          resolutionNotes: 'Secured sub-rental unit from partner vendor',
        },
        { userId: 'user-mgr', role: 'Manager' },
      )

      expect(mockRpc).toHaveBeenCalledWith('resolve_at_risk_booking', {
        p_payload: expect.objectContaining({
          at_risk_id: 'at-risk-1',
          resolution_type: 'Covered_Subrent',
          resolution_notes: 'Secured sub-rental unit from partner vendor',
        }),
      })

      expect(result.success).toBe(true)
      expect(result.status).toBe('Covered_Subrent')
    })
  })

  describe('Queries: atRiskBookings', () => {
    it('fetchActiveAtRiskBookings returns mapped items from at_risk_bookings_v', async () => {
      const mockFrom = vi.mocked(supabase.from)
      mockFrom.mockReturnValueOnce({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            order: vi.fn().mockResolvedValue({
              data: [
                {
                  id: 'risk-1',
                  client_uuid: 'uuid-1',
                  booking_id: 'bk-2',
                  booking_no: 'BK-2002',
                  client_id: 'c-1',
                  client_name: 'Studio A',
                  booking_stage: 'Confirmed',
                  pickup_at: '2026-11-12T09:00:00Z',
                  return_at: '2026-11-14T18:00:00Z',
                  cause: 'Extension clash: booking BK-1001 extended',
                  source_booking_id: 'bk-1',
                  source_booking_no: 'BK-1001',
                  clashing_asset_id: 'asset-1',
                  status: 'Active',
                  raised_at: '2026-11-10T12:00:00Z',
                  created_at: '2026-11-10T12:00:00Z',
                },
              ],
              error: null,
            }),
          }),
        }),
      } as any)

      const items = await fetchActiveAtRiskBookings()
      expect(items).toHaveLength(1)
      expect(items[0]?.bookingNo).toBe('BK-2002')
      expect(items[0]?.sourceBookingNo).toBe('BK-1001')
      expect(items[0]?.status).toBe('Active')
    })

    it('checkBookingAtRisk returns single active item if booking is at risk', async () => {
      const mockFrom = vi.mocked(supabase.from)
      mockFrom.mockReturnValueOnce({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({
                data: {
                  id: 'risk-2',
                  client_uuid: 'uuid-2',
                  booking_id: 'bk-3',
                  booking_no: 'BK-3003',
                  client_id: 'c-2',
                  client_name: 'Studio B',
                  booking_stage: 'Confirmed',
                  pickup_at: '2026-11-13T09:00:00Z',
                  return_at: '2026-11-15T18:00:00Z',
                  cause: 'Extension clash',
                  status: 'Active',
                  raised_at: '2026-11-11T10:00:00Z',
                  created_at: '2026-11-11T10:00:00Z',
                },
                error: null,
              }),
            }),
          }),
        }),
      } as any)

      const risk = await checkBookingAtRisk('bk-3')
      expect(risk).not.toBeNull()
      expect(risk?.bookingNo).toBe('BK-3003')
      expect(risk?.status).toBe('Active')
    })

    it('checkBookingAtRisk returns null when no active at-risk record exists', async () => {
      const mockFrom = vi.mocked(supabase.from)
      mockFrom.mockReturnValueOnce({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({
                data: null,
                error: null,
              }),
            }),
          }),
        }),
      } as any)

      const risk = await checkBookingAtRisk('bk-safe')
      expect(risk).toBeNull()
    })
  })
})
