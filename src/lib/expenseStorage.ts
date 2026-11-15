import { supabase } from './supabase'

/**
 * =============================================================================
 * expenseStorage.ts — T3-24 Quick Expense with Bill Photo
 *
 * Handles bill photo uploads to Supabase Storage bucket `documents`.
 * Storage path: staff/<userId>/receipt_<clientUuid>_<cleanFilename>
 * Enforces <= 3 MB file size limit and strict fail-closed document / image validation.
 *
 * Security requirements:
 * 1. Strict extension whitelist: .jpg, .jpeg, .png, .webp, .heic, .heif, .pdf
 * 2. Strict MIME type verification against extension (blocks forged extensions).
 * 3. Immediate rejection of executable, HTML, and SVG formats (image/svg+xml, text/html, etc.).
 * 4. Safe mobile HEIC handling: blank MIME only permitted for .heic/.heif extensions.
 * 5. Sanitized storage paths preventing path traversal.
 * =============================================================================
 */

export const MAX_EXPENSE_RECEIPT_BYTES = 3 * 1024 * 1024 // 3 MB (T3-24 specification)
export const EXPENSE_RECEIPT_BUCKET = 'documents'

export interface UploadExpenseReceiptOptions {
  file: File | Blob
  filename: string
  userId: string
  clientUuid: string
}

export interface UploadExpenseReceiptResult {
  storagePath: string
  signedUrl: string | null
  fileSizeBytes: number
}

export const ALLOWED_RECEIPT_EXTENSIONS = ['jpg', 'jpeg', 'png', 'webp', 'heic', 'heif', 'pdf'] as const
export type AllowedReceiptExtension = (typeof ALLOWED_RECEIPT_EXTENSIONS)[number]

const EXTENSION_MIME_MAP: Record<AllowedReceiptExtension, string[]> = {
  jpg: ['image/jpeg'],
  jpeg: ['image/jpeg'],
  png: ['image/png'],
  webp: ['image/webp'],
  heic: ['image/heic', 'image/heif'],
  heif: ['image/heic', 'image/heif'],
  pdf: ['application/pdf'],
}

const DISALLOWED_MIME_PATTERNS = [
  'text/html',
  'text/javascript',
  'application/javascript',
  'image/svg+xml',
  'application/x-sh',
  'application/x-msdownload',
  'application/x-executable',
  'application/octet-stream',
]

/**
 * Validates a receipt file before upload.
 * Enforces fail-closed security against forged extensions and dangerous MIME payloads.
 */
export function validateReceiptFile(file: File | Blob, filename: string): { valid: boolean; error?: string } {
  if (!file || typeof file.size !== 'number' || file.size <= 0) {
    return {
      valid: false,
      error: 'Receipt file is empty or invalid.',
    }
  }

  if (file.size > MAX_EXPENSE_RECEIPT_BYTES) {
    return {
      valid: false,
      error: `Receipt photo (${(file.size / (1024 * 1024)).toFixed(1)} MB) exceeds the 3 MB size limit (T3-24).`,
    }
  }

  if (!filename || typeof filename !== 'string' || !filename.trim()) {
    return {
      valid: false,
      error: 'Receipt filename is required.',
    }
  }

  const parts = filename.trim().split('.')
  if (parts.length < 2) {
    return {
      valid: false,
      error: 'Receipt filename must include a valid file extension.',
    }
  }

  const ext = parts.pop()!.toLowerCase() as AllowedReceiptExtension
  if (!ALLOWED_RECEIPT_EXTENSIONS.includes(ext)) {
    return {
      valid: false,
      error: `Unsupported file extension .${ext}. Receipt must be an image (JPEG, PNG, WebP, HEIC) or PDF.`,
    }
  }

  const mime = (file.type || '').trim().toLowerCase()

  // Explicitly block active content / script / SVG / HTML / executable types
  if (mime) {
    if (DISALLOWED_MIME_PATTERNS.some((pattern) => mime.includes(pattern))) {
      return {
        valid: false,
        error: `Disallowed receipt file type: ${mime}. Executables, HTML, and SVG formats are strictly forbidden.`,
      }
    }

    const expectedMimes = EXTENSION_MIME_MAP[ext]
    if (!expectedMimes || !expectedMimes.includes(mime)) {
      return {
        valid: false,
        error: `Mismatched file type: extension .${ext} does not match uploaded MIME type "${mime}".`,
      }
    }
  } else {
    // Mobile HEIC / HEIF camera capture in mobile WebViews occasionally provides blank MIME.
    // Documented safe path: permit blank MIME only for explicit .heic / .heif extensions.
    if (ext !== 'heic' && ext !== 'heif') {
      return {
        valid: false,
        error: `Cannot determine MIME type for file with extension .${ext}. Please upload a standard JPEG, PNG, WebP, or PDF.`,
      }
    }
  }

  return { valid: true }
}

export async function uploadExpenseReceipt(
  options: UploadExpenseReceiptOptions,
): Promise<UploadExpenseReceiptResult> {
  const { file, filename, userId, clientUuid } = options

  if (!userId || typeof userId !== 'string' || !userId.trim()) {
    throw new Error('Receipt upload rejected: an authenticated staff user ID is required.')
  }

  const validation = validateReceiptFile(file, filename)
  if (!validation.valid) {
    throw new Error(validation.error)
  }

  // Strip directory paths and sanitize base filename to prevent path traversal
  const basename = filename.trim().replace(/^.*[\\/]/, '')
  const lastDot = basename.lastIndexOf('.')
  const rawBase = lastDot > 0 ? basename.slice(0, lastDot) : basename
  const ext = (lastDot > 0 ? basename.slice(lastDot + 1) : '').toLowerCase()

  const cleanBase = rawBase
    .replace(/[^a-zA-Z0-9_-]/g, '_')
    .slice(0, 80)
  const cleanFilename = `${cleanBase || 'receipt'}.${ext}`

  // In accordance with migration 0170 storage object allowed rules:
  // documents bucket requires: staff/<userId>/<filename>
  const storagePath = `staff/${userId}/receipt_${clientUuid}_${cleanFilename}`

  const storage = supabase.storage.from(EXPENSE_RECEIPT_BUCKET)
  const contentType = file.type || (ext === 'heic' || ext === 'heif' ? 'image/heic' : 'image/jpeg')

  const { data: uploaded, error: uploadError } = await storage.upload(storagePath, file, {
    contentType,
    upsert: false,
  })

  if (uploadError || !uploaded) {
    throw new Error(`Receipt upload failed: ${uploadError?.message ?? 'unknown storage error'}`)
  }

  let signedUrl: string | null = null
  try {
    const { data: signed, error: signError } = await storage.createSignedUrl(storagePath, 3600)
    if (!signError && signed?.signedUrl) {
      signedUrl = signed.signedUrl
    }
  } catch {
    // Non-fatal if signedUrl creation deferred
  }

  return {
    storagePath,
    signedUrl,
    fileSizeBytes: file.size,
  }
}

export async function getExpenseReceiptSignedUrl(storagePath: string): Promise<string | null> {
  if (!storagePath || !storagePath.trim()) return null
  if (storagePath.startsWith('http://') || storagePath.startsWith('https://') || storagePath.startsWith('data:')) {
    return storagePath
  }
  const { data, error } = await supabase.storage.from(EXPENSE_RECEIPT_BUCKET).createSignedUrl(storagePath, 3600)
  return !error && data?.signedUrl ? data.signedUrl : null
}
