// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { DocumentShareModal } from '../DocumentShareModal'
import { ToastProvider } from '../../../../components/ui/Toast'
import { _resetMockEmailLogs, getMockEmailLogs } from '../../../../lib/email/client'
import type { Paisa } from '../../../../lib/money'

;(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true

describe('DocumentShareModal (T3-16)', () => {
  let host: HTMLDivElement | null = null
  let root: Root | null = null

  beforeEach(() => {
    _resetMockEmailLogs()
    host = document.createElement('div')
    document.body.appendChild(host)
    root = createRoot(host)
  })

  afterEach(() => {
    if (root) {
      act(() => {
        root!.unmount()
      })
    }
    if (host && host.parentNode) {
      host.parentNode.removeChild(host)
    }
    root = null
    host = null
  })

  it('renders modal when open with document type and booking reference', async () => {
    act(() => {
      root!.render(
        <ToastProvider>
          <DocumentShareModal
            isOpen={true}
            onClose={() => {}}
            docType="quote"
            userRole="Coordinator"
            booking={{
              id: 'b-001',
              bookingNo: 'BR-2026-0042',
              clientName: 'Sagarmatha Films',
              stage: 'Draft',
              itemCount: 4,
              pickupDate: '2026-08-05',
              returnDate: '2026-08-08',
              totalAmount: 4500000 as Paisa,
            }}
            clientPhone="9841234567"
            clientEmail="crew@sagarmatha.com"
          />
        </ToastProvider>,
      )
    })

    const text = host!.textContent ?? ''
    expect(text).toContain('Commercial Quotation')
    expect(text).toContain('BR-2026-0042')
    expect(text).toContain('Sagarmatha Films')
    expect(text).toContain('+9779841234567')
    expect(text).toContain('Rs')
  })

  it('enforces Law 6: Warehouse role cannot view or share priced documents', async () => {
    act(() => {
      root!.render(
        <ToastProvider>
          <DocumentShareModal
            isOpen={true}
            onClose={() => {}}
            docType="quote"
            userRole="Warehouse"
            booking={{
              id: 'b-002',
              bookingNo: 'BR-2026-0043',
              clientName: 'Indie Producer',
              stage: 'Draft',
              totalAmount: 1200000 as Paisa,
            }}
            clientPhone="9841234567"
          />
        </ToastProvider>,
      )
    })

    const banner = host!.querySelector('[data-testid="law6-restriction-banner"]')
    expect(banner).not.toBeNull()
    expect(banner?.textContent).toContain('Your role cannot view or share financial documents.')

    // Law 6: Figure must never leak into DOM for money-blind roles
    expect(host!.textContent).not.toContain('Rs')
    expect(host!.textContent).not.toContain('12,000')

    // Action buttons must be disabled
    const buttons = host!.querySelectorAll('button')
    const actionButtons = Array.from(buttons).filter((b) =>
      ['WhatsApp', 'Send Email', 'Print (A4)', 'Copy Text'].some((label) => b.textContent?.includes(label)),
    )
    for (const btn of actionButtons) {
      expect(btn.hasAttribute('disabled')).toBe(true)
    }
  })

  it('permits Warehouse role to share unpriced documents like Agreement', async () => {
    act(() => {
      root!.render(
        <ToastProvider>
          <DocumentShareModal
            isOpen={true}
            onClose={() => {}}
            docType="agreement"
            userRole="Warehouse"
            booking={{
              id: 'b-003',
              bookingNo: 'BR-2026-0044',
              clientName: 'Documentary Crew',
              stage: 'Packed',
              itemCount: 6,
            }}
            clientPhone="9841234567"
            clientEmail="doc@crew.com"
          />
        </ToastProvider>,
      )
    })

    const banner = host!.querySelector('[data-testid="law6-restriction-banner"]')
    expect(banner).toBeNull()
    expect(host!.textContent).toContain('Equipment Rental Agreement')
  })

  it('displays persistent warning when client has no phone number (NO_PHONE_REASON)', async () => {
    act(() => {
      root!.render(
        <ToastProvider>
          <DocumentShareModal
            isOpen={true}
            onClose={() => {}}
            docType="invoice"
            userRole="Coordinator"
            booking={{
              id: 'b-004',
              bookingNo: 'BR-2026-0045',
              clientName: 'Walk-in Client',
              stage: 'On Rent',
              totalAmount: 800000 as Paisa,
            }}
            clientPhone={null}
          />
        </ToastProvider>,
      )
    })

    const warning = host!.querySelector('[data-testid="no-phone-warning"]')
    expect(warning).not.toBeNull()
    expect(warning?.textContent).toContain('No valid phone on this client')

    // WhatsApp button must be disabled
    const waButton = Array.from(host!.querySelectorAll('button')).find((b) => b.textContent?.includes('WhatsApp'))
    expect(waButton?.hasAttribute('disabled')).toBe(true)
  })

  it('dispatches transactional email via Email action button', async () => {
    act(() => {
      root!.render(
        <ToastProvider>
          <DocumentShareModal
            isOpen={true}
            onClose={() => {}}
            docType="invoice"
            userRole="Coordinator"
            booking={{
              id: 'b-005',
              bookingNo: 'BR-2026-0046',
              clientName: 'Kathmandu Studios',
              stage: 'On Rent',
              totalAmount: 1500000 as Paisa,
            }}
            clientPhone="9841234567"
            clientEmail="billing@ktmstudios.com"
          />
        </ToastProvider>,
      )
    })

    const emailBtn = Array.from(host!.querySelectorAll('button')).find((b) => b.textContent?.includes('Send Email'))
    expect(emailBtn).toBeDefined()

    await act(async () => {
      emailBtn!.click()
    })

    const logs = getMockEmailLogs()
    expect(logs.length).toBe(1)
    expect(logs[0]?.recipientEmail).toBe('billing@ktmstudios.com')
    expect(logs[0]?.templateId).toBe('invoice_document')

    expect(host!.textContent).toContain('Email successfully dispatched')
  })

  it('renders and dispatches One-Tap Booking Confirmation (W20)', async () => {
    act(() => {
      root!.render(
        <ToastProvider>
          <DocumentShareModal
            isOpen={true}
            onClose={() => {}}
            docType="confirmation"
            userRole="Coordinator"
            booking={{
              id: 'b-006',
              bookingNo: 'BR-2026-0047',
              clientName: 'Music Video Production',
              stage: 'Booked',
              totalAmount: 2500000 as Paisa,
            }}
            clientPhone="9841234567"
            clientEmail="producer@musicvideo.com"
          />
        </ToastProvider>,
      )
    })

    const oneTapBtn = Array.from(host!.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Send Booking Confirmation (1 Tap)'),
    )
    expect(oneTapBtn).toBeDefined()

    await act(async () => {
      oneTapBtn!.click()
    })

    const logs = getMockEmailLogs()
    expect(logs.length).toBe(1)
    expect(logs[0]?.recipientEmail).toBe('producer@musicvideo.com')
    expect(logs[0]?.templateId).toBe('booking_confirmation')
  })
})
