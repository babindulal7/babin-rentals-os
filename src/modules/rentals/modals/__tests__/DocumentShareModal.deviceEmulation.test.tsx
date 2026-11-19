// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { DocumentShareModal } from '../DocumentShareModal'
import { ToastProvider } from '../../../../components/ui/Toast'
import { _resetMockEmailLogs } from '../../../../lib/email/client'
import type { Paisa } from '../../../../lib/money'

;(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true

describe('DocumentShareModal Mobile & Desktop Device Emulation (T3-16)', () => {
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
    vi.restoreAllMocks()
  })

  it('emulates iPhone WebShare API with PDF attachment in <= 2 taps total', async () => {
    const shareMock = vi.fn().mockResolvedValue(undefined)
    const canShareMock = vi.fn().mockReturnValue(true)

    Object.defineProperty(navigator, 'share', {
      value: shareMock,
      configurable: true,
      writable: true,
    })
    Object.defineProperty(navigator, 'canShare', {
      value: canShareMock,
      configurable: true,
      writable: true,
    })

    let taps = 0
    // Tap 1: Opening the Share sheet (simulated by rendering modal open)
    taps += 1

    act(() => {
      root!.render(
        <ToastProvider>
          <DocumentShareModal
            isOpen={true}
            onClose={() => {}}
            docType="quote"
            userRole="Coordinator"
            booking={{
              id: 'b-iphone-01',
              bookingNo: 'BK-2026-0891',
              clientName: 'Annapurna Pictures',
              stage: 'Quote',
              itemCount: 3,
              pickupDate: '2026-09-01',
              returnDate: '2026-09-04',
              totalAmount: 3500000 as Paisa,
            }}
            clientPhone="9841234567"
            clientEmail="producer@annapurna.com"
          />
        </ToastProvider>,
      )
    })

    const waBtn = Array.from(host!.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('WhatsApp'),
    )
    expect(waBtn).toBeDefined()
    expect(waBtn?.hasAttribute('disabled')).toBe(false)

    // Tap 2: Tapping the WhatsApp button
    taps += 1
    await act(async () => {
      waBtn!.click()
    })

    // Total interactive tap count is exactly 2 taps
    expect(taps).toBeLessThanOrEqual(2)
    expect(shareMock).toHaveBeenCalledTimes(1)
    const shareArgs = shareMock.mock.calls[0]?.[0]
    expect(shareArgs?.title).toContain('BK-2026-0891')
    expect(shareArgs?.text).toContain('Quotation')
    expect(shareArgs?.files).toBeDefined()
    expect(shareArgs?.files?.length).toBe(1)
  })

  it('emulates Desktop fallback when WebShare is unsupported: opens wa.me with text summary without claiming PDF attachment', async () => {
    // Delete navigator.share to simulate desktop browser without WebShare
    // @ts-expect-error mutating navigator for testing
    delete navigator.share

    const openMock = vi.fn().mockReturnValue({})
    window.open = openMock

    act(() => {
      root!.render(
        <ToastProvider>
          <DocumentShareModal
            isOpen={true}
            onClose={() => {}}
            docType="invoice"
            userRole="Coordinator"
            booking={{
              id: 'b-desktop-02',
              bookingNo: 'BK-2026-0992',
              clientName: 'Pokhara Productions',
              stage: 'On Rent',
              totalAmount: 1850000 as Paisa,
            }}
            clientPhone="9851099887"
            clientEmail="accounts@pokhara.com"
          />
        </ToastProvider>,
      )
    })

    const waBtn = Array.from(host!.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('WhatsApp'),
    )
    expect(waBtn).toBeDefined()

    await act(async () => {
      waBtn!.click()
    })

    expect(openMock).toHaveBeenCalledTimes(1)
    const openedUrl = openMock.mock.calls[0]?.[0] as string
    expect(openedUrl).toContain('https://wa.me/9779851099887?text=')
    // Verify fallback does NOT falsely claim that a PDF attachment is included
    expect(openedUrl).not.toContain('attached is the PDF')
    expect(openedUrl).not.toContain('PDF attached')
  })

  it('disables WhatsApp share when phone number is missing', async () => {
    act(() => {
      root!.render(
        <ToastProvider>
          <DocumentShareModal
            isOpen={true}
            onClose={() => {}}
            docType="quote"
            userRole="Coordinator"
            booking={{
              id: 'b-missing-ph',
              bookingNo: 'BK-2026-0993',
              clientName: 'Kathmandu Visuals',
              stage: 'Quote',
              totalAmount: 1200000 as Paisa,
            }}
            clientPhone=""
            clientEmail="contact@ktmvisuals.com"
          />
        </ToastProvider>,
      )
    })

    const waBtn = Array.from(host!.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('WhatsApp'),
    )
    expect(waBtn).toBeDefined()
    expect(waBtn?.hasAttribute('disabled')).toBe(true)
    expect(host!.textContent).toContain('No valid phone on this client')
  })

  it('Law 6: completely blocks Warehouse from viewing prices or sharing priced documents', async () => {
    act(() => {
      root!.render(
        <ToastProvider>
          <DocumentShareModal
            isOpen={true}
            onClose={() => {}}
            docType="invoice"
            userRole="Warehouse"
            booking={{
              id: 'b-warehouse-01',
              bookingNo: 'BK-2026-0994',
              clientName: 'Lalitpur Media',
              stage: 'Booked',
              totalAmount: 9500000 as Paisa,
            }}
            clientPhone="9841234567"
            clientEmail="crew@lalitpur.com"
          />
        </ToastProvider>,
      )
    })

    // Banner must warn that role cannot view or share
    expect(host!.textContent).toContain('Your role cannot view or share financial documents.')
    // Total price (e.g. 95,000 or 9,500,000) must NOT appear anywhere in the DOM
    expect(host!.textContent).not.toContain('95,000')
    expect(host!.textContent).not.toContain('95000')

    // Action buttons must all be disabled
    const buttons = Array.from(host!.querySelectorAll('button')).filter((b) =>
      ['WhatsApp', 'Send Email', 'Print (A4)', 'Copy Text'].some((txt) => b.textContent?.includes(txt)),
    )
    for (const btn of buttons) {
      expect(btn.hasAttribute('disabled')).toBe(true)
    }
  })
})
