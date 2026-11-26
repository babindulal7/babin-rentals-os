import { supabase, IS_MOCK } from '../supabase'

export type NotificationChannel = 'In-App' | 'SMS' | 'Email' | 'WhatsApp'
export type NotificationSeverity = 'Information' | 'Warning' | 'Critical'

export interface AppNotification {
  id: string
  clientUuid: string
  notificationNo: string
  userId: string
  recipientRole: string | null
  type: string
  title: string
  message: string
  body: string
  channel: NotificationChannel
  severity: NotificationSeverity
  entityType: string | null
  entityId: string | null
  linkUrl: string | null
  isRead: boolean
  readAt: string | null
  createdAt: string
}

interface NotificationDbRow {
  id: string
  client_uuid: string
  notification_no: string
  user_id: string
  recipient_role: string | null
  type: string
  title: string
  message: string
  body: string | null
  channel: NotificationChannel
  severity: NotificationSeverity
  entity_type: string | null
  entity_id: string | null
  link_url: string | null
  is_read: boolean
  read_at: string | null
  created_at: string
}

// In-memory mock notification store for tests and mock mode
const INITIAL_MOCK_NOTIFICATIONS: AppNotification[] = [
  {
    id: 'notif-001',
    clientUuid: '10000000-0000-4000-8000-000000000001',
    notificationNo: 'NOTIF-20261028-0001',
    userId: '00000000-0000-4000-8000-00000000e006', // Accounts
    recipientRole: 'Accounts',
    type: 'online_payment',
    title: 'Payment received',
    message: 'Received Rs 15,000 for BK-0012',
    body: 'Received Rs 15,000 for BK-0012',
    channel: 'In-App',
    severity: 'Information',
    entityType: 'payment',
    entityId: 'pay-001',
    linkUrl: '/rentals/BK-0012',
    isRead: false,
    readAt: null,
    createdAt: new Date().toISOString(),
  },
  {
    id: 'notif-002',
    clientUuid: '10000000-0000-4000-8000-000000000002',
    notificationNo: 'NOTIF-20261028-0002',
    userId: '00000000-0000-4000-8000-00000000e005', // Warehouse
    recipientRole: 'Warehouse',
    type: 'online_payment',
    title: 'Payment confirmed',
    message: 'Payment confirmed for BK-0012',
    body: 'Payment confirmed for BK-0012',
    channel: 'In-App',
    severity: 'Information',
    entityType: 'payment',
    entityId: 'pay-001',
    linkUrl: '/rentals/BK-0012',
    isRead: false,
    readAt: null,
    createdAt: new Date().toISOString(),
  },
  {
    id: 'notif-003',
    clientUuid: '10000000-0000-4000-8000-000000000003',
    notificationNo: 'NOTIF-20261028-0003',
    userId: '00000000-0000-4000-8000-00000000e001', // Owner
    recipientRole: 'Owner',
    type: 'online_payment',
    title: 'Payment received',
    message: 'Received Rs 15,000 for BK-0012',
    body: 'Received Rs 15,000 for BK-0012',
    channel: 'In-App',
    severity: 'Information',
    entityType: 'payment',
    entityId: 'pay-001',
    linkUrl: '/rentals/BK-0012',
    isRead: false,
    readAt: null,
    createdAt: new Date().toISOString(),
  },
  {
    id: 'notif-004',
    clientUuid: '10000000-0000-4000-8000-000000000004',
    notificationNo: 'NOTIF-20261028-0004',
    userId: '00000000-0000-4000-8000-00000000e001', // Owner
    recipientRole: 'Owner',
    type: 'damage_case',
    title: 'Damage case opened',
    message: 'Damage case opened for BK-0010: Sony FX3 body scratched',
    body: 'Damage case opened for BK-0010: Sony FX3 body scratched',
    channel: 'In-App',
    severity: 'Warning',
    entityType: 'booking',
    entityId: 'bk-0010',
    linkUrl: '/rentals/BK-0010',
    isRead: false,
    readAt: null,
    createdAt: new Date(Date.now() - 3600000).toISOString(),
  },
  {
    id: 'notif-005',
    clientUuid: '10000000-0000-4000-8000-000000000005',
    notificationNo: 'NOTIF-20261028-0005',
    userId: '00000000-0000-4000-8000-00000000e004', // Coordinator
    recipientRole: 'Coordinator',
    type: 'booking_request',
    title: 'New booking request',
    message: 'Online booking request received for BK-0014',
    body: 'Online booking request received for BK-0014',
    channel: 'In-App',
    severity: 'Information',
    entityType: 'booking',
    entityId: 'bk-0014',
    linkUrl: '/rentals/BK-0014',
    isRead: false,
    readAt: null,
    createdAt: new Date().toISOString(),
  },
  {
    id: 'notif-006',
    clientUuid: '10000000-0000-4000-8000-000000000006',
    notificationNo: 'NOTIF-20261028-0006',
    userId: '00000000-0000-4000-8000-00000000e005', // Warehouse
    recipientRole: 'Warehouse',
    type: 'prep_ready',
    title: 'Gear prep required',
    message: 'Equipment prep checklist ready for BK-0012 (3 items)',
    body: 'Equipment prep checklist ready for BK-0012 (3 items)',
    channel: 'In-App',
    severity: 'Information',
    entityType: 'booking',
    entityId: 'bk-0012',
    linkUrl: '/rentals/BK-0012',
    isRead: false,
    readAt: null,
    createdAt: new Date(Date.now() - 7200000).toISOString(),
  },
]

