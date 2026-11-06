/**
 * Web Push and Phone Pop-up Notifications (T5-09, W38, W39, W62)
 *
 * Implements client-side Web Push subscription registration, device detection,
 * notification permission management, and event handling.
 *
 * Rulings:
 *   - W62: Pop-up alerts on staff phones (iPhone, Android) and iPad for 4 events:
 *       1. late return (at 30 min, to all staff on shift at once — W38, W39)
 *       2. new online booking request
 *       3. online payment received
 *       4. damage found
 *   - Law 6: Zero figures for money-blind roles (Warehouse, Technician, Driver, Client).
 *   - Law 3: Hard delete forbidden; soft deactivate via is_active = false.
 *   - Law 8: client_uuid on all writes.
 */

import { supabase } from './supabase'
import { generateClientUuid } from './dataAccess'
import { canViewMoney } from './rbac'
import type { SystemRole } from '../types/database'
import { formatMoney, rupees } from './money'

export type PushEventType =
  | 'late_return'
  | 'new_online_request'
  | 'payment_received'
  | 'damage_found'

export interface PushNotificationPayload {
  title: string
  body: string
  link_url: string
  tag?: string
  severity?: 'Information' | 'Warning' | 'Critical'
}

export interface PushSubscriptionRecord {
  id: string
  endpoint: string
  deviceLabel: string | null
  userAgent: string | null
  isActive: boolean
  lastSeenAt: string
}

export interface PushNotificationItem {
  subscriptionId: string
  userId: string
  userRole: string
  endpoint: string
  p256dh: string
  auth: string
  title: string
  body: string
  linkUrl: string
  tag: string
  severity: 'Information' | 'Warning' | 'Urgent'
}

/** Check if Web Push and Service Workers are supported in current environment. */
export function isPushSupported(): boolean {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') return false
  return (
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window
  )
}

/** Check if VAPID public key and push backend infrastructure are configured. */
export function isVapidConfigured(): boolean {
  if (import.meta.env.VITE_DATA_SOURCE === 'mock') return true
  const key = import.meta.env.VITE_VAPID_PUBLIC_KEY
  return Boolean(key && key.trim().length > 0)
}

/** Retrieve active browser PushSubscription if one exists on this device. */
export async function getActiveDeviceSubscription(): Promise<{ endpoint: string; p256dh: string; auth: string } | null> {
  if (!isPushSupported()) return null
  try {
    const registration = await navigator.serviceWorker.ready
    const sub = await registration.pushManager?.getSubscription()
    if (!sub) return null
    const rawKey = sub.getKey('p256dh')
    const rawAuth = sub.getKey('auth')
    const p256dh = rawKey ? btoa(String.fromCharCode(...new Uint8Array(rawKey))) : ''
    const auth = rawAuth ? btoa(String.fromCharCode(...new Uint8Array(rawAuth))) : ''
    return {
      endpoint: sub.endpoint,
      p256dh,
      auth,
    }
  } catch {
    return null
  }
}

/** Check notification permission status. */
export function getNotificationPermission(): NotificationPermission | 'unsupported' {
  if (typeof window === 'undefined' || !('Notification' in window)) {
    return 'unsupported'
  }
  return Notification.permission
}

/** Request notification permission from the user. */
export async function requestNotificationPermission(): Promise<NotificationPermission> {
  if (typeof window === 'undefined' || !('Notification' in window)) {
    return 'denied'
  }
  return await Notification.requestPermission()
}

export const requestPushPermission = requestNotificationPermission

/** Detect human-friendly device label from user agent. */
export function getDeviceLabel(customUa?: string): string {
  const ua = customUa ?? (typeof navigator !== 'undefined' ? navigator.userAgent : '')
  if (!ua) return 'Desktop Client'
  if (/iPad/i.test(ua)) return 'iPad Pro'
  if (/iPhone/i.test(ua)) return 'iPhone'
  if (/Android.*Mobile/i.test(ua)) return 'Android Phone'
  if (/Android/i.test(ua)) return 'Android Tablet'
  if (/Macintosh/i.test(ua)) return 'Mac Desktop'
  if (/Windows/i.test(ua)) return 'Windows Desktop'
  if (/Linux/i.test(ua)) return 'Linux Desktop'
  return 'Desktop Client'
}

export const detectDeviceLabel = getDeviceLabel

