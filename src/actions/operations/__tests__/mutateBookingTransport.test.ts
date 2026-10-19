import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  mutateBookingTransport,
  mutateBookingTransportConfig,
  type MutateBookingTransportInput,
} from '../mutateBookingTransport'
import { ActionPermissionError } from '../../core'
import { supabase } from '../../../lib/supabase'
import { DomainEvents, EVENT_TYPES } from '../../../events/eventBus'

vi.mock('../../../lib/supabase', () => ({
  supabase: {
    rpc: vi.fn(),
  },
}))

describe('MUTATE_BOOKING_TRANSPORT Action', () => {
  const validUuid = '11111111-2222-3333-4444-555555555555'
  const driverUuid = '22222222-3333-4444-5555-666666666666'
  const keyUuid = '33333333-4444-5555-6666-777777777777'

  const ownerCtx = { userId: 'usr-owner', role: 'Owner' as const }
  const adminCtx = { userId: 'usr-admin', role: 'Admin' as const }
  const driverCtx = { userId: 'usr-driver', role: 'Driver' as const }
  const managerCtx = { userId: 'usr-mgr', role: 'Manager' as const }
  const warehouseCtx = { userId: 'usr-wh', role: 'Warehouse' as const }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('Validation', () => {
    it('rejects missing or invalid transport ID', () => {
      expect(() =>
        mutateBookingTransportConfig.validate({
          transportId: '',
          revision: 1,
          clientUuid: keyUuid,
          action: 'assign',
          driverId: driverUuid,
        }),
      ).toThrow('Valid transport ID is required.')

      expect(() =>
        mutateBookingTransportConfig.validate({
          transportId: 'not-a-uuid',
          revision: 1,
          clientUuid: keyUuid,
          action: 'assign',
          driverId: driverUuid,
        }),
      ).toThrow('Valid transport ID is required.')
    })

    it('rejects invalid revision', () => {
      expect(() =>
        mutateBookingTransportConfig.validate({
          transportId: validUuid,
          revision: 0,
          clientUuid: keyUuid,
          action: 'assign',
          driverId: driverUuid,
        }),
      ).toThrow('Valid transport revision (>= 1) is required.')
    })

    it('rejects missing or invalid client UUID', () => {
      expect(() =>
        mutateBookingTransportConfig.validate({
          transportId: validUuid,
          revision: 1,
          clientUuid: 'bad-uuid',
          action: 'assign',
          driverId: driverUuid,
        }),
      ).toThrow('Valid idempotency key is required.')
    })

    it('rejects invalid transport action', () => {
      expect(() =>
        mutateBookingTransportConfig.validate({
          transportId: validUuid,
          revision: 1,
          clientUuid: keyUuid,
          action: 'invalid' as any,
        }),
      ).toThrow('Invalid transport action')
    })

    it('requires driverId for assign action', () => {
      expect(() =>
        mutateBookingTransportConfig.validate({
          transportId: validUuid,
          revision: 1,
          clientUuid: keyUuid,
          action: 'assign',
        }),
      ).toThrow('Driver ID is required for assignment.')
    })

    it('requires recipientName of at least 2 chars for deliver action', () => {
      expect(() =>
        mutateBookingTransportConfig.validate({
          transportId: validUuid,
          revision: 1,
          clientUuid: keyUuid,
          action: 'deliver',
          recipientName: 'A',
        }),
      ).toThrow('Recipient name (minimum 2 characters) is required to complete delivery.')
    })

    it('requires note of at least 10 chars for fail action', () => {
      expect(() =>
        mutateBookingTransportConfig.validate({
          transportId: validUuid,
          revision: 1,
          clientUuid: keyUuid,
          action: 'fail',
          note: 'too short',
        }),
      ).toThrow('Reason for failed delivery (minimum 10 characters) is required.')
    })
  })

  describe('Permissions', () => {
    it('allows Owner and Admin roles to mutate transport', async () => {
      vi.mocked(supabase.rpc).mockResolvedValue({
        data: { id: validUuid, revision: 2 },
        error: null,
      } as any)

      const input: MutateBookingTransportInput = {
        transportId: validUuid,
        revision: 1,
        clientUuid: keyUuid,
        action: 'assign',
        driverId: driverUuid,
      }

      await expect(mutateBookingTransport(input, ownerCtx)).resolves.toEqual({
        id: validUuid,
        revision: 2,
      })

      await expect(mutateBookingTransport(input, adminCtx)).resolves.toEqual({
        id: validUuid,
        revision: 2,
      })
    })

    it('refuses Manager, Coordinator, Warehouse, Technician, Driver, Accounts, and Client roles', async () => {
      const input: MutateBookingTransportInput = {
        transportId: validUuid,
        revision: 1,
        clientUuid: keyUuid,
        action: 'assign',
        driverId: driverUuid,
      }

      await expect(mutateBookingTransport(input, managerCtx)).rejects.toThrow(ActionPermissionError)
      await expect(mutateBookingTransport(input, warehouseCtx)).rejects.toThrow(ActionPermissionError)
      await expect(mutateBookingTransport(input, driverCtx)).rejects.toThrow(ActionPermissionError)
    })
  })

  describe('Execution', () => {
    it('calls mutate_booking_transport RPC with mapped parameters and emits event', async () => {
      vi.mocked(supabase.rpc).mockResolvedValue({
        data: { id: validUuid, revision: 2 },
        error: null,
      } as any)

      const emitSpy = vi.spyOn(DomainEvents, 'emit').mockResolvedValue()

      const result = await mutateBookingTransport(
        {
          transportId: validUuid,
          revision: 1,
          clientUuid: keyUuid,
          action: 'assign',
          driverId: driverUuid,
        },
        ownerCtx,
      )

      expect(supabase.rpc).toHaveBeenCalledWith('mutate_booking_transport', {
        p_id: validUuid,
        p_revision: 1,
        p_key: keyUuid,
        p_action: 'assign',
        p_driver: driverUuid,
        p_recipient: null,
        p_note: null,
      })

      expect(result).toEqual({ id: validUuid, revision: 2 })
      expect(emitSpy).toHaveBeenCalledWith(
        EVENT_TYPES.TRANSPORT_UPDATED,
        expect.objectContaining({
          transportId: validUuid,
          revision: 2,
          action: 'assign',
          driverId: driverUuid,
        }),
      )
    })

    it('throws error when RPC returns an error', async () => {
      vi.mocked(supabase.rpc).mockResolvedValue({
        data: null,
        error: { message: 'Dispatch changed. Refresh before saving.' },
      } as any)

      await expect(
        mutateBookingTransport(
          {
            transportId: validUuid,
            revision: 1,
            clientUuid: keyUuid,
            action: 'dispatch',
          },
          ownerCtx,
        ),
      ).rejects.toThrow('Dispatch changed. Refresh before saving.')
    })
  })
})
