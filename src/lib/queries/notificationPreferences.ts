import { supabase, IS_MOCK } from '../supabase'

export type NotificationCategory =
  | 'booking'
  | 'handover'
  | 'damage'
  | 'delivery'
  | 'payment'
  | 'digest'
  | 'general'

export interface NotificationPreference {
  category: NotificationCategory
  notificationType: string
  inAppEnabled: boolean
  emailEnabled: boolean
  isDefault: boolean
}

export type NotificationPreferenceItem = NotificationPreference

export interface NotificationCategoryMeta {
  category: NotificationCategory
  key: NotificationCategory
  title: string
  label: string
  description: string
  emailAllowed: boolean
  emailDefault: boolean
  inAppDefault: boolean
  moneySensitive?: boolean
}

export const NOTIFICATION_CATEGORIES: readonly NotificationCategoryMeta[] = [
  {
    category: 'booking',
    key: 'booking',
    title: 'Booking updates',
    label: 'Booking updates',
    description: 'Booking confirmations, extensions, schedule changes, and cancellations.',
    emailAllowed: true,
    emailDefault: false,
    inAppDefault: true,
    moneySensitive: false,
  },
  {
    category: 'handover',
    key: 'handover',
    title: 'Custody & gear handover',
    label: 'Custody & gear handover',
    description: 'Equipment pack checks, client pickups, returns, and turnaround alerts.',
    emailAllowed: true,
    emailDefault: false,
    inAppDefault: true,
    moneySensitive: false,
  },
  {
    category: 'damage',
    key: 'damage',
    title: 'Damage & inspection alerts',
    label: 'Damage & inspection alerts',
    description: 'Damage cases opened on return, QC inspection findings, and repair progress.',
    emailAllowed: true,
    emailDefault: false,
    inAppDefault: true,
    moneySensitive: false,
  },
  {
    category: 'delivery',
    key: 'delivery',
    title: 'Delivery & dispatch',
    label: 'Delivery & dispatch',
    description: 'Vehicle dispatches, zone deliveries, and rider tracking updates.',
    emailAllowed: true,
    emailDefault: false,
    inAppDefault: true,
    moneySensitive: false,
  },
  {
    category: 'payment',
    key: 'payment',
    title: 'Payment receipts',
    label: 'Payment receipts',
    description: 'Invoice settlements and payment confirmations. Money figures hidden for money-blind roles.',
    emailAllowed: true,
    emailDefault: false,
    inAppDefault: true,
    moneySensitive: true,
  },
  {
    category: 'digest',
    key: 'digest',
    title: 'Morning digest',
    label: 'Morning digest',
    description: 'One summary email each morning with today’s pick-ups, returns, and crew shifts (O-4).',
    emailAllowed: true,
    emailDefault: true,
    inAppDefault: true,
    moneySensitive: false,
  },
  {
    category: 'general',
    key: 'general',
    title: 'System announcements',
    label: 'System announcements',
    description: 'Workspace notices, shift notes, and emergency announcements.',
    emailAllowed: true,
    emailDefault: false,
    inAppDefault: true,
    moneySensitive: false,
  },
]

export const NOTIFICATION_CATEGORIES_META = NOTIFICATION_CATEGORIES

interface MockPreferenceRow {
  userId: string
  category: NotificationCategory
  inAppEnabled: boolean
  emailEnabled: boolean
}

let mockPreferencesStore: MockPreferenceRow[] = []

export function resetMockNotificationPreferences(): void {
  mockPreferencesStore = []
}

export function getMockNotificationPreferences(): MockPreferenceRow[] {
  return [...mockPreferencesStore]
}

interface RpcPreferenceItem {
  category: string
  notification_type: string
  in_app_enabled: boolean
  email_enabled: boolean
  is_default: boolean
}

interface RpcPreferencesResponse {
  user_id: string
  preferences: RpcPreferenceItem[]
}

/**
 * Fetch notification preferences for a user (or current user).
 * Falls back to 21 Jul lock defaults if no explicit preference row exists.
 */
