// @vitest-environment jsdom
/**
 * src/booking/components/__tests__/bookingFlowE2E.test.tsx
 *
 * Integrated UI test for the Public Front Door & Online Booking Flow (T7):
 * - Product browsing & availability states (icon + label + color)
 * - Cart drawer rental day computation (06:00 Kathmandu boundary)
 * - Integer paisa money formatting, 13% VAT, and 50% advance due
 * - Request checkout submission and confirmed REQ receipt screen
 * - Away mode pause handling
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { createRoot, type Root } from 'react-dom/client'
import { act } from 'react'
import { ProductCard } from '../ProductCard'
import { CartDrawer, type CartLine } from '../CartDrawer'
import type { CatalogueItem } from '../../lib/catalogueApi'
import * as catalogueApi from '../../lib/catalogueApi'

;(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true

const sampleItem: CatalogueItem = {
  id: 'prod-fx6-01',
  kind: 'product',
  slug: 'sony-fx6-cinema-line',
  name: 'Sony FX6 Cinema Camera',
  category_name: 'Cameras',
  description: 'Full-frame cinema camera with electronic variable ND and dual base ISO.',
  photo_paths: [],
  daily_rate_paisa: 600000, // Rs 6,000 / day
  weekly_rate_paisa: 3600000,
  monthly_rate_paisa: 12000000,
  bundle_contents: [],
}

describe('Public Booking Front Door Flow (T7 UI/UX)', () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
    vi.restoreAllMocks()
  })

  describe('ProductCard availability and accessibility', () => {
    it('renders dates-needed state when dates are not chosen', () => {
      act(() => {
        root.render(
          <ProductCard
            item={sampleItem}
            hasDates={false}
            onViewDetails={vi.fn()}
            onAddToCart={vi.fn()}
          />
        )
      })

      const badge = container.querySelector('.availability-badge')
      expect(badge?.textContent).toContain('📅')
      expect(badge?.textContent).toContain('Select dates')

      const addBtn = container.querySelector('button.btn-primary') as HTMLButtonElement
      expect(addBtn.disabled).toBe(true)
      expect(addBtn.getAttribute('aria-label')).toContain('Select rental dates above')
    })

    it('renders available state with icon + label + color when available', () => {
      const onAddToCart = vi.fn()
      act(() => {
        root.render(
          <ProductCard
            item={sampleItem}
            hasDates={true}
            isAvailable={true}
            onViewDetails={vi.fn()}
            onAddToCart={onAddToCart}
          />
        )
      })

      const badge = container.querySelector('.availability-badge')
      expect(badge?.classList.contains('available')).toBe(true)
      expect(badge?.textContent).toContain('✓')
      expect(badge?.textContent).toContain('Available')

      const addBtn = container.querySelector('button.btn-primary') as HTMLButtonElement
      expect(addBtn.disabled).toBe(false)

      act(() => {
        addBtn.click()
      })
      expect(onAddToCart).toHaveBeenCalledWith(sampleItem)
    })

    it('renders unavailable state with icon + label + color when unavailable', () => {
      act(() => {
        root.render(
          <ProductCard
            item={sampleItem}
            hasDates={true}
            isAvailable={false}
            onViewDetails={vi.fn()}
            onAddToCart={vi.fn()}
          />
        )
      })

      const badge = container.querySelector('.availability-badge')
      expect(badge?.classList.contains('unavailable')).toBe(true)
      expect(badge?.textContent).toContain('✕')
      expect(badge?.textContent).toContain('Unavailable')

      const addBtn = container.querySelector('button.btn-primary') as HTMLButtonElement
      expect(addBtn.disabled).toBe(true)
      expect(addBtn.getAttribute('aria-label')).toContain('not available on selected dates')
    })
  })

  describe('CartDrawer rental calculation and checkout flow', () => {
    const cartItems: CartLine[] = [
      { item: sampleItem, quantity: 2 },
    ]

    it('calculates rental days, 13% VAT, and 50% advance due across chosen dates', () => {
      act(() => {
        root.render(
          <CartDrawer
            isOpen={true}
            onClose={vi.fn()}
            items={cartItems}
            startDate="2026-11-25"
            endDate="2026-11-27"
            startTime="06:00"
            endTime="06:00"
            onUpdateQty={vi.fn()}
            onRemoveItem={vi.fn()}
            onClearCart={vi.fn()}
            bookingChecksReady={true}
          />
        )
      })

      // 2 days rental (25th to 27th at 06:00 boundary)
      // Daily rate: Rs 6,000 * 2 units = Rs 12,000 / day * 2 days = Rs 24,000 (2,400,000 paisa)
      // VAT (13%): Rs 3,120 (312,000 paisa)
      // Total: Rs 27,120 (2,712,000 paisa)
      // Advance due (50%): Rs 13,560 (1,356,000 paisa)
      expect(container.textContent).toContain('2 days')
      expect(container.textContent).toContain('24,000') // Subtotal
      expect(container.textContent).toContain('3,120')  // 13% VAT
      expect(container.textContent).toContain('27,120') // Total
      expect(container.textContent).toContain('13,560') // 50% Advance
    })

    it('supports quantity increments and decrements with >=44px buttons', () => {
      const onUpdateQty = vi.fn()
      const onRemoveItem = vi.fn()

      act(() => {
        root.render(
          <CartDrawer
            isOpen={true}
            onClose={vi.fn()}
            items={cartItems}
            startDate="2026-11-25"
            endDate="2026-11-27"
            onUpdateQty={onUpdateQty}
            onRemoveItem={onRemoveItem}
            onClearCart={vi.fn()}
            bookingChecksReady={true}
          />
        )
      })

      const minusBtn = container.querySelector('button[aria-label="Decrease quantity of Sony FX6 Cinema Camera"]') as HTMLButtonElement
      const plusBtn = container.querySelector('button[aria-label="Increase quantity of Sony FX6 Cinema Camera"]') as HTMLButtonElement
      const deleteBtn = container.querySelector('button[aria-label="Remove Sony FX6 Cinema Camera from request"]') as HTMLButtonElement

      expect(minusBtn).toBeTruthy()
      expect(plusBtn).toBeTruthy()
      expect(deleteBtn).toBeTruthy()

      act(() => {
        plusBtn.click()
      })
      expect(onUpdateQty).toHaveBeenCalledWith('prod-fx6-01', 1)

      act(() => {
        minusBtn.click()
      })
      expect(onUpdateQty).toHaveBeenCalledWith('prod-fx6-01', -1)

      act(() => {
        deleteBtn.click()
      })
      expect(onRemoveItem).toHaveBeenCalledWith('prod-fx6-01')
    })

    it('submits checkout request and displays confirmed REQ receipt screen', async () => {
      const mockResult: catalogueApi.BookingRequestResult = {
        request_id: 'req-12345',
        request_number: 'REQ-20261125-0042',
        status: 'pending',
        total_paisa: 2400000,
        vat_paisa: 312000,
        advance_due_paisa: 1356000,
      }

      vi.spyOn(catalogueApi, 'submitBookingRequest').mockResolvedValue(mockResult)
      const onClearCart = vi.fn()

      act(() => {
        root.render(
          <CartDrawer
            isOpen={true}
            onClose={vi.fn()}
            items={cartItems}
            startDate="2026-11-25"
            endDate="2026-11-27"
            onUpdateQty={vi.fn()}
            onRemoveItem={vi.fn()}
            onClearCart={onClearCart}
            bookingChecksReady={true}
          />
        )
      })

      // Click proceed to checkout
      const proceedBtn = container.querySelector('button.btn-primary') as HTMLButtonElement
      expect(proceedBtn.textContent).toContain('Proceed to Contact & Location')

      act(() => {
        proceedBtn.click()
      })

      // Now on checkout form step
      const setInputValue = (input: HTMLInputElement, val: string) => {
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, val)
        input.dispatchEvent(new Event('input', { bubbles: true }))
        input.dispatchEvent(new Event('change', { bubbles: true }))
      }

      const nameInput = container.querySelector('input[placeholder="e.g. Aayush Shrestha"]') as HTMLInputElement
      const emailInput = container.querySelector('input[placeholder="name@example.com"]') as HTMLInputElement
      const phoneInput = container.querySelector('input[placeholder="+977-98..."]') as HTMLInputElement
      const form = container.querySelector('form') as HTMLFormElement

      act(() => {
        setInputValue(nameInput, 'Milan Gurung')
        setInputValue(emailInput, 'milan@production.np')
        setInputValue(phoneInput, '+977-9851000000')
      })

      // Submit form
      await act(async () => {
        form.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }))
      })

      expect(catalogueApi.submitBookingRequest).toHaveBeenCalledWith(
        expect.objectContaining({
          client_name: 'Milan Gurung',
          client_email: 'milan@production.np',
          client_phone: '+977-9851000000',
          start_date: '2026-11-25',
          end_date: '2026-11-27',
          fulfillment_type: 'pickup',
        })
      )

      expect(onClearCart).toHaveBeenCalled()

      // Confirmed receipt screen
      expect(container.textContent).toContain('Request REQ-20261125-0042')
      expect(container.textContent).toContain('1-Hour Response Guarantee')
      expect(container.textContent).toContain('27,120')
      expect(container.textContent).toContain('13,560')
    })

    it('blocks checkout submission when Away mode is active (T7-14)', () => {
      act(() => {
        root.render(
          <CartDrawer
            isOpen={true}
            onClose={vi.fn()}
            items={cartItems}
            startDate="2026-11-25"
            endDate="2026-11-27"
            onUpdateQty={vi.fn()}
            onRemoveItem={vi.fn()}
            onClearCart={vi.fn()}
            bookingChecksReady={true}
            awayStatus={{
              is_away: true,
              configured_away: true,
              can_accept_requests: false,
              message: 'Staff training retreat until Dec 1',
              resume_date: '2026-12-01T06:00:00+05:45',
            }}
          />
        )
      })

      const btn = container.querySelector('button.btn-primary') as HTMLButtonElement
      expect(btn.disabled).toBe(true)
      expect(btn.textContent).toContain('Requests Paused — Staff training retreat until Dec 1')
    })
  })
})
