import { describe, it, expect, vi, beforeEach } from 'vitest'
import { rupees } from '../../money'

const uploadedFiles = new Set<string>()
const failures = vi.hoisted(() => ({ auth: false, upload: false, sign: false, receipt: false, updates: [] as Record<string, unknown>[] }))

// Mock Supabase storage at top level with realistic collision simulation
vi.mock('../../supabase', () => ({
  supabase: {
    auth: { getUser: vi.fn(async () => ({ data: { user: failures.auth ? null : { id: '00000000-0000-0000-0000-000000000001' } }, error: null })) },
    storage: {
      from: vi.fn(() => ({
        upload: vi.fn().mockImplementation(async (path: string) => {
          if (failures.upload) return { data: null, error: { message: 'Upload refused' } }
          if (uploadedFiles.has(path)) {
            return { data: null, error: { message: 'The resource already exists' } }
          }
          uploadedFiles.add(path)
          return { data: { path }, error: null }
        }),
        createSignedUrl: vi.fn(async () => failures.sign ? { data: null, error: { message: 'Signing refused' } } : { data: { signedUrl: 'https://example.com/signed' }, error: null }),
        download: vi.fn().mockImplementation(async (path: string) => {
          if (uploadedFiles.has(path)) {
            return { data: new Blob(['test']), error: null }
          }
          return { data: null, error: { message: 'Not found' } }
        }),
        getPublicUrl: vi.fn().mockReturnValue({ data: { publicUrl: 'https://example.com/public' } }),
      })),
    },
    from: vi.fn(() => ({
      update: vi.fn(function(this: unknown, row: Record<string, unknown>) { failures.updates.push(row); return this }),
      eq: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      single: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn(async () => ({ data: failures.receipt ? null : { id: 'registered-file' }, error: null })),
      insert: vi.fn().mockResolvedValue({ data: null, error: null }),
    })),
  },
  IS_MOCK: false,
}))

import { exportInvoicePdf, exportDocumentPdf, exportPackingListPdf, exportReturnReportPdf } from '../exportPdf'
import { supabase } from '../../supabase'

