// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { StickyFloorBar } from '../StickyFloorBar'

;(globalThis as Record<string, unknown>)['IS_REACT_ACT_ENVIRONMENT'] = true

describe('StickyFloorBar (Usability Principle 7: 56px Floor Verbs)', () => {
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

  it('enforces minHeight >= 56px on the primary floor verb button', async () => {
    const handleComplete = vi.fn()
    const handleScan = vi.fn()

    await act(async () => {
      root.render(
        <StickyFloorBar
          progress={{ current: 5, total: 10, label: '5 remaining' }}
          onScan={handleScan}
          primaryAction={{
            label: 'Complete Packing',
            onClick: handleComplete,
          }}
        />
      )
    })

    const primaryBtn = container.querySelector<HTMLButtonElement>('button[data-primary-verb="true"]')
    expect(primaryBtn).not.toBeNull()
    expect(primaryBtn!.style.minHeight).toBe('56px')
    expect(primaryBtn!.textContent).toContain('Complete Packing')
  })

  it('renders progress counts and percentage', async () => {
    await act(async () => {
      root.render(
        <StickyFloorBar
          progress={{ current: 8, total: 10, label: '2 remaining' }}
          primaryAction={{
            label: 'Complete Handover',
            onClick: vi.fn(),
          }}
        />
      )
    })

    expect(container.textContent).toContain('8/10')
    expect(container.textContent).toContain('(80%)')
    expect(container.textContent).toContain('2 remaining')
  })

  it('invokes onScan when the scan button is tapped', async () => {
    const handleScan = vi.fn()
    await act(async () => {
      root.render(
        <StickyFloorBar
          progress={{ current: 3, total: 5 }}
          onScan={handleScan}
          primaryAction={{
            label: 'Complete Return',
            onClick: vi.fn(),
          }}
        />
      )
    })

    const scanBtn = container.querySelector<HTMLButtonElement>('button[aria-label="Scan barcode or QR code"]')
    expect(scanBtn).not.toBeNull()
    act(() => {
      scanBtn!.click()
    })
    expect(handleScan).toHaveBeenCalledTimes(1)
  })

  it('omits the scan button when onScan is not provided', async () => {
    await act(async () => {
      root.render(
        <StickyFloorBar
          progress={{ current: 3, total: 5 }}
          primaryAction={{
            label: 'Complete Reset',
            onClick: vi.fn(),
          }}
        />
      )
    })

    const scanBtn = container.querySelector<HTMLButtonElement>('button[aria-label="Scan barcode or QR code"]')
    expect(scanBtn).toBeNull()
  })

  it('invokes primaryAction.onClick when primary verb is clicked', async () => {
    const handleComplete = vi.fn()
    await act(async () => {
      root.render(
        <StickyFloorBar
          progress={{ current: 10, total: 10, complete: true }}
          primaryAction={{
            label: 'Complete Reset',
            onClick: handleComplete,
          }}
        />
      )
    })

    const primaryBtn = container.querySelector<HTMLButtonElement>('button[data-primary-verb="true"]')
    expect(primaryBtn).not.toBeNull()
    act(() => {
      primaryBtn!.click()
    })
    expect(handleComplete).toHaveBeenCalledTimes(1)
  })
})
