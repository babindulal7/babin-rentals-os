/**
 * # PDF Storage & Export Service
 *
 * Connects client-side PDF document generation to Supabase Storage:
 *  1. Generates standard PDF 1.4 binary bytes.
 *  2. Uploads the generated PDF blob to the private 'documents' bucket.
 *  3. Obtains a signed URL for secure access.
 *  4. Persists the stable private object path to `invoices.pdf_url` (or `document_registry.file_url`).
 *  5. Triggers direct browser download when requested.
 */

import { supabase } from '../supabase'
import {
  generateInvoicePdf,
  generateDocumentPdf,
  generatePackingListPdf,
  generateReturnReportPdf,
  generateClientStatementPdf,
  type InvoicePdfData,
  type DocumentPdfData,
  type PackingListPdfData,
  type ReturnReportPdfData,
  type ClientStatementPdfData,
} from './generatePdf'

export interface ExportPdfOptions {
  /** When true, uploads the generated PDF to Supabase Storage bucket 'documents'. Default: true. */
  uploadToStorage?: boolean
  /** Time in seconds before the signed URL expires. Default: 86400 (24h). */
  expiresInSeconds?: number
  /** When true, triggers a browser file download. Default: false. */
  download?: boolean
  /** Target filename for download. */
  filename?: string
  /** Database invoice ID (UUID) if known, used to persist `invoices.pdf_url`. */
  invoiceId?: string
  /** Database document ID (UUID) if known, used to persist `document_registry.file_url`. */
  documentId?: string
}

export interface ExportPdfResult {
  blob: Blob
  bytes: Uint8Array
  storagePath?: string | undefined
  signedUrl?: string | undefined
  filename: string
  fileSizeBytes: number
}

function sanitizePathSegment(segment: string): string {
  return segment.replace(/[^a-zA-Z0-9_-]/g, '_')
}

/**
 * Resolves the storage bucket client.
 */
async function getStorageClient() {
  if (!supabase?.storage || typeof supabase.storage.from !== 'function') {
    throw new Error('Supabase storage client not available')
  }
  return supabase.storage.from('documents')
}

/** Authenticated, immutable uploads; viewing links never become database identifiers. */
async function uploadPrivatePdf(blob: Blob, safeName: string, expiresIn: number) {
  const { data: identity, error: authError } = await supabase.auth.getUser()
  if (authError || !identity.user) throw new Error('Sign in before uploading a PDF.')
  const storagePath = `staff/${identity.user.id}/${safeName}_${crypto.randomUUID()}.pdf`
  const storage = await getStorageClient()
  const { data: uploaded, error: uploadError } = await storage.upload(storagePath, blob, { contentType: 'application/pdf', upsert: false })
  if (uploadError || !uploaded || uploaded.path !== storagePath) throw new Error(`PDF upload was not confirmed: ${uploadError?.message ?? 'invalid response'}`)
  const { data: signed, error: signError } = await storage.createSignedUrl(storagePath, expiresIn)
  if (signError || !signed?.signedUrl) throw new Error('PDF secure viewing could not be confirmed.')
  return { storagePath, signedUrl: signed.signedUrl }
}

/**
 * Exports an invoice as a PDF, uploads it to Supabase Storage bucket 'documents',
 * retrieves a signed URL, and persists `invoices.pdf_url`.
 */
export async function exportInvoicePdf(
  invoiceData: InvoicePdfData,
  options: ExportPdfOptions = {},
): Promise<ExportPdfResult> {
  const {
    uploadToStorage = true,
    expiresInSeconds = 86400,
    download = false,
    invoiceId,
  } = options

  const safeName = sanitizePathSegment(invoiceData.invoiceNo || invoiceId || 'DRAFT_INVOICE')
  const filename = options.filename || `${safeName}.pdf`

  // 1. Generate standard PDF bytes
  const bytes = generateInvoicePdf(invoiceData)
  const blob = new Blob([bytes as unknown as BlobPart], { type: 'application/pdf' })

  let storagePath: string | undefined
  let signedUrl: string | undefined

  if (uploadToStorage) {
    const stored = await uploadPrivatePdf(blob, safeName, expiresInSeconds)
    storagePath = stored.storagePath
    signedUrl = stored.signedUrl
    const reference = invoiceId || invoiceData.invoiceNo
    if (reference) {
      const { data, error } = await supabase.from('invoices').update({ pdf_url: storagePath })
        .eq(invoiceId ? 'id' : 'invoice_no', reference).select('id').maybeSingle()
      if (error || !data?.id) throw new Error('Invoice PDF attachment was not confirmed. The uploaded file was preserved.')
    }
  }

  // 5. Trigger browser download if requested
  if (download && typeof window !== 'undefined' && typeof document !== 'undefined') {
    const downloadUrl = signedUrl || URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = downloadUrl
    a.download = filename
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    if (!signedUrl) {
      setTimeout(() => URL.revokeObjectURL(downloadUrl), 5000)
    }
  }

  return {
    blob,
    bytes,
    storagePath,
    signedUrl,
    filename,
    fileSizeBytes: bytes.byteLength,
  }
}

