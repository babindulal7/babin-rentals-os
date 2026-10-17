// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import { AnalyticsKpiCard } from '../AnalyticsKpiCard'
import { rupees } from '../../../../lib/money'
import type { KpiViewModel } from '../../../../lib/analytics/contracts'

;(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true
let host: HTMLDivElement
let root: Root

beforeEach(() => {
  host = document.createElement('div')
  document.body.append(host)
  root = createRoot(host)
})

afterEach(() => {
  act(() => root.unmount())
  host.remove()
})

describe('AnalyticsKpiCard', () => {
  const baseModel: KpiViewModel = {
    id: 'kpi-revenue',
    label: 'Taxable Revenue',
    value: { kind: 'money', paisa: rupees(16000000), currency: 'NPR' },
    previous: { kind: 'money', paisa: rupees(12500000), currency: 'NPR' },
    comparisonLabel: 'vs prior month',
    definition: 'Issued nonvoid invoice taxable amounts before VAT',
    context: {
      fromAd: '2026-09-01',
      toAd: '2026-09-30',
      dateBasis: 'invoice-issue-month',
      provenance: 'actual',
      sourceLabel: 'Invoices table',
    },
    trend: [
      { period: 'Jul', value: 100 },
      { period: 'Aug', value: 125 },
      { period: 'Sep', value: 160 },
    ],
  }

  it('renders compact value and exposes exact value in aria-label and title', () => {
    act(() => {
      root.render(
        <MemoryRouter>
          <AnalyticsKpiCard model={baseModel} />
        </MemoryRouter>,
      )
    })

    expect(host.textContent).toContain('Taxable Revenue')
    expect(host.textContent).toContain('Rs 1.60 Cr')

    const card = host.querySelector('article')
    expect(card).not.toBeNull()
    expect(card?.getAttribute('aria-label')).toBe('Taxable Revenue: Rs 1,60,00,000')

    const valEl = host.querySelector('.analytics-kpi-card__value')
    expect(valEl?.getAttribute('title')).toBe('Rs 1,60,00,000')
  })

  it('renders delta percentage badge and comparison label', () => {
    act(() => {
      root.render(
        <MemoryRouter>
          <AnalyticsKpiCard model={baseModel} />
        </MemoryRouter>,
      )
    })

    expect(host.textContent).toContain('28.0%')
    expect(host.textContent).toContain('vs prior month')

    const deltaBadge = host.querySelector('.analytics-delta-badge--up')
    expect(deltaBadge).not.toBeNull()
  })

  it('renders drilldown Link when href is specified', () => {
    const modelWithHref: KpiViewModel = {
      ...baseModel,
      href: '/reports/revenue',
    }

    act(() => {
      root.render(
        <MemoryRouter>
          <AnalyticsKpiCard model={modelWithHref} />
        </MemoryRouter>,
      )
    })

    const link = host.querySelector('a')
    expect(link).not.toBeNull()
    expect(link?.getAttribute('href')).toBe('/reports/revenue')
    expect(link?.getAttribute('aria-label')).toBe(
      'View drilldown for Taxable Revenue, currently Rs 1,60,00,000',
    )
  })

  it('renders sparkline SVG with trajectory description', () => {
    act(() => {
      root.render(
        <MemoryRouter>
          <AnalyticsKpiCard model={baseModel} />
        </MemoryRouter>,
      )
    })

    const sparkSvg = host.querySelector('svg[aria-label*="Trend sparkline indicating upward trajectory"]')
    expect(sparkSvg).not.toBeNull()
  })

  it('handles null values as unavailable without crash or fake zero', () => {
    const nullModel: KpiViewModel = {
      ...baseModel,
      value: null,
      previous: null,
    }

    act(() => {
      root.render(
        <MemoryRouter>
          <AnalyticsKpiCard model={nullModel} />
        </MemoryRouter>,
      )
    })

    expect(host.textContent).toContain('—')
    const card = host.querySelector('article')
    expect(card?.getAttribute('aria-label')).toBe('Taxable Revenue: Unavailable')
  })
})
