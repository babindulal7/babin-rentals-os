import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  addClientIntelNote,
  addEquipmentIntelNote,
  configureIntelField,
  setClientIntelField,
  setEquipmentIntelField,
  setRentalIntelField,
} from '../writeIntel'
import { ActionPermissionError } from '../../core'

const access = vi.hoisted(() => ({
  inserts: [] as Array<{ table: string; payload: Record<string, unknown> }>,
  insertResult: { data: { id: 'test-id-123' }, error: null },
}))

vi.mock('../../../lib/dataAccess', () => ({
  idempotentInsert: async (table: string, payload: Record<string, unknown>) => {
    access.inserts.push({ table, payload })
    return access.insertResult
  },
}))

describe('writeIntel actions — permissions and operational gates', () => {
  beforeEach(() => {
    access.inserts = []
    vi.clearAllMocks()
    vi.stubGlobal('navigator', { onLine: true })
  })

  describe('addClientIntelNote', () => {
    it('admits Coordinator and Warehouse for operational client notes (note.create)', async () => {
      const res = await addClientIntelNote(
        {
          entityType: 'client',
          entityId: 'c-001',
          body: 'Needs extra cables.',
          visibility: 'operations',
          clientUuid: '11111111-1111-4111-8111-111111111111',
        },
        { userId: 'u-coord', role: 'Coordinator' as const },
      )

      expect(res.id).toBe('test-id-123')
      expect(access.inserts).toHaveLength(1)
      expect(access.inserts[0]?.table).toBe('intel_entity_notes')
      expect(access.inserts[0]?.payload.client_id).toBe('c-001')
    })

    it('denies Coordinator from creating a management note', async () => {
      await expect(
        addClientIntelNote(
          {
            entityType: 'client',
            entityId: 'c-001',
            body: 'Private credit review pending.',
            visibility: 'management',
            clientUuid: '11111111-1111-4111-8111-111111111112',
          },
          { userId: 'u-coord', role: 'Coordinator' as const },
        ),
      ).rejects.toThrow(/Management notes require Owner, Admin, or Manager access/)
    })

    it('denies Technician and Driver at the permission gate', async () => {
      await expect(
        addClientIntelNote(
          {
            entityType: 'client',
            entityId: 'c-001',
            body: 'Note text',
            visibility: 'all_staff',
            clientUuid: '11111111-1111-4111-8111-111111111113',
          },
          { userId: 'u-tech', role: 'Technician' as const },
        ),
      ).rejects.toBeInstanceOf(ActionPermissionError)
    })
  })

  describe('addEquipmentIntelNote', () => {
    it('admits Manager to add equipment intel note (inventory.create)', async () => {
      const res = await addEquipmentIntelNote(
        {
          entityType: 'equipment',
          entityId: 'p-001',
          body: 'Requires firmware update 3.1.',
          visibility: 'operations',
          clientUuid: '22222222-2222-4222-8222-222222222222',
        },
        { userId: 'u-mgr', role: 'Manager' as const },
      )

      expect(res.id).toBe('test-id-123')
      expect(access.inserts[0]?.payload.product_id).toBe('p-001')
    })

    it('denies Coordinator per 0143_smart_intel_notes_fields.sql:87 RLS mirror', async () => {
      await expect(
        addEquipmentIntelNote(
          {
            entityType: 'equipment',
            entityId: 'p-001',
            body: 'Firmware note',
            visibility: 'all_staff',
            clientUuid: '22222222-2222-4222-8222-222222222223',
          },
          { userId: 'u-coord', role: 'Coordinator' as const },
        ),
      ).rejects.toBeInstanceOf(ActionPermissionError)
    })
  })

  describe('configureIntelField', () => {
    it('admits Owner to configure field', async () => {
      const res = await configureIntelField(
        {
          entityType: 'client',
          fieldKey: 'special_delivery_terms',
          label: 'Special Delivery Terms',
          classification: 'operational',
          highPriority: true,
          clientUuid: '33333333-3333-4333-8333-333333333333',
        },
        { userId: 'u-owner', role: 'Owner' as const },
      )

      expect(res.id).toBe('test-id-123')
      expect(access.inserts[0]?.table).toBe('intel_field_definitions')
    })

    it('rejects invalid field key format', async () => {
      await expect(
        configureIntelField(
          {
            entityType: 'client',
            fieldKey: 'Invalid-Key-With-Uppercase',
            label: 'Invalid Key',
            classification: 'operational',
            highPriority: false,
            clientUuid: '33333333-3333-4333-8333-333333333334',
          },
          { userId: 'u-owner', role: 'Owner' as const },
        ),
      ).rejects.toThrow(/Use a lowercase field key/)
    })
  })

  describe('setClientIntelField & classifications', () => {
    it('admits Coordinator to set operational field', async () => {
      const res = await setClientIntelField(
        {
          entityType: 'client',
          entityId: 'c-001',
          definitionId: 'def-op-01',
          classification: 'operational',
          value: 'Loading dock gate 4',
          clientUuid: '44444444-4444-4444-8444-444444444441',
        },
        { userId: 'u-coord', role: 'Coordinator' as const },
      )

      expect(res.id).toBe('test-id-123')
    })

    it('denies Coordinator to set financial field', async () => {
      await expect(
        setClientIntelField(
          {
            entityType: 'client',
            entityId: 'c-001',
            definitionId: 'def-fin-01',
            classification: 'financial',
            value: 'Late fee exempt',
            clientUuid: '44444444-4444-4444-8444-444444444442',
          },
          { userId: 'u-coord', role: 'Coordinator' as const },
        ),
      ).rejects.toThrow(/Financial fields require money visibility/)
    })

    it('admits Owner to set financial field', async () => {
      await expect(
        setClientIntelField(
          {
            entityType: 'client',
            entityId: 'c-001',
            definitionId: 'def-fin-01',
            classification: 'financial',
            value: 'Late fee exempt',
            clientUuid: '44444444-4444-4444-8444-444444444443',
          },
          { userId: 'u-owner', role: 'Owner' as const },
        ),
      ).resolves.toBeDefined()
    })

    it('admits Manager to set equipment intel field (inventory.create)', async () => {
      const res = await setEquipmentIntelField(
        {
          entityType: 'equipment',
          entityId: 'p-001',
          definitionId: 'def-eq-01',
          classification: 'operational',
          value: 'Firmware 3.2 installed',
          clientUuid: '44444444-4444-4444-8444-444444444444',
        },
        { userId: 'u-mgr', role: 'Manager' as const },
      )
      expect(res.id).toBe('test-id-123')
    })

    it('denies Coordinator to set equipment intel field per 0143 RLS', async () => {
      await expect(
        setEquipmentIntelField(
          {
            entityType: 'equipment',
            entityId: 'p-001',
            definitionId: 'def-eq-01',
            classification: 'operational',
            value: 'Firmware 3.2 installed',
            clientUuid: '44444444-4444-4444-8444-444444444445',
          },
          { userId: 'u-coord', role: 'Coordinator' as const },
        ),
      ).rejects.toBeInstanceOf(ActionPermissionError)
    })

    it('admits Coordinator to set rental intel field (note.create)', async () => {
      const res = await setRentalIntelField(
        {
          entityType: 'rental',
          entityId: 'b-001',
          definitionId: 'def-rent-01',
          classification: 'operational',
          value: 'Grip truck driver contact: +977-9841234567',
          clientUuid: '44444444-4444-4444-8444-444444444446',
        },
        { userId: 'u-coord', role: 'Coordinator' as const },
      )
      expect(res.id).toBe('test-id-123')
    })
  })

  describe('offline rejection', () => {
    it('refuses execution when device is offline', async () => {
      vi.stubGlobal('navigator', { onLine: false })
      await expect(
        addClientIntelNote(
          {
            entityType: 'client',
            entityId: 'c-001',
            body: 'Offline note attempt',
            visibility: 'all_staff',
            clientUuid: '55555555-5555-4555-8555-555555555555',
          },
          { userId: 'u-owner', role: 'Owner' as const },
        ),
      ).rejects.toThrow(/device is offline/)
    })
  })
})
