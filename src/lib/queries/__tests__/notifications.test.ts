// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest'

vi.mock('../../supabase', () => ({
  IS_MOCK: true,
  supabase: {},
}))

import {
  fetchNotifications,
  getUnreadNotificationCount,
  markNotificationAsRead,
  markAllNotificationsAsRead,
  createNotification,
  notifyStaff,
  _resetMockNotifications,
} from '../notifications'

describe('notifications query library (T5-01, Law 3, Law 6, Law 8)', () => {
  beforeEach(() => {
    _resetMockNotifications()
    vi.restoreAllMocks()
  })

  it('fetches notifications with initial mock records', async () => {
    const list = await fetchNotifications()
    expect(list.length).toBeGreaterThanOrEqual(2)
    expect(list[0]?.notificationNo).toBeDefined()
    expect(list[0]?.isRead).toBe(false)
  })

  it('fetches unread notifications only when requested', async () => {
    const all = await fetchNotifications()
    const firstId = all[0]!.id

    await markNotificationAsRead(firstId)

    const unread = await fetchNotifications({ unreadOnly: true })
    expect(unread.some((n) => n.id === firstId)).toBe(false)
  })

  it('reports accurate unread count', async () => {
    const initialCount = await getUnreadNotificationCount()
    expect(initialCount).toBeGreaterThanOrEqual(2)

    const all = await fetchNotifications()
    await markNotificationAsRead(all[0]!.id)

    const nextCount = await getUnreadNotificationCount()
    expect(nextCount).toBe(initialCount - 1)
  })

  it('marks all notifications read in bulk', async () => {
    const initialCount = await getUnreadNotificationCount()
    const count = await markAllNotificationsAsRead()
    expect(count).toBe(initialCount)

    const unreadCount = await getUnreadNotificationCount()
    expect(unreadCount).toBe(0)
  })

  it('creates notification with Law 8 clientUuid and dispatches event', async () => {
    const listener = vi.fn()
    window.addEventListener('babin:notifications-updated', listener)

    const created = await createNotification({
      recipientId: '00000000-0000-4000-8000-00000000e005',
      type: 'shift_handover_waiting',
      title: 'Shift handover waiting',
      body: 'Shift Morning handover waiting for acknowledgement',
      linkUrl: '/today',
      entityType: 'shift_handover',
      entityId: 'sh-123',
    })

    expect(created.id).toBeDefined()
    expect(created.clientUuid).toBeDefined()
    expect(created.type).toBe('shift_handover_waiting')
    expect(created.isRead).toBe(false)
    expect(listener).toHaveBeenCalled()

    window.removeEventListener('babin:notifications-updated', listener)
  })

  it('notifyStaff creates tailored messages for money and money-blind roles (Law 6)', async () => {
    const count = await notifyStaff({
      type: 'online_payment',
      title: 'Payment received',
      moneyMessage: 'Received Rs 25,000 for BK-0050',
      moneyBlindMessage: 'Payment confirmed for BK-0050',
      entityType: 'payment',
      entityId: 'pay-50',
      linkUrl: '/rentals/BK-0050',
    })

    expect(count).toBe(2)

    const accountsList = await fetchNotifications({ userId: '00000000-0000-4000-8000-00000000e006' })
    const accountsNotif = accountsList.find((n) => n.entityId === 'pay-50')
    expect(accountsNotif).toBeDefined()
    expect(accountsNotif?.message).toContain('Rs 25,000')

    const whList = await fetchNotifications({ userId: '00000000-0000-4000-8000-00000000e005' })
    const whNotif = whList.find((n) => n.entityId === 'pay-50')
    expect(whNotif).toBeDefined()
    expect(whNotif?.message).not.toContain('25,000')
    expect(whNotif?.message).not.toContain('Rs')
    expect(whNotif?.message).toContain('Payment confirmed for BK-0050')
  })
})