/** Helper to convert VAPID base64 public key to Uint8Array for PushManager */
export function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const rawData = atob(base64)
  const outputArray = new Uint8Array(rawData.length)
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i)
  }
  return outputArray
}

// -----------------------------------------------------------------------------
// In-Memory Mock Store (for tests & mock mode)
// -----------------------------------------------------------------------------
export interface MockPushRecord {
  id: string
  clientUuid: string
  userId: string
  userRole: string
  endpoint: string
  p256dh: string
  auth: string
  deviceLabel: string
  isActive: boolean
  lastSeenAt: string
}

let mockSubscriptions: MockPushRecord[] = [
  {
    id: 'push-sub-001',
    clientUuid: '11111111-0005-4000-8000-000000000001',
    userId: '00000000-0000-0000-0000-000000000001',
    userRole: 'Owner',
    endpoint: 'https://push.example.com/sub/owner-iphone-17',
    p256dh: 'mock-p256dh-owner',
    auth: 'mock-auth-owner',
    deviceLabel: 'iPhone 17 Pro (Babin)',
    isActive: true,
    lastSeenAt: new Date().toISOString(),
  },
  {
    id: 'push-sub-002',
    clientUuid: '11111111-0005-4000-8000-000000000002',
    userId: '00000000-0000-0000-0000-000000000005',
    userRole: 'Warehouse',
    endpoint: 'https://push.example.com/sub/warehouse-floor',
    p256dh: 'mock-p256dh-warehouse',
    auth: 'mock-auth-warehouse',
    deviceLabel: 'Galaxy XCover (Floor)',
    isActive: true,
    lastSeenAt: new Date().toISOString(),
  },
]

export function _resetMockPushStore(initial?: MockPushRecord[]): void {
  mockSubscriptions = initial ? [...initial] : []
}

export function _getMockPushSubscriptions(): MockPushRecord[] {
  return [...mockSubscriptions]
}

/**
 * Pure function: formats push notification title, body, and URL per event & role.
 * Law 6: Zero money in body for Warehouse, Technician, Driver, and Client.
 */
export function formatPushNotificationForRole(
  eventType: PushEventType,
  payload: Record<string, unknown>,
  role: string,
): { title: string; body: string; linkUrl: string; tag: string } {
  const isBlind = !canViewMoney(role as SystemRole)
  const bookingNo = String(payload.booking_no || payload.bookingNo || 'Booking')
  const bookingId = String(payload.booking_id || payload.bookingId || '')

  switch (eventType) {
    case 'late_return': {
      const outstandingPaisa = Number(payload.outstanding_paisa ?? payload.outstandingPaisa ?? 0)
      const body = isBlind || outstandingPaisa <= 0
        ? `Booking ${bookingNo} is 30m overdue for return. Check counter.`
        : `Booking ${bookingNo} is 30m overdue for return. Balance owed: ${formatMoney(rupees(outstandingPaisa / 100))}.`

      return {
        title: `Late return: ${bookingNo}`,
        body,
        linkUrl: bookingId ? `/rentals/${bookingId}` : '/rentals',
        tag: `late-return-${bookingId || 'alert'}`,
      }
    }

    case 'new_online_request': {
      const clientName = String(payload.client_name || payload.clientName || 'Client')
      const totalPaisa = Number(payload.total_paisa ?? payload.totalPaisa ?? 0)
      const itemCount = payload.item_count ?? payload.itemCount

      const body = isBlind || totalPaisa <= 0
        ? `New request from ${clientName}${itemCount ? ` for ${itemCount} items` : ''}.`
        : `New request from ${clientName} (${formatMoney(rupees(totalPaisa / 100))}).`

      return {
        title: 'New online booking request',
        body,
        linkUrl: bookingId ? `/rentals/${bookingId}` : '/rentals',
        tag: `new-request-${bookingId || 'alert'}`,
      }
    }

    case 'payment_received': {
      const amountPaisa = Number(payload.amount_paisa ?? payload.amountPaisa ?? 0)
      const body = isBlind
        ? `Payment received for booking ${bookingNo}.`
        : `Payment received: ${formatMoney(rupees(amountPaisa / 100))} for ${bookingNo}.`

      return {
        title: 'Online payment received',
        body,
        linkUrl: '/finance/payments',
        tag: `payment-${payload.payment_id || bookingId || 'alert'}`,
      }
    }

    case 'damage_found': {
      const itemName = String(payload.item_name || payload.itemName || 'gear')
      const description = String(payload.description || 'Issue flagged for inspection')
      const findingId = String(payload.finding_id || payload.findingId || '')

      return {
        title: 'Damage reported',
        body: `Damage reported on ${itemName}: ${description}.`,
        linkUrl: findingId ? `/inventory/damage/${findingId}` : '/inventory',
        tag: `damage-${findingId || 'alert'}`,
      }
    }
  }
}

