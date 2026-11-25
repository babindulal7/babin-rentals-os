// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { PaymentLinkModal } from '../../../modules/rentals/booking/PaymentLinkModal'
import { PaymentLinkPage } from '../PaymentLinkPage'
import * as payApi from '../payApi'

;(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true

vi.mock('../payApi', () => ({
  createBookingPaymentLink: vi.fn(),
  fetchPaymentLinkDetails: vi.fn(),
  initOnlinePayment: vi.fn(),
  verifyOnlinePayment: vi.fn(),
  fetchOnlinePaymentProviders: vi.fn(),
}))

describe('Payment Link Components (T7-15)', () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubEnv('VITE_DATA_SOURCE', 'mock')
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(async () => {
    if (root) {
      await act(async () => {
        root.unmount()
      })
    }
    container?.remove()
    vi.unstubAllEnvs()
  })

  describe('PaymentLinkModal', () => {
    it('does not generate or share a link while hosted checkout is on hold', async () => {
      vi.stubEnv('VITE_DATA_SOURCE', 'supabase')
      await act(async () => {
        root.render(<PaymentLinkModal isOpen={true} onClose={vi.fn()} bookingId="bk-1" bookingNo="BK-1" clientName="Test client" />)
      })
      expect(payApi.createBookingPaymentLink).not.toHaveBeenCalled()
      expect(container.textContent).toContain('Online payment links are temporarily unavailable')
      expect(container.textContent).not.toContain('Shareable Link')
      expect(container.textContent).not.toContain('Email Draft')
    })

    it('generates payment link on open, renders authoritative amount and 48h expiry', async () => {
      vi.mocked(payApi.createBookingPaymentLink).mockResolvedValueOnce({
        success: true,
        intent_id: 'intent-link-1',
        token: 'token-abc-123',
        amount_paisa: 1500000,
        expires_at: new Date(Date.now() + 48 * 3600 * 1000).toISOString(),
        booking_id: 'bk-1',
        booking_no: 'BK-2026-0042',
      })

      await act(async () => {
        root.render(
          <PaymentLinkModal
            isOpen={true}
            onClose={vi.fn()}
            bookingId="bk-1"
            bookingNo="BK-2026-0042"
            clientName="Jane Doe"
            clientPhone="+977-9841234567"
            clientEmail="jane@example.com"
          />
        )
      })

      await act(async () => {
        await new Promise((r) => setTimeout(r, 20))
      })

      expect(payApi.createBookingPaymentLink).toHaveBeenCalledWith('bk-1')
      expect(container.textContent).toContain('Payment Link — BK-2026-0042')
      expect(container.textContent).toContain('Amount Due (Server Authoritative)')
      expect(container.textContent).toContain('15,000')
      expect(container.textContent).toContain('Expires in 48h')
      expect(container.textContent).toContain('Deposit Policy (O-3, B38)')
      expect(container.textContent).toContain('WhatsApp')
      expect(container.textContent).toContain('Email Draft')
      expect(container.textContent).toContain('Copy')
    })
  })

  describe('PaymentLinkPage', () => {
    it('keeps valid existing hosted links read-only without a checkout action', async () => {
      vi.stubEnv('VITE_DATA_SOURCE', 'supabase')
      vi.mocked(payApi.fetchPaymentLinkDetails).mockResolvedValueOnce({ valid: true, booking_no: 'BK-1', amount_paisa: 500000 })
      await act(async () => {
        root.render(<MemoryRouter initialEntries={['/pay/link?token=token-test']}><Routes><Route path="/pay/link" element={<PaymentLinkPage />} /></Routes></MemoryRouter>)
      })
      expect(container.textContent).toContain('Online payment is temporarily unavailable')
      expect(container.textContent).not.toContain('Pay Now with Fonepay')
      expect(payApi.initOnlinePayment).not.toHaveBeenCalled()
    })

    it('renders booking details and authoritative amount when link is valid', async () => {
      vi.mocked(payApi.fetchPaymentLinkDetails).mockResolvedValueOnce({
        valid: true,
        intent_id: 'intent-link-1',
        amount_paisa: 1500000,
        booking_id: 'bk-1',
        booking_no: 'BK-2026-0042',
        project_name: 'Summer Shoot',
        client_name_masked: 'J*** e',
        items_count: 3,
        pickup_at: '2026-12-10T06:00:00Z',
        return_at: '2026-12-12T06:00:00Z',
        expires_at: new Date(Date.now() + 48 * 3600 * 1000).toISOString(),
      })

      await act(async () => {
        root.render(
          <MemoryRouter initialEntries={['/pay/link?token=token-abc-123']}>
            <Routes>
              <Route path="/pay/link" element={<PaymentLinkPage />} />
            </Routes>
          </MemoryRouter>
        )
      })

      await act(async () => {
        await new Promise((r) => setTimeout(r, 20))
      })

      expect(payApi.fetchPaymentLinkDetails).toHaveBeenCalledWith('token-abc-123')
      expect(container.textContent).toContain('BK-2026-0042')
      expect(container.textContent).toContain('Summer Shoot')
      expect(container.textContent).toContain('J*** e')
      expect(container.textContent).toContain('3 items')
      expect(container.textContent).toContain('15,000')
      expect(container.textContent).toContain('Valid for 48 Hours')
      expect(container.textContent).toContain('Security Deposit Note')
      expect(container.textContent).toContain('Pay Now with Fonepay / eSewa / Khalti')
    })

    it('renders expired warning when link token has expired', async () => {
      vi.mocked(payApi.fetchPaymentLinkDetails).mockResolvedValueOnce({
        valid: false,
        reason: 'expired',
      })

      await act(async () => {
        root.render(
          <MemoryRouter initialEntries={['/pay/link?token=token-expired']}>
            <Routes>
              <Route path="/pay/link" element={<PaymentLinkPage />} />
            </Routes>
          </MemoryRouter>
        )
      })

      await act(async () => {
        await new Promise((r) => setTimeout(r, 20))
      })

      expect(container.textContent).toContain('Payment Link Expired')
      expect(container.textContent).toContain('Call Babin Rentals')
    })

    it('renders already settled state when booking link was already paid', async () => {
      vi.mocked(payApi.fetchPaymentLinkDetails).mockResolvedValueOnce({
        valid: false,
        reason: 'already_paid',
        booking_no: 'BK-2026-0042',
      })

      await act(async () => {
        root.render(
          <MemoryRouter initialEntries={['/pay/link?token=token-settled']}>
            <Routes>
              <Route path="/pay/link" element={<PaymentLinkPage />} />
            </Routes>
          </MemoryRouter>
        )
      })

      await act(async () => {
        await new Promise((r) => setTimeout(r, 20))
      })

      expect(container.textContent).toContain('Payment Already Settled')
      expect(container.textContent).toContain('BK-2026-0042')
    })

    it('allows toggling between 50% advance and 100% full payment', async () => {
      vi.mocked(payApi.fetchPaymentLinkDetails).mockResolvedValueOnce({
        valid: true,
        intent_id: 'intent-link-toggle',
        amount_paisa: 500000,
        total_amount_paisa: 1000000,
        advance_due_paisa: 500000,
        booking_id: 'bk-toggle',
        booking_no: 'BK-2026-0099',
        project_name: 'Toggle Shoot',
        client_name_masked: 'T*** e',
        items_count: 1,
        pickup_at: '2026-12-01T06:00:00Z',
        return_at: '2026-12-02T06:00:00Z',
        expires_at: new Date(Date.now() + 48 * 3600 * 1000).toISOString(),
      })

      await act(async () => {
        root.render(
          <MemoryRouter initialEntries={['/pay/link?token=token-toggle']}>
            <Routes>
              <Route path="/pay/link" element={<PaymentLinkPage />} />
            </Routes>
          </MemoryRouter>
        )
      })

      await act(async () => {
        await new Promise((r) => setTimeout(r, 20))
      })

      expect(container.textContent).toContain('50% Advance Deposit')
      expect(container.textContent).toContain('100% Full Payment')
      expect(container.textContent).toContain('5,000')

      // Click 100% Full Payment button
      const buttons = container.querySelectorAll('button')
      const fullButton = Array.from(buttons).find((b) => b.textContent?.includes('100% Full Payment'))
      expect(fullButton).toBeDefined()

      await act(async () => {
        fullButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
      })

      expect(container.textContent).toContain('10,000')
    })

    it('renders official receipt download, portal link and pickup instructions on settled state', async () => {
      vi.mocked(payApi.fetchPaymentLinkDetails).mockResolvedValueOnce({
        valid: false,
        reason: 'already_paid',
        booking_no: 'BK-2026-0042',
        project_name: 'Summer Shoot',
        amount_paisa: 1500000,
      })

      await act(async () => {
        root.render(
          <MemoryRouter initialEntries={['/pay/link?token=token-settled']}>
            <Routes>
              <Route path="/pay/link" element={<PaymentLinkPage />} />
            </Routes>
          </MemoryRouter>
        )
      })

      await act(async () => {
        await new Promise((r) => setTimeout(r, 20))
      })

      expect(container.textContent).toContain('Official Payment Receipt')
      expect(container.textContent).toContain('Download Receipt (PDF)')
      expect(container.textContent).toContain('My Bookings Portal')
      expect(container.textContent).toContain('Boudha Warehouse Pickup Instructions')
      expect(container.textContent).toContain('Original Government Photo ID')
    })
  })
})
