import { beforeEach, describe, expect, it, vi } from 'vitest'
import { canChangeBooking } from '../../../lib/rbac'
import {
  changeBooking,
  prepareBookingChangeSave,
  type ChangeBookingInput,
} from '../changeBooking'
import {
  bookingChangeToDraft,
  bookingChangePayload,
  type BookingChangeSnapshot,
} from '../../../lib/queries/changeBooking'
import { rupees, type Paisa } from '../../../lib/money'
import type { ActionContext } from '../../core'

const rpc = vi.hoisted(() => {
  const state = {
    calls: [] as Array<{ fn: string; args: unknown }>,
    reply: { data: null, error: null } as { data: unknown; error: unknown },
  }
  function reset() {
    state.calls = []
    state.reply = { data: null, error: null }
  }
  return { state, reset }
})

vi.mock('../../../lib/supabase', () => ({
  supabase: {
    rpc: (fn: string, args: unknown) => {
      rpc.state.calls.push({ fn, args })
      return Promise.resolve(rpc.state.reply)
    },
  },
  newClientUuid: () => 'client-uuid-1',
}))

describe('T3-18 · Change confirmed booking & linked booking', () => {
  beforeEach(() => {
    rpc.reset()
  })

  describe('RBAC · canChangeBooking', () => {
    it('grants permission to booking desk roles (Owner, Admin, Manager, Coordinator, Warehouse)', () => {
      expect(canChangeBooking('Owner')).toBe(true)
      expect(canChangeBooking('Admin')).toBe(true)
      expect(canChangeBooking('Manager')).toBe(true)
      expect(canChangeBooking('Coordinator')).toBe(true)
      expect(canChangeBooking('Warehouse')).toBe(true)
    })

    it('refuses permission to floor, driver, and client roles', () => {
      expect(canChangeBooking('Technician')).toBe(false)
      expect(canChangeBooking('Driver')).toBe(false)
      expect(canChangeBooking('Client')).toBe(false)
    })
  })

  describe('bookingChangeToDraft & bookingChangePayload', () => {
    const mockSnapshot: BookingChangeSnapshot = {
      id: 'b-001',
      code: 'BK-100',
      stage: 'Booked',
      parent_booking_id: null,
      revision: 'rev-abc-123',
      values: {
        id: 'b-001',
        client_id: 'cl-001',
        project: 'Feature Film',
        project_type: 'Feature',
        pickup_at: '2026-11-20T00:15:00.000Z', // 06:00 NPT
        return_at: '2026-11-22T12:15:00.000Z', // 18:00 NPT
        delivery_type: 'Client Pickup',
        deposit_required: 15000,
      },
      lines: [
        {
          id: 'line-1',
          client_uuid: 'uuid-line-1',
          line_type: 'Equipment',
          product_id: 'prod-1',
          name: 'Sony FX3',
          description: 'Sony FX3 Full-Frame Cinema Camera',
          qty: 1,
          days: 3,
          rate: 5000,
          discount_amount: 0,
          is_packed: false,
        },
        {
          id: 'line-2',
          client_uuid: 'uuid-line-2',
          line_type: 'Equipment',
          product_id: 'prod-2',
          name: 'Sony 24-70mm GM',
          description: 'Sony FE 24-70mm f/2.8 GM II',
          qty: 1,
          days: 3,
          rate: 2500,
          discount_amount: 0,
          is_packed: true,
        },
      ],
      crew: [],
      transport: null,
      discounts: [],
    }

    it('converts snapshot to draft preserving packed unit flags', () => {
      const draft = bookingChangeToDraft(mockSnapshot)
      expect(draft.bookingNo).toBe('BK-100')
      expect(draft.clientDbId).toBe('cl-001')
      expect(draft.project).toBe('Feature Film')
      expect(draft.lines.length).toBe(2)
      expect(draft.lines[0]?.isPacked).toBe(false)
      expect(draft.lines[1]?.isPacked).toBe(true)
    })

    it('builds change payload with correct dates and lines', () => {
      const draft = bookingChangeToDraft(mockSnapshot)
      const payload = bookingChangePayload(draft, mockSnapshot, rupees(15000) as Paisa, 'Added accessory')
      expect(payload.values.client_id).toBe('cl-001')
      expect(payload.values.deposit_required).toBe(15000)
      expect(payload.reason).toBe('Added accessory')
      expect(payload.lines.length).toBe(2)
      expect(payload.lines[0]?.product_id).toBe('prod-1')
    })

    it('sends the fuel charge in the server field and rupee units', () => {
      const draft = bookingChangeToDraft(mockSnapshot)
      draft.deliveryType = 'Babin Delivery'
      draft.fuelChargePaisa = rupees(123.45)
      const payload = bookingChangePayload(draft, mockSnapshot, rupees(15000))
      expect(payload.transport.fuel_charge).toBe(123.45)
      expect(payload.transport).not.toHaveProperty('fuelChargePaisa')
    })

    it('refuses if return date is before pickup date', () => {
      const draft = bookingChangeToDraft(mockSnapshot)
      draft.pickup = '2026-11-25'
      draft.returnDate = '2026-11-20'
      expect(() => bookingChangePayload(draft, mockSnapshot, rupees(15000) as Paisa)).toThrow(
        'Choose valid pickup and return dates.',
      )
    })
  })

  describe('changeBooking action execution', () => {
    const mockSnapshot: BookingChangeSnapshot = {
      id: 'b-001',
      code: 'BK-100',
      stage: 'Booked',
      parent_booking_id: null,
      revision: 'rev-abc-123',
      values: {
        id: 'b-001',
        client_id: 'cl-001',
        pickup_at: '2026-11-20T00:15:00.000Z',
        return_at: '2026-11-22T12:15:00.000Z',
        delivery_type: 'Client Pickup',
        deposit_required: 15000,
      },
      lines: [],
      crew: [],
      transport: null,
      discounts: [],
    }

    const draft = bookingChangeToDraft(mockSnapshot)

    const baseInput: ChangeBookingInput = {
      bookingId: 'b-001',
      expectedRevision: 'rev-abc-123',
      clientUuid: 'action-key-1',
      draft,
      snapshot: mockSnapshot,
      depositPaisa: rupees(15000) as Paisa,
      reason: 'Desk staff update',
    }

    const deskCtx: ActionContext = {
      userId: 'user-coord-1',
      role: 'Coordinator',
      isOnline: true,
    }

    it('refuses to silently change the client before calling the server', async () => {
      await expect(changeBooking({ ...baseInput, draft: { ...draft, clientDbId: 'different-client' } }, deskCtx)).rejects.toThrow(/client cannot be changed/i)
      expect(rpc.state.calls).toHaveLength(0)
    })

    it('refuses unauthorized roles', async () => {
      const floorCtx: ActionContext = {
        userId: 'user-tech-1',
        role: 'Technician',
        isOnline: true,
      }
      await expect(changeBooking(baseInput, floorCtx)).rejects.toThrow(
        /requires rental\.change/,
      )
    })

    it('refuses when offline', async () => {
      const offlineCtx: ActionContext = {
        userId: 'user-coord-1',
        role: 'Coordinator',
        isOnline: false,
      }
      await expect(changeBooking(baseInput, offlineCtx)).rejects.toThrow(
        'Connect to save this booking. Your changes are still here.',
      )
    })

    it('dispatches change_booking RPC with revision and payload', async () => {
      rpc.state.reply = {
        data: {
          id: 'b-001',
          code: 'BK-100',
          stage: 'Booked',
          revision: 'rev-def-456',
        },
        error: null,
      }

      const res = await changeBooking(baseInput, deskCtx)
      expect(res.code).toBe('BK-100')
      expect(rpc.state.calls.length).toBe(1)
      expect(rpc.state.calls[0]?.fn).toBe('change_booking')
      const pPayload = (rpc.state.calls[0]?.args as { p_payload: Record<string, unknown> }).p_payload
      expect(pPayload['booking_id']).toBe('b-001')
      expect(pPayload['revision']).toBe('rev-abc-123')
      expect(pPayload['actor_id']).toBe('user-coord-1')
    })

    it('does not send financial fields when Warehouse saves', async () => {
      rpc.state.reply = { data: { id: 'b-001', code: 'BK-100', stage: 'Booked', revision: 'new-rev' }, error: null }
      await changeBooking(baseInput, { userId: 'warehouse-1', role: 'Warehouse', isOnline: true })
      const sent = (rpc.state.calls[0]?.args as { p_payload: Record<string, unknown> }).p_payload
      expect(sent['values']).not.toHaveProperty('deposit_required')
      expect(sent).not.toHaveProperty('discount_percent')
      expect(sent).not.toHaveProperty('crew')
      expect(sent).not.toHaveProperty('transport')
      for (const line of sent['lines'] as Record<string, unknown>[]) {
        expect(line).not.toHaveProperty('rate')
        expect(line).not.toHaveProperty('discount_amount')
      }
    })

    it('prepares stable change attempt via prepareBookingChangeSave', () => {
      const attempt1 = prepareBookingChangeSave(
        {
          bookingId: baseInput.bookingId,
          expectedRevision: baseInput.expectedRevision,
          draft: baseInput.draft,
          snapshot: baseInput.snapshot,
          depositPaisa: baseInput.depositPaisa,
        },
        null,
      )
      expect(attempt1.input.clientUuid).toBeDefined()
      const attempt2 = prepareBookingChangeSave(
        {
          bookingId: baseInput.bookingId,
          expectedRevision: baseInput.expectedRevision,
          draft: baseInput.draft,
          snapshot: baseInput.snapshot,
          depositPaisa: baseInput.depositPaisa,
        },
        attempt1,
      )
      expect(attempt2).toBe(attempt1)
    })
  })
})
