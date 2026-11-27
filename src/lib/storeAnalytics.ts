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
  category?: string | undefined
  valueNpr?: number | undefined
}

export interface AnalyticsEventData {
  event: AnalyticsEventType
  pagePath?: string | undefined
  item?: AnalyticsItemPayload | undefined
  valueNpr?: number | undefined
  currency?: 'NPR' | undefined
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
 * Injects GA4 and Meta Pixel script tags lazily on the public booking app.
 * STRICT: Refuses execution if isStaffApp is true (Law 6, B37).
 */
export function initStoreAnalyticsScripts(isStaffApp = false): boolean {
  if (!shouldEnableStoreAnalytics(isStaffApp)) {
    return false
  }

  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return false
  }

  const ga4Id = import.meta.env.VITE_GA4_ID as string | undefined
  const metaPixelId = import.meta.env.VITE_META_PIXEL_ID as string | undefined

  type FbqFn = ((...args: unknown[]) => void) & {
    callMethod?: (...args: unknown[]) => void
    push?: unknown
    loaded?: boolean
    version?: string
    queue?: unknown[]
  }
  type AnalyticsWindow = Window & {
    dataLayer?: unknown[]
    gtag?: (...args: unknown[]) => void
    fbq?: FbqFn
    _fbq?: FbqFn
  }
  const win: AnalyticsWindow = window

  // Initialize GA4 if ID is configured
  if (ga4Id && !document.getElementById('ga4-script')) {
    const gaScript = document.createElement('script')
    gaScript.id = 'ga4-script'
    gaScript.async = true
    gaScript.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(ga4Id)}`
    document.head.appendChild(gaScript)

    win.dataLayer = win.dataLayer || []
    function gtag(...args: unknown[]) {
      win.dataLayer?.push(args)
    }
    win.gtag = gtag
    gtag('js', new Date())
    gtag('config', ga4Id, { send_page_view: false })
  }

  // Initialize Meta Pixel if ID is configured
  if (metaPixelId && !document.getElementById('meta-pixel-script')) {
    const pixelScript = document.createElement('script')
    pixelScript.id = 'meta-pixel-script'
    pixelScript.async = true
    pixelScript.src = 'https://connect.facebook.net/en_US/fbevents.js'
    document.head.appendChild(pixelScript)

    if (!win.fbq) {
      const fbq: FbqFn = function (...args: unknown[]) {
        if (fbq.callMethod) {
          fbq.callMethod(...args)
        } else {
          fbq.queue?.push(args)
        }
      }
      fbq.push = fbq
      fbq.loaded = true
      fbq.version = '2.0'
      fbq.queue = []
      win.fbq = fbq
      win._fbq = fbq
      fbq('init', metaPixelId)
    }
  }

  return true
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
    const win: Window & {
      gtag?: (command: string, eventName: string, params: Record<string, unknown>) => void
      fbq?: (command: string, eventName: string, params: Record<string, unknown>) => void
    } = window

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
