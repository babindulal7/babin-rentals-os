import { describe, it, expect } from 'vitest'
import {
  clock,
  clockPad,
  grouped,
  rs,
  bsAdPair,
  deliveryTypeLabel,
  formatBookingNo,
  parseBookingNoSearch,
} from '../format'

describe('format helpers', () => {
  it('formats minutes since midnight as 12-hour clock and padded clock', () => {
    expect(clock(0)).toBe('12:00 AM')
    expect(clock(450)).toBe('7:30 AM')
    expect(clock(780)).toBe('1:00 PM')
    expect(clockPad(540)).toBe('09:00 AM')
  })

  it('formats South Asian lakh grouping and Rs prefix', () => {
    expect(grouped(999)).toBe('999')
    expect(grouped(185000)).toBe('1,85,000')
    expect(grouped(-1250000)).toBe('-12,50,000')
    expect(rs(185000)).toBe('Rs 1,85,000')
  })

  it('formats BS/AD pairs and enforces Law 17 Client Pickup label', () => {
    expect(bsAdPair(14, 'Kartik', 2083, '31 Oct')).toEqual({ bs: '14 Kartik', ad: '31 Oct' })
    expect(deliveryTypeLabel('Customer Pickup')).toBe('Client Pickup')
    expect(deliveryTypeLabel('Babin Delivery')).toBe('Babin Delivery')
    expect(deliveryTypeLabel(null)).toBe('—')
  })

  it('formats and parses booking numbers without breaking project searches', () => {
    expect(formatBookingNo('946')).toBe('#946')
    expect(formatBookingNo('#946')).toBe('#946')
    expect(formatBookingNo('')).toBe('—')

    expect(parseBookingNoSearch('#946')).toBe('946')
    expect(parseBookingNoSearch('BK-946')).toBe('946')
    expect(parseBookingNoSearch('B-946')).toBe('946')
    expect(parseBookingNoSearch('B-roll')).toBe('B-roll')
  })
})
