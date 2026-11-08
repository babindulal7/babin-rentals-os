import { createAction, type ActionConfig } from '../core'
import { supabase, IS_MOCK } from '../../lib/supabase'
import { sendEmail } from '../../lib/email/client'

/**
 * T5-12 / B43 / B50: Marketing Offer Campaigns
 *
 * Owner · Admin · Manager only. Floor roles, Coordinator, and Client are denied.
 * Migration 0224 enforces role check, test-send requirement, and fail-closed consent logic.
 */

export interface AudienceFilter {
  tags?: string[]
  membership_tier?: string
}

export interface SaveOfferCampaignInput {
  campaignId?: string | null
  clientUuid: string
  subject: string
  bodyMarkdown: string
  heroImageUrl?: string | null
  ctaButtonText?: string
  ctaButtonUrl?: string
  audienceFilter?: AudienceFilter
}

export interface SaveOfferCampaignResult {
  id: string
  client_uuid: string
  subject: string
  status: string
  body_markdown: string
}

export const saveOfferCampaignConfig: ActionConfig<SaveOfferCampaignInput, SaveOfferCampaignResult> = {
  name: 'SAVE_OFFER_CAMPAIGN',
  permissions: ['offer_campaign.create'],
  implemented: true,

  validate(input) {
    if (!input.clientUuid) {
      throw new Error('clientUuid is required for audit and idempotency (Law 8).')
    }
    const subject = (input.subject ?? '').trim()
    if (subject.length < 3 || subject.length > 200) {
      throw new Error('Offer subject must be between 3 and 200 characters.')
    }
    const body = (input.bodyMarkdown ?? '').trim()
    if (body.length < 10) {
      throw new Error('Offer body text must be at least 10 characters.')
    }
    if (input.heroImageUrl && input.heroImageUrl.trim()) {
      try {
        new URL(input.heroImageUrl.trim())
      } catch {
        throw new Error('Hero image must be a valid URL.')
      }
    }
    if (input.ctaButtonUrl && input.ctaButtonUrl.trim()) {
      try {
        new URL(input.ctaButtonUrl.trim())
      } catch {
        throw new Error('CTA button link must be a valid URL.')
      }
    }
  },

  async execute(input, ctx) {
    if (ctx.isOnline === false) {
      throw new Error('Campaign composition requires an online connection. Nothing was saved.')
    }

    const { data, error } = await supabase.rpc('save_offer_campaign', {
      p_campaign_id: input.campaignId ?? null,
      p_client_uuid: input.clientUuid,
      p_subject: input.subject.trim(),
      p_body_markdown: input.bodyMarkdown.trim(),
      p_hero_image_url: input.heroImageUrl?.trim() || null,
      p_cta_button_text: input.ctaButtonText?.trim() || 'Book Gear Online',
      p_cta_button_url: input.ctaButtonUrl?.trim() || 'https://book.babinrentals.com',
      p_audience_filter: input.audienceFilter ?? {},
    })

    if (error) {
      throw new Error(error.message)
    }

    return {
      result: data as unknown as SaveOfferCampaignResult,
      events: [],
    }
  },
}

export const saveOfferCampaign = createAction(saveOfferCampaignConfig)

/* ── Test Send ───────────────────────────────────────────────────────────── */

export interface TestOfferCampaignInput {
  campaignId: string
  testEmail: string
  subject: string
  bodyMarkdown: string
  heroImageUrl?: string | null
  ctaButtonText?: string
  ctaButtonUrl?: string
}

export interface TestOfferCampaignResult {
  campaign_id: string
  status: string
  test_recipient_email: string
  test_sent_at: string
}

