// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { InfoTooltip } from '../InfoTooltip'

;(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true

let root: Root | undefined
let container: HTMLDivElement | undefined

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
  if (root) act(() => root?.unmount())
  container?.remove()
  root = undefined
  container = undefined
})

function mount(content: string, label?: string): HTMLDivElement {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  act(() => root?.render(<InfoTooltip content={content} {...(label !== undefined ? { label } : {})} />))
  return container
}

describe('InfoTooltip 300ms hover delay specification', () => {
  it('does not open immediately on mouseEnter before 300ms', () => {
    const c = mount('Explanatory context note', 'Order details')
    const button = c.querySelector('button[aria-label="Order details"]')
    expect(button).not.toBeNull()

    act(() => {
      button?.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }))
    })

    // At 150ms, tooltip should still be closed
    act(() => {
      vi.advanceTimersByTime(150)
    })
    expect(document.querySelector('[role="tooltip"]')).toBeNull()

    // At 300ms, tooltip opens
    act(() => {
      vi.advanceTimersByTime(150)
    })
    const tip = document.querySelector('[role="tooltip"]')
    expect(tip).not.toBeNull()
    expect(tip?.textContent).toContain('Explanatory context note')
  })

  it('cancels opening if mouse leaves before 300ms', () => {
    const c = mount('Cancelled tip', 'Hint')
    const button = c.querySelector('button[aria-label="Hint"]')

    act(() => {
      button?.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }))
    })
    act(() => {
      vi.advanceTimersByTime(200)
    })
    act(() => {
      button?.dispatchEvent(new MouseEvent('mouseout', { bubbles: true }))
    })
    act(() => {
      vi.advanceTimersByTime(200)
    })

    expect(document.querySelector('[role="tooltip"]')).toBeNull()
  })

  it('opens immediately on keyboard focus without waiting 300ms', () => {
    const c = mount('Keyboard accessible note', 'Info')
    const button = c.querySelector('button[aria-label="Info"]')

    act(() => {
      button?.dispatchEvent(new FocusEvent('focus', { bubbles: true }))
    })

    const tip = document.querySelector('[role="tooltip"]')
    expect(tip).not.toBeNull()
    expect(tip?.textContent).toContain('Keyboard accessible note')
  })
})
