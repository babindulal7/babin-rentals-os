// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MobileHeaderSearch } from './MobileHeaderSearch'

;(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true

let host: HTMLDivElement
let root: Root

beforeEach(() => {
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
})

afterEach(() => {
  act(() => root.unmount())
  host.remove()
})

function mount(onKeyDown = vi.fn()) {
  const onChange = vi.fn()
  act(() => root.render(
    <MobileHeaderSearch
      title="Rentals"
      config={{ value: 'क्यामेरा', onChange, onKeyDown }}
    />,
  ))
  const trigger = host.querySelector<HTMLButtonElement>('button[aria-label="Search Rentals"]')!
  act(() => trigger.click())
  const input = host.querySelector<HTMLInputElement>('input[type="search"]')!
  expect(document.activeElement).toBe(input)
  return { input, trigger, onKeyDown }
}

function key(target: Element, name: string, options: KeyboardEventInit = {}, legacy = false) {
  const event = new KeyboardEvent('keydown', {
    key: name,
    bubbles: true,
    cancelable: true,
    ...options,
  })
  if (legacy) Object.defineProperty(event, 'keyCode', { value: 229 })
  act(() => { target.dispatchEvent(event) })
  return event
}

describe('MobileHeaderSearch IME keyboard handling', () => {
  it('keeps the search open while Enter or Escape selects a Nepali IME candidate', () => {
    const { input, onKeyDown } = mount()
    for (const name of ['Enter', 'Escape']) {
      const event = key(input, name, { isComposing: true })
      expect(event.defaultPrevented).toBe(false)
      expect(host.querySelector('input[type="search"]')).toBe(input)
    }
    expect(onKeyDown).not.toHaveBeenCalled()
    expect(document.activeElement).toBe(input)
  })

  it('handles legacy IMEs that report keyCode 229 without isComposing', () => {
    const { input, onKeyDown } = mount()
    key(input, 'Enter', {}, true)
    key(input, 'Escape', {}, true)
    expect(host.querySelector('input[type="search"]')).toBe(input)
    expect(onKeyDown).not.toHaveBeenCalled()
  })

  it('still submits on ordinary Enter and closes on ordinary Escape, restoring focus', () => {
    const onKeyDown = vi.fn()
    const { input, trigger } = mount(onKeyDown)
    key(input, 'Enter')
    expect(onKeyDown).toHaveBeenCalledTimes(1)
    expect(host.querySelector('input[type="search"]')).toBeNull()
    expect(document.activeElement).toBe(trigger)

    act(() => trigger.click())
    const reopened = host.querySelector<HTMLInputElement>('input[type="search"]')!
    key(reopened, 'Escape')
    expect(host.querySelector('input[type="search"]')).toBeNull()
    expect(document.activeElement).toBe(trigger)
    expect(onKeyDown).toHaveBeenCalledTimes(1)
  })

  it('does not open the slash shortcut during legacy IME composition', () => {
    act(() => root.render(
      <MobileHeaderSearch title="Rentals" config={{ value: '', onChange: vi.fn() }} />,
    ))
    key(document.body, '/', {}, true)
    expect(host.querySelector('input[type="search"]')).toBeNull()
    key(document.body, '/')
    expect(host.querySelector('input[type="search"]')).not.toBeNull()
  })
})
