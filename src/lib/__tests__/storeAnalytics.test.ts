// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import {
  sanitizeAnalyticsEvent,
  shouldEnableStoreAnalytics,
  trackStoreEvent,
  initStoreAnalyticsScripts,
  type AnalyticsEventData,
  type SanitizedAnalyticsPayload,
} from '../storeAnalytics'

describe('T7-16 Store Analytics (GA4 and Meta Pixel)', () => {
  beforeEach(() => {
    document.getElementById('ga4-script')?.remove()
    document.getElementById('meta-pixel-script')?.remove()
  })

  afterEach(() => {
    document.getElementById('ga4-script')?.remove()
    document.getElementById('meta-pixel-script')?.remove()
  })

  it('strips sensitive query params and PII from analytics events', () => {
    const rawEvent: AnalyticsEventData = {
      event: 'page_view',
      pagePath: '/catalogue/sony-fx3?email=client@test.com&ref=token123&phone=9800000000#hash',
    }
    const sanitized = sanitizeAnalyticsEvent(rawEvent)
    expect(sanitized.event).toBe('page_view')
    expect(sanitized.params.page_path).toBe('/catalogue/sony-fx3')
    expect(JSON.stringify(sanitized)).not.toContain('client@test.com')
    expect(JSON.stringify(sanitized)).not.toContain('token123')
    expect(JSON.stringify(sanitized)).not.toContain('9800000000')
  })

  it('formats view_item and add_to_request with item metadata and rupee values', () => {
    const itemEvent: AnalyticsEventData = {
      event: 'add_to_request',
      item: {
        itemId: 'prod-lens-24-70',
        itemName: 'Sony 24-70mm GM II',
        category: 'Lenses',
        valueNpr: 2500,
      },
    }
    const sanitized = sanitizeAnalyticsEvent(itemEvent)
    expect(sanitized.event).toBe('add_to_request')
    expect(sanitized.params.item_id).toBe('prod-lens-24-70')
    expect(sanitized.params.item_name).toBe('Sony 24-70mm GM II')
    expect(sanitized.params.item_category).toBe('Lenses')
    expect(sanitized.params.value).toBe(2500)
    expect(sanitized.params.currency).toBe('NPR')
  })

  it('formats payment_done with rupee amount but never booking numbers or client details', () => {
    const payEvent: AnalyticsEventData = {
      event: 'payment_done',
      valueNpr: 15000,
    }
    const sanitized = sanitizeAnalyticsEvent(payEvent)
    expect(sanitized.event).toBe('payment_done')
    expect(sanitized.params.value).toBe(15000)
    expect(sanitized.params.currency).toBe('NPR')
    expect(sanitized.params.booking_id).toBeUndefined()
    expect(sanitized.params.booking_no).toBeUndefined()
    expect(sanitized.params.client_id).toBeUndefined()
  })

  it('strictly blocks execution when called from within the staff app', () => {
    expect(shouldEnableStoreAnalytics(true)).toBe(false)
    expect(shouldEnableStoreAnalytics(false)).toBe(true)

    let dispatched = false
    const success = trackStoreEvent(
      { event: 'page_view', pagePath: '/today' },
      true, // isStaffApp: true
      () => {
        dispatched = true
      },
    )
    expect(success).toBe(false)
    expect(dispatched).toBe(false)
  })

  it('dispatches sanitized events when on the public booking store', () => {
    let captured: SanitizedAnalyticsPayload = { event: 'page_view', params: {} }
    const success = trackStoreEvent(
      { event: 'request_sent', valueNpr: 5000 },
      false, // isStaffApp: false
      (p) => {
        captured = p
      },
    )
    expect(success).toBe(true)
    expect(captured.event).toBe('request_sent')
    expect(captured.params.value).toBe(5000)
  })

  it('initStoreAnalyticsScripts strictly refuses staff app and does not inject DOM scripts', () => {
    const result = initStoreAnalyticsScripts(true)
    expect(result).toBe(false)
    expect(document.getElementById('ga4-script')).toBeNull()
    expect(document.getElementById('meta-pixel-script')).toBeNull()
  })

  it('initStoreAnalyticsScripts allows public booking app and handles script injection', () => {
    const result = initStoreAnalyticsScripts(false)
    expect(result).toBe(true)
  })

  it('proves the staff app (index.html, src/App.tsx, src/main.tsx) loads neither script', () => {
    const rootDir = path.resolve(__dirname, '../../..')
    const indexHtml = fs.readFileSync(path.join(rootDir, 'index.html'), 'utf8')
    const staffAppTsx = fs.readFileSync(path.join(rootDir, 'src/App.tsx'), 'utf8')
    const staffMainTsx = fs.readFileSync(path.join(rootDir, 'src/main.tsx'), 'utf8')

    // Staff app entry points must never contain GA4 or Meta Pixel scripts
    expect(indexHtml).not.toContain('googletagmanager.com')
    expect(indexHtml).not.toContain('connect.facebook.net')
    expect(indexHtml).not.toContain('gtag')
    expect(indexHtml).not.toContain('fbq')

    // Staff app code must never import or initialize storeAnalytics
    expect(staffAppTsx).not.toContain('storeAnalytics')
    expect(staffAppTsx).not.toContain('initStoreAnalyticsScripts')
    expect(staffMainTsx).not.toContain('storeAnalytics')
  })
})