export const testOfferCampaignConfig: ActionConfig<TestOfferCampaignInput, TestOfferCampaignResult> = {
  name: 'TEST_OFFER_CAMPAIGN',
  permissions: ['offer_campaign.create'],
  implemented: true,

  validate(input) {
    if (!input.campaignId) {
      throw new Error('campaignId is required.')
    }
    const email = (input.testEmail ?? '').trim()
    if (!email || !email.includes('@') || !email.includes('.')) {
      throw new Error('A valid test recipient email address is required.')
    }
  },

  async execute(input, ctx) {
    if (ctx.isOnline === false) {
      throw new Error('Sending a test email requires an active connection.')
    }

    const targetEmail = input.testEmail.trim()

    // 1. Dispatch email via Edge Function (or mock)
    await sendEmail({
      templateId: 'offer_campaign',
      recipientEmail: targetEmail,
      language: 'en',
    })

    // 2. Mark campaign as test_sent in Postgres
    const { data, error } = await supabase.rpc('record_offer_campaign_test_send', {
      p_campaign_id: input.campaignId,
      p_test_email: targetEmail,
    })

    if (error) {
      throw new Error(error.message)
    }

    return {
      result: data as unknown as TestOfferCampaignResult,
      events: [],
    }
  },
}

export const testOfferCampaign = createAction(testOfferCampaignConfig)

/* ── Audience Preview ────────────────────────────────────────────────────── */

export interface AudiencePreviewInput {
  audienceFilter?: AudienceFilter
}

export interface AudiencePreviewResult {
  eligible_count: number
  opted_out_count: number
  no_email_count: number
}

export const previewOfferAudienceConfig: ActionConfig<AudiencePreviewInput, AudiencePreviewResult> = {
  name: 'PREVIEW_OFFER_AUDIENCE',
  permissions: ['offer_campaign.create'],
  implemented: true,

  validate() {
    // Audience filter is optional; empty object previews all active clients.
  },

  async execute(input, ctx) {
    if (ctx.isOnline === false) {
      throw new Error('Audience calculation requires an active connection.')
    }

    const { data, error } = await supabase.rpc('preview_offer_campaign_audience', {
      p_audience_filter: input.audienceFilter ?? {},
    })

    if (error) {
      throw new Error(error.message)
    }

    return {
      result: data as unknown as AudiencePreviewResult,
      events: [],
    }
  },
}

export const previewOfferAudience = createAction(previewOfferAudienceConfig)

/* ── Queue Campaign Broadcast ────────────────────────────────────────────── */

export interface QueueOfferCampaignInput {
  campaignId: string
  clientUuid: string
}

export interface QueueOfferCampaignResult {
  campaign_id: string
  recipient_count: number
  status: string
  replayed: boolean
}

export const queueOfferCampaignConfig: ActionConfig<QueueOfferCampaignInput, QueueOfferCampaignResult> = {
  name: 'QUEUE_OFFER_CAMPAIGN',
  permissions: ['offer_campaign.send'],
  implemented: true,

  validate(input) {
    if (!input.campaignId) {
      throw new Error('campaignId is required.')
    }
    if (!input.clientUuid) {
      throw new Error('clientUuid is required (Law 8).')
    }
  },

  async execute(input, ctx) {
    if (ctx.isOnline === false) {
      throw new Error('Broadcasting an offer campaign requires an active connection.')
    }

    const { data, error } = await supabase.rpc('queue_offer_campaign', {
      p_campaign_id: input.campaignId,
      p_client_uuid: input.clientUuid,
    })

    if (error) {
      throw new Error(error.message)
    }

    return {
      result: data as unknown as QueueOfferCampaignResult,
      events: [],
    }
  },
}

export const queueOfferCampaign = createAction(queueOfferCampaignConfig)

/* ── Client Unsubscribe (Unauthenticated / Public) ───────────────────────── */

export interface UnsubscribeResult {
  success: boolean
  clientCode?: string
  unsubscribedAt?: string
  error?: string
}

export async function unsubscribeClient(rawToken: string): Promise<UnsubscribeResult> {
  const token = (rawToken ?? '').trim()
  if (!token) {
    return { success: false, error: 'A valid unsubscribe token is required.' }
  }

  if (IS_MOCK) {
    return {
      success: true,
      clientCode: 'C-9901',
      unsubscribedAt: new Date().toISOString(),
    }
  }

  try {
    const { data, error } = await supabase.functions.invoke('send-email', {
      body: {
        action: 'unsubscribe',
        token,
      },
    })

    if (error) {
      return { success: false, error: error.message }
    }

    if (!data?.success) {
      return { success: false, error: data?.error || 'Failed to process unsubscribe request.' }
    }

    return {
      success: true,
      clientCode: data.client_code,
      unsubscribedAt: data.unsubscribed_at,
    }
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Network error communicating with unsubscribe service.',
    }
  }
}
