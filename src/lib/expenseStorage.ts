import { supabase } from './supabase'

/**
 * =============================================================================
 * expenseStorage.ts — T3-24 Quick Expense with Bill Photo
 *
 * Handles bill photo uploads to Supabase Storage bucket `documents`.
 * Storage path: staff/<userId>/receipt_<clientUuid>_<cleanFilename>
 * Enforces <= 3 MB file size limit and valid document / image formats.
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

const ACCEPTED_RECEIPT_MIME_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
  'image/heif',
  'application/pdf',
])

export function validateReceiptFile(file: File | Blob, filename: string): { valid: boolean; error?: string } {
  if (file.size > MAX_EXPENSE_RECEIPT_BYTES) {
    return {
      valid: false,
      error: `Receipt photo (${(file.size / (1024 * 1024)).toFixed(1)} MB) exceeds the 3 MB size limit (T3-24).`,
    }
  }

  // Check type or extension
  const ext = filename.split('.').pop()?.toLowerCase() ?? ''
  const validExt = ['jpg', 'jpeg', 'png', 'webp', 'heic', 'heif', 'pdf'].includes(ext)
  const validType = file.type ? ACCEPTED_RECEIPT_MIME_TYPES.has(file.type) : true

  if (!validExt && !validType) {
    return {
      valid: false,
      error: 'Receipt must be an image (JPEG, PNG, WebP, HEIC) or PDF.',
    }
  }

  return { valid: true }
}

export async function uploadExpenseReceipt(
  options: UploadExpenseReceiptOptions,
): Promise<UploadExpenseReceiptResult> {
  const { file, filename, userId, clientUuid } = options

  const validation = validateReceiptFile(file, filename)
  if (!validation.valid) {
    throw new Error(validation.error)
  }

  const cleanFilename = filename
    .trim()
    .replace(/[^a-zA-Z0-9._-]/g, '_')
    .slice(0, 100)

  // In accordance with migration 0170 storage object allowed rules:
  // documents bucket requires: staff/<userId>/<filename>
  const storagePath = `staff/${userId}/receipt_${clientUuid}_${cleanFilename}`

  const storage = supabase.storage.from(EXPENSE_RECEIPT_BUCKET)
  const { data: uploaded, error: uploadError } = await storage.upload(storagePath, file, {
    contentType: file.type || 'image/jpeg',
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
