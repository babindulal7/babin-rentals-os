// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import type { Viewport } from '../../../lib/device'

let viewport: Viewport = 'desktop'

vi.mock('../../../lib/device', async (orig) => ({
  ...(await orig<typeof import('../../../lib/device')>()),
  useViewport: () => viewport,
  useCapability: () => ({ coarsePointer: false, hasHover: true, standalone: false, reducedMotion: false }),
}))

;(globalThis as Record<string, unknown>)['IS_REACT_ACT_ENVIRONMENT'] = true

const { default: DepreciationCalculator } = await import('../DepreciationCalculator')

let container: HTMLDivElement
let root: Root

/** React tracks the last value it set; a bare `.value =` is ignored on rerender. */
async function type(el: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set
  setter?.call(el, value)
  await act(async () => {
    el.dispatchEvent(new Event('input', { bubbles: true }))
  })
}

function fieldNamed(label: string): HTMLInputElement {
  const match = [...container.querySelectorAll('label')].find((l) =>
    (l.textContent ?? '').toLowerCase().startsWith(label.toLowerCase()),
  )
  const input = match?.querySelector('input')
  if (!input) throw new Error(`no field named "${label}"`)
  return input as HTMLInputElement
}

function byLabel(label: string): HTMLInputElement {
  const el = container.querySelector(`input[aria-label="${label}"]`)
  if (!el) throw new Error(`no input labelled "${label}"`)
  return el as HTMLInputElement
}

beforeEach(() => {
  viewport = 'desktop'
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
})

afterEach(async () => {
  await act(async () => root.unmount())
  container.remove()
})

describe('Depreciation book value curve — axis labels', () => {
  it('prints whole-paisa money on the axis, never a float tail', async () => {
    await act(async () => {
      root.render(
        <MemoryRouter>
          <DepreciationCalculator />
        </MemoryRouter>,
      )
    })
    await type(fieldNamed('Purchase price'), '100000')
    await type(byLabel('Useful life in years'), '5')
    await type(fieldNamed('Salvage value'), '10000')

    const text = container.textContent ?? ''
    expect(text).toContain('Book value curve')
    // Two-decimal money from a third of the top value: Rs 33,333.33 and Rs 66,666.67.
    expect(text).toContain('Rs 33,333.33')
    expect(text).toContain('Rs 66,666.67')
    // The broken label was "Rs 33,333.33.333333333488554": a dot followed by a long fraction.
    expect(text).not.toMatch(/\.\d{3,}/)
  })
})