/**
 * Exports a Pro Forma invoice as a PDF, uploads it to Supabase Storage bucket 'documents',
 * retrieves a signed URL, and persists `document_registry.file_url`.
 * A pro forma is not a tax invoice, takes no invoice number, and is valid for 7 days (B18, Law 7).
 */
export async function exportProFormaPdf(
  invoiceData: InvoicePdfData,
  options: ExportPdfOptions = {},
): Promise<ExportPdfResult> {
  const {
    uploadToStorage = true,
    expiresInSeconds = 86400,
    download = false,
    documentId,
  } = options

  const proFormData: InvoicePdfData = {
    ...invoiceData,
    isProForma: true,
    documentTitle: invoiceData.documentTitle || 'PRO FORMA INVOICE — not a tax invoice',
    status: 'Pro Forma',
  }

  const safeBookingNo = sanitizePathSegment(invoiceData.bookingNo || 'BOOKING')
  const safeName = sanitizePathSegment(options.filename?.replace(/\.pdf$/i, '') || `PRO_FORMA_${safeBookingNo}`)
  const filename = options.filename || `${safeName}.pdf`

  const bytes = generateInvoicePdf(proFormData)
  const blob = new Blob([bytes as unknown as BlobPart], { type: 'application/pdf' })

  let storagePath: string | undefined
  let signedUrl: string | undefined

  if (uploadToStorage) {
    const stored = await uploadPrivatePdf(blob, safeName, expiresInSeconds)
    storagePath = stored.storagePath
    signedUrl = stored.signedUrl
    const reference = documentId || safeName
    if (reference) {
      await supabase
        .from('document_registry')
        .update({ file_url: storagePath, file_size_bytes: bytes.byteLength })
        .eq(documentId ? 'id' : 'document_no', reference)
    }
  }

  if (download && typeof window !== 'undefined' && typeof document !== 'undefined') {
    const downloadUrl = signedUrl || URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = downloadUrl
    a.download = filename
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    if (!signedUrl) {
      setTimeout(() => URL.revokeObjectURL(downloadUrl), 5000)
    }
  }

  return {
    blob,
    bytes,
    storagePath,
    signedUrl,
    filename,
    fileSizeBytes: bytes.byteLength,
  }
}

/**
 * Exports a registered document as a PDF, uploads to Supabase Storage bucket 'documents',
 * retrieves a signed URL, and persists `document_registry.file_url`.
 */
export async function exportDocumentPdf(
  documentData: DocumentPdfData,
  options: ExportPdfOptions = {},
): Promise<ExportPdfResult> {
  const {
    uploadToStorage = true,
    expiresInSeconds = 86400,
    download = false,
    documentId,
  } = options

  const safeName = sanitizePathSegment(documentData.documentNo || documentId || 'DOC')
  const filename = options.filename || `${safeName}.pdf`

  const bytes = generateDocumentPdf(documentData)
  const blob = new Blob([bytes as unknown as BlobPart], { type: 'application/pdf' })

  let storagePath: string | undefined
  let signedUrl: string | undefined

  if (uploadToStorage) {
    const stored = await uploadPrivatePdf(blob, safeName, expiresInSeconds)
    storagePath = stored.storagePath
    signedUrl = stored.signedUrl
    const reference = documentId || documentData.documentNo
    if (reference) {
      const { data, error } = await supabase.from('document_registry')
        .update({ file_url: storagePath, file_size_bytes: bytes.byteLength })
        .eq(documentId ? 'id' : 'document_no', reference).select('id').maybeSingle()
      if (error || !data?.id) throw new Error('Document PDF attachment was not confirmed. The uploaded file was preserved.')
    }
  }

  if (download && typeof window !== 'undefined' && typeof document !== 'undefined') {
    const downloadUrl = signedUrl || URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = downloadUrl
    a.download = filename
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    if (!signedUrl) {
      setTimeout(() => URL.revokeObjectURL(downloadUrl), 5000)
    }
  }

  return {
    blob,
    bytes,
    storagePath,
    signedUrl,
    filename,
    fileSizeBytes: bytes.byteLength,
  }
}

/**
 * Exports a warehouse packing list as a PDF document.
 * Follows the 27 Jul hierarchy rule (parent-first, children nested) and is strictly money-blind.
 */
