// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import {
  InputGroup,
  InputGroupAddon,
  InputGroupText,
  InputGroupInput,
  InputGroupTextarea,
  Kbd,
  Dialog,
  DialogPopup,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogPanel,
  DialogFooter,
  DialogClose,
} from '../index'

;(globalThis as Record<string, unknown>)['IS_REACT_ACT_ENVIRONMENT'] = true

describe('coss UI Primitives & InputGroup Patterns', () => {
  let host: HTMLDivElement | null = null
  let root: Root | null = null

  beforeEach(() => {
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

  it('renders InputGroup with inline start and end addons', () => {
    act(() => {
      root!.render(
        <InputGroup>
          <InputGroupAddon align="inline-start">
            <InputGroupText>Rs.</InputGroupText>
          </InputGroupAddon>
          <InputGroupInput placeholder="Amount" aria-label="Amount" />
          <InputGroupAddon align="inline-end">
            <InputGroupText>NPR</InputGroupText>
          </InputGroupAddon>
        </InputGroup>
      )
    })

    expect(host!.textContent).toContain('Rs.')
    expect(host!.textContent).toContain('NPR')
    const input = host!.querySelector('input')
    expect(input).not.toBeNull()
    expect(input?.getAttribute('aria-label')).toBe('Amount')
  })

  it('transfers focus to input when clicking on non-interactive addon', () => {
    act(() => {
      root!.render(
        <InputGroup>
          <InputGroupAddon align="inline-start" id="addon-prefix">
            <InputGroupText>Search</InputGroupText>
          </InputGroupAddon>
          <InputGroupInput placeholder="Type query" />
        </InputGroup>
      )
    })

    const input = host!.querySelector('input') as HTMLInputElement
    const addon = host!.querySelector('#addon-prefix') as HTMLDivElement

    expect(document.activeElement).not.toBe(input)
    act(() => {
      addon.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }))
    })
    expect(document.activeElement).toBe(input)
  })

  it('renders InputGroupTextarea with block-end addon and Kbd', () => {
    act(() => {
      root!.render(
        <InputGroup>
          <InputGroupTextarea placeholder="Paste items" />
          <InputGroupAddon align="block-end">
            <InputGroupText>5 items</InputGroupText>
            <Kbd>Enter ↵</Kbd>
          </InputGroupAddon>
        </InputGroup>
      )
    })

    expect(host!.querySelector('textarea')).not.toBeNull()
    expect(host!.textContent).toContain('5 items')
    expect(host!.textContent).toContain('Enter ↵')
  })

  it('renders Kbd with accessible styling and typography', () => {
    act(() => {
      root!.render(<Kbd id="shortcut-k">⌘K</Kbd>)
    })

    const kbd = host!.querySelector('kbd#shortcut-k')
    expect(kbd).not.toBeNull()
    expect(kbd?.textContent).toBe('⌘K')
    expect(kbd?.getAttribute('data-slot')).toBe('kbd')
  })

  it('renders coss Dialog overlay with header, panel, and close action', () => {
    act(() => {
      root!.render(
        <Dialog defaultOpen>
          <DialogPopup>
            <DialogHeader>
              <DialogTitle>Operational Asset</DialogTitle>
              <DialogDescription>Equipment details overview</DialogDescription>
            </DialogHeader>
            <DialogPanel>
              <p>Barcode content and specification tags</p>
            </DialogPanel>
            <DialogFooter>
              <DialogClose>Done</DialogClose>
            </DialogFooter>
          </DialogPopup>
        </Dialog>
      )
    })

    expect(document.body.textContent).toContain('Operational Asset')
    expect(document.body.textContent).toContain('Equipment details overview')
    expect(document.body.textContent).toContain('Barcode content and specification tags')
    expect(document.body.textContent).toContain('Done')
  })
})
