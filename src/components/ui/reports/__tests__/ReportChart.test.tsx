// @vitest-environment jsdom
import { act, cloneElement, type ReactElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ReportAreaChart, type ReportChartPoint } from '../ReportChart'

;(globalThis as Record<string, unknown>)['IS_REACT_ACT_ENVIRONMENT'] = true

// Only replace layout measurement: interaction and Tooltip use real Recharts v3.
vi.mock('recharts', async () => {
  const actual = await vi.importActual<typeof import('recharts')>('recharts')
  return { ...actual, ResponsiveContainer: ({ children }: { children: ReactElement<{ width?: number; height?: number }> }) => cloneElement(children, { width: 800, height: 280 }) }
})

const points: ReportChartPoint[] = [
  { periodKey: '2026-01', periodLabel: 'January 2026', value: 10_000_000, formattedValue: 'Rs 1,00,000' },
  { periodKey: '2026-02', periodLabel: 'February 2026', value: 20_000_000, formattedValue: 'Rs 2,00,000' },
]
let host: HTMLDivElement
let root: Root
async function render() {
  await act(async () => { root.render(<ReportAreaChart data={points} metricLabel="Taxable revenue" ariaLabel="Revenue chart" valueUnit="paisa" currency="NPR" />) })
}
function chart() { return host.querySelector('[role="group"]') as HTMLDivElement }
async function key(value: string) {
  await act(async () => { chart().dispatchEvent(new KeyboardEvent('keydown', { key: value, bubbles: true })); await new Promise(resolve => setTimeout(resolve, 20)) })
}

beforeEach(() => {
  host = document.createElement('div'); document.body.appendChild(host); root = createRoot(host)
})
afterEach(async () => { await act(async () => root.unmount()); host.remove() })

describe('ReportAreaChart real Recharts interaction', () => {
  it('uses rupee labels for integer paisa and keeps exact table values', async () => {
    await render()
    expect(host.textContent).toContain('Rs 1L')
    expect(host.textContent).not.toContain('Rs 1Cr')
    const tableButton = host.querySelector('button[aria-label="View report data as table"]') as HTMLButtonElement
    await act(async () => tableButton.click())
    expect(host.querySelector('table')?.textContent).toContain('Rs 1,00,000')
    expect(host.querySelector('table')?.textContent).toContain('Rs 2,00,000')
  })

  it('announces keyboard selection and dismisses the actual tooltip with Close and Escape', async () => {
    await render()
    await key('ArrowRight')
    expect(host.textContent).toContain('Selected January 2026: Rs 1,00,000')
    let close = host.querySelector('button[aria-label="Close tooltip"]') as HTMLButtonElement | null
    expect(close).not.toBeNull()
    expect(close?.style.minHeight).toBe('44px')
    expect(close?.style.minWidth).toBe('44px')
    await act(async () => close?.click())
    expect(host.querySelector('button[aria-label="Close tooltip"]')).toBeNull()
    expect(document.activeElement).toBe(chart())
    await key('End')
    expect(host.textContent).toContain('Selected February 2026: Rs 2,00,000')
    close = host.querySelector('button[aria-label="Close tooltip"]')
    expect(close).not.toBeNull()
    await key('Escape')
    expect(host.querySelector('button[aria-label="Close tooltip"]')).toBeNull()
  })

  it('selects pointer points through the supported v3 index and suppresses immediate reopen after dismissal', async () => {
    await render()
    const wrapper = host.querySelector('.recharts-wrapper') as HTMLDivElement
    wrapper.getBoundingClientRect = () => ({ x: 0, y: 0, left: 0, top: 0, right: 800, bottom: 280, width: 800, height: 280, toJSON: () => ({}) })
    Object.defineProperty(wrapper, 'offsetWidth', { configurable: true, value: 800 })
    const move = async () => { await act(async () => { wrapper.dispatchEvent(new MouseEvent('mousemove', { clientX: 200, clientY: 140, bubbles: true })); await new Promise(resolve => setTimeout(resolve, 20)) }) }
    await move()
    expect(host.textContent).toContain('Selected January 2026: Rs 1,00,000')
    const close = host.querySelector('button[aria-label="Close tooltip"]') as HTMLButtonElement
    await act(async () => close.click())
    await move()
    expect(host.querySelector('button[aria-label="Close tooltip"]')).toBeNull()
  })
})
