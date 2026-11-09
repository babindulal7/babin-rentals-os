// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { shouldNavigateInspector } from './InspectorNavigator'
import { BP } from '../../lib/breakpoints'

function shortcut(target: Element, options: KeyboardEventInit = {}) {
  const event = new KeyboardEvent('keydown', { key: 'ArrowDown', altKey: true, bubbles: true, ...options })
  target.dispatchEvent(event)
  return event
}

describe('inspector keyboard guard', () => {
  it('accepts an unhandled desktop Alt+Arrow shortcut', () => {
    const target = document.createElement('button')
    expect(shouldNavigateInspector(shortcut(target), BP.desktop)).toBe(true)
  })

  it('does not intercept Nepali IME composition or legacy keyCode 229', () => {
    const target = document.createElement('button')
    expect(shouldNavigateInspector(shortcut(target, { isComposing: true }), BP.desktop)).toBe(false)
    const legacy = shortcut(target)
    Object.defineProperty(legacy, 'keyCode', { value: 229 })
    expect(shouldNavigateInspector(legacy, BP.desktop)).toBe(false)
  })

  it('ignores nested editable and accessible textbox targets', () => {
    for (const html of ['<div contenteditable="plaintext-only"><span>typing</span></div>', '<div role="textbox"><span>typing</span></div>', '<input />']) {
      const root = document.createElement('div')
      root.innerHTML = html
      const target = root.querySelector('span, input')!
      expect(shouldNavigateInspector(shortcut(target), BP.desktop)).toBe(false)
    }
  })

  it('does not navigate on mobile, modified keys, or non-arrow keys', () => {
    const target = document.createElement('button')
    expect(shouldNavigateInspector(shortcut(target), BP.desktop - 1)).toBe(false)
    expect(shouldNavigateInspector(shortcut(target, { ctrlKey: true }), BP.desktop)).toBe(false)
    expect(shouldNavigateInspector(shortcut(target, { key: 'Enter' }), BP.desktop)).toBe(false)
  })
})