/**
 * Register a push subscription for the signed-in user in the database or mock store.
 */
export async function registerPushSubscription(params: {
  endpoint: string
  p256dh: string
  auth: string
  deviceLabel?: string
  userAgent?: string
  clientUuid?: string
}): Promise<{ success: boolean; id?: string }> {
  const clientUuid = params.clientUuid || generateClientUuid()
  const deviceLabel = params.deviceLabel || getDeviceLabel(params.userAgent)
  const userAgent = params.userAgent || (typeof navigator !== 'undefined' ? navigator.userAgent : null)

  const isMock = import.meta.env.VITE_DATA_SOURCE === 'mock' || !supabase
  if (isMock) {
    const existingIdx = mockSubscriptions.findIndex((s) => s.endpoint === params.endpoint)
    const record: MockPushRecord = {
      id: existingIdx >= 0 ? mockSubscriptions[existingIdx]!.id : `push-sub-${Date.now()}`,
      clientUuid,
      userId: 'mock-current-user',
      userRole: 'Owner',
      endpoint: params.endpoint,
      p256dh: params.p256dh,
      auth: params.auth,
      deviceLabel,
      isActive: true,
      lastSeenAt: new Date().toISOString(),
    }

    if (existingIdx >= 0) {
      mockSubscriptions[existingIdx] = record
    } else {
      mockSubscriptions.push(record)
    }
    return { success: true, id: record.id }
  }

  const { data, error } = await supabase.rpc('register_push_subscription', {
    p_client_uuid: clientUuid,
    p_endpoint: params.endpoint,
    p_p256dh: params.p256dh,
    p_auth: params.auth,
    p_device_label: deviceLabel,
    p_user_agent: userAgent,
  })

  if (error) {
    throw new Error(`Failed to register push subscription: ${error.message}`)
  }

  const returnedId = (data as { id?: string } | null)?.id
  return { success: true, ...(returnedId ? { id: returnedId } : {}) }
}

/**
 * Deactivate a push subscription (soft unregister, Law 3).
 */
export async function unregisterPushSubscription(endpoint: string): Promise<boolean> {
  const isMock = import.meta.env.VITE_DATA_SOURCE === 'mock' || !supabase
  if (isMock) {
    const item = mockSubscriptions.find((s) => s.endpoint === endpoint)
    if (item) {
      item.isActive = false
      return true
    }
    return false
  }

  const { data, error } = await supabase.rpc('unregister_push_subscription', {
    p_endpoint: endpoint,
  })

  if (error) {
    throw new Error(`Failed to unregister push subscription: ${error.message}`)
  }

  return Boolean(data)
}

/**
 * Fetch staff member's registered push subscriptions from the view.
 */
export async function fetchUserPushSubscriptions(): Promise<PushSubscriptionRecord[]> {
  const isMock = import.meta.env.VITE_DATA_SOURCE === 'mock' || !supabase
  if (isMock) {
    return mockSubscriptions
      .filter((s) => s.isActive)
      .map((s) => ({
        id: s.id,
        endpoint: s.endpoint,
        deviceLabel: s.deviceLabel,
        userAgent: null,
        isActive: s.isActive,
        lastSeenAt: s.lastSeenAt,
      }))
  }

  const { data, error } = await supabase
    .from('push_subscriptions_v')
    .select('id, endpoint, device_label, user_agent, is_active, last_seen_at')
    .eq('is_active', true)
    .order('last_seen_at', { ascending: false })

  if (error) {
    throw new Error(`Failed to fetch push subscriptions: ${error.message}`)
  }

  return (data || []).map((row) => ({
    id: row.id,
    endpoint: row.endpoint,
    deviceLabel: row.device_label,
    userAgent: row.user_agent,
    isActive: row.is_active,
    lastSeenAt: row.last_seen_at,
  }))
}

/**
 * Retrieves push notifications to send for a given event and payload.
 */