let mockNotifications: AppNotification[] = [...INITIAL_MOCK_NOTIFICATIONS]

function mapDbRow(row: NotificationDbRow): AppNotification {
  const msg = row.message ?? row.body ?? ''
  return {
    id: row.id,
    clientUuid: row.client_uuid,
    notificationNo: row.notification_no,
    userId: row.user_id,
    recipientRole: row.recipient_role,
    type: row.type ?? 'general',
    title: row.title,
    message: msg,
    body: msg,
    channel: row.channel ?? 'In-App',
    severity: row.severity ?? 'Information',
    entityType: row.entity_type,
    entityId: row.entity_id,
    linkUrl: row.link_url,
    isRead: Boolean(row.is_read),
    readAt: row.read_at,
    createdAt: row.created_at,
  }
}

/**
 * Fetch notifications for current authenticated staff member from notifications_v.
 */
export async function fetchNotifications(options?: {
  unreadOnly?: boolean | undefined
  limit?: number | undefined
  userId?: string | undefined
}): Promise<AppNotification[]> {
  if (IS_MOCK) {
    let list = [...mockNotifications]
    if (options?.userId) {
      list = list.filter((n) => n.userId === options.userId)
    }
    if (options?.unreadOnly) {
      list = list.filter((n) => !n.isRead)
    }
    list.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    if (options?.limit && options.limit > 0) {
      list = list.slice(0, options.limit)
    }
    return list
  }

  let query = supabase
    .from('notifications_v')
    .select('*')
    .order('created_at', { ascending: false })

  if (options?.unreadOnly) {
    query = query.eq('is_read', false)
  }
  if (options?.limit && options.limit > 0) {
    query = query.limit(options.limit)
  }

  const { data, error } = await query

  if (error) {
    console.warn('Failed to fetch notifications_v:', error.message)
    return []
  }

  return ((data ?? []) as unknown as NotificationDbRow[]).map(mapDbRow)
}

/**
 * Get count of unread notifications for current user.
 */
export async function getUnreadNotificationCount(userId?: string | undefined): Promise<number> {
  if (IS_MOCK) {
    const list = userId
      ? mockNotifications.filter((n) => n.userId === userId && !n.isRead)
      : mockNotifications.filter((n) => !n.isRead)
    return list.length
  }

  try {
    if (!supabase || typeof supabase.from !== 'function') {
      return 0
    }
    const { count, error } = await supabase
      .from('notifications_v')
      .select('*', { count: 'exact', head: true })
      .eq('is_read', false)

    if (error) {
      console.warn('Failed to get unread notification count:', error.message)
      return 0
    }

    return count ?? 0
  } catch {
    return 0
  }
}

/**
 * Subscribe to realtime notification updates.
 * Returns unsubscribe callback.
 */
