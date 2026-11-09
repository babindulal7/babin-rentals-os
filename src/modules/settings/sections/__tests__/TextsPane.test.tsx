// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { TextsPane } from '../TextsPane'
import type { SystemRole } from '../../../../types/database'

;(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true

const { authState } = vi.hoisted(() => ({
  authState: { role: 'Owner' as SystemRole, id: 'u-test-01' },
}))

vi.mock('../../../../lib/auth', () => ({
  useAuth: () => ({ user: { role: authState.role, id: authState.id } }),
}))

const mockTemplates = [
  {
    id: 'tmpl-001',
    client_uuid: 'e0000001-0000-0000-0000-000000000001',
    template_key: 'email.pickup_reminder',
    category: 'email' as const,
    name: 'Pickup Reminder',
    description: 'Automatic reminder sent 24 hours prior to equipment pickup',
    version: 1,
    subject: 'Reminder: Equipment pickup for {{booking_number}} on {{pickup_date}}',
    body: 'Dear {{client_name}}, your rental gear for booking {{booking_number}} is scheduled for pickup on {{pickup_date}} at {{pickup_time}}.',
    allowed_placeholders: ['client_name', 'booking_number', 'pickup_time', 'pickup_date', 'action_url'],
    is_active: true,
    created_by: 'u-owner-01',
    created_at: '2026-11-06T12:00:00Z',
  },
  {
    id: 'tmpl-002',
    client_uuid: 'e0000001-0000-0000-0000-000000000002',
    template_key: 'doc.invoice_footer',
    category: 'document' as const,
    name: 'Tax Invoice Footer Notice',
    description: 'Standard payment instructions and thank you message printed at the bottom of tax invoices',
    version: 1,
    subject: null,
    body: 'Thank you for choosing {{company_name}}. Please deposit dues to {{bank_details}}.',
    allowed_placeholders: ['company_name', 'bank_details', 'company_phone'],
    is_active: true,
    created_by: 'u-owner-01',
    created_at: '2026-11-06T12:00:00Z',
  },
]

vi.mock('../../../../lib/queries/messageTemplates', () => ({
  useMessageTemplates: () => ({
    templates: mockTemplates,
    loading: false,
    error: null,
    reload: vi.fn(),
  }),
  useMessageTemplateHistory: () => ({
    history: [mockTemplates[0]],
    loading: false,
    error: null,
    reload: vi.fn(),
  }),
}))

vi.mock('../../../../actions/settings/messageTemplates', () => ({
  saveMessageTemplate: vi.fn(),
  restoreMessageTemplate: vi.fn(),
}))

describe('TextsPane (T5-13, B20, O-11, Law 7)', () => {
  let container: HTMLDivElement | null = null
  let root: Root | null = null

  beforeEach(() => {
    vi.clearAllMocks()
    authState.role = 'Owner'
    authState.id = 'u-test-01'
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(() => {
    if (root) {
      act(() => {
        root?.unmount()
      })
    }
    container?.remove()
    container = null
    root = null
  })

  const renderComponent = async () => {
    if (!root || !container) return
    await act(async () => {
      root?.render(<TextsPane />)
    })
  }

  it('renders Access Restricted when caller is Manager (B20)', async () => {
    authState.role = 'Manager'
    await renderComponent()

    expect(container?.textContent).toContain('Access Restricted')
    expect(container?.textContent).toContain('restricted to Owner and Admin')
    expect(container?.textContent).not.toContain('Email Subject Line')
  })

  it('renders Access Restricted when caller is Warehouse (Law 6 / B20)', async () => {
    authState.role = 'Warehouse'
    await renderComponent()

    expect(container?.textContent).toContain('Access Restricted')
    expect(container?.textContent).not.toContain('Email Subject Line')
  })

  it('renders editor and template list for Owner', async () => {
    authState.role = 'Owner'
    await renderComponent()

    expect(container?.textContent).not.toContain('Access Restricted')
    expect(container?.textContent).toContain('Pickup Reminder')
    expect(container?.textContent).toContain('Email Subject Line')
    expect(container?.textContent).toContain('Allowed Placeholders')
    expect(container?.textContent).toContain('{{client_name}}')
    expect(container?.textContent).toContain('{{booking_number}}')
    expect(container?.textContent).toContain('Save New Version')
  })

  it('displays Law 7 legal notice when selecting a document template', async () => {
    authState.role = 'Owner'
    await renderComponent()

    // Find and click the Document template button in the list
    const docButton = Array.from(container?.querySelectorAll('button') || []).find((b) =>
      b.textContent?.includes('Tax Invoice Footer Notice'),
    )
    expect(docButton).toBeDefined()

    await act(async () => {
      docButton?.click()
    })

    expect(container?.textContent).toContain('Legal Notice')
    expect(container?.textContent).toContain('Tax invoice number, PAN, and VAT lines are immutable')
  })

  it('toggles preview with booking and interpolates sample context', async () => {
    authState.role = 'Owner'
    await renderComponent()

    const previewBtn = Array.from(container?.querySelectorAll('button') || []).find((b) =>
      b.textContent?.includes('Preview with Booking'),
    )
    expect(previewBtn).toBeDefined()

    await act(async () => {
      previewBtn?.click()
    })

    expect(container?.textContent).toContain('Preview with Real Booking')
    expect(container?.textContent).toContain('BK-2026-0842')
    expect(container?.textContent).toContain('Aarav Sharma')
  })
})
