// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { InvoicePaymentStatusModal } from '../InvoiceActionsMenu'
import type { Paisa } from '../../../../lib/money'
import type { SelectedRentalBookingFacts } from '../../../../lib/rentalMoreActionsRegistry'

let container: HTMLDivElement
let root: Root

async function flush(rounds = 3) {
  for (let i = 0; i < rounds; i++) {
    await act(async () => {
      await Promise.resolve()
    })
  }
}

async function mountModal(props: Parameters<typeof InvoicePaymentStatusModal>[0]) {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  await act(async () => {
    root.render(<InvoicePaymentStatusModal {...props} />)
  })
  await flush()
}

describe('InvoiceActionsMenu - InvoicePaymentStatusModal (T3-06)', () => {
  const sampleBooking: SelectedRentalBookingFacts = {
    id: 'booking-inv-1',
    bookingNo: 'BK-2026-0088',
    clientName: 'Everest Film Crew',
    invoiceNo: 'INV-2026-0088',
    totalAmount: 1800000, // Rs 18,000
    paidAmount: 1000000, // Rs 10,000
    outstandingAmount: 800000, // Rs 8,000
    depositRequired: 2000000 as Paisa, // Rs 20,000
    stage: 'Confirmed',
  }

  afterEach(async () => {
    if (root) {
      await act(async () => {
        root.unmount()
      })
    }
    if (container && container.parentNode) {
      container.parentNode.removeChild(container)
    }
  })

  it('renders payment status details and commercial settlement breakdown', async () => {
    await mountModal({
      isOpen: true,
      onClose: vi.fn(),
      booking: sampleBooking,
    })

    expect(container.textContent).toContain('Payment Status · #BK-2026-0088')
    expect(container.textContent).toContain('Commercial Settlement')
    expect(container.textContent).toContain('Invoice: INV-2026-0088')
    expect(container.textContent).toContain('Total Billed: Rs 18,000')
    expect(container.textContent).toContain('Total Received: Rs 10,000')
    expect(container.textContent).toContain('Outstanding Balance: Rs 8,000')
    expect(container.textContent).toContain('Security Deposit: Rs 20,000')
  })
})
