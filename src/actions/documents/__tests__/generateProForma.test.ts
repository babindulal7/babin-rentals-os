import { describe, it, expect, vi, beforeEach } from 'vitest'
import { generateProFormaConfig } from '../generateProForma'

const mockState = vi.hoisted(() => ({
  bookings: [
    {
      id: 'booking-uuid-1',
      booking_no: 'BK-2026-0001',
      client_id: 'client-uuid-1',
      project_name: 'Kathmandu Indie Film',
      deposit_required: 5000000,
    },
  ],
  clients: [
    {
      id: 'client-uuid-1',
      name: 'Indie Film Studios',
      phone: '+977-9800000001',
      email: 'studio@indie.np',
      pan_vat: '600000001',
    },
  ],
  invoices: [
    {
      id: 'invoice-draft-uuid',
      booking_id: 'booking-uuid-1',
      status: 'Draft',
      subtotal: 10000000,
      discount_amount: 0,
      discount_percent: 0,
      taxable_amount: 10000000,
      vat_rate: 0.13,
      vat_amount: 1300000,
      total_amount: 11300000,
      paid_amount: 0,
      outstanding_amount: 11300000,
      notes: 'Sample draft notes',
      project_name: 'Kathmandu Indie Film',
      issue_date: '2026-11-10',
      due_date: '2026-11-17',
    },
  ],
  registryRows: [] as any[],
  bookingDocRows: [] as any[],
}))

vi.mock('../../../lib/supabase', () => ({
  supabase: {
    from: (table: string) => ({
      select: (_cols?: string, opts?: { count?: string; head?: boolean }) => {
        if (opts?.count === 'exact' && opts?.head) {
          return {
            eq: () => ({
              eq: () =>
                Promise.resolve({
                  count: mockState.registryRows.filter((r) => r.document_type === 'Pro Forma').length,
                  error: null,
                }),
            }),
          }
        }
        return {
          or: (cond: string) => ({
            maybeSingle: async () => {
              if (table === 'bookings') {
                const b = mockState.bookings.find((item) => cond.includes(item.id) || cond.includes(item.booking_no))
                return { data: b || null, error: null }
              }
              return { data: null, error: null }
            },
          }),
          eq: (_field: string, val: any) => ({
            eq: (_field2: string, val2: any) => ({
              order: () => ({
                limit: () => ({
                  maybeSingle: async () => {
                    if (table === 'invoices') {
                      const inv = mockState.invoices.find((i) => i.booking_id === val && i.status === val2)
                      return { data: inv || null, error: null }
                    }
                    return { data: null, error: null }
                  },
                }),
              }),
            }),
            maybeSingle: async () => {
              if (table === 'clients') {
                const cl = mockState.clients.find((c) => c.id === val)
                return { data: cl || null, error: null }
              }
              if (table === 'invoices') {
                const inv = mockState.invoices.find((i) => i.id === val)
                return { data: inv || null, error: null }
              }
              return { data: null, error: null }
            },
          }),
        }
      },
    }),
    IS_MOCK: false,
  },
}))

vi.mock('../../../lib/dataAccess', () => ({
  generateClientUuid: () => 'mock-client-uuid-1',
  idempotentInsert: async (table: string, row: any) => {
    if (table === 'document_registry') {
      const inserted = { id: `doc-uuid-${mockState.registryRows.length + 1}`, ...row }
      mockState.registryRows.push(inserted)
      return inserted
    }
    if (table === 'booking_documents') {
      mockState.bookingDocRows.push(row)
      return row
    }
    return row
  },
}))

vi.mock('../../../lib/pdf/exportPdf', () => ({
  exportProFormaPdf: vi.fn().mockResolvedValue({
    blob: new Blob(),
    bytes: new Uint8Array([1, 2, 3]),
    storagePath: 'documents/PF-BK-2026-0001.pdf',
    signedUrl: 'https://storage.local/documents/PF-BK-2026-0001.pdf',
    filename: 'PF-BK-2026-0001.pdf',
    fileSizeBytes: 1234,
  }),
}))

vi.mock('../../../lib/queries/finance', () => ({
  fetchInvoiceLines: vi.fn().mockResolvedValue([
    {
      description: 'RED V-Raptor 8K Camera',
      quantity: 1,
      days: 2,
      unitRate: 50000,
      lineTotal: 100000,
    },
  ]),
}))

vi.mock('../../../lib/queries/invoiceCompany', () => ({
  fetchInvoiceCompany: vi.fn().mockResolvedValue({
    name: 'Babin Rentals Kathmandu',
    panVat: '109876543',
  }),
}))

describe('generateProForma Action (T3-27, B18, B55, Law 6, Law 7)', () => {
  beforeEach(() => {
    mockState.registryRows = []
    mockState.bookingDocRows = []
  })

  it('validates bookingId is required', () => {
    expect(() => generateProFormaConfig.validate({ bookingId: '' })).toThrow(/Booking ID is required/i)
  })

  it('blocks money-blind roles under Law 6', async () => {
    const roles = ['Warehouse', 'Technician', 'Driver', 'Client'] as const
    for (const role of roles) {
      await expect(
        generateProFormaConfig.execute(
          { bookingId: 'booking-uuid-1' },
          { userId: 'user-wh-1', role },
        ),
      ).rejects.toThrow(/Law 6 money-blindness/i)
    }
  })

  it('allows finance staff (Coordinator, Accounts, Manager, Admin, Owner) and creates document record', async () => {
    const output = await generateProFormaConfig.execute(
      { bookingId: 'BK-2026-0001', download: false },
      { userId: 'user-coord-1', role: 'Coordinator' },
    )

    expect(output.result.success).toBe(true)
    expect(output.result.documentNo).toBe('PF-BK-2026-0001')
    expect(output.result.bookingNo).toBe('BK-2026-0001')
    expect(output.result.fileUrl).toBe('documents/PF-BK-2026-0001.pdf')

    // Persisted to document_registry with 'Pro Forma' type
    expect(mockState.registryRows.length).toBe(1)
    const docRow = mockState.registryRows[0]
    expect(docRow.document_type).toBe('Pro Forma')
    expect(docRow.document_no).toBe('PF-BK-2026-0001')
    expect(docRow.lifecycle_status).toBe('Draft')

    // Persisted to booking_documents
    expect(mockState.bookingDocRows.length).toBe(1)
    const bDoc = mockState.bookingDocRows[0]
    expect(bDoc.doc_type).toBe('Pro Forma')
    expect(bDoc.origin).toBe('Generated')
  })

  it('fails loudly when the booking has no draft invoice', async () => {
    // Temporarily clear draft invoices
    const oldInvoices = [...mockState.invoices]
    mockState.invoices = []
    try {
      await expect(
        generateProFormaConfig.execute(
          { bookingId: 'BK-2026-0001' },
          { userId: 'user-coord-1', role: 'Coordinator' },
        ),
      ).rejects.toThrow(/has no draft invoice/i)
    } finally {
      mockState.invoices = oldInvoices
    }
  })
})
