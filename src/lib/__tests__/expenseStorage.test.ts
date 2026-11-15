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

  it('accepts valid receipt image and pdf formats matching their extension', () => {
    const jpegBlob = new Blob(['jpeg'], { type: 'image/jpeg' })
    expect(validateReceiptFile(jpegBlob, 'receipt.jpg').valid).toBe(true)
    expect(validateReceiptFile(jpegBlob, 'receipt.jpeg').valid).toBe(true)

    const pngBlob = new Blob(['png'], { type: 'image/png' })
    expect(validateReceiptFile(pngBlob, 'receipt.png').valid).toBe(true)

    const webpBlob = new Blob(['webp'], { type: 'image/webp' })
    expect(validateReceiptFile(webpBlob, 'receipt.webp').valid).toBe(true)

    const pdfBlob = new Blob(['pdf'], { type: 'application/pdf' })
    expect(validateReceiptFile(pdfBlob, 'invoice.pdf').valid).toBe(true)
  })

  it('rejects forged MIME type (e.g. text/html masquerading as JPEG)', () => {
    const htmlForgedBlob = new Blob(['<html>malicious</html>'], { type: 'text/html' })
    const result = validateReceiptFile(htmlForgedBlob, 'innocent.jpg')
    expect(result.valid).toBe(false)
    expect(result.error).toContain('Disallowed receipt file type: text/html')
  })

  it('rejects SVG images masquerading as pictures', () => {
    const svgBlob = new Blob(['<svg></svg>'], { type: 'image/svg+xml' })
    const result = validateReceiptFile(svgBlob, 'vector.png')
    expect(result.valid).toBe(false)
    expect(result.error).toContain('Disallowed receipt file type: image/svg+xml')
  })

  it('rejects mismatched MIME and extension (e.g. PDF masquerading as PNG)', () => {
    const pdfBlob = new Blob(['pdf'], { type: 'application/pdf' })
    const result = validateReceiptFile(pdfBlob, 'fake.png')
    expect(result.valid).toBe(false)
    expect(result.error).toContain('Mismatched file type')
  })

  it('rejects unknown extensions even when MIME is empty', () => {
    const blankBlob = new Blob(['binary'], { type: '' })
    const result = validateReceiptFile(blankBlob, 'script.sh')
    expect(result.valid).toBe(false)
    expect(result.error).toContain('Unsupported file extension .sh')
  })

  it('allows mobile HEIC / HEIF with blank MIME type as documented safe path', () => {
    const blankHeicBlob = new Blob(['heic-bytes'], { type: '' })
    expect(validateReceiptFile(blankHeicBlob, 'photo.heic').valid).toBe(true)
    expect(validateReceiptFile(blankHeicBlob, 'photo.heif').valid).toBe(true)
  })

  it('rejects empty or zero-byte files', () => {
    const emptyBlob = new Blob([], { type: 'image/jpeg' })
    const result = validateReceiptFile(emptyBlob, 'empty.jpg')
    expect(result.valid).toBe(false)
    expect(result.error).toContain('empty or invalid')
  })

  it('uploads receipt to documents bucket under staff path with sanitized filename', async () => {
    const userId = '11111111-1111-4111-8111-111111111111'
    const clientUuid = '22222222-2222-4222-8222-222222222222'
    const testBlob = new Blob(['test-receipt-bytes'], { type: 'image/jpeg' })

    const result = await uploadExpenseReceipt({
      file: testBlob,
      filename: '../../lunch bill!.jpeg',
      userId,
      clientUuid,
    })

    // Path traversal .. stripped, non-alphanumeric converted
    expect(result.storagePath).toBe(`staff/${userId}/receipt_${clientUuid}_lunch_bill_.jpeg`)
    expect(result.fileSizeBytes).toBe(testBlob.size)
    expect(uploadMock).toHaveBeenCalledWith(
      EXPENSE_RECEIPT_BUCKET,
      `staff/${userId}/receipt_${clientUuid}_lunch_bill_.jpeg`,
      testBlob,
      expect.objectContaining({ upsert: false }),
    )
  })

  it('refuses upload if userId is missing', async () => {
    const testBlob = new Blob(['test-receipt-bytes'], { type: 'image/jpeg' })
    await expect(
      uploadExpenseReceipt({
        file: testBlob,
        filename: 'bill.jpg',
        userId: '',
        clientUuid: 'uuid-1',
      }),
    ).rejects.toThrow('an authenticated staff user ID is required')
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
