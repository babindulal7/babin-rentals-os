// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act, createElement, Suspense, useRef } from 'react'
import { createRoot } from 'react-dom/client'
import { BarcodeBurstDetector, useBarcodeBurst } from '../barcodeBurst'

;(globalThis as Record<string, unknown>)['IS_REACT_ACT_ENVIRONMENT'] = true

describe('BarcodeBurstDetector (T2-09)', () => {
  let detector: BarcodeBurstDetector
  let onScan: ReturnType<typeof vi.fn>
  let virtualTime = 100000
  let nowSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    virtualTime = 100000
    nowSpy = vi.spyOn(Date, 'now').mockImplementation(() => virtualTime)
    onScan = vi.fn()
    detector = new BarcodeBurstDetector({ onScan, minChars: 3, maxIntervalMs: 50, cooldownMs: 1000 })
  })

  afterEach(() => {
    nowSpy.mockRestore()
    document.body.replaceChildren()
  })

  function key(instance: BarcodeBurstDetector, value: string, init: KeyboardEventInit = {}) {
    const event = new KeyboardEvent('keydown', { key: value, cancelable: true, ...init })
    instance.handleKeyDown(event)
    return event
  }

  function burst(instance: BarcodeBurstDetector, chars: string, intervalMs = 15, submit = true) {
    for (const char of chars) {
      key(instance, char)
      virtualTime += intervalMs
    }
    if (submit) return key(instance, 'Enter')
    return undefined
  }

  function scanField() {
    const input = document.createElement('input')
    document.body.append(input)
    const focus = vi.spyOn(input, 'focus')
    const instance = new BarcodeBurstDetector({ onScan, targetInputRef: { current: input } })
    return { input, focus, instance }
  }

  it('captures a rapid HID burst and prevents its Enter from submitting a form', () => {
    const enter = burst(detector, 'CAM-FX3-001', 10)
    expect(onScan).toHaveBeenCalledExactlyOnceWith('CAM-FX3-001')
    expect(enter?.defaultPrevented).toBe(true)
  })

  it('ignores slow human typing and does not steal focus', () => {
    const { instance, focus } = scanField()
    burst(instance, 'CAM-FX3-001', 100)
    expect(onScan).not.toHaveBeenCalled()
    expect(focus).not.toHaveBeenCalled()
  })

  it('rejects bursts shorter than minChars', () => {
    burst(detector, 'AB', 10)
    expect(onScan).not.toHaveBeenCalled()
  })

  it('does not average a slow prefix into the subsequent fast barcode', () => {
    key(detector, 'X')
    virtualTime += 100
    burst(detector, 'CAM-FX3-001', 10)
    expect(onScan).toHaveBeenCalledExactlyOnceWith('CAM-FX3-001')
  })

  it('does not scan a completed burst after a pause before Enter', () => {
    burst(detector, 'CAM-FX3-001', 10, false)
    virtualTime += 100
    key(detector, 'Enter')
    expect(onScan).not.toHaveBeenCalled()
  })

  it('suppresses duplicate scans within cooldown, then permits a later retry', () => {
    burst(detector, 'LENS-2470-09', 10)
    virtualTime += 300
    burst(detector, 'LENS-2470-09', 10)
    expect(onScan).toHaveBeenCalledTimes(1)
    virtualTime += 1500
    burst(detector, 'LENS-2470-09', 10)
    expect(onScan).toHaveBeenCalledTimes(2)
  })

  it('accepts consecutive different items with no delay between scans', () => {
    burst(detector, 'UNIT-AAA-1', 10)
    burst(detector, 'UNIT-BBB-2', 10)
    expect(onScan.mock.calls.map(([code]) => code)).toEqual(['UNIT-AAA-1', 'UNIT-BBB-2'])
  })

  it('captures 50 consecutive serials exactly once in order', () => {
    for (let i = 1; i <= 50; i++) {
      virtualTime += 100
      burst(detector, `SN-2026-${String(i).padStart(4, '0')}`, 12)
    }
    expect(onScan).toHaveBeenCalledTimes(50)
    for (let i = 1; i <= 50; i++) {
      expect(onScan).toHaveBeenNthCalledWith(i, `SN-2026-${String(i).padStart(4, '0')}`)
    }
  })

  it('focuses the scan input only after enough rapid characters', () => {
    const { instance, input, focus } = scanField()
    burst(instance, 'SN', 10, false)
    expect(focus).not.toHaveBeenCalled()
    key(instance, '1')
    expect(document.activeElement).toBe(input)
    key(instance, 'Enter')
    expect(onScan).toHaveBeenCalledExactlyOnceWith('SN1')
  })

  it.each(['input', 'textarea', 'select', 'contenteditable', 'textbox'])('leaves editing in another %s alone', (kind) => {
    const { instance, focus } = scanField()
    const field = document.createElement(kind === 'contenteditable' || kind === 'textbox' ? 'div' : kind)
    if (kind === 'contenteditable') field.setAttribute('contenteditable', 'true')
    if (kind === 'textbox') field.setAttribute('role', 'textbox')
    field.tabIndex = 0
    document.body.append(field)
    field.focus()
    burst(instance, 'CAM-123', 10)
    expect(onScan).not.toHaveBeenCalled()
    expect(focus).not.toHaveBeenCalled()
    expect(document.activeElement).toBe(field)
  })

  it('allows a barcode typed in the explicit scan field', () => {
    const { instance, input } = scanField()
    input.focus()
    burst(instance, 'CAM-123', 10)
    expect(onScan).toHaveBeenCalledExactlyOnceWith('CAM-123')
  })

  it('does not scan the underlying floor while a modal is open', () => {
    const { instance, focus } = scanField()
    const dialog = document.createElement('div')
    dialog.setAttribute('role', 'dialog')
    dialog.setAttribute('aria-modal', 'true')
    document.body.append(dialog)
    burst(instance, 'CAM-123', 10)
    expect(onScan).not.toHaveBeenCalled()
    expect(focus).not.toHaveBeenCalled()
  })

  it('allows a scanner that belongs to the active modal', () => {
    const { instance, input } = scanField()
    const dialog = document.createElement('div')
    dialog.setAttribute('role', 'dialog')
    dialog.setAttribute('aria-modal', 'true')
    dialog.append(input)
    document.body.append(dialog)
    burst(instance, 'CAM-123', 10)
    expect(onScan).toHaveBeenCalledExactlyOnceWith('CAM-123')
  })

  it('blocks the outer scanner while a nested modal owns the foreground', () => {
    const { instance, input, focus } = scanField()
    const outer = document.createElement('div')
    outer.setAttribute('aria-modal', 'true')
    outer.append(input)
    const nested = document.createElement('div')
    nested.setAttribute('aria-modal', 'true')
    document.body.append(outer, nested)
    burst(instance, 'CAM-123', 10)
    expect(onScan).not.toHaveBeenCalled()
    expect(focus).not.toHaveBeenCalled()
  })

  it('routes a nested modal scan to its own detector only', () => {
    const { instance: outerDetector, input: outerInput } = scanField()
    const outer = document.createElement('div')
    outer.setAttribute('aria-modal', 'true')
    outer.append(outerInput)
    const nested = document.createElement('div')
    nested.setAttribute('aria-modal', 'true')
    const nestedInput = document.createElement('input')
    nested.append(nestedInput)
    document.body.append(outer, nested)
    const nestedScan = vi.fn()
    const nestedDetector = new BarcodeBurstDetector({
      onScan: nestedScan,
      targetInputRef: { current: nestedInput },
    })
    for (const char of 'CAM-123') {
      const event = new KeyboardEvent('keydown', { key: char, cancelable: true })
      outerDetector.handleKeyDown(event)
      nestedDetector.handleKeyDown(event)
      virtualTime += 10
    }
    const enter = new KeyboardEvent('keydown', { key: 'Enter', cancelable: true })
    outerDetector.handleKeyDown(enter)
    nestedDetector.handleKeyDown(enter)
    expect(onScan).not.toHaveBeenCalled()
    expect(nestedScan).toHaveBeenCalledExactlyOnceWith('CAM-123')
  })

  it.each(['Backspace', 'Delete', 'ArrowLeft', 'Escape'])('clears buffered text after %s', (editingKey) => {
    burst(detector, 'CAM-123', 10, false)
    key(detector, editingKey)
    key(detector, 'Enter')
    expect(onScan).not.toHaveBeenCalled()
  })

  it.each([{ ctrlKey: true }, { metaKey: true }, { altKey: true }, { isComposing: true }, { repeat: true }])('ignores shortcuts, composition and held keys (%j)', (init) => {
    burst(detector, 'CAM-123', 10, false)
    key(detector, 'Enter', init)
    key(detector, 'Enter')
    expect(onScan).not.toHaveBeenCalled()
  })

  it('leaves an already handled key alone and clears the partial scan', () => {
    burst(detector, 'CAM-123', 10, false)
    const enter = new KeyboardEvent('keydown', { key: 'Enter', cancelable: true })
    enter.preventDefault()
    detector.handleKeyDown(enter)
    key(detector, 'Enter')
    expect(onScan).not.toHaveBeenCalled()
  })

  it('clears a partial burst when disabled and re-enabled', () => {
    burst(detector, 'CAM-123', 10, false)
    detector.updateConfig({ enabled: false })
    detector.updateConfig({ enabled: true })
    key(detector, 'Enter')
    expect(onScan).not.toHaveBeenCalled()
    burst(detector, 'CAM-456', 10)
    expect(onScan).toHaveBeenCalledExactlyOnceWith('CAM-456')
  })

  it('clears a removed target ref instead of retaining its focus trap', () => {
    const { instance, input, focus } = scanField()
    burst(instance, 'CAM-123', 10, false)
    input.blur()
    focus.mockClear()
    instance.updateConfig({ targetInputRef: undefined })
    key(instance, 'Enter')
    expect(onScan).not.toHaveBeenCalled()
    burst(instance, 'CAM-456', 10)
    expect(onScan).toHaveBeenCalledExactlyOnceWith('CAM-456')
    expect(focus).not.toHaveBeenCalled()
  })
})


