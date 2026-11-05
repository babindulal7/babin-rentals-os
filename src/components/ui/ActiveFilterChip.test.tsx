// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ActiveFilterChip } from './ActiveFilterChip'

const mounted: Array<{ node: HTMLDivElement; root: ReturnType<typeof createRoot> }> = []
beforeEach(() => vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true))
afterEach(() => {
  for (const { node, root } of mounted.splice(0)) {
    act(() => root.unmount())
    node.remove()
  }
  vi.unstubAllGlobals()
})

function render(disabled = false) {
  const node = document.createElement('div')
  document.body.append(node)
  const root = createRoot(node)
  mounted.push({ node, root })
  const onRemove = vi.fn()
  act(() => root.render(
    <ActiveFilterChip id="status:active" dimension="status" label="Active" onRemove={onRemove} disabled={disabled} />,
  ))
  return { node, button: node.querySelector('button')!, onRemove }
}

describe('ActiveFilterChip touch accessibility', () => {
  it('uses a 44px remove target while keeping the filter name accessible', () => {
    const { node, button } = render()
    expect(button.style.width).toBe('44px')
    expect(button.style.height).toBe('44px')
    expect((node.firstElementChild as HTMLElement).style.minHeight).toBe('44px')
    expect(button.getAttribute('aria-label')).toBe('Remove status filter for Active')
  })

  it('removes only the requested filter on click', () => {
    const { button, onRemove } = render()
    act(() => button.click())
    expect(onRemove).toHaveBeenCalledWith('status:active')
  })

  it('does not remove disabled filters', () => {
    const { button, onRemove } = render(true)
    expect(button.disabled).toBe(true)
    act(() => button.click())
    expect(onRemove).not.toHaveBeenCalled()
  })
})
