// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ToastProvider } from '../../../components/ui/Toast'
import LegacyExportCard from '../LegacyExportCard'
import * as legacyExportLib from '../../../lib/legacyLocalExport'

;(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true

describe('LegacyExportCard (T4-06, Ruling D28, Law 3)', () => {
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
          <LegacyExportCard />
        </ToastProvider>,
      )
    })
    // Give async getLegacyLocalEntriesSummary state update a cycle
    await act(async () => {
      await new Promise((r) => setTimeout(r, 10))
    })
  }

  it('renders nothing on a clean device with 0 legacy entries', async () => {
    await renderComponent()
    const region = container?.querySelector('[role="region"]')
    expect(region).toBeNull()
  })

  it('renders notice with count when legacy entries exist', async () => {
    localStorage.setItem('babin_internal_notes_v1', JSON.stringify([{ id: 'n1' }, { id: 'n2' }]))
    localStorage.setItem('br.productions', JSON.stringify([{ id: 'p1' }]))

    await renderComponent()

    const region = container?.querySelector('[role="region"]')
    expect(region).not.toBeNull()
    expect(container?.textContent).toContain('Old device entries found')
    expect(container?.textContent).toContain('3')
    expect(container?.textContent).toContain('old entries saved only here')
    expect(container?.textContent).toContain('Download file for Babin')
  })

  it('renders nothing if export notice has been dismissed', async () => {
    localStorage.setItem('babin_internal_notes_v1', JSON.stringify([{ id: 'n1' }]))
    legacyExportLib.dismissLegacyExport()

    await renderComponent()

    const region = container?.querySelector('[role="region"]')
    expect(region).toBeNull()
  })

  it('dismisses card when Dismiss button is clicked and preserves localStorage entries (Law 3)', async () => {
    localStorage.setItem('babin_internal_notes_v1', JSON.stringify([{ id: 'n1' }]))

    await renderComponent()

    const dismissBtn = Array.from(container?.querySelectorAll('button') ?? []).find(
      (b) => b.textContent?.trim() === 'Dismiss',
    )
    expect(dismissBtn).toBeDefined()

    await act(async () => {
      dismissBtn?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

    // Notice disappears
    expect(container?.querySelector('[role="region"]')).toBeNull()
    expect(legacyExportLib.isLegacyExportDismissed()).toBe(true)

    // Data remains completely intact
    expect(localStorage.getItem('babin_internal_notes_v1')).not.toBeNull()
  })

  it('triggers download when Download button is clicked', async () => {
    localStorage.setItem('br.productions', JSON.stringify([{ id: 'prod-1' }]))
    const downloadSpy = vi.spyOn(legacyExportLib, 'downloadLegacyExport').mockResolvedValue({
      exportedAt: '2026-10-28T00:00:00.000Z',
      device: { userAgent: 'test', platform: 'test' },
      totalCount: 1,
      summary: { 'br.productions': 1 },
      data: { 'br.productions': [{ id: 'prod-1' }] },
      csvText: 'test',
    })

    await renderComponent()

    const downloadBtn = Array.from(container?.querySelectorAll('button') ?? []).find(
      (b) => b.textContent?.includes('Download file for Babin'),
    )
    expect(downloadBtn).toBeDefined()

    await act(async () => {
      downloadBtn?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

    expect(downloadSpy).toHaveBeenCalled()
  })
})
