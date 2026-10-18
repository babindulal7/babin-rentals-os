// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { MultiSeriesTrend } from '../MultiSeriesTrend'
import { rupees } from '../../../../lib/money'
import type { ChartPoint, ChartSeriesSpec } from '../../../../lib/analytics/contracts'

;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

function renderComponent(ui: React.ReactElement) {
  const host = document.createElement('div')
  document.body.appendChild(host)
  const root = createRoot(host)
  act(() => {
    root.render(ui)
  })
  return {
    host,
    unmount: () => {
      act(() => root.unmount())
      host.remove()
    },
  }
}

const SAMPLE_SERIES: readonly ChartSeriesSpec[] = [
  { key: 'taxable', label: 'Taxable Revenue', unit: 'paisa', colorIndex: 0, kind: 'actual' },
  { key: 'vat', label: '13% VAT', unit: 'paisa', colorIndex: 1, kind: 'actual' },
  { key: 'invoices', label: 'Invoices', unit: 'count', colorIndex: 2, kind: 'actual' },
]

const SAMPLE_POINTS: readonly ChartPoint[] = [
  {
    periodKey: '2026-07',
    displayLabel: 'July 2026',
    series: { taxable: rupees(100000), vat: rupees(13000), invoices: 5 },
  },
  {
    periodKey: '2026-08',
    displayLabel: 'August 2026',
    series: { taxable: rupees(150000), vat: rupees(19500), invoices: 8 },
  },
  {
    periodKey: '2026-09',
    displayLabel: 'September 2026',
    series: { taxable: rupees(250000), vat: rupees(32500), invoices: 12 },
  },
]

describe('MultiSeriesTrend', () => {
  it('renders an empty state gracefully when points is empty', () => {
    const { host, unmount } = renderComponent(<MultiSeriesTrend points={[]} series={SAMPLE_SERIES} />)
    expect(host.textContent).toContain('No chart data available for the selected period.')
    unmount()
  })

  it('renders multiple series lines with CAT token colors', () => {
    const { host, unmount } = renderComponent(
      <MultiSeriesTrend points={SAMPLE_POINTS} series={SAMPLE_SERIES} title="Revenue & Tax Performance" />
    )

    // Title and summary present
    expect(host.textContent).toContain('Revenue & Tax Performance')
    expect(host.textContent).toContain('Showing 3 periods across 3 visible series')

    // 3 polylines for the 3 series
    const polylines = host.querySelectorAll('polyline')
    expect(polylines).toHaveLength(3)

    // Cat colors assigned
    expect(polylines[0]?.getAttribute('stroke')).toBe('var(--cat-1)')
    expect(polylines[1]?.getAttribute('stroke')).toBe('var(--cat-2)')
    expect(polylines[2]?.getAttribute('stroke')).toBe('var(--cat-3)')

    unmount()
  })

  it('synchronizes all series values when hovering or focusing a period', () => {
    const onActivate = vi.fn()
    const { host, unmount } = renderComponent(
      <MultiSeriesTrend points={SAMPLE_POINTS} series={SAMPLE_SERIES} onActivatePoint={onActivate} />
    )

    const circles = host.querySelectorAll<SVGCircleElement>('circle[tabindex="0"]')
    expect(circles.length).toBeGreaterThanOrEqual(3)

    // Focus on second period
    const secondPeriodCircle = circles[1]
    act(() => {
      secondPeriodCircle?.focus()
      secondPeriodCircle?.dispatchEvent(new FocusEvent('focus'))
    })

    // Header updates with second period label and all 3 series values
    expect(host.textContent).toContain('Period:')
    expect(host.textContent).toContain('August 2026')
    expect(host.textContent).toContain('Taxable Revenue:')
    expect(host.textContent).toContain('13% VAT:')
    expect(host.textContent).toContain('Invoices:')
    expect(host.textContent).toContain('8')

    unmount()
  })

  it('toggles series visibility on legend button click', () => {
    const { host, unmount } = renderComponent(
      <MultiSeriesTrend points={SAMPLE_POINTS} series={SAMPLE_SERIES} />
    )

    const legendButtons = host.querySelectorAll('div[role="group"] button')
    expect(legendButtons).toHaveLength(3)

    const vatButton = legendButtons[1]
    expect(vatButton?.textContent).toContain('13% VAT')

    // Click to toggle VAT series off
    act(() => {
      vatButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

    // VAT series polyline removed from plot
    expect(host.querySelectorAll('polyline')).toHaveLength(2)

    // VAT button shows line-through
    expect(vatButton?.getAttribute('aria-pressed')).toBe('false')

    // Click again to toggle back on
    act(() => {
      vatButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

    expect(host.querySelectorAll('polyline')).toHaveLength(3)
    expect(vatButton?.getAttribute('aria-pressed')).toBe('true')

    unmount()
  })

  it('navigates data points with keyboard arrow keys', () => {
    const { host, unmount } = renderComponent(
      <MultiSeriesTrend points={SAMPLE_POINTS} series={SAMPLE_SERIES} />
    )

    const circles = host.querySelectorAll<SVGCircleElement>('circle[tabindex="0"]')
    const firstCircle = circles[0]

    // Press ArrowRight
    act(() => {
      firstCircle?.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, cancelable: true })
      )
    })

    // Second month selected
    expect(host.textContent).toContain('August 2026')

    // Press End
    act(() => {
      firstCircle?.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'End', bubbles: true, cancelable: true })
      )
    })

    // Last month selected
    expect(host.textContent).toContain('September 2026')

    unmount()
  })

  it('renders accessible data table with headers and data for all series', () => {
    const { host, unmount } = renderComponent(
      <MultiSeriesTrend points={SAMPLE_POINTS} series={SAMPLE_SERIES} />
    )

    const table = host.querySelector('table')
    expect(table).not.toBeNull()

    const headers = Array.from(table?.querySelectorAll('th[scope="col"]') ?? []).map(th => th.textContent)
    expect(headers).toContain('Period')
    expect(headers).toContain('Taxable Revenue')
    expect(headers).toContain('13% VAT')
    expect(headers).toContain('Invoices')

    const rows = table?.querySelectorAll('tbody tr')
    expect(rows).toHaveLength(3)

    unmount()
  })
})
