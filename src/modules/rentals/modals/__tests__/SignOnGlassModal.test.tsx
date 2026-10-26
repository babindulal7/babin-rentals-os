// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { SignOnGlassModal } from '../SignOnGlassModal'

;(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true

vi.mock('../../../../lib/evidenceStorage', () => ({
  uploadEvidencePhoto: vi.fn().mockResolvedValue({
    id: 'ef-9999-9999-9999-999999999999',
    referenceId: 'ref-1111',
    storagePath: 'evidence/signatures/sig.png',
    signedUrl: 'https://example.com/sig.png',
  }),
}))

describe('SignOnGlassModal (T2-02)', () => {
  let host: HTMLDivElement | null = null
  let root: Root | null = null

  beforeEach(() => {
    host = document.createElement('div')
    document.body.appendChild(host)
    root = createRoot(host)

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
      cb(new Blob(['fake png'], { type: 'image/png' }))
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
  })

  it('refuses blank signature pad with an inline warning', async () => {
    const onSignComplete = vi.fn()
    const onClose = vi.fn()

    act(() => {
      root!.render(
        <SignOnGlassModal
          isOpen={true}
          onClose={onClose}
          role="receiver"
          defaultName="Ram Shrestha"
          bookingNo="B-100"
          onSignComplete={onSignComplete}
        />,
      )
    })

    const acceptBtn = [...host!.querySelectorAll('button')].find((b) =>
      b.textContent?.includes('Accept & Sign Handover'),
    ) as HTMLButtonElement
    expect(acceptBtn).not.toBeNull()

    await act(async () => {
      acceptBtn.click()
    })

    // onSignComplete must NOT be called on empty pad
    expect(onSignComplete).not.toHaveBeenCalled()
    expect(onClose).not.toHaveBeenCalled()

    // Error banner rendered
    expect(host!.textContent).toContain('Please draw your signature on the glass canvas before submitting.')
  })

  it('accepts drawn signature and passes captured signature to onSignComplete', async () => {
    const onSignComplete = vi.fn()
    const onClose = vi.fn()

    act(() => {
      root!.render(
        <SignOnGlassModal
          isOpen={true}
          onClose={onClose}
          role="receiver"
          defaultName="Ram Shrestha"
          bookingNo="B-100"
          onSignComplete={onSignComplete}
        />,
      )
    })

    const canvas = host!.querySelector('canvas') as HTMLCanvasElement
    expect(canvas).not.toBeNull()

    // Draw on the canvas
    act(() => {
      canvas.dispatchEvent(new PointerEvent('pointerdown', { clientX: 20, clientY: 30, pointerId: 1, bubbles: true }))
      canvas.dispatchEvent(new PointerEvent('pointermove', { clientX: 40, clientY: 50, pointerId: 1, bubbles: true }))
      canvas.dispatchEvent(new PointerEvent('pointerup', { pointerId: 1, bubbles: true }))
    })

    const acceptBtn = [...host!.querySelectorAll('button')].find((b) =>
      b.textContent?.includes('Accept & Sign Handover'),
    ) as HTMLButtonElement

    await act(async () => {
      acceptBtn.click()
    })

    expect(onSignComplete).toHaveBeenCalled()
    const callArg = onSignComplete.mock.calls[0]?.[0]
    expect(callArg.name).toBe('Ram Shrestha')
    expect(callArg.role).toBe('Receiver')
    expect(callArg.mode).toBe('draw')
    expect(typeof callArg.dataUrl).toBe('string')
    expect(onClose).toHaveBeenCalled()
  })

  it('uploads signature PNG and returns evidenceFileId when bookingId and userId are provided', async () => {
    const onSignComplete = vi.fn()
    const onClose = vi.fn()

    act(() => {
      root!.render(
        <SignOnGlassModal
          isOpen={true}
          onClose={onClose}
          role="warehouse"
          defaultName="Operator Sita"
          bookingNo="B-100"
          bookingId="b0000000-0000-4000-8000-000000000001"
          userId="u0000000-0000-4000-8000-000000000001"
          onSignComplete={onSignComplete}
        />,
      )
    })

    const canvas = host!.querySelector('canvas') as HTMLCanvasElement

    act(() => {
      canvas.dispatchEvent(new PointerEvent('pointerdown', { clientX: 15, clientY: 15, pointerId: 1, bubbles: true }))
      canvas.dispatchEvent(new PointerEvent('pointermove', { clientX: 35, clientY: 35, pointerId: 1, bubbles: true }))
      canvas.dispatchEvent(new PointerEvent('pointerup', { pointerId: 1, bubbles: true }))
    })

    const acceptBtn = [...host!.querySelectorAll('button')].find((b) =>
      b.textContent?.includes('Accept & Sign Handover'),
    ) as HTMLButtonElement

    await act(async () => {
      acceptBtn.click()
    })

    expect(onSignComplete).toHaveBeenCalled()
    const callArg = onSignComplete.mock.calls[0]?.[0]
    expect(callArg.evidenceFileId).toBe('ef-9999-9999-9999-999999999999')
    expect(callArg.role).toBe('Warehouse staff')
  })
})
