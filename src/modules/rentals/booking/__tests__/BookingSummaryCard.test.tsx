// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { describe, expect, it, vi } from 'vitest'
import { BookingSummaryCard } from '../BookingSummaryCard'
import { rupees } from '../../../../lib/money'

describe('BookingSummaryCard', () => {
  const mockPricing = {
    grossSubtotalPaisa: rupees(20000),
    taxableSubtotalPaisa: rupees(18000),
    vatPaisa: rupees(2340),
    vatRatePercent: 13,
    rentalTotalPaisa: rupees(20340),
    securityDeposit: { requiredPaisa: rupees(10000) },
    advanceRequiredPaisa: rupees(10170),
    discounts: {
      appliedPercent: 10,
      discountPaisa: rupees(2000),
    },
  }

  it('renders line-by-line tax/deposit breakdown and total', async () => {
    const host = document.createElement('div')
    document.body.appendChild(host)
    const root = createRoot(host)

    try {
      await act(async () => {
        root.render(
          <BookingSummaryCard
            client={{ name: 'Babin Dulal' }}
            pickupAt="2026-10-17"
            pickupTime="09:00"
            returnAt="2026-10-19"
            returnTime="18:00"
            totalUnits={3}
            days={2}
            dayWord="days"
            canBookingMoney={true}
            pricing={mockPricing}
            blockingNotices={[]}
            runNoticeAction={vi.fn()}
          />
        )
      })

      expect(host.textContent).toContain('Booking Summary')
      expect(host.textContent).toContain('Babin Dulal')
      expect(host.textContent).toContain('3 items · 2 days')
      expect(host.textContent).toContain('Subtotal')
      expect(host.textContent).toContain('Discount (10%)')
      expect(host.textContent).toContain('Taxable Amount')
      expect(host.textContent).toContain('VAT (13%)')
      expect(host.textContent).toContain('Estimated Rental Total')
      expect(host.textContent).toContain('Security Deposit')
      expect(host.textContent).toContain('Advance Required')
      expect(host.textContent).toContain('Ready to confirm')
    } finally {
      await act(async () => root.unmount())
      host.remove()
    }
  })

  it('renders blocking notices before confirming when present', async () => {
    const host = document.createElement('div')
    document.body.appendChild(host)
    const root = createRoot(host)
    const runNoticeAction = vi.fn()

    try {
      await act(async () => {
        root.render(
          <BookingSummaryCard
            pickupTime="09:00"
            returnTime="18:00"
            totalUnits={0}
            days={0}
            dayWord="days"
            canBookingMoney={true}
            pricing={mockPricing}
            blockingNotices={[
              { text: 'No client selected', action: 'Select Client' },
              { text: 'Select a project type', action: 'Open Client & Dates' },
            ]}
            runNoticeAction={runNoticeAction}
          />
        )
      })

      expect(host.textContent).toContain('Before confirming')
      expect(host.textContent).toContain('No client selected')
      expect(host.textContent).toContain('Select a project type')

      const actionBtn = Array.from(host.querySelectorAll('button')).find((b) => b.textContent?.includes('Select Client'))
      expect(actionBtn).toBeDefined()
      await act(async () => {
        actionBtn?.click()
      })
      expect(runNoticeAction).toHaveBeenCalledWith('Select Client')
    } finally {
      await act(async () => root.unmount())
      host.remove()
    }
  })
})
