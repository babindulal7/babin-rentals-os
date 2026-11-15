import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  validateReceiptFile,
  uploadExpenseReceipt,
  getExpenseReceiptSignedUrl,
  MAX_EXPENSE_RECEIPT_BYTES,
  EXPENSE_RECEIPT_BUCKET,
} from '../expenseStorage'

const uploadMock = vi.fn()
const createSignedUrlMock = vi.fn()

vi.mock('../supabase', () => ({
  supabase: {
    storage: {
      from: vi.fn((bucket: string) => ({
        upload: (path: string, file: unknown, opts: unknown) => uploadMock(bucket, path, file, opts),
        createSignedUrl: (path: string, exp: number) => createSignedUrlMock(bucket, path, exp),
      })),
    },
  },
}))

describe('expenseStorage (T3-24)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    uploadMock.mockImplementation((_bucket, path) => Promise.resolve({ data: { path }, error: null }))
    createSignedUrlMock.mockImplementation((bucket, path) =>
      Promise.resolve({ data: { signedUrl: `https://storage.local/${bucket}/${path}?signed=1` }, error: null }),
    )
  })

  it('enforces 3 MB file size cap', () => {
    const smallBlob = new Blob(['sample-receipt-image-content'], { type: 'image/jpeg' })
    expect(validateReceiptFile(smallBlob, 'bill.jpg').valid).toBe(true)

    // Over 3 MB
    const largeBlob = {
      size: MAX_EXPENSE_RECEIPT_BYTES + 1024,
      type: 'image/jpeg',
    } as unknown as Blob

    const check = validateReceiptFile(largeBlob, 'oversized.jpg')
    expect(check.valid).toBe(false)
    expect(check.error).toContain('exceeds the 3 MB size limit')
  })

  it('accepts valid receipt image and pdf formats and rejects unsupported formats', () => {
    const pngBlob = new Blob(['png'], { type: 'image/png' })
    expect(validateReceiptFile(pngBlob, 'receipt.png').valid).toBe(true)

    const pdfBlob = new Blob(['pdf'], { type: 'application/pdf' })
    expect(validateReceiptFile(pdfBlob, 'invoice.pdf').valid).toBe(true)

    const exeBlob = new Blob(['binary'], { type: 'application/octet-stream' })
    expect(validateReceiptFile(exeBlob, 'malicious.exe').valid).toBe(false)
  })

  it('uploads receipt to documents bucket under staff path', async () => {
    const userId = '11111111-1111-4111-8111-111111111111'
    const clientUuid = '22222222-2222-4222-8222-222222222222'
    const testBlob = new Blob(['test-receipt-bytes'], { type: 'image/jpeg' })

    const result = await uploadExpenseReceipt({
      file: testBlob,
      filename: 'lunch bill.jpeg',
      userId,
      clientUuid,
    })

    expect(result.storagePath).toBe(`staff/${userId}/receipt_${clientUuid}_lunch_bill.jpeg`)
    expect(result.fileSizeBytes).toBe(testBlob.size)
    expect(uploadMock).toHaveBeenCalledWith(
      EXPENSE_RECEIPT_BUCKET,
      `staff/${userId}/receipt_${clientUuid}_lunch_bill.jpeg`,
      testBlob,
      expect.objectContaining({ upsert: false }),
    )
  })

  it('retrieves signed URL for existing receipt path', async () => {
    const path = 'staff/11111111-1111-4111-8111-111111111111/receipt_22222222-2222-4222-8222-222222222222_bill.jpg'
    const url = await getExpenseReceiptSignedUrl(path)
    expect(url).toBe(`https://storage.local/documents/${path}?signed=1`)
  })

  it('returns direct url when already a full url', async () => {
    const httpUrl = 'https://example.com/receipt.jpg'
    expect(await getExpenseReceiptSignedUrl(httpUrl)).toBe(httpUrl)
  })
})
