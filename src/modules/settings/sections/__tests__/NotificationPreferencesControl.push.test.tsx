// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { NotificationPreferencesControl } from '../NotificationPreferencesControl'
import * as pushModule from '../../../../lib/push'

vi.mock('../../../../lib/auth', () => ({
  useAuth: () => ({
    user: { id: 'test-user-id', name: 'Test User', role: 'Coordinator' },
  }),
}))

vi.mock('../../../../lib/queries/notificationPreferences', () => ({
  NOTIFICATION_CATEGORIES: [
    { category: 'booking_created', label: 'New booking created', description: 'When a new booking is created', inAppDefault: true, emailDefault: true },
  ],
  fetchNotificationPreferences: vi.fn().mockResolvedValue([]),
  updateNotificationPreference: vi.fn().mockResolvedValue(true),
}))

;(globalThis as Record<string, unknown>)['IS_REACT_ACT_ENVIRONMENT'] = true

describe('NotificationPreferencesControl — Push subscription truth (UX-10, A-10)', () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    vi.restoreAllMocks()
    vi.spyOn(pushModule, 'isPushSupported').mockReturnValue(true)
    vi.spyOn(pushModule, 'detectDeviceLabel').mockReturnValue('iPhone 17 Pro')
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => {
      root.unmount()
    })
    container.remove()
  })

  const mount = async () => {
    await act(async () => {
      root.render(<NotificationPreferencesControl />)
    })
  }

  it('renders Off when no device push subscription is active', async () => {
    vi.spyOn(pushModule, 'getActiveDevicePushSubscription').mockResolvedValue(null)
    vi.spyOn(pushModule, 'getNotificationPermission').mockReturnValue('default')

    await mount()

    expect(container.textContent).toContain('Off')
    expect(container.textContent).toContain('Phone & iPad Pop-ups')
  })

  it('renders Subscribed when an active push subscription exists', async () => {
    vi.spyOn(pushModule, 'getActiveDevicePushSubscription').mockResolvedValue({
      endpoint: 'https://push.example.com/test-endpoint',
    })
    vi.spyOn(pushModule, 'getNotificationPermission').mockReturnValue('granted')

    await mount()

    expect(container.textContent).toContain('Subscribed')
  })

  it('subscribes device on toggle and updates badge', async () => {
    vi.spyOn(pushModule, 'getActiveDevicePushSubscription').mockResolvedValue(null)
    vi.spyOn(pushModule, 'getNotificationPermission').mockReturnValue('granted')
    const subscribeSpy = vi.spyOn(pushModule, 'subscribeCurrentDevice').mockResolvedValue(true)

    await mount()
    expect(container.textContent).toContain('Off')

    const toggle = container.querySelector('button[role="switch"]') as HTMLButtonElement | null
    expect(toggle).not.toBeNull()

    await act(async () => {
      toggle!.click()
    })

    expect(subscribeSpy).toHaveBeenCalled()
    expect(container.textContent).toContain('Subscribed')
  })

  it('unsubscribes device on toggle off', async () => {
    vi.spyOn(pushModule, 'getActiveDevicePushSubscription').mockResolvedValue({
      endpoint: 'https://push.example.com/test-endpoint',
    })
    vi.spyOn(pushModule, 'getNotificationPermission').mockReturnValue('granted')
    const unsubscribeSpy = vi.spyOn(pushModule, 'unsubscribeCurrentDevice').mockResolvedValue(true)

    await mount()
    expect(container.textContent).toContain('Subscribed')

    const toggle = container.querySelector('button[role="switch"]') as HTMLButtonElement | null
    expect(toggle).not.toBeNull()

    await act(async () => {
      toggle!.click()
    })

    expect(unsubscribeSpy).toHaveBeenCalled()
    expect(container.textContent).toContain('Off')
  })

  it('warns when notification permission is blocked in browser settings', async () => {
    vi.spyOn(pushModule, 'getActiveDevicePushSubscription').mockResolvedValue(null)
    vi.spyOn(pushModule, 'getNotificationPermission').mockReturnValue('denied')

    await mount()

    expect(container.textContent).toContain('Notifications are blocked in browser settings')
  })
})