export async function exportPackingListPdf(
  packingData: PackingListPdfData,
  options: ExportPdfOptions = {},
): Promise<ExportPdfResult> {
  const {
    uploadToStorage = false,
    expiresInSeconds = 86400,
    download = false,
    documentId,
  } = options

  const safeBookingNo = sanitizePathSegment(packingData.bookingNo || 'BOOKING')
  const safeName = sanitizePathSegment(packingData.documentNo || `PACKING_LIST_${safeBookingNo}`)
  const filename = options.filename || `${safeName}.pdf`

  const bytes = generatePackingListPdf(packingData)
  const blob = new Blob([bytes as unknown as BlobPart], { type: 'application/pdf' })

  let storagePath: string | undefined
  let signedUrl: string | undefined

  if (uploadToStorage) {
    try {
      const stored = await uploadPrivatePdf(blob, safeName, expiresInSeconds)
      storagePath = stored.storagePath
      signedUrl = stored.signedUrl
      const reference = documentId || packingData.documentNo
      if (reference) {
        await supabase
          .from('document_registry')
          .update({ file_url: storagePath, file_size_bytes: bytes.byteLength })
          .eq(documentId ? 'id' : 'document_no', reference)
      }
    } catch {
      // Storage upload failure in floor/offline mode does not block printing
    }
  }

  if (download && typeof window !== 'undefined' && typeof document !== 'undefined') {
    const downloadUrl = signedUrl || URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = downloadUrl
    a.download = filename
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    if (!signedUrl) {
      setTimeout(() => URL.revokeObjectURL(downloadUrl), 5000)
    }
  }

  return {
    blob,
    bytes,
    storagePath,
    signedUrl,
    filename,
    fileSizeBytes: bytes.byteLength,
  }
}

/**
 * Exports a warehouse return inspection report as a PDF document.
 * Strictly money-blind — includes units, outcomes, photos count, and flags.
 */
export async function exportReturnReportPdf(
  returnData: ReturnReportPdfData,
  options: ExportPdfOptions = {},
): Promise<ExportPdfResult> {
  const {
    uploadToStorage = false,
    expiresInSeconds = 86400,
    download = false,
    documentId,
  } = options

  const safeBookingNo = sanitizePathSegment(returnData.bookingNo || 'BOOKING')
  const safeName = sanitizePathSegment(returnData.documentNo || `RETURN_REPORT_${safeBookingNo}`)
  const filename = options.filename || `${safeName}.pdf`

  const bytes = generateReturnReportPdf(returnData)
  const blob = new Blob([bytes as unknown as BlobPart], { type: 'application/pdf' })

  let storagePath: string | undefined
  let signedUrl: string | undefined

  if (uploadToStorage) {
    try {
      const stored = await uploadPrivatePdf(blob, safeName, expiresInSeconds)
      storagePath = stored.storagePath
      signedUrl = stored.signedUrl
      const reference = documentId || returnData.documentNo
      if (reference) {
        await supabase
          .from('document_registry')
          .update({ file_url: storagePath, file_size_bytes: bytes.byteLength })
          .eq(documentId ? 'id' : 'document_no', reference)
      }
    } catch {
      // Storage upload failure in floor/offline mode does not block printing
    }
  }

  if (download && typeof window !== 'undefined' && typeof document !== 'undefined') {
    const downloadUrl = signedUrl || URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = downloadUrl
    a.download = filename
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    if (!signedUrl) {
      setTimeout(() => URL.revokeObjectURL(downloadUrl), 5000)
    }
  }

  return {
    blob,
    bytes,
    storagePath,
    signedUrl,
    filename,
    fileSizeBytes: bytes.byteLength,
  }
}

/**
 * Opens a PDF document blob for direct viewing and printing on iPad / desktop.
 */
export function openPdfForPrint(blob: Blob, _title?: string): void {
  if (typeof window === 'undefined') return
  const url = URL.createObjectURL(blob)
  const opened = window.open(url, '_blank')
  if (!opened) {
    // If popups are blocked, download the file directly so the operator gets it
    const a = document.createElement('a')
    a.href = url
    a.download = `${_title || 'document'}.pdf`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
  }
}

/**
 * Exports a Client Statement PDF (T3-20) and optionally triggers browser download.
 */
export async function exportClientStatementPdf(
  statementData: ClientStatementPdfData,
  options: Pick<ExportPdfOptions, 'download' | 'filename'> = {},
): Promise<ExportPdfResult> {
  const safeName = sanitizePathSegment(`Statement_${statementData.client.name}`)
  const filename = options.filename || `${safeName}.pdf`
  const bytes = generateClientStatementPdf(statementData)
  const blob = new Blob([bytes as unknown as BlobPart], { type: 'application/pdf' })

  if (options.download && typeof window !== 'undefined' && typeof document !== 'undefined') {
    const downloadUrl = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = downloadUrl
    a.download = filename
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    setTimeout(() => URL.revokeObjectURL(downloadUrl), 5000)
  }

  return {
    blob,
    bytes,
    filename,
    fileSizeBytes: bytes.byteLength,
  }
}
