// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { InteractiveTrendChart, type TrendPoint, type TrendSeries } from '../charts/InteractiveTrendChart'

;(globalThis as Record<string, unknown>)['IS_REACT_ACT_ENVIRONMENT'] = true

const points: TrendPoint[] = [
  { key: '2026-08', axisLabel: 'Aug 2026', longLabel: 'August 2026' },
  { key: '2026-09', axisLabel: 'Sep 2026', longLabel: 'September 2026' },
  { key: '2026-10', axisLabel: 'Oct 2026', longLabel: '1–14 October 2026 (month to date)' },
]

const series: TrendSeries[] = [
  { key: 'current', label: 'Billed revenue', status: 'actual', values: [100, 250, null] },
  { key: 'previous', label: 'Previous period', status: 'actual', values: [80, 0, 40], slot: 1, marker: 'square' },
]

const fmt = (v: number) => `Rs ${v}`

let container: HTMLDivElement
let root: Root
let observedWidth = 0

class FakeResizeObserver {
  constructor(private cb: (entries: Array<{ contentRect: { width: number } }>) => void) {}
  observe() {
    if (observedWidth > 0) this.cb([{ contentRect: { width: observedWidth } }])
  }
  disconnect() {}
}

function render(extra: Partial<Parameters<typeof InteractiveTrendChart>[0]> = {}) {
  act(() => {
    root.render(<InteractiveTrendChart title="Billed revenue by month" points={points} series={series} formatValue={fmt} formatTick={fmt} {...extra} />)
  })
}

const chart = () => container.querySelector('[aria-roledescription="interactive chart"]') as HTMLDivElement
const key = (k: string) => act(() => { chart().dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true })) })
const column = (i: number) => container.querySelector(`rect[data-point="${i}"]`) as SVGRectElement
const readout = () => container.querySelector('[data-testid="trend-readout"]')?.textContent ?? null

beforeEach(() => {
  observedWidth = 0
  vi.stubGlobal('ResizeObserver', FakeResizeObserver)
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
})

afterEach(() => {
  act(() => root.unmount())
  container.remove()
  vi.unstubAllGlobals()
})

