// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ToastProvider } from '../../../../components/ui/Toast'
import { LegacyExportControl } from '../LegacyExportControl'
import * as legacyExportLib from '../../../../lib/legacyLocalExport'

;(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true

describe('LegacyExportControl (Settings ▸ System)', () => {
  let container: HTMLDivElement | null = null
  let root: Root | null = null

  beforeEach(() => {
    localStorage.clear()
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
    vi.restoreAllMocks()
  })

  afterEach(() => {
    if (root) {
      act(() => {
        root?.unmount()
      })
    }
    container?.remove()
    container = null
    root = null
    localStorage.clear()
  })

  const renderComponent = async () => {
    await act(async () => {
      root?.render(
        <ToastProvider>
          <LegacyExportControl />
        </ToastProvider>,
      )
    })
    await act(async () => {
      await new Promise((r) => setTimeout(r, 10))
    })
  }

  it('shows zero entries on a clean device and disables download button', async () => {
    await renderComponent()
    expect(container?.textContent).toContain('No unsynced legacy entries on this device')
    const btn = container?.querySelector('button[disabled]')
    expect(btn).not.toBeNull()
  })

  it('shows entry count when legacy data is stored and enables download', async () => {
    localStorage.setItem('br.shiftHandovers', JSON.stringify([{ id: 'sh-old' }]))
    localStorage.setItem('babin_coupons_v2', JSON.stringify([{ id: 'c-old' }]))

    await renderComponent()

    expect(container?.textContent).toContain('2')
    expect(container?.textContent).toContain('old entries saved on this device')

    const downloadBtn = Array.from(container?.querySelectorAll('button') ?? []).find(
      (b) => b.textContent?.includes('Download file for Babin'),
    )
    expect(downloadBtn).toBeDefined()
    expect(downloadBtn?.hasAttribute('disabled')).toBe(false)
  })

  it('provides button to restore Today notice if previously dismissed', async () => {
    localStorage.setItem('br.warranties', JSON.stringify([{ id: 'w-1' }]))
    legacyExportLib.dismissLegacyExport()

    await renderComponent()

    const restoreBtn = Array.from(container?.querySelectorAll('button') ?? []).find(
      (b) => b.textContent?.includes('Restore Today notice'),
    )
    expect(restoreBtn).toBeDefined()

    await act(async () => {
      restoreBtn?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

    expect(legacyExportLib.isLegacyExportDismissed()).toBe(false)
  })
})
