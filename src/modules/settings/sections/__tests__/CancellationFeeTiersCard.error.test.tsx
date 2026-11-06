// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { CancellationFeeTiersCard } from '../CancellationFeeTiersCard'
import * as tiersApi from '../../../../lib/queries/cancellationFeeTiers'

;(globalThis as Record<string, unknown>)['IS_REACT_ACT_ENVIRONMENT'] = true

describe('CancellationFeeTiersCard — read error truthfulness (UX-17)', () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    vi.restoreAllMocks()
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

  it('renders inline error alert when fetch fails instead of claiming no tiers exist', async () => {
    vi.spyOn(tiersApi, 'fetchCancellationFeeTiers').mockRejectedValueOnce(new Error('Network error'))

    await act(async () => {
      root.render(<CancellationFeeTiersCard />)
    })

    // Allow promises to resolve
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0))
    })

    const alert = container.querySelector('[role="alert"]')
    expect(alert).not.toBeNull()
    expect(alert?.textContent).toContain('Network error')
    expect(alert?.textContent).toContain('Could not retrieve policy tiers')
    expect(container.textContent).not.toContain('No cancellation fee tiers are defined')
  })

  it('retries fetch when Retry button is clicked', async () => {
    const fetchSpy = vi.spyOn(tiersApi, 'fetchCancellationFeeTiers')
      .mockRejectedValueOnce(new Error('Transient failure'))
      .mockResolvedValueOnce([
        {
          id: 'tier-1',
          noticeHours: 24,
          feePercent: 50,
          retiredAt: null,
          createdAt: '2026-11-06T00:00:00Z',
        },
      ])

    await act(async () => {
      root.render(<CancellationFeeTiersCard />)
    })
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0))
    })

    const retryBtn = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Retry'),
    )
    expect(retryBtn).toBeDefined()

    await act(async () => {
      retryBtn!.click()
    })
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0))
    })

    expect(fetchSpy).toHaveBeenCalledTimes(2)
    expect(container.querySelector('[role="alert"]')).toBeNull()
    expect(container.textContent).toContain('24h notice')
    expect(container.textContent).toContain('50% fee')
  })
})