describe('exportPdf', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    uploadedFiles.clear()
    Object.assign(failures, { auth: false, upload: false, sign: false, receipt: false, updates: [] })
  })

  it('exports invoice PDF, uploads to documents bucket and retrieves signed URL', async () => {
    const res = await exportInvoicePdf(
      {
        invoiceNo: 'INV-2026-9001',
        status: 'Sent',
        bookingNo: 'B-750',
        client: { name: 'Kailash Films' },
        company: { name: 'Recorded Rentals', panVat: '123456789' },
        lines: [
          {
            description: 'Sony BURANO 8K Cinema Camera',
            quantity: 1,
            rentalDays: 2,
            ratePaisa: rupees(25000),
            totalPaisa: rupees(50000),
          },
        ],
        subtotalPaisa: rupees(50000),
        taxablePaisa: rupees(50000),
        vatPaisa: rupees(6500),
        totalPaisa: rupees(56500),
      },
      {
        uploadToStorage: true,
      },
    )

    expect(res.blob).toBeInstanceOf(Blob)
    expect(res.bytes).toBeInstanceOf(Uint8Array)
    expect(res.fileSizeBytes).toBeGreaterThan(500)
    expect(res.filename).toBe('INV-2026-9001.pdf')
    expect(res.storagePath).toMatch(/^staff\/00000000-0000-0000-0000-000000000001\/INV-2026-9001_[\da-f-]+\.pdf$/)
    expect(res.signedUrl).toBeDefined()
    expect(typeof res.signedUrl).toBe('string')

    const downloaded = await supabase.storage.from('documents').download(res.storagePath!)
    expect(downloaded.error).toBeNull()
    expect(downloaded.data).toBeDefined()
  })

  it('honors Law 3 by keeping an immutable unique revision for every export', async () => {
    const invoiceData = {
      invoiceNo: 'INV-2026-9002',
      status: 'Paid',
      bookingNo: 'B-751',
      client: { name: 'Muktinath Media' },
      company: { name: 'Recorded Rentals', panVat: '123456789' },
      lines: [
        {
          description: 'DJI Ronin 4D 6K',
          quantity: 1,
          totalPaisa: rupees(18000),
        },
      ],
      subtotalPaisa: rupees(18000),
      taxablePaisa: rupees(18000),
      vatPaisa: rupees(2340),
      totalPaisa: rupees(20340),
    }

    const first = await exportInvoicePdf(invoiceData)
    expect(first.storagePath).toContain('/INV-2026-9002_')

    const second = await exportInvoicePdf(invoiceData)
    expect(second.storagePath).not.toBe(first.storagePath)
    expect(uploadedFiles.size).toBe(2)
    expect(second.signedUrl).toBeDefined()
  })

  it('exports general document to its authenticated private namespace', async () => {
    const res = await exportDocumentPdf({
      documentNo: 'DOC-2026-8800',
      title: 'Commercial Quote for Feature Film',
      docType: 'Quotation',
      clientName: 'Annapurna Studios',
    })

    expect(res.filename).toBe('DOC-2026-8800.pdf')
    expect(res.storagePath).toContain('staff/00000000-0000-0000-0000-000000000001/DOC-2026-8800_')
    expect(res.signedUrl).toBeDefined()
    expect(failures.updates[0]?.file_url).toBe(res.storagePath)
    expect(failures.updates[0]?.file_url).not.toBe(res.signedUrl)
  })

  const documentData = { documentNo: 'DOC-SECURITY', title: 'Agreement', docType: 'Rental Agreement', clientName: 'Client' }
  it('refuses unauthenticated uploads before writing any bytes', async () => {
    failures.auth = true
    await expect(exportDocumentPdf(documentData)).rejects.toThrow('Sign in')
    expect(uploadedFiles.size).toBe(0)
    expect(failures.updates).toHaveLength(0)
  })
  it('does not register a failed upload', async () => {
    failures.upload = true
    await expect(exportDocumentPdf(documentData)).rejects.toThrow('upload was not confirmed')
    expect(failures.updates).toHaveLength(0)
  })
  it('refuses signing failure and preserves the uploaded object', async () => {
    failures.sign = true
    await expect(exportDocumentPdf(documentData)).rejects.toThrow('secure viewing')
    expect(uploadedFiles.size).toBe(1)
    expect(failures.updates).toHaveLength(0)
  })
  it('does not claim an attachment when the registry updates zero rows', async () => {
    failures.receipt = true
    await expect(exportDocumentPdf(documentData)).rejects.toThrow('attachment was not confirmed')
    expect(uploadedFiles.size).toBe(1)
  })
  it('retains local-only PDF generation without requiring authentication', async () => {
    failures.auth = true
    const result = await exportDocumentPdf(documentData, { uploadToStorage: false })
    expect(result.bytes.byteLength).toBeGreaterThan(500)
    expect(result.storagePath).toBeUndefined()
    expect(failures.updates).toHaveLength(0)
  })

  it('exports packing list PDF offline/local without requiring auth or throwing storage errors', async () => {
    failures.auth = true
    const res = await exportPackingListPdf({
      bookingNo: 'BK-100',
      clientName: 'Client Alpha',
      items: [
        { id: '1', name: 'Item 1', quantity: 1 },
      ],
    })
    expect(res.blob).toBeInstanceOf(Blob)
    expect(res.bytes.byteLength).toBeGreaterThan(500)
    expect(res.filename).toContain('BK-100')
  })

  it('exports return report PDF offline/local without requiring auth or throwing storage errors', async () => {
    failures.auth = true
    const res = await exportReturnReportPdf({
      bookingNo: 'BK-200',
      clientName: 'Client Beta',
      totalUnits: 1,
      returnedUnits: 1,
      missingUnits: 0,
      damagedUnits: 0,
      photosCount: 0,
      lines: [
        { id: '1', name: 'Item 1', quantity: 1, outcome: 'Received' },
      ],
    })
    expect(res.blob).toBeInstanceOf(Blob)
    expect(res.bytes.byteLength).toBeGreaterThan(500)
    expect(res.filename).toContain('BK-200')
  })
})
