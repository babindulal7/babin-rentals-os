// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import RiderDeliveryPage from '../RiderDeliveryPage'
import * as riderQuery from '../../../lib/queries/riderLink'

;(globalThis as Record<string, unknown>)['IS_REACT_ACT_ENVIRONMENT'] = true

// The real rider query layer in its mock mode, regardless of how the suite is launched.
vi.mock('../../../lib/supabase', () => ({
  IS_MOCK: true,
  supabase: {},
}))

const RECEIVER_PLACEHOLDER = 'input[placeholder="Name of person receiving the gear"]'

describe('RiderDeliveryPage end-to-end flow (FUNC-1)', () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    localStorage.clear()
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => {
      root.unmount()
    })
    container.remove()
    document.body.innerHTML = ''
    vi.restoreAllMocks()
  })

  // createRiderLink may return no raw token when it replays an earlier request (client_uuid idempotency);
  // a fresh link always has one.
  async function issueLink(jobId: string, name: string, phone: string): Promise<string> {
    const { rawToken } = await riderQuery.createRiderLink(jobId, name, phone, 'Owner')
    if (!rawToken) throw new Error('expected a raw token for a newly issued link')
    return rawToken
  }

  const button = (text: string) =>
    Array.from(document.querySelectorAll('button')).find((b) => b.textContent?.includes(text)) as HTMLButtonElement

  async function openAsRider(token: string) {
    await act(async () => {
      root.render(
        <MemoryRouter initialEntries={[`/rider/${token}`]}>
          <Routes>
            <Route path="/rider/:token" element={<RiderDeliveryPage />} />
          </Routes>
        </MemoryRouter>,
      )
    })
  }

  async function typeReceiver(name: string) {
    const input = document.querySelector(RECEIVER_PLACEHOLDER) as HTMLInputElement
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, name)
      input.dispatchEvent(new Event('input', { bubbles: true }))
    })
  }

  it('shows "Delivery Complete" after a real pickup then delivery, not the inactive-link screen', async () => {
    const rawToken = await issueLink('job-1', 'Ram Rider', '9801234567')
    await openAsRider(rawToken)

    await act(async () => {
      button('Picked Up from Shop').click()
    })
    await typeReceiver('Suman Receiver')
    await act(async () => {
      ;(document.querySelector('[data-floor-verb="deliver"]') as HTMLButtonElement).click()
    })

    const text = document.body.textContent || ''
    expect(text).toContain('Delivery Complete')
    expect(text).toContain('Suman Receiver')
    expect(text).toContain('Ram Rider')
    expect(text).not.toContain('Delivery Link Inactive')
  })

  it('does not re-fetch the job after a successful delivery, because the server refuses a completed link', async () => {
    const job = {
      link_id: 'l-1',
      job_id: 'j-1',
      booking_no: 'BK-701',
      leg: 'Outbound' as const,
      status: 'In Transit' as const,
      scheduled_at: new Date().toISOString(),
      rider_name: 'Prem Bahadur',
      rider_phone: '9841234567',
      pickup_address: 'Hub',
      delivery_address: 'Studio',
      contact_name: 'Anup',
      contact_phone: '9851000000',
      item_count: 1,
      items: [{ product_name: 'Camera', quantity: 1 }],
      expires_at: new Date(Date.now() + 86400000).toISOString(),
    }
    // First read succeeds; any later read behaves like production once the link is completed.
    const fetchSpy = vi
      .spyOn(riderQuery, 'fetchRiderJobByToken')
      .mockResolvedValueOnce(job)
      .mockRejectedValue(new Error('Delivery link has already been completed'))
    const completeSpy = vi.spyOn(riderQuery, 'riderCompleteJobDelivery').mockResolvedValue(undefined)

    await openAsRider('tok-live')
    await typeReceiver('Suman Receiver')
    await act(async () => {
      ;(document.querySelector('[data-floor-verb="deliver"]') as HTMLButtonElement).click()
    })

    expect(completeSpy).toHaveBeenCalledTimes(1)
    expect(fetchSpy).toHaveBeenCalledTimes(1)
    expect(document.body.textContent).toContain('Delivery Complete')
    expect(document.body.textContent).not.toContain('Delivery Link Inactive')
  })

  it('a failed delivery keeps the rider on the job screen so they can retry', async () => {
    const rawToken = await issueLink('job-2', 'Hari Rider', '9812345678')
    vi.spyOn(riderQuery, 'riderCompleteJobDelivery').mockRejectedValue(new Error('Could not reach the delivery service.'))
    const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {})

    await openAsRider(rawToken)
    await act(async () => {
      button('Picked Up from Shop').click()
    })
    await typeReceiver('Suman Receiver')
    await act(async () => {
      ;(document.querySelector('[data-floor-verb="deliver"]') as HTMLButtonElement).click()
    })

    expect(alertSpy).toHaveBeenCalledWith('Could not reach the delivery service.')
    expect(document.body.textContent).not.toContain('Delivery Complete')
    expect(document.querySelector('[data-floor-verb="deliver"]')).not.toBeNull()
  })
})
