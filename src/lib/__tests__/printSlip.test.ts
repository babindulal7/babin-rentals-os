// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import { escapeHtml, printRentalSlip, type RentalSlipData } from '../printSlip'
import { rupees } from '../money'

describe('printSlip', () => {
  describe('escapeHtml', () => {
    it('escapes &, <, >, ", and \'', () => {
      expect(escapeHtml('<script>alert("xss") & \'test\'</script>')).toBe(
        '&lt;script&gt;alert(&quot;xss&quot;) &amp; &#39;test&#39;&lt;/script&gt;'
      )
    })

    it('leaves safe strings untouched', () => {
      expect(escapeHtml('Sony FX3 Cinema Camera')).toBe('Sony FX3 Cinema Camera')
    })
  })

  describe('printRentalSlip', () => {
    it('returns early when window is undefined', () => {
      const origWindow = globalThis.window
      // @ts-expect-error test SSR environment
      delete globalThis.window
      try {
        expect(() =>
          printRentalSlip({
            bookingNo: 'BK-100',
            clientName: 'Test Client',
            clientPhone: '9800000000',
            stage: 'Booked',
            pickupDate: '2026-10-21',
            returnDate: '2026-10-23',
            lines: [],
          })
        ).not.toThrow()
      } finally {
        globalThis.window = origWindow
      }
    })

    it('opens print window and writes escaped HTML with VAT rate', () => {
      const mockDoc = {
        open: vi.fn(),
        write: vi.fn(),
        close: vi.fn(),
      }
      const mockWindow = {
        document: mockDoc,
      }
      const openSpy = vi.spyOn(window, 'open').mockReturnValue(mockWindow as unknown as Window)

      const slipData: RentalSlipData = {
        bookingNo: 'BK-<999>',
        clientName: 'Alice & Bob',
        clientPhone: '9841000000',
        stage: 'Booked',
        pickupDate: '2026-10-21',
        returnDate: '2026-10-23',
        lines: [
          {
            name: 'ARRI Alexa Mini <LF>',
            serial: 'SN-"123"',
            qty: 1,
            days: 2,
            amountPaisa: rupees(50000),
          },
        ],
        subtotalPaisa: rupees(50000),
        vatPaisa: rupees(6500),
        vatRatePercent: 13,
        totalPaisa: rupees(56500),
        operatorName: 'Staff <Admin>',
      }

      printRentalSlip(slipData)

      expect(openSpy).toHaveBeenCalledWith('', '_blank', 'width=380,height=600')
      expect(mockDoc.open).toHaveBeenCalled()
      expect(mockDoc.close).toHaveBeenCalled()

      const writtenHtml = mockDoc.write.mock.calls[0]?.[0] as string
      expect(writtenHtml).toContain('BK-&lt;999&gt;')
      expect(writtenHtml).toContain('Alice &amp; Bob')
      expect(writtenHtml).toContain('ARRI Alexa Mini &lt;LF&gt;')
      expect(writtenHtml).toContain('SN-&quot;123&quot;')
      expect(writtenHtml).toContain('Staff &lt;Admin&gt;')
      expect(writtenHtml).toContain('VAT (13%):')

      openSpy.mockRestore()
    })
  })
})
