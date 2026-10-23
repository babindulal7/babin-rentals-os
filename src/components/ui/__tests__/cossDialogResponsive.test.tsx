// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import {
  Dialog,
  DialogPopup,
  DialogHeader,
  DialogTitle,
  DialogPanel,
  DialogFooter,
  DialogClose,
} from '../cossDialog'

let mockViewport: 'phone' | 'tablet' | 'desktop' = 'desktop'

vi.mock('../../../lib/device', () => ({
  useViewport: () => mockViewport,
}))

;(globalThis as Record<string, unknown>)['IS_REACT_ACT_ENVIRONMENT'] = true

describe('cossDialog Responsive Mobile Bottom-Stick & Desktop Centering', () => {
  let host: HTMLDivElement | null = null
  let root: Root | null = null

  beforeEach(() => {
    mockViewport = 'desktop'
    host = document.createElement('div')
    document.body.appendChild(host)
    root = createRoot(host)
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

  it('renders centered with card border-radius and maxWidth on desktop (width >= 1280)', () => {
    mockViewport = 'desktop'

    act(() => {
      root!.render(
        <Dialog defaultOpen>
          <DialogPopup>
            <DialogHeader>
              <DialogTitle>Desktop Dialog</DialogTitle>
            </DialogHeader>
            <DialogPanel>Desktop content</DialogPanel>
            <DialogFooter>
              <DialogClose>Close</DialogClose>
            </DialogFooter>
          </DialogPopup>
        </Dialog>
      )
    })

    const wrapper = document.querySelector('.coss-dialog__wrapper') as HTMLDivElement
    expect(wrapper).not.toBeNull()
    expect(wrapper.style.alignItems).toBe('center')
    expect(wrapper.style.justifyContent).toBe('center')

    const popup = document.querySelector('[data-slot="dialog-popup"]') as HTMLDivElement
    expect(popup).not.toBeNull()
    expect(popup.style.maxWidth).toBe('520px')
    expect(popup.style.borderRadius).toBe('var(--r-card, 12px)')
  })

  it('renders centered on tablet (768 to 1279px)', () => {
    mockViewport = 'tablet'

    act(() => {
      root!.render(
        <Dialog defaultOpen>
          <DialogPopup>
            <DialogHeader>
              <DialogTitle>Tablet Dialog</DialogTitle>
            </DialogHeader>
            <DialogPanel>Tablet content</DialogPanel>
          </DialogPopup>
        </Dialog>
      )
    })

    const wrapper = document.querySelector('.coss-dialog__wrapper') as HTMLDivElement
    expect(wrapper).not.toBeNull()
    expect(wrapper.style.alignItems).toBe('center')

    const popup = document.querySelector('[data-slot="dialog-popup"]') as HTMLDivElement
    expect(popup).not.toBeNull()
    expect(popup.style.maxWidth).toBe('520px')
    expect(popup.style.borderRadius).toBe('var(--r-card, 12px)')
  })

  it('renders pinned to bottom as a bottom-sheet on phone (< 768px) with bottomStickOnMobile=true', () => {
    mockViewport = 'phone'

    act(() => {
      root!.render(
        <Dialog defaultOpen>
          <DialogPopup bottomStickOnMobile={true}>
            <DialogHeader>
              <DialogTitle>Phone Bottom Sheet</DialogTitle>
            </DialogHeader>
            <DialogPanel>Phone sheet content</DialogPanel>
            <DialogFooter>
              <DialogClose>Confirm</DialogClose>
            </DialogFooter>
          </DialogPopup>
        </Dialog>
      )
    })

    const wrapper = document.querySelector('.coss-dialog__wrapper') as HTMLDivElement
    expect(wrapper).not.toBeNull()
    expect(wrapper.style.alignItems).toBe('flex-end')
    expect(wrapper.style.padding).toBe('0px')

    const popup = document.querySelector('[data-slot="dialog-popup"]') as HTMLDivElement
    expect(popup).not.toBeNull()
    expect(popup.style.maxWidth).toBe('100%')
    expect(popup.style.borderRadius).toBe('16px 16px 0 0')
    expect(popup.className).toContain('coss-dialog__popup--bottom-stick')

    const footer = document.querySelector('[data-slot="dialog-footer"]') as HTMLDivElement
    expect(footer).not.toBeNull()
    expect(footer.className).toContain('coss-dialog__footer')
  })

  it('renders centered on phone when bottomStickOnMobile is explicitly false', () => {
    mockViewport = 'phone'

    act(() => {
      root!.render(
        <Dialog defaultOpen>
          <DialogPopup bottomStickOnMobile={false}>
            <DialogHeader>
              <DialogTitle>Centered Phone Modal</DialogTitle>
            </DialogHeader>
            <DialogPanel>Center content</DialogPanel>
          </DialogPopup>
        </Dialog>
      )
    })

    const wrapper = document.querySelector('.coss-dialog__wrapper') as HTMLDivElement
    expect(wrapper).not.toBeNull()
    expect(wrapper.style.alignItems).toBe('center')

    const popup = document.querySelector('[data-slot="dialog-popup"]') as HTMLDivElement
    expect(popup).not.toBeNull()
    expect(popup.style.maxWidth).toBe('520px')
    expect(popup.style.borderRadius).toBe('var(--r-card, 12px)')
  })
})
