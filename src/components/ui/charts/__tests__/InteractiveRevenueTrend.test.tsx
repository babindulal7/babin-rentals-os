// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { InteractiveRevenueTrend } from '../InteractiveRevenueTrend'
import { rupees } from '../../../../lib/money'
import type { RevenueMonth } from '../../../../lib/intel/revenueTrend'

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

const SAMPLE_MONTHS: readonly RevenueMonth[] = [
  { periodStartUtc: '2026-07-01T00:00:00.000Z', label: '2026-07', amountPaisa: rupees(100000), invoiceCount: 5 },
  { periodStartUtc: '2026-08-01T00:00:00.000Z', label: '2026-08', amountPaisa: rupees(150000), invoiceCount: 8 },
  { periodStartUtc: '2026-09-01T00:00:00.000Z', label: '2026-09', amountPaisa: rupees(250000), invoiceCount: 12 },
]

describe('InteractiveRevenueTrend', () => {
  it('renders an empty state gracefully when months is empty', () => {
    const { host, unmount } = renderComponent(<InteractiveRevenueTrend months={[]} />)
    expect(host.textContent).toContain('No recorded invoices in this period.')
    unmount()
  })

  it('renders the SVG chart with points, gradient, and period total', () => {
    const { host, unmount } = renderComponent(<InteractiveRevenueTrend months={SAMPLE_MONTHS} />)

    // Period total displayed initially
    expect(host.textContent).toContain('Period Total:')
    expect(host.textContent).toContain('25 invoices across 3 calendar months')

    // SVG elements present
    const svg = host.querySelector('svg')
    expect(svg).not.null
    expect(svg?.getAttribute('aria-label')).toContain('Issued taxable revenue by AD month')

    // Point circles
    const circles = host.querySelectorAll('circle[tabindex="0"]')
    expect(circles).toHaveLength(3)

    // First circle aria label
    expect(circles[0]?.getAttribute('aria-label')).toContain('2026-07')
    expect(circles[0]?.getAttribute('aria-label')).toContain('5 invoices')

    unmount()
  })

  it('updates synchronized details on circle focus and click', () => {
    const onActivate = vi.fn()
    const { host, unmount } = renderComponent(
      <InteractiveRevenueTrend months={SAMPLE_MONTHS} onActivate={onActivate} />
    )

    const circles = host.querySelectorAll<SVGCircleElement>('circle[tabindex="0"]')
    const secondCircle = circles[1]
    expect(secondCircle).not.undefined

    // Focus second circle
    act(() => {
      secondCircle?.focus()
      secondCircle?.dispatchEvent(new FocusEvent('focus'))
    })

    // Headline now shows second month
    expect(host.textContent).toContain('Month:')
    expect(host.textContent).toContain('2026-08')
    expect(host.textContent).toContain('8 issued invoices')
    expect(host.textContent).toContain('30.0% of window')

    unmount()
  })

  it('navigates through data points using keyboard arrow keys', () => {
    const { host, unmount } = renderComponent(<InteractiveRevenueTrend months={SAMPLE_MONTHS} />)

    const circles = host.querySelectorAll<SVGCircleElement>('circle[tabindex="0"]')
    const firstCircle = circles[0]

    // Press ArrowRight on first circle
    act(() => {
      firstCircle?.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, cancelable: true })
      )
    })

    // Now second month is selected
    expect(host.textContent).toContain('2026-08')

    // Press End key
    act(() => {
      firstCircle?.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'End', bubbles: true, cancelable: true })
      )
    })

    // Last month selected
    expect(host.textContent).toContain('2026-09')

    unmount()
  })

  it('includes accessible data table in details with all rows', () => {
    const { host, unmount } = renderComponent(<InteractiveRevenueTrend months={SAMPLE_MONTHS} />)

    const table = host.querySelector('table')
    expect(table).not.null

    const rows = table?.querySelectorAll('tbody tr')
    expect(rows).toHaveLength(3)
    expect(rows?.[0]?.textContent).toContain('2026-07')
    expect(rows?.[1]?.textContent).toContain('2026-08')
    expect(rows?.[2]?.textContent).toContain('2026-09')

    unmount()
  })

  it('locks selection on tap/click and unlocks on clear button', () => {
    const { host, unmount } = renderComponent(<InteractiveRevenueTrend months={SAMPLE_MONTHS} />)

    const circles = host.querySelectorAll<SVGCircleElement>('circle[tabindex="0"]')
    const firstCircle = circles[0]

    // Click first circle to lock
    act(() => {
      firstCircle?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

    // Lock button should appear
    const clearButton = host.querySelector('button')
    expect(clearButton).not.null
    expect(clearButton?.textContent).toBe('Clear lock')

    // Click clear lock
    act(() => {
      clearButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

    // Back to period summary
    expect(host.textContent).toContain('Period Total:')

    unmount()
  })
})
