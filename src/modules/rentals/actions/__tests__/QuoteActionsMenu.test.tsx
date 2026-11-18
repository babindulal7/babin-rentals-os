// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { QuotePreviewModal } from '../QuoteActionsMenu'
import type { SelectedRentalBookingFacts } from '../../../../lib/rentalMoreActionsRegistry'

const mockExportDocumentPdf = vi.fn()
const mockShowSuccessToast = vi.fn()

vi.mock('../../../../lib/pdf/exportPdf', () => ({
  exportDocumentPdf: (...args: unknown[]) => mockExportDocumentPdf(...args),
}))

vi.mock('../../../../components/ui/Toast', () => ({
  useToast: () => ({
    showSuccessToast: (...args: unknown[]) => mockShowSuccessToast(...args),
    showErrorToast: vi.fn(),
  }),
}))

let container: HTMLDivElement
let root: Root

async function flush(rounds = 3) {
  for (let i = 0; i < rounds; i++) {
    await act(async () => {
      await Promise.resolve()
    })
  }
}

async function mountModal(props: Parameters<typeof QuotePreviewModal>[0]) {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  await act(async () => {
    root.render(<QuotePreviewModal {...props} />)
  })
  await flush()
}

describe('QuoteActionsMenu - QuotePreviewModal (T3-06)', () => {
  const sampleBooking: SelectedRentalBookingFacts = {
    id: 'booking-uuid-q1',
    bookingNo: 'BK-2026-0042',
    clientName: 'Annapurna Pictures',
    pickupDate: '2026-09-20',
    returnDate: '2026-09-22',
    itemCount: 4,
    totalAmount: 4500000, // Rs 45,000
    stage: 'Draft',
  }

  beforeEach(() => {
    vi.clearAllMocks()
    mockExportDocumentPdf.mockResolvedValue({
      bytes: new Uint8Array([1, 2, 3]),
      signedUrl: 'https://example.com/quote.pdf',
      filename: 'quote.pdf',
    })
  })

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

  it('renders quotation details and enforces Law 6 money blindness', async () => {
    await mountModal({
      isOpen: true,
      onClose: vi.fn(),
      booking: sampleBooking,
      canViewMoney: false, // Money-blind role (Warehouse/Technician)
    })

    expect(container.textContent).toContain('Commercial Quotation')
    expect(container.textContent).toContain('Annapurna Pictures')
    expect(container.textContent).toContain('BK-2026-0042')
    // No money figures displayed for money-blind roles
    expect(container.textContent).not.toContain('Estimated Total')
    expect(container.textContent).not.toContain('Rs 45,000')
  })

  it('renders estimated total when user has money permission', async () => {
    await mountModal({
      isOpen: true,
      onClose: vi.fn(),
      booking: sampleBooking,
      canViewMoney: true, // Money role (Coordinator/Manager)
    })

    expect(container.textContent).toContain('Estimated Total (incl. 13% VAT):')
    expect(container.textContent).toContain('Rs 45,000')
  })

  it('triggers exportDocumentPdf when Download PDF is clicked', async () => {
    await mountModal({
      isOpen: true,
      onClose: vi.fn(),
      booking: sampleBooking,
      canViewMoney: true,
    })

    const downloadBtn = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Download PDF'),
    )
    expect(downloadBtn).toBeDefined()

    await act(async () => {
      downloadBtn?.click()
    })
    await flush()

    expect(mockExportDocumentPdf).toHaveBeenCalledWith(
      expect.objectContaining({
        documentNo: 'quote-booking-uuid-q1',
        title: expect.stringContaining('BK-2026-0042'),
        clientName: 'Annapurna Pictures',
        bookingNo: 'BK-2026-0042',
      }),
    )
    expect(mockShowSuccessToast).toHaveBeenCalledWith('Quote PDF Ready', expect.anything())
  })
})
