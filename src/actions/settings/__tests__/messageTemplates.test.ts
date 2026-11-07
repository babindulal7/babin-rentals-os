import { describe, it, expect, vi, beforeEach } from 'vitest'
import { saveMessageTemplate, restoreMessageTemplate } from '../messageTemplates'
import type { ActionContext } from '../../core'
import { supabase } from '../../../lib/supabase'

vi.mock('../../../lib/supabase', () => ({
  IS_MOCK: false,
  supabase: {
    rpc: vi.fn(),
  },
}))

vi.mock('../../../lib/dataAccess', () => ({
  generateClientUuid: () => 'e0000001-0000-0000-0000-000000000099',
}))

describe('T5-13 Message Templates Actions', () => {
  const mockRpc = vi.mocked(supabase.rpc)

  const ownerCtx: ActionContext = {
    userId: 'u-owner-001',
    role: 'Owner',
    isOnline: true,
  }

  const adminCtx: ActionContext = {
    userId: 'u-admin-001',
    role: 'Admin',
    isOnline: true,
  }

  const managerCtx: ActionContext = {
    userId: 'u-manager-001',
    role: 'Manager',
    isOnline: true,
  }

  const warehouseCtx: ActionContext = {
    userId: 'u-warehouse-001',
    role: 'Warehouse',
    isOnline: true,
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('saveMessageTemplate', () => {
    it('refuses save when caller is Manager (B20 Owner/Admin only)', async () => {
      await expect(
        saveMessageTemplate(
          {
            templateKey: 'email.pickup_reminder',
            subject: 'Ready for pickup',
            body: 'Hello {{client_name}}, your booking {{booking_number}} is ready',
          },
          managerCtx,
        ),
      ).rejects.toThrow(/requires settings\.manage_templates/i)
      expect(mockRpc).not.toHaveBeenCalled()
    })

    it('refuses save when caller is money-blind role (Warehouse)', async () => {
      await expect(
        saveMessageTemplate(
          {
            templateKey: 'email.pickup_reminder',
            subject: 'Ready for pickup',
            body: 'Hello {{client_name}}, your booking {{booking_number}} is ready',
          },
          warehouseCtx,
        ),
      ).rejects.toThrow(/requires settings\.manage_templates/i)
      expect(mockRpc).not.toHaveBeenCalled()
    })

    it('validates template input fields before calling RPC', async () => {
      await expect(
        saveMessageTemplate(
          {
            templateKey: '',
            body: 'Valid body text',
          },
          ownerCtx,
        ),
      ).rejects.toThrow(/Template key is required/i)

      await expect(
        saveMessageTemplate(
          {
            templateKey: 'email.test',
            body: 'Hi',
          },
          ownerCtx,
        ),
      ).rejects.toThrow(/Template body must be at least 5 characters long/i)
    })

    it('handles RPC error when unknown placeholder is rejected by database', async () => {
      mockRpc.mockResolvedValueOnce({
        data: null,
        error: {
          code: '22023',
          message: 'Unknown placeholder "{{secret_code_xyz}}" is refused. Allowed placeholders: client_name, booking_number',
          details: '',
          hint: '',
        },
      } as any)

      await expect(
        saveMessageTemplate(
          {
            templateKey: 'email.pickup_reminder',
            subject: 'Secret code',
            body: 'Hello {{client_name}}, your code is {{secret_code_xyz}}',
          },
          ownerCtx,
        ),
      ).rejects.toThrow(/Unknown placeholder "{{secret_code_xyz}}"/i)

      expect(mockRpc).toHaveBeenCalledWith('save_message_template', {
        p_client_uuid: 'e0000001-0000-0000-0000-000000000099',
        p_template_key: 'email.pickup_reminder',
        p_subject: 'Secret code',
        p_body: 'Hello {{client_name}}, your code is {{secret_code_xyz}}',
      })
    })

    it('allows Owner to save valid new version and bumps version number', async () => {
      const mockSavedTemplate = {
        id: 'tmpl-002-v2',
        client_uuid: 'e0000001-0000-0000-0000-000000000099',
        template_key: 'email.pickup_reminder',
        category: 'email',
        name: 'Pickup Reminder',
        description: 'Automatic reminder sent 24 hours prior to equipment pickup',
        version: 2,
        subject: 'Custom Subject: {{booking_number}}',
        body: 'Hello {{client_name}}, your gear for booking {{booking_number}} is ready on {{pickup_date}} at {{pickup_time}}.',
        allowed_placeholders: ['client_name', 'booking_number', 'pickup_time', 'pickup_date'],
        is_active: true,
        created_by: ownerCtx.userId,
        created_at: new Date().toISOString(),
      }

      mockRpc.mockResolvedValueOnce({
        data: mockSavedTemplate,
        error: null,
      } as any)

      const res = await saveMessageTemplate(
        {
          templateKey: 'email.pickup_reminder',
          subject: 'Custom Subject: {{booking_number}}',
          body: 'Hello {{client_name}}, your gear for booking {{booking_number}} is ready on {{pickup_date}} at {{pickup_time}}.',
        },
        ownerCtx,
      )

      expect(res.success).toBe(true)
      expect(res.template.version).toBe(2)
      expect(res.template.is_active).toBe(true)
      expect(res.template.subject).toContain('Custom Subject')
      expect(res.template.body).toContain('Hello {{client_name}}')
      expect(mockRpc).toHaveBeenCalledWith('save_message_template', {
        p_client_uuid: 'e0000001-0000-0000-0000-000000000099',
        p_template_key: 'email.pickup_reminder',
        p_subject: 'Custom Subject: {{booking_number}}',
        p_body: 'Hello {{client_name}}, your gear for booking {{booking_number}} is ready on {{pickup_date}} at {{pickup_time}}.',
      })
    })
  })

  describe('restoreMessageTemplate', () => {
    it('refuses restore when caller is not Owner or Admin', async () => {
      await expect(
        restoreMessageTemplate(
          {
            templateKey: 'email.pickup_reminder',
            targetVersion: 1,
          },
          managerCtx,
        ),
      ).rejects.toThrow(/requires settings\.manage_templates/i)
      expect(mockRpc).not.toHaveBeenCalled()
    })

    it('validates target version is a positive integer', async () => {
      await expect(
        restoreMessageTemplate(
          {
            templateKey: 'email.pickup_reminder',
            targetVersion: 0,
          },
          ownerCtx,
        ),
      ).rejects.toThrow(/Target version must be a positive integer/i)
    })

    it('allows Admin to restore target version (Law 3 append-only)', async () => {
      const mockRestoredTemplate = {
        id: 'tmpl-002-v3',
        client_uuid: 'e0000001-0000-0000-0000-000000000099',
        template_key: 'email.pickup_reminder',
        category: 'email',
        name: 'Pickup Reminder',
        description: 'Automatic reminder sent 24 hours prior to equipment pickup',
        version: 3,
        subject: 'Reminder: Equipment pickup for {{booking_number}} on {{pickup_date}}',
        body: 'Dear {{client_name}},\n\nThis is a reminder that your rental gear for booking {{booking_number}} is scheduled for pickup on {{pickup_date}} at {{pickup_time}}.\n\nPlease remember to bring your authorized ID for equipment handover.',
        allowed_placeholders: ['client_name', 'booking_number', 'pickup_time', 'pickup_date'],
        is_active: true,
        created_by: adminCtx.userId,
        created_at: new Date().toISOString(),
      }

      mockRpc.mockResolvedValueOnce({
        data: mockRestoredTemplate,
        error: null,
      } as any)

      const res = await restoreMessageTemplate(
        {
          templateKey: 'email.pickup_reminder',
          targetVersion: 1,
        },
        adminCtx,
      )

      expect(res.success).toBe(true)
      expect(res.template.version).toBe(3)
      expect(res.template.is_active).toBe(true)
      expect(res.template.body).toContain('authorized ID')
      expect(mockRpc).toHaveBeenCalledWith('restore_message_template', {
        p_client_uuid: 'e0000001-0000-0000-0000-000000000099',
        p_template_key: 'email.pickup_reminder',
        p_target_version: 1,
      })
    })
  })
})
