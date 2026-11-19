import { describe, it, expect } from 'vitest'
import {
  sanitizeAnalyticsEvent,
  shouldEnableStoreAnalytics,
  trackStoreEvent,
  type AnalyticsEventData,
} from '../storeAnalytics'

describe('T7-16 Store Analytics (GA4 and Meta Pixel)', () => {
  it('strips sensitive query params and PII from analytics events', () => {
    const rawEvent: AnalyticsEventData = {
      event: 'page_view',
      pagePath: '/catalogue/sony-fx3?email=client@test.com&ref=token123#hash',
    }
    const sanitized = sanitizeAnalyticsEvent(rawEvent)
    expect(sanitized.event).toBe('page_view')
    expect(sanitized.params.page_path).toBe('/catalogue/sony-fx3')
    expect(JSON.stringify(sanitized)).not.toContain('client@test.com')
    expect(JSON.stringify(sanitized)).not.toContain('token123')
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
    let captured: any = null
    const success = trackStoreEvent(
      { event: 'request_sent', valueNpr: 5000 },
      false, // isStaffApp: false
      (p) => {
        captured = p
      },
    )
    expect(success).toBe(true)
    expect(captured?.event).toBe('request_sent')
    expect(captured?.params.value).toBe(5000)
  })
})
