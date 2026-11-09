// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import type { SystemRole } from '../../../types/database'
import type { OfferCampaignRecord } from '../../../lib/queries/offerCampaigns'

let currentUser: { id: string; name: string; role: SystemRole; isSharedDevice: boolean } = {
  id: 'u-1',
  name: 'Babin Dulal',
  role: 'Owner',
  isSharedDevice: false,
}

const mockCampaigns: OfferCampaignRecord[] = [
  {
    id: 'camp-1',
    clientUuid: '11111111-2222-3333-4444-555555555555',
    subject: 'Autumn Cinema Package',
    bodyMarkdown: 'Special autumn package for film productions.',
    heroImageUrl: null,
    ctaButtonText: 'Book Gear Online',
    ctaButtonUrl: 'https://book.babinrentals.com',
    audienceFilter: {},
    status: 'completed',
    testRecipientEmail: 'owner@babinrentals.com',
    testSentAt: '2026-10-28T10:00:00Z',
    recipientCount: 15,
    sentCount: 15,
    failedCount: 0,
    bouncedCount: 0,
    unsubscribedCount: 1,
    createdBy: 'user-1',
    createdByName: 'Babin Dulal',
    createdAt: '2026-10-28T10:00:00Z',
    updatedAt: '2026-10-28T10:00:00Z',
    queuedAt: '2026-10-28T10:00:00Z',
    completedAt: '2026-10-28T10:05:00Z',
  },
]

vi.mock('../../../lib/auth', () => ({
  useAuth: () => ({
    user: currentUser,
  }),
}))

vi.mock('../../../lib/queries/offerCampaigns', () => ({
  fetchOfferCampaigns: vi.fn(async () => [...mockCampaigns]),
}))

vi.mock('../../../actions/marketing/offerCampaigns', () => ({
  saveOfferCampaign: vi.fn(async () => ({
    id: 'new-camp-1',
    client_uuid: 'u-1',
    subject: 'Promo',
    status: 'draft',
    body_markdown: 'Body text',
  })),
  testOfferCampaign: vi.fn(async () => ({
    campaign_id: 'new-camp-1',
    status: 'test_sent',
    test_recipient_email: 'owner@babinrentals.com',
    test_sent_at: '2026-11-06T12:00:00Z',
  })),
  previewOfferAudience: vi.fn(async () => ({
    eligible_count: 24,
    opted_out_count: 3,
    no_email_count: 1,
  })),
  queueOfferCampaign: vi.fn(async () => ({
    campaign_id: 'new-camp-1',
    recipient_count: 24,
    status: 'queued',
    replayed: false,
  })),
}))

;(globalThis as Record<string, unknown>)['IS_REACT_ACT_ENVIRONMENT'] = true

const { OfferCampaigns } = await import('../OfferCampaigns')

describe('OfferCampaigns UI (T5-12, B43, B50)', () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
    currentUser = { id: 'u-1', name: 'Babin Dulal', role: 'Owner', isSharedDevice: false }
  })

  afterEach(() => {
    act(() => {
      root.unmount()
    })
    container.remove()
  })

  it('renders Restricted state for unauthorized roles (Coordinator, Warehouse)', async () => {
    currentUser = { id: 'u-2', name: 'Floor Staff', role: 'Coordinator', isSharedDevice: false }

    await act(async () => {
      root.render(<OfferCampaigns />)
    })

    expect(container.textContent).toContain('Access Restricted')
    expect(container.textContent).toContain('Only Owner, Admin, and Manager (B43) have authority')
  })

  it('renders composer and campaign history for authorized role (Owner)', async () => {
    await act(async () => {
      root.render(<OfferCampaigns />)
    })

    expect(container.textContent).toContain('Offer Emails to Clients')
    expect(container.textContent).toContain('Compose Offer')
    expect(container.textContent).toContain('Subject Line')
    expect(container.textContent).toContain('Autumn Cinema Package')
  })

  it('disables Broadcast button until test email is verified', async () => {
    await act(async () => {
      root.render(<OfferCampaigns />)
    })

    const buttons = Array.from(container.querySelectorAll('button'))
    const broadcastBtn = buttons.find((b) => b.textContent?.includes('Send Test First to Unlock'))
    expect(broadcastBtn).toBeDefined()
    expect(broadcastBtn?.disabled).toBe(true)
  })
})
