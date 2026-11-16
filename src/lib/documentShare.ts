/**
 * src/lib/documentShare.ts — Babin Rentals OS
 *
 * Core document sharing engine (T3-16).
 *
 * Supports 1-to-2 tap document distribution across 4 primary channels:
 *  1. WhatsApp (Native sheet file share on iOS/Android, or wa.me compose link)
 *  2. Email (via T5-03 transactional email, from no-reply@babinrentals.com)
 *  3. Print (A4 direct via openPdfForPrint / window.print)
 *  4. Copy text (Clean formatted markdown/plain-text summary)
 *
 * Law 6 Enforcement:
 *  Money-blind roles (Warehouse, Technician, Driver, Client) cannot view or share
 *  priced documents (Quote, Invoice, Payment Receipt, Booking Confirmation with pricing).
 *  Unpriced documents (Rental Agreement, Packing List, Return Report) can be shared by floor roles.
 */

import { canViewMoney } from './rbac'
import type { SystemRole } from '../types/database'
import { normalisePhone, buildWaLink, NO_PHONE_REASON } from './whatsapp'
import {
  quoteDocument,
  invoiceDocument,
  receiptDocument,
  agreementDocument,
  bookingConfirmed,
  type WaBusiness,
  type WaQuoteDocument,
  type WaInvoiceDocument,
  type WaReceiptDocument,
  type WaAgreementDocument,
  type WaBookingConfirmed,
} from './whatsappTemplates'
import { sendEmail, type SendEmailResult } from './email/client'
import { openPdfForPrint } from './pdf/exportPdf'

export type DocumentShareType =
  | 'quote'
  | 'invoice'
  | 'receipt'
  | 'agreement'
  | 'confirmation'
  | 'packing_list'
  | 'return_report'

export interface SharePermissionResult {
  allowed: boolean
  reason?: string | undefined
}

/**
 * Law 6 Classification:
 * Priced documents contain financial totals or pricing structures.
 */
export function isPricedDocument(docType: DocumentShareType): boolean {
  switch (docType) {
    case 'quote':
    case 'invoice':
    case 'receipt':
    case 'confirmation':
      return true
    case 'agreement':
    case 'packing_list':
    case 'return_report':
      return false
    default:
      return true
  }
}

/**
 * Evaluates whether a role is permitted to share a given document type.
 * Under Law 6, money-blind roles (Warehouse, Technician, Driver, Client) cannot share priced documents.
 */
export function canRoleShareDocument(
  role: SystemRole | string | undefined | null,
  docType: DocumentShareType,
): SharePermissionResult {
  const sysRole = (role || 'Warehouse') as SystemRole
  if (isPricedDocument(docType) && !canViewMoney(sysRole)) {
    return {
      allowed: false,
      reason: 'Your role cannot view or share financial documents.',
    }
  }
  return { allowed: true }
}

export interface BuildWhatsAppLinkOptions {
  docType: DocumentShareType
  facts:
    | { kind: 'quote'; data: WaQuoteDocument }
    | { kind: 'invoice'; data: WaInvoiceDocument }
    | { kind: 'receipt'; data: WaReceiptDocument }
    | { kind: 'agreement'; data: WaAgreementDocument }
    | { kind: 'confirmation'; data: WaBookingConfirmed }
  business: WaBusiness
  phone?: string | null | undefined
}

export interface WhatsAppShareLinkResult {
  url: string | null
  text: string
  disabledReason?: string | undefined
}

/**
 * Builds the WhatsApp share text and compose link.
 * If the recipient phone is invalid or missing, disables the button with NO_PHONE_REASON.
 */
export function buildWhatsAppShareLink(options: BuildWhatsAppLinkOptions): WhatsAppShareLinkResult {
  const { facts, business, phone } = options

  let text = ''
  switch (facts.kind) {
    case 'quote':
      text = quoteDocument(facts.data, business)
      break
    case 'invoice':
      text = invoiceDocument(facts.data, business)
      break
    case 'receipt':
      text = receiptDocument(facts.data, business)
      break
    case 'agreement':
      text = agreementDocument(facts.data, business)
      break
    case 'confirmation':
      text = bookingConfirmed(facts.data, business)
      break
    default:
      text = `Document from ${business.businessName} for your rental record.`
  }

  const valid = normalisePhone(phone)
  if (!valid) {
    return {
      url: null,
      text,
      disabledReason: NO_PHONE_REASON,
    }
  }

  return {
    url: buildWaLink(phone, text),
    text,
  }
}

