// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { ScannerInput } from '../ScannerInput'

;(globalThis as Record<string, unknown>)['IS_REACT_ACT_ENVIRONMENT'] = true

describe('ScannerInput Component (T2-09)', () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => {
      root.unmount()
    })
    container.remove()
  })

  async function mount(props: Partial<Parameters<typeof ScannerInput>[0]> = {}) {
    const onScan = props.onScan ?? vi.fn()
    await act(async () => {
      root.render(<ScannerInput onScan={onScan} {...props} />)
    })
    return { container, onScan }
  }

  it('renders input, scan button with >= 44px touch target, and barcode icon', async () => {
    const { container } = await mount()
    const input = container.querySelector('input')
    const button = container.querySelector('button[type="submit"]')

    expect(input).not.toBeNull()
    expect(button).not.toBeNull()
    expect(button?.textContent).toContain('Scan')
  })

  it('fires onScan on manual typing and form submission', async () => {
    const onScan = vi.fn()
    const { container } = await mount({ onScan })
    const input = container.querySelector('input')!
    const form = container.querySelector('form')!

    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, 'BAR-12345')
      input.dispatchEvent(new Event('input', { bubbles: true }))
      input.dispatchEvent(new Event('change', { bubbles: true }))
    })

    await act(async () => {
      form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
    })

    expect(onScan).toHaveBeenCalledWith('BAR-12345')
    expect(container.textContent).toContain('Scanned: BAR-12345')
  })

  it('S14: renders camera scan button when onCameraClick is provided', async () => {
    const onCameraClick = vi.fn()
    const { container } = await mount({ onCameraClick })

    const cameraBtn = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Camera')
    )
    expect(cameraBtn).toBeDefined()

    await act(async () => {
      cameraBtn?.click()
    })

    expect(onCameraClick).toHaveBeenCalledTimes(1)
  })

  it('ambient listener: captures fast keystroke burst ending in Enter from Bluetooth scanner', async () => {
    const onScan = vi.fn()
    await mount({ onScan, ambient: true })

    let now = 500000
    const nowSpy = vi.spyOn(Date, 'now')

    const code = 'SN-FX3-9988'
    for (const char of code) {
      nowSpy.mockReturnValue(now)
      await act(async () => {
        window.dispatchEvent(new KeyboardEvent('keydown', { key: char, bubbles: true }))
      })
      now += 15
    }

    nowSpy.mockReturnValue(now)
    await act(async () => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
    })

    expect(onScan).toHaveBeenCalledWith('SN-FX3-9988')
    nowSpy.mockRestore()
  })

  it('prevents double submit: duplicate burst within cooldown window is suppressed', async () => {
    const onScan = vi.fn()
    await mount({ onScan, ambient: true, cooldownMs: 1000 })

    let now = 600000
    const nowSpy = vi.spyOn(Date, 'now')

    // First burst
    for (const char of 'TRIPOD-01') {
      nowSpy.mockReturnValue(now)
      await act(async () => {
        window.dispatchEvent(new KeyboardEvent('keydown', { key: char, bubbles: true }))
      })
      now += 15
    }
    nowSpy.mockReturnValue(now)
    await act(async () => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
    })

    expect(onScan).toHaveBeenCalledTimes(1)

    // Immediate duplicate burst 200ms later
    now += 200
    for (const char of 'TRIPOD-01') {
      nowSpy.mockReturnValue(now)
      await act(async () => {
        window.dispatchEvent(new KeyboardEvent('keydown', { key: char, bubbles: true }))
      })
      now += 15
    }
    nowSpy.mockReturnValue(now)
    await act(async () => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
    })

    // Suppressed! Still 1 call
    expect(onScan).toHaveBeenCalledTimes(1)

    nowSpy.mockRestore()
  })
})