describe('useBarcodeBurst workspace lifecycle', () => {
  it('stops scanning while Suspense hides a workspace and clears its partial burst', async () => {
    const container = document.createElement('div')
    document.body.append(container)
    const root = createRoot(container)
    const onScan = vi.fn()
    const pending = new Promise<void>(() => {})
    let now = 100000
    const nowSpy = vi.spyOn(Date, 'now').mockImplementation(() => now)

    function Workspace({ suspended }: { suspended: boolean }) {
      const targetInputRef = useRef<HTMLInputElement>(null)
      useBarcodeBurst({ onScan, targetInputRef })
      if (suspended) throw pending
      return createElement('input', { ref: targetInputRef, 'aria-label': 'Scan serial' })
    }

    async function render(suspended: boolean) {
      await act(async () => {
        root.render(createElement(Suspense, { fallback: createElement('button', null, 'Loading workspace') },
          createElement(Workspace, { suspended })))
      })
    }

    function keys(value: string, submit = true) {
      for (const key of [...value, ...(submit ? ['Enter'] : [])]) {
        now += 10
        window.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }))
      }
    }

    try {
      await render(false)
      keys('VISIBLE-1')
      keys('PARTIAL', false)
      await render(true)
      expect(container.textContent).toContain('Loading workspace')
      expect(container.querySelector('input')?.style.display).toBe('none')
      const loadingButton = container.querySelector('button')
      loadingButton?.focus()
      expect(document.activeElement).toBe(loadingButton)
      keys('HIDDEN-1')
      expect(onScan.mock.calls.map(([code]) => code)).toEqual(['VISIBLE-1'])

      await render(false)
      keys('')
      expect(onScan.mock.calls.map(([code]) => code)).toEqual(['VISIBLE-1'])
      keys('VISIBLE-2')
      expect(onScan.mock.calls.map(([code]) => code)).toEqual(['VISIBLE-1', 'VISIBLE-2'])
    } finally {
      act(() => root.unmount())
      container.remove()
      nowSpy.mockRestore()
    }
  })
})