export function subscribeToNotificationChanges(
  callback: () => void,
  userId?: string | undefined,
): () => void {
  try {
    if (IS_MOCK || !supabase || typeof supabase.channel !== 'function') {
      return () => {}
    }

    const channel = supabase
      .channel(`realtime:notifications:${userId ?? 'all'}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'notifications' },
        () => {
          callback()
        },
      )
      .subscribe()

    return () => {
      try {
        if (typeof supabase.removeChannel === 'function') {
          void supabase.removeChannel(channel)
        }
      } catch {
        // ignore
      }
    }
  } catch {
    return () => {}
  }
}

/**
 * Mark a single notification as read.
 */
export async function markNotificationAsRead(id: string): Promise<AppNotification> {
  if (IS_MOCK) {
    const idx = mockNotifications.findIndex((n) => n.id === id)
    if (idx === -1) {
      throw new Error(`Notification ${id} not found`)
    }
    mockNotifications[idx] = {
      ...mockNotifications[idx]!,
      isRead: true,
      readAt: new Date().toISOString(),
    }
    const updated = mockNotifications[idx]!
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('babin:notifications-updated', { detail: { id, isRead: true } }))
    }
    return updated
  }

  const { data, error } = await supabase.rpc('mark_notification_read', {
    p_notification_id: id,
  })

  if (error) {
    throw new Error(`Failed to mark notification as read: ${error.message}`)
  }

  const res = mapDbRow(data as unknown as NotificationDbRow)
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('babin:notifications-updated', { detail: { id, isRead: true } }))
  }
  return res
}

/**
 * Mark all unread notifications as read for current user.
 */
export async function markAllNotificationsAsRead(): Promise<number> {
  if (IS_MOCK) {
    let count = 0
    mockNotifications = mockNotifications.map((n) => {
      if (!n.isRead) {
        count++
        return { ...n, isRead: true, readAt: new Date().toISOString() }
      }
      return n
    })
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('babin:notifications-updated', { detail: { allRead: true, count } }))
    }
    return count
  }

  const { data, error } = await supabase.rpc('mark_all_notifications_read')

  if (error) {
    throw new Error(`Failed to mark all notifications as read: ${error.message}`)
  }

  const count = typeof data === 'number' ? data : 0
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('babin:notifications-updated', { detail: { allRead: true, count } }))
  }
  return count
}

/**
 * Creates a notification for a specific recipient user.
 */
export async function createNotification(params: {
  recipientId: string
  type: string
  title: string
  body: string
  linkUrl?: string
  entityType?: string
  entityId?: string
  severity?: NotificationSeverity
  clientUuid?: string
}): Promise<AppNotification> {
  const clientUuid = params.clientUuid ?? crypto.randomUUID()
  const severity = params.severity ?? 'Information'

  if (IS_MOCK) {
    const newNotif: AppNotification = {
      id: `notif-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      clientUuid,
      notificationNo: `NOTIF-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${Math.floor(Math.random() * 10000)}`,
      userId: params.recipientId,
      recipientRole: null,
      type: params.type,
      title: params.title,
      message: params.body,
      body: params.body,
      channel: 'In-App',
      severity,
      entityType: params.entityType ?? null,
      entityId: params.entityId ?? null,
      linkUrl: params.linkUrl ?? null,
      isRead: false,
      readAt: null,
      createdAt: new Date().toISOString(),
    }
    mockNotifications.unshift(newNotif)
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('babin:notifications-updated', { detail: newNotif }))
    }
    return newNotif
  }

  const { data, error } = await supabase.rpc('create_notification', {
    p_client_uuid: clientUuid,
    p_user_id: params.recipientId,
    p_type: params.type,
    p_title: params.title,
    p_message: params.body,
    p_entity_type: params.entityType ?? null,
    p_entity_id: params.entityId ?? null,
    p_link_url: params.linkUrl ?? null,
    p_severity: severity,
  })

  if (error) {
    throw new Error(`Failed to create notification: ${error.message}`)
  }

  const res = mapDbRow(data as unknown as NotificationDbRow)
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('babin:notifications-updated', { detail: res }))
  }
  return res
}

/**
 * Broadcasts notification to all active staff with role-based Law 6 money filtering.
 */
export async function notifyStaff(params: {
  type: string
  title: string
  moneyMessage: string
  moneyBlindMessage: string
  linkUrl?: string
  entityType?: string
  entityId?: string
  severity?: NotificationSeverity
}): Promise<number> {
  if (IS_MOCK) {
    // In mock mode, synthesize for existing roles
    const accountsNotif: AppNotification = {
      id: `mock-notif-${Date.now()}-1`,
      clientUuid: crypto.randomUUID(),
      notificationNo: `NOTIF-${Date.now()}`,
      userId: '00000000-0000-4000-8000-00000000e006',
      recipientRole: 'Accounts',
      type: params.type,
      title: params.title,
      message: params.moneyMessage,
      body: params.moneyMessage,
      channel: 'In-App',
      severity: params.severity ?? 'Information',
      entityType: params.entityType ?? null,
      entityId: params.entityId ?? null,
      linkUrl: params.linkUrl ?? null,
      isRead: false,
      readAt: null,
      createdAt: new Date().toISOString(),
    }
    const warehouseNotif: AppNotification = {
      id: `mock-notif-${Date.now()}-2`,
      clientUuid: crypto.randomUUID(),
      notificationNo: `NOTIF-${Date.now() + 1}`,
      userId: '00000000-0000-4000-8000-00000000e005',
      recipientRole: 'Warehouse',
      type: params.type,
      title: params.title,
      message: params.moneyBlindMessage,
      body: params.moneyBlindMessage,
      channel: 'In-App',
      severity: params.severity ?? 'Information',
      entityType: params.entityType ?? null,
      entityId: params.entityId ?? null,
      linkUrl: params.linkUrl ?? null,
      isRead: false,
      readAt: null,
      createdAt: new Date().toISOString(),
    }
    mockNotifications.unshift(accountsNotif, warehouseNotif)
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('babin:notifications-updated'))
    }
    return 2
  }

  const { data, error } = await supabase.rpc('notify_staff', {
    p_type: params.type,
    p_title: params.title,
    p_message_money: params.moneyMessage,
    p_message_money_blind: params.moneyBlindMessage,
    p_link_url: params.linkUrl ?? null,
    p_entity_type: params.entityType ?? null,
    p_entity_id: params.entityId ?? null,
    p_severity: params.severity ?? 'Information',
  })

  if (error) {
    throw new Error(`Failed to broadcast notification: ${error.message}`)
  }

  const count = typeof data === 'number' ? data : 0
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('babin:notifications-updated'))
  }
  return count
}

/**
 * Returns a copy of current mock notifications for synchronous initial state.
 */
export function getMockNotifications(): AppNotification[] {
  return mockNotifications.map((n) => ({ ...n }))
}

/**
 * Resets in-memory mock notifications for test isolation.
 */
export function _resetMockNotifications(): void {
  mockNotifications = INITIAL_MOCK_NOTIFICATIONS.map((n) => ({ ...n }))
}
