// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'

const mockAuthUser = { id: 'owner-1', role: 'Owner' }
vi.mock('../../../../lib/auth', () => ({
  useAuth: () => ({ user: mockAuthUser }),
}))

vi.mock('../../../../lib/queries/notificationPreferences', () => ({
  NOTIFICATION_CATEGORIES: ['rental_operations', 'financial', 'system_security'],
  fetchNotificationPreferences: vi.fn().mockResolvedValue([]),
  updateNotificationPreference: vi.fn().mockResolvedValue({}),
}))

let mockIsPushSupported = false
let mockIsVapidConfigured = false
let mockActiveDeviceSub: { endpoint: string; p256dh: string; auth: string } | null = null
const mockSubscribeCurrentDevice = vi.fn()
const mockUnsubscribeCurrentDevice = vi.fn()

vi.mock('../../../../lib/push', () => ({
  isPushSupported: () => mockIsPushSupported,
  isVapidConfigured: () => mockIsVapidConfigured,
  getActiveDeviceSubscription: vi.fn().mockImplementation(async () => mockActiveDeviceSub),
  subscribeCurrentDevice: (...args: unknown[]) => mockSubscribeCurrentDevice(...args),
  unsubscribeCurrentDevice: (...args: unknown[]) => mockUnsubscribeCurrentDevice(...args),
  detectDeviceLabel: () => 'Test Browser',
}))

;(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true
const { NotificationPreferencesControl } = await import('../NotificationPreferencesControl')

let container: HTMLDivElement
let root: Root

async function mount() {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  await act(async () => {
    root.render(<NotificationPreferencesControl />)
  })
}

async function unmount() {
  if (root) {
    await act(async () => {
      root.unmount()
    })
  }
  container?.remove()
}

describe('UX-06: Push subscription truth and configuration guard', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockIsPushSupported = false
    mockIsVapidConfigured = false
    mockActiveDeviceSub = null
  })

  afterEach(async () => {
    await unmount()
  })

  it('shows push as unsupported and disables registration when browser lacks support', async () => {
    mockIsPushSupported = false
    mockIsVapidConfigured = true
    await mount()

    const pushCard = container.querySelector('[aria-label="Phone and iPad Push Alerts"]')
    expect(pushCard).not.toBeNull()
    expect(pushCard?.textContent).toContain('Push notifications are not supported on this browser')
    const switchBtn = pushCard?.querySelector('button[role="switch"]') as HTMLButtonElement | null
    expect(switchBtn).not.toBeNull()
    expect(switchBtn?.disabled).toBe(true)
    expect(switchBtn?.getAttribute('aria-checked')).toBe('false')
    expect(pushCard?.textContent).toContain('Off')
  })

  it('shows Push not configured when VAPID infrastructure is missing', async () => {
    mockIsPushSupported = true
    mockIsVapidConfigured = false
    await mount()

    const pushCard = container.querySelector('[aria-label="Phone and iPad Push Alerts"]')
    expect(pushCard?.textContent).toContain('Push not configured')
    const switchBtn = pushCard?.querySelector('button[role="switch"]') as HTMLButtonElement | null
    expect(switchBtn?.disabled).toBe(true)
    expect(switchBtn?.getAttribute('aria-checked')).toBe('false')
  })

  it('does NOT claim push is enabled when no active PushSubscription exists', async () => {
    mockIsPushSupported = true
    mockIsVapidConfigured = true
    mockActiveDeviceSub = null // No subscription on device
    await mount()

    const pushCard = container.querySelector('[aria-label="Phone and iPad Push Alerts"]')
    expect(pushCard?.textContent).toContain('Off')
    const switchBtn = pushCard?.querySelector('button[role="switch"]') as HTMLButtonElement | null
    expect(switchBtn?.disabled).toBe(false)
    expect(switchBtn?.getAttribute('aria-checked')).toBe('false')
  })

  it('displays Active when a real active PushSubscription is confirmed', async () => {
    mockIsPushSupported = true
    mockIsVapidConfigured = true
    mockActiveDeviceSub = {
      endpoint: 'https://real-push.service.com/sub-1234',
      p256dh: 'test-p256',
      auth: 'test-auth',
    }
    await mount()

    const pushCard = container.querySelector('[aria-label="Phone and iPad Push Alerts"]')
    expect(pushCard?.textContent).toContain('Active')
    const switchBtn = pushCard?.querySelector('button[role="switch"]') as HTMLButtonElement | null
    expect(switchBtn?.getAttribute('aria-checked')).toBe('true')
  })

  it('subscribes real device when toggled on and unregisters exact subscription when toggled off', async () => {
    mockIsPushSupported = true
    mockIsVapidConfigured = true
    mockActiveDeviceSub = null
    mockSubscribeCurrentDevice.mockResolvedValue(true)
    mockUnsubscribeCurrentDevice.mockResolvedValue(true)

    await mount()
    const switchBtn = container.querySelector('[aria-label="Phone and iPad Push Alerts"] button[role="switch"]') as HTMLButtonElement

    // Toggle on
    await act(async () => {
      switchBtn.click()
    })
    expect(mockSubscribeCurrentDevice).toHaveBeenCalledTimes(1)
    expect(switchBtn.getAttribute('aria-checked')).toBe('true')

    // Toggle off
    await act(async () => {
      switchBtn.click()
    })
    expect(mockUnsubscribeCurrentDevice).toHaveBeenCalledTimes(1)
    expect(switchBtn.getAttribute('aria-checked')).toBe('false')
  })

  it('handles subscription failure honestly and sets error inline', async () => {
    mockIsPushSupported = true
    mockIsVapidConfigured = true
    mockActiveDeviceSub = null
    mockSubscribeCurrentDevice.mockRejectedValue(new Error('Notification permission was not granted by the user.'))

    await mount()
    const switchBtn = container.querySelector('[aria-label="Phone and iPad Push Alerts"] button[role="switch"]') as HTMLButtonElement

    await act(async () => {
      switchBtn.click()
    })

    expect(switchBtn.getAttribute('aria-checked')).toBe('false')
    expect(container.textContent).toContain('Notification permission was not granted')
  })
})
