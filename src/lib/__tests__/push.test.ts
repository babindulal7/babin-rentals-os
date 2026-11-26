import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  isPushSupported,
  getNotificationPermission,
  getDeviceLabel,
  detectDeviceLabel,
  urlBase64ToUint8Array,
  registerPushSubscription,
  unregisterPushSubscription,
  fetchUserPushSubscriptions,
  formatPushNotificationForRole,
  getPushNotificationsForEvent,
  _resetMockPushStore,
  _getMockPushSubscriptions,
  type MockPushRecord,
  type PushNotificationItem,
} from '../push'

describe('Web Push & Phone Pop-ups (T5-09, W62)', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    _resetMockPushStore([
      {
        id: 'sub-test-owner',
        clientUuid: '11111111-0005-4000-8000-000000000001',
        userId: 'user-owner',
        userRole: 'Owner',
        endpoint: 'https://push.example.com/owner',
        p256dh: 'p256dh-owner',
        auth: 'auth-owner',
        deviceLabel: 'iPhone 17 Pro',
        isActive: true,
        lastSeenAt: new Date().toISOString(),
      },
      {
        id: 'sub-test-warehouse',
        clientUuid: '11111111-0005-4000-8000-000000000002',
        userId: 'user-wh',
        userRole: 'Warehouse',
        endpoint: 'https://push.example.com/wh',
        p256dh: 'p256dh-wh',
        auth: 'auth-wh',
        deviceLabel: 'Galaxy XCover (Floor)',
        isActive: true,
        lastSeenAt: new Date().toISOString(),
      },
    ])
  })

  it('detects push support in environment', () => {
    expect(isPushSupported()).toBe(false)
    expect(getNotificationPermission()).toBe('unsupported')
  })

  it('detects human-friendly device labels from user agent (W62)', () => {
    expect(detectDeviceLabel('Mozilla/5.0 (iPad; CPU OS 18_0 like Mac OS X) AppleWebKit/605.1.15')).toBe('iPad Pro')
    expect(detectDeviceLabel('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15')).toBe('iPhone')
    expect(getDeviceLabel('Mozilla/5.0 (Linux; Android 14; Mobile) AppleWebKit/537.36 Chrome/120')).toBe('Android Phone')
    expect(getDeviceLabel('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36')).toBe('Windows Desktop')
  })

  it('converts base64 VAPID public key to Uint8Array', () => {
    const testKey = 'BEl62iUYgUivxIkv69yViEuiBIa-Ib9-SkvMeAtA3LFgDzkrxZJjSgSnfckjBJuBkr3qBUYIHBQFLXYp5Nksh8U'
    const uint8 = urlBase64ToUint8Array(testKey)
    expect(uint8).toBeInstanceOf(Uint8Array)
    expect(uint8.length).toBeGreaterThan(0)
  })

  describe('formatPushNotificationForRole (Law 6 Money Blindness)', () => {
    it('enforces Law 6 on payment_received alerts', () => {
      const payload = {
        booking_no: 'BK-2026-0042',
        amount_paisa: 1500000, // Rs 15,000
      }

      // Money role sees formatted rupees
      const ownerAlert = formatPushNotificationForRole('payment_received', payload, 'Owner')
      expect(ownerAlert.title).toBe('Online payment received')
      expect(ownerAlert.body).toContain('Rs')
      expect(ownerAlert.body).toContain('15,000')

      // Floor role gets the alert with ZERO money figures
      const whAlert = formatPushNotificationForRole('payment_received', payload, 'Warehouse')
      expect(whAlert.title).toBe('Online payment received')
      expect(whAlert.body).not.toContain('Rs')
      expect(whAlert.body).not.toContain('15,000')
      expect(whAlert.body).toBe('Payment received for booking BK-2026-0042.')

      const techAlert = formatPushNotificationForRole('payment_received', payload, 'Technician')
      expect(techAlert.body).not.toContain('Rs')
    })

    it('enforces Law 6 on late_return alerts (W38, W39)', () => {
      const payload = {
        booking_id: 'bk-123',
        booking_no: 'BK-2026-0099',
        outstanding_paisa: 400000, // Rs 4,000
      }

      const managerAlert = formatPushNotificationForRole('late_return', payload, 'Manager')
      expect(managerAlert.title).toBe('Late return: BK-2026-0099')
      expect(managerAlert.body).toContain('Balance owed: Rs 4,000')
      expect(managerAlert.linkUrl).toBe('/rentals/bk-123')

      const whAlert = formatPushNotificationForRole('late_return', payload, 'Warehouse')
      expect(whAlert.title).toBe('Late return: BK-2026-0099')
      expect(whAlert.body).not.toContain('Rs')
      expect(whAlert.body).not.toContain('4,000')
      expect(whAlert.body).toBe('Booking BK-2026-0099 is 30m overdue for return. Check counter.')
    })

    it('formats new_online_request alerts correctly', () => {
      const payload = {
        booking_id: 'bk-456',
        client_name: 'Gorkha Cinema',
        total_paisa: 5000000,
        item_count: 6,
      }

      const coordAlert = formatPushNotificationForRole('new_online_request', payload, 'Coordinator')
      expect(coordAlert.title).toBe('New online booking request')
      expect(coordAlert.body).toContain('Gorkha Cinema')
      expect(coordAlert.body).toContain('Rs 50,000')

      const whAlert = formatPushNotificationForRole('new_online_request', payload, 'Warehouse')
      expect(whAlert.body).toContain('Gorkha Cinema')
      expect(whAlert.body).not.toContain('Rs')
      expect(whAlert.body).toContain('6 items')
    })

    it('formats damage_found alerts with record link', () => {
      const payload = {
        finding_id: 'df-789',
        item_name: 'RED Komodo 6K',
        description: 'Sensor port cover missing',
      }

      const alert = formatPushNotificationForRole('damage_found', payload, 'Warehouse')
      expect(alert.title).toBe('Damage reported')
      expect(alert.body).toBe('Damage reported on RED Komodo 6K: Sensor port cover missing.')
      expect(alert.linkUrl).toBe('/inventory/damage/df-789')
      expect(alert.tag).toBe('damage-df-789')
    })
  })

  describe('Subscription Management (Law 3 Deactivation)', () => {
    it('registers a new push subscription in mock store', async () => {
      const res = await registerPushSubscription({
        endpoint: 'https://push.example.com/new-device',
        p256dh: 'new-key',
        auth: 'new-auth',
        deviceLabel: 'iPad Air (Field)',
      })
      expect(res.success).toBe(true)
      const subs = _getMockPushSubscriptions()
      const found = subs.find((s: MockPushRecord) => s.endpoint === 'https://push.example.com/new-device')
      expect(found).toBeDefined()
      expect(found?.deviceLabel).toBe('iPad Air (Field)')
      expect(found?.isActive).toBe(true)
    })

    it('soft-deactivates subscription on unregister (Law 3)', async () => {
      const ok = await unregisterPushSubscription('https://push.example.com/wh')
      expect(ok).toBe(true)
      const subs = _getMockPushSubscriptions()
      const found = subs.find((s: MockPushRecord) => s.endpoint === 'https://push.example.com/wh')
      expect(found).toBeDefined()
      expect(found?.isActive).toBe(false)
    })

    it('delivers push notifications to active subscriptions', async () => {
      const notifs = await getPushNotificationsForEvent('payment_received', {
        booking_no: 'BK-TEST',
        amount_paisa: 100000,
      })
      expect(notifs.length).toBe(2)
      const ownerNotif = notifs.find((n: PushNotificationItem) => n.userRole === 'Owner')
      const whNotif = notifs.find((n: PushNotificationItem) => n.userRole === 'Warehouse')
      expect(ownerNotif?.body).toContain('Rs 1,000')
      expect(whNotif?.body).not.toContain('Rs')
    })

    it('fetches user push subscriptions from view in mock mode', async () => {
      const subs = await fetchUserPushSubscriptions()
      expect(subs.length).toBeGreaterThan(0)
      expect(subs[0]?.isActive).toBe(true)
      expect(subs[0]?.endpoint).toContain('https://push.example.com')
    })
  })
})