export async function fetchNotificationPreferences(
  userId?: string | undefined,
): Promise<NotificationPreference[]> {
  if (IS_MOCK) {
    return NOTIFICATION_CATEGORIES.map((cat) => {
      const existing = mockPreferencesStore.find(
        (p) => (!userId || p.userId === userId) && p.category === cat.category,
      )
      if (existing) {
        return {
          category: cat.category,
          notificationType: cat.category,
          inAppEnabled: existing.inAppEnabled,
          emailEnabled: existing.emailEnabled,
          isDefault: false,
        }
      }
      return {
        category: cat.category,
        notificationType: cat.category,
        inAppEnabled: cat.inAppDefault,
        emailEnabled: cat.emailDefault,
        isDefault: true,
      }
    })
  }

  try {
    let res: { data: unknown; error: { message: string } | null }

    if (userId) {
      res = await supabase.rpc('get_user_notification_preferences', { p_user_id: userId })
    } else {
      res = await supabase.rpc('get_my_notification_preferences')
    }

    if (res.error) {
      console.warn('Failed to fetch notification preferences from RPC:', res.error.message)
      return getFallbackPreferences()
    }

    const payload = res.data as RpcPreferencesResponse | null
    if (!payload?.preferences || !Array.isArray(payload.preferences)) {
      return getFallbackPreferences()
    }

    return payload.preferences.map((p) => ({
      category: p.category as NotificationCategory,
      notificationType: p.notification_type,
      inAppEnabled: Boolean(p.in_app_enabled),
      emailEnabled: Boolean(p.email_enabled),
      isDefault: Boolean(p.is_default),
    }))
  } catch (err) {
    console.warn('Exception fetching notification preferences:', err)
    return getFallbackPreferences()
  }
}

/**
 * Save notification preference for a specific category.
 * Law 8: Generates client_uuid.
 * Dispatches 'babin:notification-preferences-updated'.
 */
export async function updateNotificationPreference(
  category: NotificationCategory,
  inApp: boolean,
  email: boolean,
  userId?: string | undefined,
): Promise<void> {
  const clientUuid = typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : '10000000-0000-4000-8000-' + Math.random().toString(16).slice(2, 14)

  if (IS_MOCK) {
    const effectiveUserId = userId ?? 'mock-user-current'
    const index = mockPreferencesStore.findIndex(
      (p) => p.userId === effectiveUserId && p.category === category,
    )
    if (index >= 0) {
      mockPreferencesStore[index] = {
        userId: effectiveUserId,
        category,
        inAppEnabled: inApp,
        emailEnabled: email,
      }
    } else {
      mockPreferencesStore.push({
        userId: effectiveUserId,
        category,
        inAppEnabled: inApp,
        emailEnabled: email,
      })
    }

    if (typeof window !== 'undefined') {
      window.dispatchEvent(
        new CustomEvent('babin:notification-preferences-updated', {
          detail: { category, inApp, email, userId: effectiveUserId },
        }),
      )
    }
    return
  }

  const effectiveUserId = userId ?? (await supabase.auth.getUser()).data.user?.id
  if (!effectiveUserId) {
    throw new Error('User ID required to update notification preferences')
  }

  const { error } = await supabase.rpc('set_notification_preference', {
    p_client_uuid: clientUuid,
    p_user_id: effectiveUserId,
    p_notification_type: category,
    p_in_app: inApp,
    p_email: email,
  })

  if (error) {
    throw new Error(error.message)
  }

  if (typeof window !== 'undefined') {
    window.dispatchEvent(
      new CustomEvent('babin:notification-preferences-updated', {
        detail: { category, inApp, email, userId: effectiveUserId },
      }),
    )
  }
}

function getFallbackPreferences(): NotificationPreference[] {
  return NOTIFICATION_CATEGORIES.map((cat) => ({
    category: cat.category,
    notificationType: cat.category,
    inAppEnabled: cat.inAppDefault,
    emailEnabled: cat.emailDefault,
    isDefault: true,
  }))
}
