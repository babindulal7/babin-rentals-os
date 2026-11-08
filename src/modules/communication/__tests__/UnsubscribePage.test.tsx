// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import * as offerActions from '../../../actions/marketing/offerCampaigns'

;(globalThis as Record<string, unknown>)['IS_REACT_ACT_ENVIRONMENT'] = true

const { UnsubscribePage } = await import('../UnsubscribePage')

describe('UnsubscribePage (T5-12, K6)', () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
    vi.clearAllMocks()
  })

  afterEach(() => {
    act(() => {
      root.unmount()
    })
    container.remove()
  })

  it('renders missing token error when accessed without token', async () => {
    await act(async () => {
      root.render(
        <MemoryRouter initialEntries={['/unsubscribe']}>
          <Routes>
            <Route path="/unsubscribe" element={<UnsubscribePage />} />
          </Routes>
        </MemoryRouter>
      )
    })

    expect(container.textContent).toContain('Missing unsubscribe token')
  })

  it('renders success confirmation when token is successfully processed', async () => {
    vi.spyOn(offerActions, 'unsubscribeClient').mockResolvedValueOnce({
      success: true,
      clientCode: 'C-9901',
      unsubscribedAt: '2026-11-06T12:00:00Z',
    })

    await act(async () => {
      root.render(
        <MemoryRouter initialEntries={['/unsubscribe?token=sample-crypto-token']}>
          <Routes>
            <Route path="/unsubscribe" element={<UnsubscribePage />} />
          </Routes>
        </MemoryRouter>
      )
    })

    expect(container.textContent).toContain('Unsubscribed Successfully')
    expect(container.textContent).toContain('C-9901')
  })

  it('renders error state when token is invalid or expired', async () => {
    vi.spyOn(offerActions, 'unsubscribeClient').mockResolvedValueOnce({
      success: false,
      error: 'The unsubscribe link is invalid or has expired.',
    })

    await act(async () => {
      root.render(
        <MemoryRouter initialEntries={['/unsubscribe?token=invalid-token']}>
          <Routes>
            <Route path="/unsubscribe" element={<UnsubscribePage />} />
          </Routes>
        </MemoryRouter>
      )
    })

    expect(container.textContent).toContain('Unsubscribe Unsuccessful')
    expect(container.textContent).toContain('invalid or has expired')
  })
})
