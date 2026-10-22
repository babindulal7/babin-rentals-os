// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { expect, it } from 'vitest'
import { useCollapsed } from '../collapse'

;(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true

it('keeps desktop and tablet navigation defaults and preferences independent across resizing', () => {
  localStorage.clear()
  const host = document.createElement('div')
  const root = createRoot(host)
  function Navigation({ tablet }: { tablet: boolean }) {
    const [collapsed, toggle] = useCollapsed(tablet ? 'sidebar:tablet' : 'sidebar:desktop', tablet)
    return <button onClick={toggle}>{collapsed ? 'rail' : 'expanded'}</button>
  }
  try {
    act(() => root.render(<Navigation tablet={false} />))
    expect(host.textContent).toBe('expanded')
    act(() => root.render(<Navigation tablet />))
    expect(host.textContent).toBe('rail')
    act(() => host.querySelector('button')!.click())
    expect(host.textContent).toBe('expanded')
    act(() => root.render(<Navigation tablet={false} />))
    expect(host.textContent).toBe('expanded')
    act(() => host.querySelector('button')!.click())
    act(() => root.render(<Navigation tablet />))
    expect(host.textContent).toBe('expanded')
    act(() => root.render(<Navigation tablet={false} />))
    expect(host.textContent).toBe('rail')
    expect(localStorage.getItem('br-collapsed:sidebar:tablet')).toBe('0')
    expect(localStorage.getItem('br-collapsed:sidebar:desktop')).toBe('1')
  } finally {
    act(() => root.unmount())
    localStorage.clear()
  }
})
