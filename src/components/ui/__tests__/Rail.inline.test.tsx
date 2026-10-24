// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, describe, expect, it } from 'vitest'
import { Rail, ReflowRail } from '../Page'

;(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true

let root: Root | undefined
let container: HTMLDivElement | undefined

afterEach(() => {
  if (root) act(() => root?.unmount())
  container?.remove()
  root = undefined
  container = undefined
})

function render(node: React.ReactNode): HTMLDivElement {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  act(() => root?.render(node))
  return container
}

// RULING 2026-10-23: right-hand summaries are inline again. There is no header toggle,
// no drawer and no dialog — the content is on the page whenever the page is.
describe('Rail renders its content inline — no drawer button', () => {
  it('puts the summary in the page as a labelled aside, with no button or dialog', () => {
    const c = render(<Rail label="Rental summary"><p>Total Rs 100</p></Rail>)
    const aside = c.querySelector('aside[aria-label="Rental summary"]')
    expect(aside?.textContent).toContain('Total Rs 100')
    expect(c.querySelector('button')).toBeNull()
    expect(document.querySelector('[role="dialog"]')).toBeNull()
  })

  it('ReflowRail shows the same content without any toggle', () => {
    const c = render(<ReflowRail><p>Report period</p></ReflowRail>)
    expect(c.textContent).toContain('Report period')
    expect(c.querySelector('button')).toBeNull()
  })
})
