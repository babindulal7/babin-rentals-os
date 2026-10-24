// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, describe, expect, it } from 'vitest'
import { KpiStrip } from '../Page'

;(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true

let root: Root | undefined
let container: HTMLDivElement | undefined

afterEach(() => {
  if (root) act(() => root?.unmount())
  container?.remove()
  root = undefined
  container = undefined
})

function render(items: Parameters<typeof KpiStrip>[0]['items']): HTMLDivElement {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  act(() => root?.render(<KpiStrip items={items} />))
  return container
}

// RULING 2026-10-23: a KPI tile carries no (i). Its definition (L1), note and zero
// explanation (L2) are printed on the tile as one ellipsised line.
describe('KpiStrip prints its definition on the tile — no (i) button', () => {
  it('shows definition and note as one visible caption line and renders no button', () => {
    const c = render([
      { label: 'Revenue', value: 'Rs 10', icon: 'dollar', accent: 'success', note: 'From orders in the period', definition: 'Excl. taxes' },
    ])
    const caption = c.querySelector('.kpi-tile__caption')
    expect(caption?.textContent).toBe('Excl. taxes · From orders in the period')
    expect(c.querySelector('button')).toBeNull()
    expect(document.querySelector('[role="tooltip"]')).toBeNull()
  })

  it('swaps in the zero explanation when the figure is zero (L2)', () => {
    const c = render([
      { label: 'Overdue', value: '0', icon: 'box', accent: 'danger', definition: 'Past due, never returned', zeroExplanation: 'Nothing is overdue today' },
    ])
    expect(c.querySelector('.kpi-tile__caption')?.textContent).toBe('Nothing is overdue today')
  })

  it('has no caption line when there is nothing to explain, and keeps `detail` visible', () => {
    const c = render([{ label: 'Open', value: '3', icon: 'box', accent: 'primary', detail: 'Rs 5 receivable' }])
    expect(c.querySelector('.kpi-tile__caption')).toBeNull()
    expect(c.querySelector('button')).toBeNull()
    expect(c.textContent).toContain('Rs 5 receivable')
  })
})
