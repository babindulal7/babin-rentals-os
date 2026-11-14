// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import RiderDeliveryPage from '../RiderDeliveryPage'
import * as riderQuery from '../../../lib/queries/riderLink'

;(globalThis as Record<string, unknown>)['IS_REACT_ACT_ENVIRONMENT'] = true

describe('RiderDeliveryPage Responsive Layout & Viewports (T4-08, 375px/820px/1440px)', () => {
  let container: HTMLDivElement
  let root: Root

  const mockActiveJob: riderQuery.RiderJobData = {
    link_id: 'link-resp-101',
    job_id: 'job-resp-101',
    booking_no: 'BK-2026-999',
    leg: 'Outbound',
    status: 'In Transit',
    scheduled_at: new Date().toISOString(),
    rider_name: 'Suresh Rai',
    rider_phone: '9849999999',
    pickup_address: 'Babin Rentals Hub, Lazimpat',
    delivery_address: 'Film City, Godawari',
    contact_name: 'Rohan Sharma',
    contact_phone: '9801234567',
    item_count: 2,
    items: [
      { product_name: 'Sony FX3 Cinema Line Camera', quantity: 1 },
      { product_name: 'Sony FE 24-70mm GM II', quantity: 1 },
    ],
    expires_at: new Date(Date.now() + 86400000).toISOString(),
  }

  beforeEach(() => {
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
    vi.restoreAllMocks()
    vi.spyOn(riderQuery, 'fetchRiderJobByToken').mockResolvedValue(mockActiveJob)
  })

  afterEach(() => {
    act(() => {
      root.unmount()
    })
    container.remove()
    document.body.innerHTML = ''
    vi.restoreAllMocks()
  })

  const viewports = [
    { name: 'Mobile (375px)', width: 375, height: 667 },
    { name: 'Tablet (820px)', width: 820, height: 1180 },
    { name: 'Desktop (1440px)', width: 1440, height: 900 },
  ]

  viewports.forEach(({ name, width, height }) => {
    it(`renders cleanly without horizontal clipping or overflow at ${name}`, async () => {
      window.innerWidth = width
      window.innerHeight = height
      container.style.width = `${width}px`

      await act(async () => {
        root.render(
          <MemoryRouter initialEntries={['/rider/valid-resp-token']}>
            <Routes>
              <Route path="/rider/:token" element={<RiderDeliveryPage />} />
            </Routes>
          </MemoryRouter>,
        )
      })

      // Wait for fetchRiderJobByToken resolution
      await act(async () => {
        await new Promise((r) => setTimeout(r, 10))
      })

      const bodyText = document.body.textContent || ''
      expect(bodyText).toContain('BK-2026-999')
      expect(bodyText).toContain('Film City, Godawari')
      expect(bodyText).toContain('In Transit')

      // Check button touch target minimum height on mobile/tablet (Law 16 >= 56px)
      const actionButton = Array.from(document.querySelectorAll('button')).find((b) =>
        b.textContent?.includes('Mark Delivered'),
      )
      expect(actionButton).toBeDefined()
      expect(actionButton?.getAttribute('data-floor-verb')).toBe('deliver')
      expect(actionButton?.style.minHeight).toBe('56px')

      // STRICT MONEY BLINDNESS (Law 6): zero prices, NPR, Rs., or rate figures
      expect(bodyText).not.toMatch(/Rs\.?\s*\d+/i)
      expect(bodyText).not.toMatch(/NPR/i)
      expect(bodyText.toLowerCase()).not.toContain('deposit')
      expect(bodyText.toLowerCase()).not.toContain('fee')
      expect(bodyText.toLowerCase()).not.toContain('rate')
      expect(bodyText.toLowerCase()).not.toContain('customer')
    })
  })
})