describe('InteractiveTrendChart', () => {
  it('names every series and its data status in words, not colour', () => {
    render()
    const legend = container.querySelector('ul[aria-label="Series"]')!.textContent
    expect(legend).toContain('Billed revenue')
    expect(legend).toContain('Previous period')
    expect(legend!.match(/Actual/g)).toHaveLength(2)
  })

  it('is one tab stop with an accessible name and instructions', () => {
    render()
    expect(chart().tabIndex).toBe(0)
    expect(chart().getAttribute('aria-label')).toMatch(/3 periods.*arrow keys/)
  })

  it('moves between periods with the arrow keys, Home and End, and Esc clears', () => {
    render()
    key('ArrowRight')
    expect(readout()).toMatch(/^August 2026\. Billed revenue \(Actual\): Rs 100\. Previous period \(Actual\): Rs 80\./)
    key('ArrowRight')
    expect(readout()).toMatch(/^September 2026/)
    key('End')
    expect(readout()).toMatch(/month to date/)
    key('ArrowRight')
    expect(readout()).toMatch(/month to date/) // clamped at the last period
    key('Home')
    expect(readout()).toMatch(/^August 2026/)
    key('Escape')
    expect(readout()).toBeNull()
  })

  it('reads a missing value as "No value", never as zero — and a real zero as zero', () => {
    render()
    key('End')
    expect(readout()).toContain('Billed revenue (Actual): No value')
    key('ArrowLeft')
    expect(readout()).toContain('Previous period (Actual): Rs 0')
  })

  it('leaves a gap in the line for a missing value', () => {
    render()
    const path = container.querySelectorAll('path')[0]!.getAttribute('d')!
    expect(path.match(/[ML]/g)).toEqual(['M', 'L']) // two points drawn, the null is not
  })

  it('activates only when the page provides a destination', () => {
    const onActivate = vi.fn()
    render()
    key('ArrowRight')
    key('Enter')
    expect(onActivate).not.toHaveBeenCalled()
    render({ onActivate })
    // The selection survives a re-render with the same periods.
    expect(readout()).toMatch(/^August 2026/)
    key('Enter')
    expect(onActivate).toHaveBeenCalledWith(0)
  })

  it('tap freezes a period, tapping it again dismisses, tapping outside dismisses', () => {
    render()
    act(() => column(1).dispatchEvent(new MouseEvent('click', { bubbles: true })))
    expect(readout()).toMatch(/^September 2026/)
    act(() => column(1).dispatchEvent(new MouseEvent('click', { bubbles: true })))
    expect(readout()).toBeNull()

    act(() => column(0).dispatchEvent(new MouseEvent('click', { bubbles: true })))
    expect(readout()).toMatch(/^August 2026/)
    act(() => { document.body.dispatchEvent(new Event('pointerdown', { bubbles: true })) })
    expect(readout()).toBeNull()
  })

  it('the Clear button dismisses a frozen selection', () => {
    render()
    act(() => column(2).dispatchEvent(new MouseEvent('click', { bubbles: true })))
    const clear = [...container.querySelectorAll('button')].find((b) => b.textContent === 'Clear selection')!
    expect(clear).toBeTruthy()
    act(() => clear.click())
    expect(readout()).toBeNull()
  })

  it('on a wide chart, shows a tooltip for the selection and keeps the readout for screen readers only', () => {
    observedWidth = 900
    render()
    key('ArrowRight')
    const tip = container.querySelector('[data-testid="trend-tooltip"]')
    expect(tip?.textContent).toContain('August 2026')
    expect(tip?.textContent).toContain('Rs 100')
    expect(container.querySelector('[data-testid="trend-readout"]')!.className).toBe('sr-only')
  })

  it('on a narrow chart, prints the values below instead of a floating tooltip', () => {
    observedWidth = 340
    render()
    key('ArrowRight')
    expect(container.querySelector('[data-testid="trend-tooltip"]')).toBeNull()
    expect(container.querySelector('[data-testid="trend-readout"]')!.className).toBe('')
    expect(container.textContent).not.toContain('Hover, tap')
  })

  it('a frozen selection stays fixed while the mouse moves over other periods', () => {
    observedWidth = 900
    render()
    act(() => column(0).dispatchEvent(new MouseEvent('click', { bubbles: true })))
    // jsdom has no PointerEvent; a MouseEvent with pointerType is what React reads.
    const move = new MouseEvent('pointermove', { bubbles: true })
    Object.defineProperty(move, 'pointerType', { value: 'mouse' })
    act(() => { column(2).dispatchEvent(move) })
    expect(container.querySelector('[data-testid="trend-tooltip"]')!.textContent).toContain('August 2026')
  })

  it('offers an equivalent values table', () => {
    render()
    const rows = [...container.querySelectorAll('details table tbody tr')].map((r) => r.textContent)
    expect(rows).toEqual(['August 2026Rs 100Rs 80', 'September 2026Rs 250Rs 0', '1–14 October 2026 (month to date)No valueRs 40'])
    render({ showTable: false })
    expect(container.querySelector('details')).toBeNull()
  })

  it('draws a single baseline for an all-zero series rather than an invented scale', () => {
    render({ series: [{ key: 'z', label: 'Zero', status: 'actual', values: [0, 0, 0] }] })
    const ticks = [...container.querySelectorAll('svg text')].filter((t) => t.textContent?.startsWith('Rs'))
    expect(ticks.map((t) => t.textContent)).toEqual(['Rs 0'])
  })

  it('draws illustrative series dashed and actual series solid', () => {
    render({ series: [{ key: 'a', label: 'A', status: 'actual', values: [1, 2, 3] }, { key: 'i', label: 'I', status: 'illustrative', values: [1, 3, 5] }] })
    const paths = container.querySelectorAll('path')
    expect(paths[0]!.getAttribute('stroke-dasharray')).toBeNull()
    expect(paths[1]!.getAttribute('stroke-dasharray')).toBe('7 5')
    expect(container.querySelector('ul[aria-label="Series"]')!.textContent).toContain('Illustrative')
  })
})