export async function getPushNotificationsForEvent(
  eventType: PushEventType,
  payload: Record<string, unknown>,
): Promise<PushNotificationItem[]> {
  const isMock = import.meta.env.VITE_DATA_SOURCE === 'mock' || !supabase

  if (isMock) {
    return mockSubscriptions
      .filter((sub) => sub.isActive)
      .map((sub) => {
        const formatted = formatPushNotificationForRole(eventType, payload, sub.userRole)
        return {
          subscriptionId: sub.id,
          userId: sub.userId,
          userRole: sub.userRole,
          endpoint: sub.endpoint,
          p256dh: sub.p256dh,
          auth: sub.auth,
          title: formatted.title,
          body: formatted.body,
          linkUrl: formatted.linkUrl,
          tag: formatted.tag,
          severity: (eventType === 'late_return' || eventType === 'damage_found' ? 'Warning' : 'Information') as 'Information' | 'Warning' | 'Urgent',
        }
      })
  }

  interface PushNotificationRpcRow {
    subscription_id: string
    user_id: string
    user_role: string
    endpoint: string
    p256dh: string
    auth: string
    title: string
    body: string
    link_url: string
    tag: string
    severity: 'Information' | 'Warning' | 'Urgent'
  }

  const { data, error } = await supabase.rpc('get_push_notifications_for_event', {
    p_event_type: eventType,
    p_payload: payload,
  })

  if (error) {
    throw new Error(`Failed to get push notifications: ${error.message}`)
  }

  return ((data as PushNotificationRpcRow[] | null) || []).map((row) => ({
    subscriptionId: row.subscription_id,
    userId: row.user_id,
    userRole: row.user_role,
    endpoint: row.endpoint,
    p256dh: row.p256dh,
    auth: row.auth,
    title: row.title,
    body: row.body,
    linkUrl: row.link_url,
    tag: row.tag,
    severity: row.severity,
  }))
}

/**
 * Subscribe current browser session to Web Push and save to database.
 */
export async function subscribeCurrentDevice(vapidPublicKey?: string): Promise<boolean> {
  if (!isPushSupported()) {
    throw new Error('Push notifications are not supported on this browser or platform.')
  }

  const permission = await requestNotificationPermission()
  if (permission !== 'granted') {
    throw new Error('Notification permission was not granted by the user.')
  }

  const registration = await navigator.serviceWorker.ready
  if (!registration.pushManager) {
    throw new Error('PushManager not available on service worker registration.')
  }

  const existingSub = await registration.pushManager.getSubscription()
  if (existingSub) {
    const rawKey = existingSub.getKey('p256dh')
    const rawAuth = existingSub.getKey('auth')
    const p256dh = rawKey ? btoa(String.fromCharCode(...new Uint8Array(rawKey))) : ''
    const auth = rawAuth ? btoa(String.fromCharCode(...new Uint8Array(rawAuth))) : ''

    await registerPushSubscription({
      endpoint: existingSub.endpoint,
      p256dh,
      auth,
      deviceLabel: getDeviceLabel(),
    })
    return true
  }

  const key =
    vapidPublicKey ||
    import.meta.env.VITE_VAPID_PUBLIC_KEY ||
    (import.meta.env.VITE_DATA_SOURCE === 'mock'
      ? 'BEl62iUYgUivxIkv69yViEuiBIa-Ib9-SkvMeAtA3LFgDzkrxZJjSgSnfckjBJuBkr3qBUYIHBQFLXYp5Nksh8U'
      : '')

  if (!key) {
    throw new Error('Push not configured: missing VAPID public key.')
  }

  const sub = await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(key) as unknown as BufferSource,
  })

  const rawKey = sub.getKey('p256dh')
  const rawAuth = sub.getKey('auth')
  const p256dh = rawKey ? btoa(String.fromCharCode(...new Uint8Array(rawKey))) : ''
  const auth = rawAuth ? btoa(String.fromCharCode(...new Uint8Array(rawAuth))) : ''

  await registerPushSubscription({
    endpoint: sub.endpoint,
    p256dh,
    auth,
    deviceLabel: getDeviceLabel(),
  })

  return true
}

/**
 * Unsubscribe current browser session from Web Push and deactivate in database.
 */
export async function unsubscribeCurrentDevice(): Promise<boolean> {
  if (!isPushSupported()) return true

  const registration = await navigator.serviceWorker.ready
  const sub = await registration.pushManager.getSubscription()
  if (sub) {
    await unregisterPushSubscription(sub.endpoint)
    await sub.unsubscribe()
  }
  return true
}
