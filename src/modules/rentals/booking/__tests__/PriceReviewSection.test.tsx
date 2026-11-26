// @vitest-environment jsdom
import { act, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { describe, expect, it } from 'vitest'
import { PriceReviewSection, type PriceReviews } from '../PriceReviewSection'
import type { BookingChangeLine } from '../../../../lib/queries/changeBooking'

const line: BookingChangeLine = {
  id: 'line-1', client_uuid: 'key-1', line_type: 'Equipment', name: 'Camera',
  qty: 1, days: 2, rate: 250, line_total: 475, price_breakdown: { method: 'structure' },
}

describe('desk price review', () => {
  it('requires confirmation of a zero total when a custom item is removed', async () => {
    const host = document.createElement('div')
    document.body.appendChild(host)
    const root = createRoot(host)
    function Harness() {
      const [reviews, setReviews] = useState<PriceReviews>({})
      return <PriceReviewSection lines={[line]} activeLineIds={[]} reviews={reviews} setReviews={setReviews} />
    }
    try {
      await act(async () => root.render(<Harness />))
      expect(host.textContent).toContain('Removed item: new total Rs 0')
      const confirmed = host.querySelector<HTMLInputElement>('input[type="checkbox"]')!
      expect(confirmed.disabled).toBe(false)
      await act(async () => confirmed.click())
      expect(confirmed.checked).toBe(true)
    } finally {
      await act(async () => root.unmount())
      host.remove()
    }
  })
  it('requires a fresh confirmation after changing the reviewed amount', async () => {
    const host = document.createElement('div')
    document.body.appendChild(host)
    const root = createRoot(host)
    function Harness() {
      const [reviews, setReviews] = useState<PriceReviews>({})
      return <PriceReviewSection lines={[line]} reviews={reviews} setReviews={setReviews} />
    }
    try {
      await act(async () => root.render(<Harness />))
      expect(host.textContent).toContain('Camera')
      const amount = host.querySelector<HTMLInputElement>('input[type="text"]')!
      const confirmed = host.querySelector<HTMLInputElement>('input[type="checkbox"]')!
      expect(confirmed.disabled).toBe(true)
      await act(async () => {
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(amount, '900.25')
        amount.dispatchEvent(new Event('input', { bubbles: true }))
      })
      expect(confirmed.disabled).toBe(false)
      await act(async () => confirmed.click())
      expect(confirmed.checked).toBe(true)
      await act(async () => {
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(amount, '950')
        amount.dispatchEvent(new Event('input', { bubbles: true }))
      })
      expect(confirmed.checked).toBe(false)
    } finally {
      await act(async () => root.unmount())
      host.remove()
    }
  })
})
