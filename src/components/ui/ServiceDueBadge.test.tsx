import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { ServiceDueBadge } from './ServiceDueBadge'
import type { ServiceRow } from '../../lib/serviceDue'

const dueRow: ServiceRow = {
  unitId: 'unit-1',
  productId: 'product-1',
  lastServiceAt: '2026-01-01',
  daysSinceService: 45,
  rentalDaysSinceService: 42,
  meterHoursSinceService: 0,
  dueAt: null,
  dueReason: 'usage',
  overdueDays: null,
  serviceIntervalDays: null,
  serviceIntervalRentalDays: 40,
  serviceIntervalMeterHours: null,
  serviceGraceDays: 0,
}

describe('ServiceDueBadge accessibility', () => {
  it('exposes the exact service reason and usage counter to assistive technology', () => {
    const html = renderToStaticMarkup(<ServiceDueBadge row={dueRow} />)
    expect(html).toContain('aria-label="Service due. Due — usage (42 of 40 rental days)"')
    expect(html).toContain('title="Due — usage (42 of 40 rental days)"')
    expect(html).toContain('Service due')
  })

  it('preserves the overdue warning in the accessible name', () => {
    const html = renderToStaticMarkup(<ServiceDueBadge row={{ ...dueRow, overdueDays: 12 }} />)
    expect(html).toContain('aria-label="Overdue by 12 days. Due — usage (42 of 40 rental days)"')
  })

  it('renders no warning when nothing is due', () => {
    expect(renderToStaticMarkup(<ServiceDueBadge row={{ ...dueRow, dueReason: null }} />)).toBe('')
    expect(renderToStaticMarkup(<ServiceDueBadge row={undefined} />)).toBe('')
  })
})
