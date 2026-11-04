import { describe, it, expect, beforeEach } from 'vitest'
import {
  NOTIFICATION_CATEGORIES,
  fetchNotificationPreferences,
  updateNotificationPreference,
  resetMockNotificationPreferences,
} from '../notificationPreferences'

describe('Notification Preferences Queries (T5-05, Ruling 21 Jul lock)', () => {
  beforeEach(() => {
    resetMockNotificationPreferences()
  })

  it('defines the required notification categories including morning digest and operations alerts', () => {
    const keys = NOTIFICATION_CATEGORIES.map((c) => c.category)
    expect(keys).toContain('digest')
    expect(keys).toContain('booking')
    expect(keys).toContain('handover')
    expect(keys).toContain('damage')
    expect(keys).toContain('delivery')
    expect(keys).toContain('payment')
    expect(keys).toContain('general')
  })

  it('provides role-based defaults according to 21 Jul lock and Law 6 money blindness', async () => {
    const prefs = await fetchNotificationPreferences('user-test-owner')
    const payment = prefs.find((d) => d.category === 'payment')
    const digest = prefs.find((d) => d.category === 'digest')

    expect(payment?.inAppEnabled).toBe(true)
    expect(digest?.emailEnabled).toBe(true)
    expect(digest?.inAppEnabled).toBe(true)
  })

  it('updates notification preference and persists the toggled state', async () => {
    const userId = 'user-test-coord-01'

    // Initially true for Coordinator
    const initial = await fetchNotificationPreferences(userId)
    const initialDamage = initial.find((p) => p.category === 'damage')
    expect(initialDamage?.inAppEnabled).toBe(true)

    // Disable in-app for damage
    await updateNotificationPreference('damage', false, true, userId)

    const updated = await fetchNotificationPreferences(userId)
    const updatedDamage = updated.find((p) => p.category === 'damage')
    expect(updatedDamage?.inAppEnabled).toBe(false)
    expect(updatedDamage?.emailEnabled).toBe(true)
  })
})
