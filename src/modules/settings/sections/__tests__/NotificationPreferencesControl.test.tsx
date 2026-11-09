// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ToastProvider } from '../../../../components/ui/Toast'
import { NotificationPreferencesControl } from '../NotificationPreferencesControl'
import * as prefLib from '../../../../lib/queries/notificationPreferences'

const mockAuthUser = vi.hoisted(() => ({ id: 'usr-coord', name: 'Alina Shrestha', role: 'Coordinator' }))

vi.mock('../../../../lib/auth', () => ({
  useAuth: () => ({ user: mockAuthUser, logout: vi.fn() }),
}))

vi.mock('../../../../lib/supabase', () => ({
  IS_MOCK: true,
  supabase: {},
}))

;(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true

describe('NotificationPreferencesControl (Settings ▸ System ▸ Notifications)', () => {
  let container: HTMLDivElement | null = null
  let root: Root | null = null

  beforeEach(() => {
    prefLib.resetMockNotificationPreferences()
    mockAuthUser.role = 'Coordinator'
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
    vi.restoreAllMocks()
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
    await act(async () => {
      root?.render(
        <ToastProvider>
          <NotificationPreferencesControl />
        </ToastProvider>,
      )
    })
    await act(async () => {
      await new Promise((r) => setTimeout(r, 20))
    })
  }

  it('renders all 7 categories with proper defaults (digest email on, all in-app on)', async () => {
    await renderComponent()

    expect(container?.textContent).toContain('Booking updates')
    expect(container?.textContent).toContain('Custody & gear handover')
    expect(container?.textContent).toContain('Damage & inspection alerts')
    expect(container?.textContent).toContain('Delivery & dispatch')
    expect(container?.textContent).toContain('Payment receipts')
    expect(container?.textContent).toContain('Morning digest')
    expect(container?.textContent).toContain('System announcements')

    // 14 category switches (2 per category) + 1 device push switch = 15 switches in total
    const switches = Array.from(container?.querySelectorAll('button[role="switch"]') ?? [])
    expect(switches.length).toBe(15)

    // Damage in-app switch is on, damage email switch is off
    const damageInApp = switches.find((s) => s.getAttribute('aria-label')?.includes('Damage & inspection alerts In-App'))
    const damageEmail = switches.find((s) => s.getAttribute('aria-label')?.includes('Damage & inspection alerts Email'))
    expect(damageInApp).toBeDefined()
    expect(damageEmail).toBeDefined()
    expect(damageInApp?.getAttribute('aria-checked')).toBe('true')
    expect(damageEmail?.getAttribute('aria-checked')).toBe('false')

    // Digest email switch is on
    const digestEmail = switches.find((s) => s.getAttribute('aria-label')?.includes('Morning digest Email'))
    expect(digestEmail).toBeDefined()
    expect(digestEmail?.getAttribute('aria-checked')).toBe('true')
  })

  it('toggles in-app preference off when clicked and saves', async () => {
    const updateSpy = vi.spyOn(prefLib, 'updateNotificationPreference')

    await renderComponent()

    const damageInApp = Array.from(container?.querySelectorAll('button[role="switch"]') ?? []).find(
      (s) => s.getAttribute('aria-label')?.includes('Damage & inspection alerts In-App'),
    )
    expect(damageInApp).toBeDefined()

    await act(async () => {
      damageInApp?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

    expect(updateSpy).toHaveBeenCalledWith('damage', false, false, 'usr-coord')
    expect(damageInApp?.getAttribute('aria-checked')).toBe('false')
  })

  it('toggles email preference on when clicked and saves', async () => {
    const updateSpy = vi.spyOn(prefLib, 'updateNotificationPreference')

    await renderComponent()

    const bookingEmail = Array.from(container?.querySelectorAll('button[role="switch"]') ?? []).find(
      (s) => s.getAttribute('aria-label')?.includes('Booking updates Email'),
    )
    expect(bookingEmail).toBeDefined()

    await act(async () => {
      bookingEmail?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

    expect(updateSpy).toHaveBeenCalledWith('booking', true, true, 'usr-coord')
    expect(bookingEmail?.getAttribute('aria-checked')).toBe('true')
  })

  it('handles error gracefully and provides a retry affordance', async () => {
    vi.spyOn(prefLib, 'fetchNotificationPreferences').mockRejectedValue(new Error('Network error loading preferences'))

    await renderComponent()

    expect(container?.textContent).toContain('Network error loading preferences')
    const retryBtn = Array.from(container?.querySelectorAll('button') ?? []).find(
      (b) => b.textContent?.trim() === 'Retry',
    )
    expect(retryBtn).toBeDefined()
  })
})