/**
 * Shares a PDF file natively via WebShare API (e.g. iPhone / Android share sheet).
 * If files are supported, attaches the PDF directly for WhatsApp / AirDrop / Mail sharing.
 * Falls back cleanly when WebShare API is unsupported.
 */
export async function shareViaNative(options: {
  title: string
  text?: string | undefined
  blob?: Blob | undefined
  filename?: string | undefined
}): Promise<{ shared: boolean; method: 'native' | 'fallback'; error?: string | undefined }> {
  const { title, text, blob, filename = 'document.pdf' } = options

  if (typeof navigator === 'undefined' || typeof navigator.share !== 'function') {
    return { shared: false, method: 'fallback', error: 'WebShare API not supported on this platform' }
  }

  try {
    // Check if file sharing is supported
    if (blob && typeof navigator.canShare === 'function' && typeof File !== 'undefined') {
      const file = new File([blob], filename, { type: 'application/pdf' })
      if (navigator.canShare({ files: [file] })) {
        await navigator.share({
          title,
          text: text ?? title,
          files: [file],
        })
        return { shared: true, method: 'native' }
      }
    }

    // Text/URL sharing fallback
    await navigator.share({
      title,
      text: text ?? title,
    })
    return { shared: true, method: 'native' }
  } catch (err: unknown) {
    // User abort is not an error to display
    const msg = err instanceof Error ? err.message : String(err)
    if (msg.toLowerCase().includes('abort') || msg.toLowerCase().includes('cancel')) {
      return { shared: false, method: 'native' }
    }
    return { shared: false, method: 'fallback', error: msg }
  }
}

/**
 * Dispatches a document via transactional email (T5-03) from no-reply@babinrentals.com.
 */
export async function sendDocumentEmail(options: {
  docType: DocumentShareType
  recipientEmail: string
  recipientName?: string | undefined
  bookingId?: string | undefined
  bookingNo: string
  extraData?: Record<string, unknown> | undefined
}): Promise<SendEmailResult> {
  const { docType, recipientEmail, bookingId, bookingNo } = options

  if (!recipientEmail || !recipientEmail.includes('@')) {
    throw new Error('Please enter a valid recipient email address.')
  }

  let templateId = 'booking_confirmation'
  switch (docType) {
    case 'quote':
      templateId = 'quote_document'
      break
    case 'invoice':
      templateId = 'invoice_document'
      break
    case 'receipt':
      templateId = 'receipt_document'
      break
    case 'agreement':
      templateId = 'rental_agreement'
      break
    case 'confirmation':
      templateId = 'booking_confirmation'
      break
    case 'packing_list':
      templateId = 'dispatch_manifest'
      break
    case 'return_report':
      templateId = 'return_receipt'
      break
  }

  return sendEmail({
    templateId,
    recipientEmail,
    entityType: 'booking',
    entityId: bookingId ?? bookingNo,
    language: 'en',
  })
}

/**
 * Copies formatted text summary to clipboard.
 */
export async function copyDocumentText(text: string): Promise<boolean> {
  if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text)
      return true
    } catch {
      // Fallback
    }
  }

  if (typeof document !== 'undefined') {
    try {
      const textarea = document.createElement('textarea')
      textarea.value = text
      textarea.style.position = 'fixed'
      textarea.style.opacity = '0'
      document.body.appendChild(textarea)
      textarea.select()
      const successful = document.execCommand('copy')
      document.body.removeChild(textarea)
      return successful
    } catch {
      return false
    }
  }

  return false
}

/**
 * Triggers A4 document printing.
 */
export function printDocumentBlob(blob: Blob, title?: string): void {
  openPdfForPrint(blob, title)
}
