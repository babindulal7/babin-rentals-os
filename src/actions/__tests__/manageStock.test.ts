import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  addEquipmentUnitsConfig,
  retireEquipmentUnitConfig,
  type AddEquipmentUnitsInput,
  type RetireEquipmentUnitInput,
} from '../inventory/manageStock'
import type { Role } from '../../lib/rbac'

const rpc = vi.hoisted(() => vi.fn())
vi.mock('../../lib/supabase', () => ({
  supabase: { rpc },
  newClientUuid: () => 'mock-uuid-key',
}))

const ctx = (role: Role, isOnline = true) => ({ userId: 'operator-id', role, isOnline })

describe('manageStock actions', () => {
  beforeEach(() => {
    rpc.mockReset()
  })

  describe('addEquipmentUnits', () => {
    const validInput: AddEquipmentUnitsInput = {
      productId: 'prod-001',
      units: [
        { warehouse_id: 'wh-main', serial_no: 'SN-001', condition: 'Good' },
        { warehouse_id: 'wh-main', serial_no: 'SN-002', condition: 'New' },
      ],
      clientUuid: 'custom-key',
    }

    it('validates required product ID', () => {
      expect(() =>
        addEquipmentUnitsConfig.validate({ ...validInput, productId: '' })
      ).toThrow('Product ID is required.')
    })

    it('validates at least one unit is provided', () => {
      expect(() =>
        addEquipmentUnitsConfig.validate({ ...validInput, units: [] })
      ).toThrow('At least one unit is required.')
    })

    it('validates warehouse_id on every unit', () => {
      expect(() =>
        addEquipmentUnitsConfig.validate({
          ...validInput,
          units: [{ warehouse_id: '', serial_no: 'SN-001' }],
        })
      ).toThrow('Warehouse is required for every unit.')
    })

    it.each(['Owner', 'Admin', 'Manager'] as Role[])(
      'allows %s to add equipment units',
      async (role) => {
        rpc.mockResolvedValue({
          data: {
            product_id: 'prod-001',
            added_count: 2,
            total_quantity: 10,
            unit_ids: ['u-1', 'u-2'],
          },
          error: null,
        })

        const res = await addEquipmentUnitsConfig.execute(validInput, ctx(role))
        expect(res.result.added_count).toBe(2)
        expect(res.result.total_quantity).toBe(10)
        expect(rpc).toHaveBeenCalledWith('add_equipment_units', {
          p_product_id: 'prod-001',
          p_units: validInput.units,
          p_key: 'custom-key',
        })
      }
    )

    it.each(['Coordinator', 'Warehouse', 'Technician', 'Driver', 'Client'] as Role[])(
      'refuses %s to add equipment units',
      async (role) => {
        await expect(addEquipmentUnitsConfig.execute(validInput, ctx(role))).rejects.toThrow(
          'Only Owner, Admin, or Manager may add equipment units.'
        )
        expect(rpc).not.toHaveBeenCalled()
      }
    )

    it('refuses execution when offline', async () => {
      await expect(
        addEquipmentUnitsConfig.execute(validInput, ctx('Manager', false))
      ).rejects.toThrow('Connect to add units to equipment.')
      expect(rpc).not.toHaveBeenCalled()
    })

    it('throws if RPC returns server error', async () => {
      rpc.mockResolvedValue({ data: null, error: { message: 'Exclusion conflict or invalid product' } })
      await expect(addEquipmentUnitsConfig.execute(validInput, ctx('Owner'))).rejects.toThrow(
        'Exclusion conflict or invalid product'
      )
    })

    it('throws if write was not confirmed by the server', async () => {
      rpc.mockResolvedValue({ data: null, error: null })
      await expect(addEquipmentUnitsConfig.execute(validInput, ctx('Owner'))).rejects.toThrow(
        'Unit intake was not confirmed by the server.'
      )
    })
  })

  describe('retireEquipmentUnit', () => {
    const validRetireInput: RetireEquipmentUnitInput = {
      unitId: 'unit-999',
      reason: 'Sensor cracked beyond repair during field drop',
      clientUuid: 'retire-key',
    }

    it('validates required unitId', () => {
      expect(() =>
        retireEquipmentUnitConfig.validate({ ...validRetireInput, unitId: '' })
      ).toThrow('Unit ID is required.')
    })

    it('requires an explanation of at least 10 characters', () => {
      expect(() =>
        retireEquipmentUnitConfig.validate({ ...validRetireInput, reason: 'Broken' })
      ).toThrow('Retirement requires an explanation of at least 10 characters.')
      expect(() =>
        retireEquipmentUnitConfig.validate({ ...validRetireInput, reason: '   short   ' })
      ).toThrow('Retirement requires an explanation of at least 10 characters.')
    })

    it.each(['Owner', 'Admin', 'Manager'] as Role[])(
      'allows %s to retire equipment units',
      async (role) => {
        rpc.mockResolvedValue({
          data: {
            unit_id: 'unit-999',
            asset_tag: 'EQ-001-01',
            product_id: 'prod-001',
            status: 'Retired',
            total_quantity: 9,
            retired_at: new Date().toISOString(),
          },
          error: null,
        })

        const res = await retireEquipmentUnitConfig.execute(validRetireInput, ctx(role))
        expect(res.result.status).toBe('Retired')
        expect(res.result.unit_id).toBe('unit-999')
        expect(rpc).toHaveBeenCalledWith('retire_equipment_unit', {
          p_unit_id: 'unit-999',
          p_reason: 'Sensor cracked beyond repair during field drop',
          p_key: 'retire-key',
        })
      }
    )

    it.each(['Coordinator', 'Warehouse', 'Technician', 'Driver', 'Client'] as Role[])(
      'refuses %s to retire equipment units',
      async (role) => {
        await expect(
          retireEquipmentUnitConfig.execute(validRetireInput, ctx(role))
        ).rejects.toThrow('Only Owner, Admin, or Manager may retire equipment units.')
        expect(rpc).not.toHaveBeenCalled()
      }
    )

    it('refuses execution when offline', async () => {
      await expect(
        retireEquipmentUnitConfig.execute(validRetireInput, ctx('Admin', false))
      ).rejects.toThrow('Connect to retire equipment.')
      expect(rpc).not.toHaveBeenCalled()
    })

    it('throws if unit is active on rental (database exclusion/guard error)', async () => {
      rpc.mockResolvedValue({
        data: null,
        error: { message: 'Unit unit-999 is currently committed or on rent. Cannot retire an active unit.' },
      })
      await expect(
        retireEquipmentUnitConfig.execute(validRetireInput, ctx('Admin'))
      ).rejects.toThrow('Unit unit-999 is currently committed or on rent. Cannot retire an active unit.')
    })

    it('throws if write was not confirmed by the server', async () => {
      rpc.mockResolvedValue({ data: null, error: null })
      await expect(
        retireEquipmentUnitConfig.execute(validRetireInput, ctx('Owner'))
      ).rejects.toThrow('Unit retirement was not confirmed by the server.')
    })
  })
})
