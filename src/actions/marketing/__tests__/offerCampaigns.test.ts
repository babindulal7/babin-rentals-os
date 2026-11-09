import { describe, it, expect, vi, beforeEach } from 'vitest'
import { supabase } from '../../../lib/supabase'

vi.mock('../../../lib/supabase', () => ({
  IS_MOCK: true,
  supabase: {
    rpc: vi.fn(),
    functions: {
      invoke: vi.fn(),
    },
  },
}))

import {
  saveOfferCampaignConfig,
  testOfferCampaignConfig,
  previewOfferAudienceConfig,
  queueOfferCampaignConfig,
  unsubscribeClient,
} from '../offerCampaigns'
import * as emailClient from '../../../lib/email/client'
import { canManageOfferCampaigns } from '../../../lib/rbac'
import type { SystemRole } from '../../../types/database'

describe('T5-12 / B43: Offer Campaigns Actions & Engine', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('RBAC & Role Gate (B43)', () => {
    it('grants Owner, Admin, and Manager', () => {
      expect(canManageOfferCampaigns('Owner')).toBe(true)
      expect(canManageOfferCampaigns('Admin')).toBe(true)
      expect(canManageOfferCampaigns('Manager')).toBe(true)
    })

    it('strictly denies Coordinator, Warehouse, Technician, Driver, and Client', () => {
      const deniedRoles: SystemRole[] = [
        'Coordinator',
        'Warehouse',
        'Technician',
        'Driver',
        'Client',
        'Accounts',
      ]
      for (const role of deniedRoles) {
        expect(canManageOfferCampaigns(role)).toBe(false)
      }
      expect(canManageOfferCampaigns(null)).toBe(false)
      expect(canManageOfferCampaigns(undefined)).toBe(false)
    })
  })

  describe('saveOfferCampaignConfig', () => {
    it('validates clientUuid is required (Law 8)', () => {
      expect(() =>
        saveOfferCampaignConfig.validate({
          clientUuid: '',
          subject: 'Special Offer',
          bodyMarkdown: 'Valid body text for rental gear.',
        })
      ).toThrow(/clientUuid is required/i)
    })

    it('validates subject length (3-200)', () => {
      expect(() =>
        saveOfferCampaignConfig.validate({
          clientUuid: 'uuid-1',
          subject: 'Hi',
          bodyMarkdown: 'Valid body text for rental gear.',
        })
      ).toThrow(/between 3 and 200 characters/i)

      expect(() =>
        saveOfferCampaignConfig.validate({
          clientUuid: 'uuid-1',
          subject: 'a'.repeat(201),
          bodyMarkdown: 'Valid body text for rental gear.',
        })
      ).toThrow(/between 3 and 200 characters/i)
    })

    it('validates body markdown length (>= 10 chars)', () => {
      expect(() =>
        saveOfferCampaignConfig.validate({
          clientUuid: 'uuid-1',
          subject: 'Valid Subject',
          bodyMarkdown: 'Short',
        })
      ).toThrow(/at least 10 characters/i)
    })

    it('validates hero image URL format', () => {
      expect(() =>
        saveOfferCampaignConfig.validate({
          clientUuid: 'uuid-1',
          subject: 'Valid Subject',
          bodyMarkdown: 'Valid body text with enough length.',
          heroImageUrl: 'not-a-valid-url',
        })
      ).toThrow(/valid URL/i)
    })

    it('validates CTA button link format', () => {
      expect(() =>
        saveOfferCampaignConfig.validate({
          clientUuid: 'uuid-1',
          subject: 'Valid Subject',
          bodyMarkdown: 'Valid body text with enough length.',
          ctaButtonUrl: 'ftp://bad-link',
        })
      ).not.toThrow() // valid URL scheme

      expect(() =>
        saveOfferCampaignConfig.validate({
          clientUuid: 'uuid-1',
          subject: 'Valid Subject',
          bodyMarkdown: 'Valid body text with enough length.',
          ctaButtonUrl: 'not an url',
        })
      ).toThrow(/valid URL/i)
    })

    it('refuses execution when offline', async () => {
      await expect(
        saveOfferCampaignConfig.execute(
          {
            clientUuid: 'uuid-1',
            subject: 'Valid Subject',
            bodyMarkdown: 'Valid body text with enough length.',
          },
          { userId: 'u1', role: 'Owner', isOnline: false }
        )
      ).rejects.toThrow(/requires an online connection/i)
    })
  })

  describe('testOfferCampaignConfig', () => {
    it('validates campaignId and email format', () => {
      expect(() =>
        testOfferCampaignConfig.validate({
          campaignId: '',
          testEmail: 'owner@example.com',
          subject: 'Subject',
          bodyMarkdown: 'Valid body length text',
        })
      ).toThrow(/campaignId is required/i)

      expect(() =>
        testOfferCampaignConfig.validate({
          campaignId: 'camp-1',
          testEmail: 'invalid-email',
          subject: 'Subject',
          bodyMarkdown: 'Valid body length text',
        })
      ).toThrow(/valid test recipient email/i)
    })

    it('refuses execution when offline', async () => {
      await expect(
        testOfferCampaignConfig.execute(
          {
            campaignId: 'camp-1',
            testEmail: 'owner@example.com',
            subject: 'Subject',
            bodyMarkdown: 'Valid body length text',
          },
          { userId: 'u1', role: 'Owner', isOnline: false }
        )
      ).rejects.toThrow(/active connection/i)
    })

    it('dispatches email and records test send in Postgres', async () => {
      const sendEmailSpy = vi.spyOn(emailClient, 'sendEmail').mockResolvedValueOnce({
        success: true,
        status: 'mock_sent',
        emailLogId: 'log-1',
      })

      const rpcSpy = vi.mocked(supabase.rpc).mockResolvedValueOnce({
        data: {
          campaign_id: 'camp-1',
          status: 'test_sent',
          test_recipient_email: 'owner@example.com',
          test_sent_at: '2026-11-06T12:00:00Z',
        },
        error: null,
      } as any)

      const result = await testOfferCampaignConfig.execute(
        {
          campaignId: 'camp-1',
          testEmail: 'owner@example.com',
          subject: 'Special Offer',
          bodyMarkdown: 'Valid body text with enough length.',
        },
        { userId: 'u1', role: 'Owner', isOnline: true }
      )

      expect(sendEmailSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          templateId: 'offer_campaign',
          recipientEmail: 'owner@example.com',
        })
      )
      expect(rpcSpy).toHaveBeenCalledWith('record_offer_campaign_test_send', {
        p_campaign_id: 'camp-1',
        p_test_email: 'owner@example.com',
      })
      expect(result.result.status).toBe('test_sent')
    })
  })

  describe('previewOfferAudienceConfig', () => {
    it('calls preview_offer_campaign_audience RPC', async () => {
      const rpcSpy = vi.mocked(supabase.rpc).mockResolvedValueOnce({
        data: {
          eligible_count: 42,
          opted_out_count: 5,
          no_email_count: 2,
        },
        error: null,
      } as any)

      const res = await previewOfferAudienceConfig.execute(
        { audienceFilter: { membership_tier: 'Gold' } },
        { userId: 'u1', role: 'Owner', isOnline: true }
      )

      expect(rpcSpy).toHaveBeenCalledWith('preview_offer_campaign_audience', {
        p_audience_filter: { membership_tier: 'Gold' },
      })
      expect(res.result.eligible_count).toBe(42)
      expect(res.result.opted_out_count).toBe(5)
    })
  })

  describe('queueOfferCampaignConfig', () => {
    it('validates campaignId and clientUuid', () => {
      expect(() =>
        queueOfferCampaignConfig.validate({ campaignId: '', clientUuid: 'uuid-1' })
      ).toThrow(/campaignId is required/i)

      expect(() =>
        queueOfferCampaignConfig.validate({ campaignId: 'camp-1', clientUuid: '' })
      ).toThrow(/clientUuid is required/i)
    })

    it('refuses queueing offline', async () => {
      await expect(
        queueOfferCampaignConfig.execute(
          { campaignId: 'camp-1', clientUuid: 'uuid-1' },
          { userId: 'u1', role: 'Owner', isOnline: false }
        )
      ).rejects.toThrow(/active connection/i)
    })

    it('calls queue_offer_campaign RPC', async () => {
      const rpcSpy = vi.mocked(supabase.rpc).mockResolvedValueOnce({
        data: {
          campaign_id: 'camp-1',
          recipient_count: 25,
          status: 'queued',
          replayed: false,
        },
        error: null,
      } as any)

      const res = await queueOfferCampaignConfig.execute(
        { campaignId: 'camp-1', clientUuid: 'uuid-1' },
        { userId: 'u1', role: 'Owner', isOnline: true }
      )

      expect(rpcSpy).toHaveBeenCalledWith('queue_offer_campaign', {
        p_campaign_id: 'camp-1',
        p_client_uuid: 'uuid-1',
      })
      expect(res.result.recipient_count).toBe(25)
      expect(res.result.status).toBe('queued')
    })
  })

  describe('unsubscribeClient', () => {
    it('validates empty token fails closed', async () => {
      const res = await unsubscribeClient('')
      expect(res.success).toBe(false)
      expect(res.error).toMatch(/valid unsubscribe token is required/i)
    })

    it('returns mock success when IS_MOCK is true (npm test default)', async () => {
      // When run via `npm test`, VITE_DATA_SOURCE=mock → IS_MOCK=true.
      // The unsubscribeClient function returns a canned success without
      // calling supabase.functions.invoke.
      const res = await unsubscribeClient('any-token-value')
      expect(res.success).toBe(true)
      expect(res.clientCode).toBe('C-9901')
      expect(res.unsubscribedAt).toBeDefined()
    })
  })
})
