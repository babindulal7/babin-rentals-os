import { describe, it, expect } from 'vitest'
import {
  generateInvoicePdf,
  generateDocumentPdf,
  type InvoicePdfData,
} from '../generatePdf'
import { rupees } from '../../money'

describe('generatePdf', () => {
  describe('generateInvoicePdf', () => {
    const basicInvoice: InvoicePdfData = {
      client: { name: 'Test Client' }, lines: [], subtotalPaisa: rupees(1000),
      taxablePaisa: rupees(1000), vatPaisa: rupees(130), totalPaisa: rupees(1130),
    }

    it('refuses an invoice without a saved business name instead of inventing one', () => {
      expect(() => generateInvoicePdf(basicInvoice)).toThrow(/organisation name/i)
    })

    it('refuses a VAT-bearing invoice without a saved VAT/PAN', () => {
      expect(() => generateInvoicePdf({ ...basicInvoice, company: { name: 'Recorded Rentals' } })).toThrow(/VAT\/PAN/i)
    })

    it('omits unset VAT/PAN and optional contacts when no VAT is charged', () => {
      const text = new TextDecoder().decode(generateInvoicePdf({ ...basicInvoice, vatPaisa: rupees(0), company: { name: 'Recorded Rentals' } }))
      expect(text).not.toContain('PAN/VAT:')
      expect(text).not.toContain('601234567')
      expect(text).not.toContain('Kathmandu, Nepal')
    })

    it('prints supplied business details without adding invented contact details or a tagline', () => {
      const text = new TextDecoder().decode(generateInvoicePdf({
        ...basicInvoice,
        company: { name: 'Recorded Rentals', panVat: '123456789', phone: '+977 9801234567', description: 'Saved business description' },
      }))
      expect(text).toContain('Recorded Rentals')
      expect(text).toContain('PAN/VAT: 123456789')
      expect(text).toContain('+977 9801234567')
      expect(text).toContain('Saved business description')
      expect(text).not.toContain('601234567')
      expect(text).not.toContain('4400000')
      expect(text).not.toContain('Kathmandu, Nepal')
      expect(text).not.toContain('Professional Camera, Lighting')
    })

    it('produces valid PDF 1.4 binary bytes with standard structure', () => {
      const data: InvoicePdfData = {
        invoiceNo: 'INV-2026-0001',
        status: 'Sent',
        issueDateAd: '2026-09-18',
        dueDateAd: '2026-09-25',
        bookingNo: 'B-715',
        client: {
          name: 'Himalayan Films Pvt Ltd',
          phone: '+977-9800000000',
          email: 'production@himalayanfilms.com',
          panVat: '600123456',
        },
        company: {
          name: 'Babin Rentals Kathmandu',
          panVat: '123456789',
        },
        lines: [
          {
            description: 'RED KOMODO 6K Cinema Package',
            serialNo: 'SN-RED-KOM-001',
            quantity: 1,
            rentalDays: 3,
            ratePaisa: rupees(15000),
            totalPaisa: rupees(45000),
          },
          {
            description: 'Blazar Mantis Anamorphic 5-Lens Set',
            serialNo: 'SN-LENS-MANTIS-01',
            quantity: 1,
            rentalDays: 3,
            ratePaisa: rupees(12000),
            totalPaisa: rupees(36000),
          },
        ],
        subtotalPaisa: rupees(81000),
        discountPercent: 10,
        discountPaisa: rupees(8100),
        taxablePaisa: rupees(72900),
        vatPercent: 13,
        vatPaisa: rupees(9477),
        totalPaisa: rupees(82377),
        paidPaisa: rupees(30000),
        outstandingPaisa: rupees(52377),
        notes: 'Net 7 days. Return in clean condition.',
      }

      const bytes = generateInvoicePdf(data)

      expect(bytes).toBeInstanceOf(Uint8Array)
      expect(bytes.byteLength).toBeGreaterThan(500)

      const text = new TextDecoder().decode(bytes)

      // 1. PDF 1.4 Header
      expect(text.startsWith('%PDF-1.4\n')).toBe(true)

      // 2. Objects & Structure
      expect(text).toContain('/Type /Catalog')
      expect(text).toContain('/Type /Pages')
      expect(text).toContain('/Type /Page')
      expect(text).toContain('/MediaBox [0 0 595.28 841.89]') // A4
      expect(text).toContain('/BaseFont /Helvetica')
      expect(text).toContain('/BaseFont /Helvetica-Bold')
      expect(text).toContain('/BaseFont /Courier')

      // 3. Content assertions
      expect(text).toContain('Babin Rentals Kathmandu')
      expect(text).toContain('INV-2026-0001')
      expect(text).toContain('Himalayan Films Pvt Ltd')
      expect(text).toContain('RED KOMODO 6K')
      expect(text).toContain('SN-RED-KOM-001')
      expect(text).toContain('B-715')

      // 4. Cross-reference & Trailer byte-accuracy
      expect(text).toContain('xref\n0 ')
      expect(text).toContain('trailer\n<<')
      expect(text).toContain('/Root 1 0 R')
      expect(text).toContain('startxref\n')
      expect(text.trimEnd().endsWith('%%EOF')).toBe(true)

      // Assert that startxref byte offset in the file points directly to 'xref\n'
      const startXrefMatch = text.match(/startxref\s+(\d+)\s+%%EOF/)
      expect(startXrefMatch).not.toBeNull()
      const startXrefPos = Number(startXrefMatch![1])
      const xrefSlice = new TextDecoder().decode(bytes.slice(startXrefPos, startXrefPos + 4))
      expect(xrefSlice).toBe('xref')
    })

    it('handles zero VAT percent dynamically and displays overflow indicator for >12 lines', () => {
      const overflowData: InvoicePdfData = {
        invoiceNo: 'INV-2026-0099',
        status: 'Sent',
        bookingNo: 'BK-999',
        client: { name: 'Large Project Crew' },
        company: { name: 'Recorded Rentals', panVat: '123456789' },
        lines: Array.from({ length: 15 }, (_, i) => ({
          description: `Gear Item #${i + 1}`,
          quantity: 1,
          rentalDays: 1,
          ratePaisa: rupees(1000),
          totalPaisa: rupees(1000),
        })),
        subtotalPaisa: rupees(15000),
        taxablePaisa: rupees(15000),
        vatPercent: 0,
        vatPaisa: rupees(0),
        totalPaisa: rupees(15000),
      }

      const bytes = generateInvoicePdf(overflowData)
      const text = new TextDecoder().decode(bytes)

      expect(text).toContain('VAT \\(0%\\):')
      expect(text).toContain('...and 4 more items included in totals')
    })

    it('handles Draft invoices with no invoice_no cleanly', () => {
      const draftData: InvoicePdfData = {
        invoiceNo: null,
        status: 'Draft',
        bookingNo: 'B-720',
        client: { name: 'Everest Cine' },
        company: { name: 'Recorded Rentals', panVat: '123456789' },
        lines: [
          {
            description: 'Sony FX3 Cinema Camera',
            quantity: 1,
            totalPaisa: rupees(5000),
          },
        ],
        subtotalPaisa: rupees(5000),
        taxablePaisa: rupees(5000),
        vatPaisa: rupees(650),
        totalPaisa: rupees(5650),
      }

      const bytes = generateInvoicePdf(draftData)
      const text = new TextDecoder().decode(bytes)

      expect(text).toContain('DRAFT INVOICE')
      expect(text).toContain('DRAFT')
      expect(text).toContain('NO NUMBER')
      expect(text).toContain('Everest Cine')
      expect(text.trimEnd().endsWith('%%EOF')).toBe(true)
    })
  })

  describe('generateDocumentPdf', () => {
    it('generates an A4 commercial document PDF', () => {
      const bytes = generateDocumentPdf({
        documentNo: 'DOC-2026-0099',
        title: 'Equipment Rental Agreement — Alpha Productions',
        docType: 'Rental Agreement',
        clientName: 'Alpha Productions',
        bookingNo: 'B-730',
        contentParagraphs: [
          'The customer agrees to maintain the equipment in good working order.',
          'Loss or damage will be charged at current replacement cost.',
        ],
      })

      expect(bytes).toBeInstanceOf(Uint8Array)
      const text = new TextDecoder().decode(bytes)

      expect(text.startsWith('%PDF-1.4\n')).toBe(true)
      expect(text).toContain('RENTAL AGREEMENT')
      expect(text).toContain('DOC-2026-0099')
      expect(text).toContain('Alpha Productions')
      expect(text).toContain('The customer agrees to maintain the equipment')
      expect(text.trimEnd().endsWith('%%EOF')).toBe(true)
    })
  })
})
