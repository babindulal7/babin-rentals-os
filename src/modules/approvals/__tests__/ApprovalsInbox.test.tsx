// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { ApprovalsInbox } from '../ApprovalsInbox'
import { _resetMockApprovals } from '../../../lib/queries/approvals'

const session = vi.hoisted(() => ({
  role: 'Manager' as string,
  userId: 'usr-mgr-99',
  name: 'Pradeep Giri',
}))

vi.mock('../../../lib/auth', () => ({
  useAuth: () => ({
    user: {
      id: session.userId,
      email: `${session.name.toLowerCase().replace(' ', '.')}@babinrentals.com`,
      name: session.name,
      role: session.role,
    },
    session: { access_token: 'test-token' },
  }),
}))

;(globalThis as Record<string, unknown>)['IS_REACT_ACT_ENVIRONMENT'] = true

let container: HTMLDivElement
let root: Root

async function mount(initialEntries = ['/approvals']) {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  await act(async () => {
    root.render(
      <MemoryRouter initialEntries={initialEntries}>
        <ApprovalsInbox />
      </MemoryRouter>,
    )
  })
}

function cleanup() {
  if (root) {
    act(() => {
      root.unmount()
    })
  }
  if (container && container.parentNode) {
    container.parentNode.removeChild(container)
  }
}

describe('ApprovalsInbox Component (T5-10, W57, PERMISSIONS §6.2)', () => {
  beforeEach(() => {
    _resetMockApprovals()
    session.role = 'Manager'
    session.userId = 'usr-mgr-99'
    session.name = 'Pradeep Giri'
    vi.restoreAllMocks()
  })

  afterEach(() => {
    cleanup()
  })

  it('renders RestrictedState for floor roles (Warehouse, Technician, Driver, Client) — Law 6', async () => {
    session.role = 'Warehouse'
    session.userId = 'usr-wh-01'
    session.name = 'Sagar Maharjan'

    await mount()

    expect(container.textContent).toContain('Floor roles (Warehouse, Technician, Driver, Client) cannot view or decide')
    expect(container.textContent).not.toContain('RED Komodo X Body Sensor Shatter')
  })

  it('renders pending approvals and filters for Manager', async () => {
    await mount()

    expect(container.textContent).toContain('Approvals Inbox')
    expect(container.textContent).toContain('DMG-2026-0041')
    expect(container.textContent).toContain('DMG-2026-0042')
  })

  it('NEVER shows an Approve button to a Manager for an Owner-only item (Card Rule & PERMISSIONS §6.2)', async () => {
    await mount()

    const cards = container.querySelectorAll('div[id^="appr-"]')
    expect(cards.length).toBeGreaterThan(0)

    // 1. Manager-eligible item (appr-001 / DMG-2026-0041, Rs 8,000) HAS an Approve button
    const tripodCard = Array.from(cards).find((c) => c.textContent?.includes('DMG-2026-0041'))
    expect(tripodCard).toBeDefined()
    const tripodButtons = Array.from(tripodCard?.querySelectorAll('button') || [])
    const hasTripodApprove = tripodButtons.some((b) => b.textContent?.trim() === 'Approve')
    expect(hasTripodApprove).toBe(true)

    // 2. Owner-only item (appr-002 / DMG-2026-0042, Rs 185,000 RED Komodo) NEVER has an Approve button for Manager
    const komodoCard = Array.from(cards).find((c) => c.textContent?.includes('DMG-2026-0042'))
    expect(komodoCard).toBeDefined()
    const komodoButtons = Array.from(komodoCard?.querySelectorAll('button') || [])
    const hasKomodoApprove = komodoButtons.some((b) => b.textContent?.trim() === 'Approve')
    expect(hasKomodoApprove).toBe(false)
    expect(komodoCard?.textContent).toContain('Awaiting Owner (Babin) — Owner-only authorization')
  })

  it('shows Approve button for Owner-only items when logged in as Owner (Babin)', async () => {
    session.role = 'Owner'
    session.userId = 'usr-owner-01'
    session.name = 'Babin Shrestha'

    await mount()

    const cards = container.querySelectorAll('div[id^="appr-"]')
    const komodoCard = Array.from(cards).find((c) => c.textContent?.includes('DMG-2026-0042'))
    expect(komodoCard).toBeDefined()

    // Owner CAN approve Owner-only items
    const komodoButtons = Array.from(komodoCard?.querySelectorAll('button') || [])
    const hasKomodoApprove = komodoButtons.some((b) => b.textContent?.trim() === 'Approve')
    expect(hasKomodoApprove).toBe(true)
  })

  it('allows Manager to approve manager-eligible item and updates state', async () => {
    await mount()

    const cards = container.querySelectorAll('div[id^="appr-"]')
    const tripodCard = Array.from(cards).find((c) => c.textContent?.includes('DMG-2026-0041'))
    const approveBtn = Array.from(tripodCard?.querySelectorAll('button') || []).find(
      (b) => b.textContent?.trim() === 'Approve',
    )
    expect(approveBtn).toBeDefined()

    await act(async () => {
      approveBtn?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

    // Dialog opens
    const dialog = document.body.querySelector('[role="dialog"]')
    expect(dialog).not.toBeNull()
    expect(dialog?.textContent).toContain('Approve Authorization')

    const confirmBtn = Array.from(dialog?.querySelectorAll('button') || []).find(
      (b) => b.textContent?.trim() === 'Confirm Approval',
    )
    expect(confirmBtn).toBeDefined()

    await act(async () => {
      confirmBtn?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

    // Dialog closes
    expect(document.body.querySelector('[role="dialog"]')).toBeNull()
  })

  it('enforces mandatory 10-char reason when declining an item', async () => {
    await mount()

    const cards = container.querySelectorAll('div[id^="appr-"]')
    const tripodCard = Array.from(cards).find((c) => c.textContent?.includes('DMG-2026-0041'))
    const declineBtn = Array.from(tripodCard?.querySelectorAll('button') || []).find(
      (b) => b.textContent?.trim() === 'Decline…',
    )
    expect(declineBtn).toBeDefined()

    await act(async () => {
      declineBtn?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

    // Dialog opens
    const dialog = document.body.querySelector('[role="dialog"]')
    expect(dialog).not.toBeNull()
    expect(dialog?.textContent).toContain('Decline Authorization')

    const confirmBtn = Array.from(dialog?.querySelectorAll('button') || []).find(
      (b) => b.textContent?.trim() === 'Confirm Decline',
    ) as HTMLButtonElement
    expect(confirmBtn.disabled).toBe(true)

    const textarea = dialog?.querySelector('textarea') as HTMLTextAreaElement
    expect(textarea).not.toBeNull()

    // Type short reason
    const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value')?.set
    await act(async () => {
      nativeSetter?.call(textarea, 'Short')
      textarea.dispatchEvent(new Event('input', { bubbles: true }))
      textarea.dispatchEvent(new Event('change', { bubbles: true }))
    })

    expect(confirmBtn.disabled).toBe(true)

    // Type valid reason >= 10 chars
    await act(async () => {
      nativeSetter?.call(textarea, 'Wear and tear covered under standard terms.')
      textarea.dispatchEvent(new Event('input', { bubbles: true }))
      textarea.dispatchEvent(new Event('change', { bubbles: true }))
    })

    expect(confirmBtn.disabled).toBe(false)

    await act(async () => {
      confirmBtn.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

    expect(document.body.querySelector('[role="dialog"]')).toBeNull()
  })
})
