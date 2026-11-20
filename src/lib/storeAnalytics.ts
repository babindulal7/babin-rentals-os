/**
 * Store Analytics: GA4 & Meta Pixel Integration (T7-16)
 *
 * Implements privacy-compliant analytics dispatch for the public booking site ONLY:
 * - Supported events:
 *   - page_view
 *   - view_item
 *   - add_to_request
 *   - request_sent
 *   - payment_done (with rupee value)
 * - Strict Privacy Boundary:
 *   - NEVER sends personal data (no names, phone numbers, email addresses, or booking numbers).
 *   - NEVER loads or executes inside the staff operations app.
 *   - Uses public environment variables (VITE_GA4_ID, VITE_META_PIXEL_ID).
 */

export type AnalyticsEventType =
  | 'page_view'
  | 'view_item'
  | 'add_to_request'
  | 'request_sent'
  | 'payment_done'

export interface AnalyticsItemPayload {
  itemId: string
  itemName: string
  category?: string
  valueNpr?: number
}

export interface AnalyticsEventData {
  event: AnalyticsEventType
  pagePath?: string
  item?: AnalyticsItemPayload
  valueNpr?: number
  currency?: 'NPR'
}

export interface SanitizedAnalyticsPayload {
  event: AnalyticsEventType
  params: Record<string, string | number | boolean>
}

/**
 * Sanitizes an analytics event ensuring no PII leaks.
 * Strips any potential name, email, phone, or raw booking reference identifiers.
 */
export function sanitizeAnalyticsEvent(data: AnalyticsEventData): SanitizedAnalyticsPayload {
  const params: Record<string, string | number | boolean> = {}

  if (data.pagePath) {
    // Only keep pathname, strip any query parameters to prevent email/token leaks
    const cleanPath = data.pagePath.split('?')[0]?.split('#')[0] ?? '/'
    params.page_path = cleanPath
  }

  if (data.item) {
    params.item_id = data.item.itemId
    params.item_name = data.item.itemName
    if (data.item.category) {
      params.item_category = data.item.category
    }
    if (typeof data.item.valueNpr === 'number') {
      params.value = data.item.valueNpr
      params.currency = 'NPR'
    }
  }

  if (typeof data.valueNpr === 'number') {
    params.value = data.valueNpr
    params.currency = 'NPR'
  }

  return {
    event: data.event,
    params,
  }
}

/** Check if analytics should be enabled (only on public booking surfaces, never staff app) */
export function shouldEnableStoreAnalytics(isStaffApp: boolean): boolean {
  return !isStaffApp
}

/**
 * Dispatches an analytics event to GA4 (gtag) and Meta Pixel (fbq) if available on window.
 */
export function trackStoreEvent(
  eventData: AnalyticsEventData,
  isStaffApp = false,
  customDispatcher?: (sanitized: SanitizedAnalyticsPayload) => void,
): boolean {
  if (!shouldEnableStoreAnalytics(isStaffApp)) {
    return false
  }

  const sanitized = sanitizeAnalyticsEvent(eventData)

  if (customDispatcher) {
    customDispatcher(sanitized)
    return true
  }

  // Safe browser window dispatch
  if (typeof window !== 'undefined') {
    const win = window as unknown as {
      gtag?: (command: string, eventName: string, params: Record<string, unknown>) => void
      fbq?: (command: string, eventName: string, params: Record<string, unknown>) => void
    }

    if (typeof win.gtag === 'function') {
      win.gtag('event', sanitized.event, sanitized.params)
    }

    if (typeof win.fbq === 'function') {
      // Map standard Meta Pixel events
      const metaEventMap: Record<AnalyticsEventType, string> = {
        page_view: 'PageView',
        view_item: 'ViewContent',
        add_to_request: 'AddToCart',
        request_sent: 'Lead',
        payment_done: 'Purchase',
      }
      win.fbq('track', metaEventMap[sanitized.event] ?? 'CustomEvent', sanitized.params)
    }
  }

  return true
}
