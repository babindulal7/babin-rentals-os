/**
 * Offer campaigns query layer (T5-12, B43, B50, migration 0224).
 * Reads from `offer_campaigns_v` view. Strictly Owner, Admin, and Manager only.
 */
import { supabase, IS_MOCK } from '../supabase'

export interface OfferCampaignRecord {
  id: string
  clientUuid: string
  subject: string
  bodyMarkdown: string
  heroImageUrl: string | null
  ctaButtonText: string
  ctaButtonUrl: string
  audienceFilter: Record<string, unknown>
  status: 'draft' | 'test_sent' | 'queued' | 'sending' | 'completed' | 'cancelled'
  testRecipientEmail: string | null
  testSentAt: string | null
  recipientCount: number
  sentCount: number
  failedCount: number
  bouncedCount: number
  unsubscribedCount: number
  createdBy: string
  createdByName: string
  createdAt: string
  updatedAt: string
  queuedAt: string | null
  completedAt: string | null
}

interface OfferCampaignDbRow {
  id: string
  client_uuid: string
  subject: string
  body_markdown: string
  hero_image_url: string | null
  cta_button_text: string
  cta_button_url: string
  audience_filter: Record<string, unknown>
  status: 'draft' | 'test_sent' | 'queued' | 'sending' | 'completed' | 'cancelled'
  test_recipient_email: string | null
  test_sent_at: string | null
  recipient_count: number
  sent_count: number
  failed_count: number
  bounced_count: number
  unsubscribed_count: number
  created_by: string
  created_by_name: string
  created_at: string
  updated_at: string
  queued_at: string | null
  completed_at: string | null
}

function mapDbRow(row: OfferCampaignDbRow): OfferCampaignRecord {
  return {
    id: row.id,
    clientUuid: row.client_uuid,
    subject: row.subject,
    bodyMarkdown: row.body_markdown,
    heroImageUrl: row.hero_image_url,
    ctaButtonText: row.cta_button_text,
    ctaButtonUrl: row.cta_button_url,
    audienceFilter: row.audience_filter,
    status: row.status,
    testRecipientEmail: row.test_recipient_email,
    testSentAt: row.test_sent_at,
    recipientCount: row.recipient_count,
    sentCount: row.sent_count,
    failedCount: row.failed_count,
    bouncedCount: row.bounced_count,
    unsubscribedCount: row.unsubscribed_count,
    createdBy: row.created_by,
    createdByName: row.created_by_name,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    queuedAt: row.queued_at,
    completedAt: row.completed_at,
  }
}

const mockCampaigns: OfferCampaignRecord[] = [
  {
    id: 'campaign-seed-01',
    clientUuid: '11111111-2222-3333-4444-555555555555',
    subject: 'Autumn Cinema Package — 20% Off Prime Lenses',
    bodyMarkdown: 'Upgrade your production with our high-speed prime set. Book for 3 or more shooting days and receive a special autumn rate.',
    heroImageUrl: null,
    ctaButtonText: 'Book Gear Online',
    ctaButtonUrl: 'https://book.babinrentals.com',
    audienceFilter: {},
    status: 'completed',
    testRecipientEmail: 'owner@babinrentals.com',
    testSentAt: '2026-10-28T10:00:00Z',
    recipientCount: 42,
    sentCount: 41,
    failedCount: 1,
    bouncedCount: 0,
    unsubscribedCount: 1,
    createdBy: 'user-owner-01',
    createdByName: 'Babin Dulal',
    createdAt: '2026-10-28T09:30:00Z',
    updatedAt: '2026-10-28T10:05:00Z',
    queuedAt: '2026-10-28T10:05:00Z',
    completedAt: '2026-10-28T10:15:00Z',
  },
]

export async function fetchOfferCampaigns(): Promise<OfferCampaignRecord[]> {
  if (IS_MOCK) {
    return [...mockCampaigns]
  }

  const { data, error } = await supabase
    .from('offer_campaigns_v')
    .select('*')
    .order('created_at', { ascending: false })

  if (error) {
    throw new Error(error.message)
  }

  return (data as unknown as OfferCampaignDbRow[]).map(mapDbRow)
}
