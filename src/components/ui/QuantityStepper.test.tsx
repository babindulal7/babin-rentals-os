// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { QuantityStepper } from './QuantityStepper'

const mounted: Array<{ node: HTMLDivElement; root: ReturnType<typeof createRoot> }> = []
beforeEach(() => vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true))
afterEach(() => {
  for (const { node, root } of mounted.splice(0)) {
    act(() => root.unmount())
    node.remove()
  }
  vi.unstubAllGlobals()
})

function render() {
  const node = document.createElement('div')
  document.body.append(node)
  const root = createRoot(node)
  mounted.push({ node, root })
  const onChange = vi.fn()
  act(() => root.render(<QuantityStepper value={2} onChange={onChange} ariaLabel="Units" />))
  return { input: node.querySelector('input')!, onChange }
}

describe('QuantityStepper IME keyboard behavior', () => {
  it('does not increment while a composed ArrowUp event is in progress', () => {
    const { input, onChange } = render()
    act(() => input.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true, isComposing: true })))
    expect(onChange).not.toHaveBeenCalled()
  })

  it('ignores legacy IME keyCode 229 for ArrowDown', () => {
    const { input, onChange } = render()
    const event = new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true })
    Object.defineProperty(event, 'keyCode', { value: 229 })
    act(() => input.dispatchEvent(event))
    expect(onChange).not.toHaveBeenCalled()
  })

  it('keeps normal keyboard stepping available', () => {
    const { input, onChange } = render()
    act(() => input.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true, cancelable: true })))
    expect(onChange).toHaveBeenCalledWith(3)
  })
})
