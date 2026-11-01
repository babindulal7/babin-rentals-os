// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import RiderDeliveryPage from '../RiderDeliveryPage'
import * as riderQuery from '../../../lib/queries/riderLink'

;(globalThis as Record<string, unknown>)['IS_REACT_ACT_ENVIRONMENT'] = true

describe('RiderDeliveryPage (T4-08, W49)', () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
    vi.restoreAllMocks()
  })

  afterEach(() => {
    act(() => {
      root.unmount()
    })
    container.remove()
    document.body.innerHTML = ''
    vi.restoreAllMocks()
  })

  const renderWithToken = (token: string) => {
    act(() => {
      root.render(
        <MemoryRouter initialEntries={[`/rider/${token}`]}>
          <Routes>
            <Route path="/rider/:token" element={<RiderDeliveryPage />} />
          </Routes>
        </MemoryRouter>,
      )
    })
  }

  it('renders loading state initially', async () => {
    vi.spyOn(riderQuery, 'fetchRiderJobByToken').mockReturnValue(new Promise(() => {}))
    renderWithToken('token-loading-1')

    const bodyText = document.body.textContent || ''
    expect(bodyText).toContain('Loading delivery details')
  })

  it('renders inactive / expired state when link is invalid or expired', async () => {
    vi.spyOn(riderQuery, 'fetchRiderJobByToken').mockRejectedValue(
      new Error('Delivery link has expired or was revoked by staff.'),
    )

    await act(async () => {
      renderWithToken('token-expired-2')
    })

    const bodyText = document.body.textContent || ''
    expect(bodyText).toContain('Delivery Link Inactive')
    expect(bodyText).toContain('Delivery link has expired or was revoked by staff.')
  })

  it('renders active job details in Scheduled / Ready state with strict money blindness (Law 6, Law 17)', async () => {
    vi.spyOn(riderQuery, 'fetchRiderJobByToken').mockResolvedValue({
      link_id: 'link-101',
      job_id: 'job-101',
      booking_no: 'BK-701',
      leg: 'Outbound',
      status: 'Ready',
      scheduled_at: new Date().toISOString(),
      rider_name: 'Prem Bahadur',
      rider_phone: '9841234567',
      pickup_address: 'Babin Rentals Hub, Lazimpat, Kathmandu',
      delivery_address: 'Mandala Theatre, Anamnagar, Kathmandu',
      contact_name: 'Anup Baral',
      contact_phone: '9851000000',
      item_count: 3,
      items: [
        { product_name: 'Sony FX3 Cinema Camera Kit', quantity: 1 },
        { product_name: 'Sennheiser Wireless G4 Mic Set', quantity: 2 },
      ],
      expires_at: new Date(Date.now() + 86400000).toISOString(),
    })

    await act(async () => {
      renderWithToken('valid-token-3')
    })

    const bodyText = document.body.textContent || ''
    // Job identification
    expect(bodyText).toContain('BK-701')
    expect(bodyText).toContain('Prem Bahadur')
    expect(bodyText).toContain('Mandala Theatre, Anamnagar, Kathmandu')
    expect(bodyText).toContain('Sony FX3 Cinema Camera Kit')
    expect(bodyText).toContain('3 items')

    // Floor verb button: Picked up from shop
    const pickupButton = Array.from(document.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Picked Up from Shop'),
    )
    expect(pickupButton).toBeDefined()
    expect(pickupButton?.getAttribute('data-floor-verb')).toBe('pickup')

    // STRICT MONEY BLINDNESS (Law 6): zero prices, NPR, Rs., or rate figures
    expect(bodyText).not.toMatch(/Rs\.?\s*\d+/i)
    expect(bodyText).not.toMatch(/NPR/i)
    expect(bodyText.toLowerCase()).not.toContain('deposit')
    expect(bodyText.toLowerCase()).not.toContain('fee')
    expect(bodyText.toLowerCase()).not.toContain('rate')
    expect(bodyText.toLowerCase()).not.toContain('total cost')

    // Law 17: word "customer" must never appear
    expect(bodyText.toLowerCase()).not.toContain('customer')
  })

  it('renders signature pad and floor action button (>=56px) in In Transit state', async () => {
    vi.spyOn(riderQuery, 'fetchRiderJobByToken').mockResolvedValue({
      link_id: 'link-102',
      job_id: 'job-102',
      booking_no: 'BK-702',
      leg: 'Outbound',
      status: 'In Transit',
      scheduled_at: new Date().toISOString(),
      rider_name: 'Suresh Rai',
      rider_phone: '9849999999',
      pickup_address: 'Babin Rentals Hub, Lazimpat',
      delivery_address: 'Film City, Godawari',
      contact_name: 'Rohan Sharma',
      contact_phone: '9801234567',
      item_count: 1,
      items: [{ product_name: 'Aputure 600d Pro Light Storm', quantity: 1 }],
      expires_at: new Date(Date.now() + 86400000).toISOString(),
    })

    await act(async () => {
      renderWithToken('transit-token-4')
    })

    const bodyText = document.body.textContent || ''
    expect(bodyText).toContain('Confirm Delivery')
    expect(bodyText).toContain('Film City, Godawari')

    // Confirm Delivered button exists with >=56px touch target
    const deliverButton = Array.from(document.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Mark Delivered'),
    )
    expect(deliverButton).toBeDefined()
    expect(deliverButton?.getAttribute('data-floor-verb')).toBe('deliver')
    expect(deliverButton?.style.minHeight).toBe('56px')

    // Signature canvas exists
    const canvas = document.querySelector('canvas')
    expect(canvas).toBeDefined()
  })

  it('shows delivered completion state when job is already delivered', async () => {
    vi.spyOn(riderQuery, 'fetchRiderJobByToken').mockResolvedValue({
      link_id: 'link-103',
      job_id: 'job-103',
      booking_no: 'BK-703',
      leg: 'Outbound',
      status: 'Delivered',
      scheduled_at: new Date().toISOString(),
      rider_name: 'Suresh Rai',
      rider_phone: '9849999999',
      pickup_address: 'Babin Rentals Hub',
      delivery_address: 'Film City, Godawari',
      contact_name: 'Rohan Sharma',
      contact_phone: '9801234567',
      item_count: 1,
      items: [{ product_name: 'Aputure 600d', quantity: 1 }],
      expires_at: new Date(Date.now() + 86400000).toISOString(),
    })

    await act(async () => {
      renderWithToken('delivered-token-5')
    })

    const bodyText = document.body.textContent || ''
    expect(bodyText).toContain('Delivery Complete!')
    expect(bodyText).toContain('The delivery has been verified and registered on the system.')
  })
})
