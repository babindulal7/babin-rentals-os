// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { createRef } from 'react'
import { SignaturePad, type SignaturePadRef } from '../SignaturePad'

;(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true

describe('SignaturePad component (T2-02)', () => {
  let host: HTMLDivElement | null = null
  let root: Root | null = null

  beforeEach(() => {
    host = document.createElement('div')
    document.body.appendChild(host)
    root = createRoot(host)

    // Stub HTMLCanvasElement methods for jsdom
    HTMLCanvasElement.prototype.getContext = vi.fn().mockReturnValue({
      scale: vi.fn(),
      beginPath: vi.fn(),
      arc: vi.fn(),
      fill: vi.fn(),
      moveTo: vi.fn(),
      lineTo: vi.fn(),
      stroke: vi.fn(),
      clearRect: vi.fn(),
    }) as unknown as typeof HTMLCanvasElement.prototype.getContext
    HTMLCanvasElement.prototype.toDataURL = vi.fn().mockReturnValue('data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==')
    HTMLCanvasElement.prototype.toBlob = vi.fn().mockImplementation((cb: (b: Blob | null) => void) => {
      cb(new Blob(['fake png bytes'], { type: 'image/png' }))
    })
  })

  afterEach(() => {
    if (root) {
      act(() => {
        root!.unmount()
      })
    }
    if (host && host.parentNode) {
      host.parentNode.removeChild(host)
    }
    root = null
    host = null
    vi.restoreAllMocks()
  })

  it('renders canvas with touch-action: none and accessibility attributes', () => {
    act(() => {
      root!.render(<SignaturePad ariaLabel="Receiver signature canvas" />)
    })

    const canvas = host!.querySelector('canvas') as HTMLCanvasElement
    expect(canvas).not.toBeNull()
    expect(canvas.getAttribute('aria-label')).toBe('Receiver signature canvas')
    expect(canvas.getAttribute('role')).toBe('img')
    expect(canvas.style.touchAction).toBe('none')
  })

  it('provides a Clear button that satisfies the >= 44px touch floor (Law 15)', () => {
    act(() => {
      root!.render(<SignaturePad />)
    })

    const clearBtn = host!.querySelector('button[aria-label="Clear signature"]') as HTMLButtonElement
    expect(clearBtn).not.toBeNull()
    expect(clearBtn.style.minHeight).toContain('44px')
    expect(clearBtn.style.minWidth).toContain('44px')
  })

  it('starts in empty state and updates state after pointer drawing events', () => {
    const onDrawChange = vi.fn()
    const ref = createRef<SignaturePadRef>()

    act(() => {
      root!.render(<SignaturePad ref={ref} onDrawChange={onDrawChange} />)
    })

    expect(ref.current?.isEmpty()).toBe(true)

    const canvas = host!.querySelector('canvas') as HTMLCanvasElement

    act(() => {
      canvas.dispatchEvent(new PointerEvent('pointerdown', { clientX: 20, clientY: 30, pointerId: 1, bubbles: true }))
    })

    expect(onDrawChange).toHaveBeenCalledWith(true)
    expect(ref.current?.isEmpty()).toBe(false)

    act(() => {
      canvas.dispatchEvent(new PointerEvent('pointermove', { clientX: 40, clientY: 50, pointerId: 1, bubbles: true }))
      canvas.dispatchEvent(new PointerEvent('pointerup', { pointerId: 1, bubbles: true }))
    })

    expect(ref.current?.isEmpty()).toBe(false)
  })

  it('resets canvas and reports isEmpty=true when Clear is clicked', () => {
    const onDrawChange = vi.fn()
    const ref = createRef<SignaturePadRef>()

    act(() => {
      root!.render(<SignaturePad ref={ref} onDrawChange={onDrawChange} />)
    })

    const canvas = host!.querySelector('canvas') as HTMLCanvasElement
    act(() => {
      canvas.dispatchEvent(new PointerEvent('pointerdown', { clientX: 20, clientY: 30, pointerId: 1, bubbles: true }))
    })
    expect(ref.current?.isEmpty()).toBe(false)

    const clearBtn = host!.querySelector('button[aria-label="Clear signature"]') as HTMLButtonElement
    act(() => {
      clearBtn.click()
    })

    expect(ref.current?.isEmpty()).toBe(true)
    expect(onDrawChange).toHaveBeenCalledWith(false)
  })

  it('exports drawing through toDataURL and toFile', async () => {
    const ref = createRef<SignaturePadRef>()

    act(() => {
      root!.render(<SignaturePad ref={ref} />)
    })

    // When empty, toFile resolves to null
    const emptyFile = await ref.current?.toFile('sig.png')
    expect(emptyFile).toBeNull()

    const canvas = host!.querySelector('canvas') as HTMLCanvasElement
    act(() => {
      canvas.dispatchEvent(new PointerEvent('pointerdown', { clientX: 10, clientY: 10, pointerId: 1, bubbles: true }))
      canvas.dispatchEvent(new PointerEvent('pointermove', { clientX: 25, clientY: 25, pointerId: 1, bubbles: true }))
      canvas.dispatchEvent(new PointerEvent('pointerup', { pointerId: 1, bubbles: true }))
    })

    const dataUrl = ref.current?.toDataURL()
    expect(typeof dataUrl).toBe('string')
    expect(dataUrl).toContain('data:image/png;base64,')

    const file = await ref.current?.toFile('receiver-signature.png')
    expect(file).not.toBeNull()
    expect(file?.name).toBe('receiver-signature.png')
    expect(file?.type).toBe('image/png')
  })
})
