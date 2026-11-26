/**
 * src/modules/rentals/modals/DocumentShareModal.tsx — Babin Rentals OS
 *
 * Universal 1-to-2 Tap Document Share Sheet (T3-16).
 *
 * Covers:
 *  - Quote, Invoice, Receipt, Agreement, Booking Confirmation (W20).
 *  - Channels:
 *      1. WhatsApp (Native sheet with attached PDF on mobile, or wa.me compose link with formatted text)
 *      2. Email (From no-reply@babinrentals.com via T5-03 transactional email)
 *      3. Print (A4 direct via openPdfForPrint / window.print)
 *      4. Copy Text (Structured summary to clipboard)
 *      5. One-Tap Booking Confirmation (W20: staff sends with 1 tap, email first, WhatsApp optional)
 *
 * Law 6 Compliance:
 *  - Strictly hides money figures from money-blind roles (Warehouse, Technician, Driver, Client).
 *  - Money-blind roles cannot view or share priced documents.
 *
 * Accessibility & Touch Targets:
 *  - All primary interactive elements ≥ 44px (W95).
 */

import { useState } from 'react'
import { Modal } from '../../../components/ui/Modal'
import { Button } from '../../../components/ui/Button'
import Icon from '../../../components/ui/Icon'
import { useToast } from '../../../components/ui/Toast'
import { formatBookingNo } from '../../../lib/format'
import { formatMoney } from '../../../lib/money'
import type { Paisa } from '../../../lib/money'
import { normalisePhone, openWaLink } from '../../../lib/whatsapp'
import { readSettings } from '../../../lib/settingsStore'
import {
  type DocumentShareType,
  canRoleShareDocument,
  buildWhatsAppShareLink,
  shareViaNative,
  sendDocumentEmail,
  copyDocumentText,
  printDocumentBlob,
} from '../../../lib/documentShare'
import {
  exportDocumentPdf,
  exportInvoicePdf,
  exportRentalAgreementPdf,
} from '../../../lib/pdf/exportPdf'
import type { SelectedRentalBookingFacts } from '../../../lib/rentalMoreActionsRegistry'
import type { SystemRole } from '../../../types/database'

export interface DocumentShareModalProps {
  isOpen: boolean
  onClose: () => void
  docType: DocumentShareType
  booking: SelectedRentalBookingFacts & {
    clientPhone?: string | null | undefined
    clientEmail?: string | null | undefined
  }
  userRole?: SystemRole | undefined
  clientPhone?: string | null | undefined
  clientEmail?: string | null | undefined
  documentNo?: string | null | undefined
  pdfBlob?: Blob | null | undefined
  onSuccess?: (channel: 'whatsapp' | 'email' | 'print' | 'copy' | 'confirmation_w20') => void
}

export function DocumentShareModal({
  isOpen,
  onClose,
  docType,
  booking,
  userRole = 'Coordinator',
  clientPhone,
  clientEmail,
  documentNo,
  pdfBlob,
  onSuccess,
}: DocumentShareModalProps) {
  const { showSuccessToast } = useToast()

  const activePhone = clientPhone ?? booking.clientPhone ?? null
  const initialEmail = clientEmail ?? booking.clientEmail ?? ''

  const [emailInput, setEmailInput] = useState(initialEmail)
  const [isSendingEmail, setIsSendingEmail] = useState(false)
  const [isPrinting, setIsPrinting] = useState(false)
  const [isSharingNative, setIsSharingNative] = useState(false)
  const [emailSentSuccess, setEmailSentSuccess] = useState(false)
  const [inlineError, setInlineError] = useState<string | null>(null)

  const settings = readSettings()
  const business = {
    businessName: String(settings.organisationName || 'Babin Rentals'),
    businessPhone: String(settings.businessPhone || '+977-1-4780000'),
  }

  // Law 6 check
  const perm = canRoleShareDocument(userRole, docType)
  const isAllowed = perm.allowed

  // Phone normalisation check
  const normalisedPhone = normalisePhone(activePhone)
  const hasValidPhone = Boolean(normalisedPhone)

  // Document labels
  const docTitleMap: Record<DocumentShareType, string> = {
    quote: 'Commercial Quotation',
    invoice: 'Tax Invoice',
    receipt: 'Payment Receipt',
    agreement: 'Equipment Rental Agreement',
    confirmation: 'Booking Confirmation',
    packing_list: 'Warehouse Packing List',
    return_report: 'Return Inspection Report',
  }
  const documentLabel = docTitleMap[docType] || 'Rental Document'
  const displayDocumentNo = documentNo || booking.quoteNo || booking.invoiceNo || formatBookingNo(booking.bookingNo)

  // Construct structured share facts
  const factsBundle = (() => {
    switch (docType) {
      case 'quote':
        return {
          kind: 'quote' as const,
          data: {
            clientName: booking.clientName || 'Client',
            bookingNo: booking.bookingNo,
            quoteNo: booking.quoteNo ?? null,
            startIso: booking.pickupDate || new Date().toISOString(),
            endIso: booking.returnDate || new Date().toISOString(),
            itemCount: booking.itemCount ?? 1,
            total: typeof booking.totalAmount === 'number' ? (booking.totalAmount as Paisa) : null,
          },
        }
      case 'invoice':
        return {
          kind: 'invoice' as const,
          data: {
            clientName: booking.clientName || 'Client',
            bookingNo: booking.bookingNo,
            invoiceNo: booking.invoiceNo || displayDocumentNo,
            total: (typeof booking.totalAmount === 'number' ? booking.totalAmount : 0) as Paisa,
            paid: typeof booking.paidAmount === 'number' ? (booking.paidAmount as Paisa) : null,
            balance: typeof booking.outstandingAmount === 'number' ? (booking.outstandingAmount as Paisa) : null,
          },
        }
      case 'receipt':
        return {
          kind: 'receipt' as const,
          data: {
            clientName: booking.clientName || 'Client',
            bookingNo: booking.bookingNo,
            receiptNo: displayDocumentNo,
            amount: (typeof booking.paidAmount === 'number' && booking.paidAmount > 0
              ? booking.paidAmount
              : booking.totalAmount ?? 0) as Paisa,
            method: 'Bank / Cash / QR',
            balance: (typeof booking.outstandingAmount === 'number' ? booking.outstandingAmount : 0) as Paisa,
          },
        }
      case 'agreement':
        return {
          kind: 'agreement' as const,
          data: {
            clientName: booking.clientName || 'Client',
            bookingNo: booking.bookingNo,
            agreementNo: displayDocumentNo,
            startIso: booking.pickupDate || new Date().toISOString(),
            endIso: booking.returnDate || new Date().toISOString(),
            itemCount: booking.itemCount ?? 1,
          },
        }
      case 'confirmation':
      default:
        return {
          kind: 'confirmation' as const,
          data: {
            clientName: booking.clientName || 'Client',
            bookingNo: booking.bookingNo,
            startIso: booking.pickupDate || new Date().toISOString(),
            endIso: booking.returnDate || new Date().toISOString(),
            lineCount: booking.itemCount ?? 1,
            topLines: [],
            total: (typeof booking.totalAmount === 'number' ? booking.totalAmount : 0) as Paisa,
            advance: typeof booking.paidAmount === 'number' ? (booking.paidAmount as Paisa) : null,
            deposit: typeof booking.depositRequired === 'number' ? (booking.depositRequired as Paisa) : null,
            pickupTime: String(settings.defaultPickupTime || '10:00 AM'),
          },
        }
    }
  })()

  const waShare = buildWhatsAppShareLink({
    docType,
    facts: factsBundle,
    business,
    phone: activePhone,
  })

  // Ensure PDF blob exists for native share / printing
  const resolvePdfBlob = async (): Promise<Blob> => {
    if (pdfBlob) return pdfBlob
    switch (docType) {
      case 'invoice': {
        const res = await exportInvoicePdf(
          {
            invoiceNo: displayDocumentNo,
            bookingNo: booking.bookingNo,
            client: {
              name: booking.clientName || 'Client',
            },
            issueDateAd: new Date().toISOString(),
            lines: [],
            subtotalPaisa: (booking.totalAmount ?? 0) as Paisa,
            taxablePaisa: (booking.totalAmount ?? 0) as Paisa,
            vatPaisa: 0 as Paisa,
            totalPaisa: (booking.totalAmount ?? 0) as Paisa,
            paidPaisa: (booking.paidAmount ?? 0) as Paisa,
            outstandingPaisa: (booking.outstandingAmount ?? 0) as Paisa,
          },
          { uploadToStorage: false },
        )
        return res.blob
      }
      case 'agreement': {
        const res = await exportRentalAgreementPdf(
          {
            agreementNo: displayDocumentNo,
            bookingNo: booking.bookingNo,
            client: {
              name: booking.clientName || 'Client',
            },
            rentalStartAd: booking.pickupDate ?? null,
            rentalEndAd: booking.returnDate ?? null,
            equipment: [],
            issueDateAd: new Date().toISOString(),
          },
          { uploadToStorage: false },
        )
        return res.blob
      }
      case 'quote':
      default: {
        const res = await exportDocumentPdf(
          {
            documentNo: displayDocumentNo,
            title: `${documentLabel} · ${formatBookingNo(booking.bookingNo)}`,
            docType: 'Contract',
            clientName: booking.clientName || 'Client',
            bookingNo: booking.bookingNo,
            dateAd: new Date().toISOString(),
          },
          { uploadToStorage: false },
        )
        return res.blob
      }
    }
  }

  // 1. WhatsApp share handler
  const handleWhatsAppShare = async () => {
    if (!hasValidPhone || !waShare.url) return

    setIsSharingNative(true)
    try {
      // On mobile devices supporting file share, try native share sheet first
      if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
        try {
          const blob = await resolvePdfBlob()
          const nativeRes = await shareViaNative({
            title: `${documentLabel} · ${booking.bookingNo}`,
            text: waShare.text,
            blob,
            filename: `${displayDocumentNo}.pdf`,
          })
          if (nativeRes.shared) {
            showSuccessToast('Shared Successfully', 'Shared document via native sheet.')
            onSuccess?.('whatsapp')
            return
          }
        } catch {
          // Native share rejected or unsupported, fallback to wa.me link
        }
      }

      // Fallback: Open direct wa.me link
      const opened = openWaLink(waShare.url)
      if (opened) {
        showSuccessToast('WhatsApp Opened', 'Prepared message in WhatsApp.')
        setInlineError(null)
        onSuccess?.('whatsapp')
      } else {
        setInlineError('Popup blocked by browser. Please allow popups to open WhatsApp.')
      }
    } finally {
      setIsSharingNative(false)
    }
  }

  // 2. Email dispatch handler
  const handleSendEmail = async () => {
    if (!emailInput || !emailInput.includes('@')) {
      setInlineError('Please enter a valid recipient email address.')
      return
    }

    setIsSendingEmail(true)
    setInlineError(null)
    try {
      await sendDocumentEmail({
        docType,
        recipientEmail: emailInput.trim(),
        recipientName: booking.clientName || 'Valued Client',
        bookingId: booking.id,
        bookingNo: booking.bookingNo,
      })

      setEmailSentSuccess(true)
      showSuccessToast('Email Dispatched', `Document sent from no-reply@babinrentals.com to ${emailInput}.`)
      onSuccess?.('email')
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      setInlineError(msg)
    } finally {
      setIsSendingEmail(false)
    }
  }

  // 3. Print handler (A4)
  const handlePrint = async () => {
    setIsPrinting(true)
    setInlineError(null)
    try {
      const blob = await resolvePdfBlob()
      printDocumentBlob(blob, displayDocumentNo)
      showSuccessToast('Document Ready', 'Sent document to printer dialog.')
      onSuccess?.('print')
    } catch {
      window.print()
    } finally {
      setIsPrinting(false)
    }
  }

  // 4. Copy text handler
  const handleCopyText = async () => {
    const success = await copyDocumentText(waShare.text)
    if (success) {
      setInlineError(null)
      showSuccessToast('Text Copied', 'Document summary copied to clipboard.')
      onSuccess?.('copy')
    } else {
      setInlineError('Unable to copy text to clipboard on this device.')
    }
  }

  // 5. One-Tap Booking Confirmation (W20: Staff-sent, email first, WhatsApp optional)
  const handleOneTapConfirmation = async () => {
    // 1-Tap dispatches email immediately
    if (emailInput && emailInput.includes('@')) {
      setIsSendingEmail(true)
      try {
        await sendDocumentEmail({
          docType: 'confirmation',
          recipientEmail: emailInput.trim(),
          recipientName: booking.clientName || 'Valued Client',
          bookingId: booking.id,
          bookingNo: booking.bookingNo,
        })
        setEmailSentSuccess(true)
        showSuccessToast('Confirmation Dispatched', `Booking confirmation emailed to ${emailInput}.`)
      } catch {
        // Continue to offer WhatsApp
      } finally {
        setIsSendingEmail(false)
      }
    }

    // Then opens WhatsApp if phone exists
    if (hasValidPhone && waShare.url) {
      openWaLink(waShare.url)
    }

    onSuccess?.('confirmation_w20')
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      size="md"
      title={`Share ${documentLabel}`}
      subtitle={`Booking Ref: ${formatBookingNo(booking.bookingNo)}`}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {/* Law 6 Alert Banner if Restricted */}
        {!isAllowed && (
          <div
            data-testid="law6-restriction-banner"
            style={{
              padding: '12px 14px',
              borderRadius: 'var(--r-card, 8px)',
              background: 'color-mix(in srgb, var(--danger, #dc2626) 10%, var(--card))',
              border: '1px solid color-mix(in srgb, var(--danger, #dc2626) 35%, transparent)',
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              color: 'var(--danger, #dc2626)',
              fontSize: 'var(--t-meta, 13px)',
              fontWeight: 600,
            }}
          >
            <Icon name="alert_triangle" size={18} />
            <span>{perm.reason ?? 'Your role cannot view or share financial documents.'}</span>
          </div>
        )}

        {/* Document Overview Card */}
        <div
          style={{
            padding: 14,
            borderRadius: 'var(--r-card, 8px)',
            background: 'var(--card2, #f9fafb)',
            border: '1px solid var(--border, #e5e7eb)',
            display: 'flex',
            flexDirection: 'column',
            gap: 8,
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontWeight: 700, fontSize: 'var(--t-ui, 14px)', color: 'var(--text)' }}>
              {documentLabel}
            </span>
            <span style={{ fontSize: 'var(--t-caption, 11px)', color: 'var(--muted)', fontFamily: 'var(--font-mono)' }}>
              {displayDocumentNo}
            </span>
          </div>

          <div style={{ fontSize: 'var(--t-meta, 13px)', color: 'var(--text2)', lineHeight: 1.5 }}>
            <div>Client: <strong style={{ color: 'var(--text)' }}>{booking.clientName || 'Standard Client'}</strong></div>
            <div>Booking Ref: <strong>{formatBookingNo(booking.bookingNo)}</strong></div>
            {booking.pickupDate && booking.returnDate && (
              <div>Rental Period: {booking.pickupDate} → {booking.returnDate}</div>
            )}
            <div>Gear Items: {booking.itemCount ?? 1} item(s)</div>
          </div>

          {/* Law 6: Render financial figure only when allowed */}
          {isAllowed && typeof booking.totalAmount === 'number' && (
            <div
              style={{
                marginTop: 4,
                paddingTop: 8,
                borderTop: '1px solid var(--border, #e5e7eb)',
                display: 'flex',
                justifyContent: 'space-between',
                fontWeight: 700,
                fontSize: 'var(--t-ui, 14px)',
                color: 'var(--text)',
              }}
            >
              <span>{docType === 'invoice' ? 'Invoice Total:' : 'Estimated Total:'}</span>
              <span className="figure">{formatMoney(booking.totalAmount as Paisa)}</span>
            </div>
          )}
        </div>

        {/* Special One-Tap Booking Confirmation Banner (W20) */}
        {docType === 'confirmation' && isAllowed && (
          <div
            style={{
              padding: '12px 14px',
              borderRadius: 'var(--r-card, 8px)',
              background: 'color-mix(in srgb, var(--primary, #2563eb) 8%, var(--card))',
              border: '1px solid color-mix(in srgb, var(--primary, #2563eb) 25%, transparent)',
              display: 'flex',
              flexDirection: 'column',
              gap: 8,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 700, fontSize: 'var(--t-ui, 13px)', color: 'var(--primary, #2563eb)' }}>
              <Icon name="zap" size={16} />
              <span>One-Tap Staff Send</span>
            </div>
            <p style={{ margin: 0, fontSize: 'var(--t-meta, 12px)', color: 'var(--text2)', lineHeight: 1.4 }}>
              Dispatches confirmation via email first from <strong>no-reply@babinrentals.com</strong>, and prepares WhatsApp chat.
            </p>
            <Button
              variant="primary"
              icon="send"
              style={{ minHeight: 44, width: '100%', marginTop: 4 }}
              disabled={!isAllowed || isSendingEmail}
              onClick={handleOneTapConfirmation}
            >
              {isSendingEmail ? 'Sending Confirmation…' : 'Send Booking Confirmation (1 Tap)'}
            </Button>
          </div>
        )}

        {/* Recipient Details: Phone & Email */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {/* Phone Status */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <span style={{ fontSize: 'var(--t-caption, 12px)', fontWeight: 600, color: 'var(--text2)' }}>
              WhatsApp Phone Number:
            </span>
            {hasValidPhone ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 'var(--t-meta, 13px)', color: 'var(--text)' }}>
                <Icon name="phone" size={14} style={{ color: '#16a34a' }} />
                <span style={{ fontFamily: 'var(--font-mono)' }}>+{normalisedPhone}</span>
              </div>
            ) : (
              <div
                data-testid="no-phone-warning"
                style={{
                  fontSize: 'var(--t-meta, 12px)',
                  color: 'var(--warning-text, #b45309)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                }}
              >
                <Icon name="alert_triangle" size={14} />
                <span>{waShare.disabledReason || 'No valid phone on this client — add one on the client record first.'}</span>
              </div>
            )}
          </div>

          {/* Recipient Email Input */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <label
              htmlFor="recipient-email-input"
              style={{ fontSize: 'var(--t-caption, 12px)', fontWeight: 600, color: 'var(--text2)' }}
            >
              Recipient Email (Sent from no-reply@babinrentals.com):
            </label>
            <input
              id="recipient-email-input"
              type="email"
              value={emailInput}
              disabled={!isAllowed || isSendingEmail}
              onChange={(e) => setEmailInput(e.target.value)}
              placeholder="client@example.com"
              style={{
                minHeight: 44,
                padding: '8px 12px',
                borderRadius: 'var(--r-input, 6px)',
                border: '1px solid var(--border, #d1d5db)',
                background: 'var(--input-bg, #ffffff)',
                color: 'var(--text)',
                fontSize: 'var(--t-ui, 14px)',
              }}
            />
            {emailSentSuccess && (
              <span style={{ fontSize: 'var(--t-caption, 12px)', color: 'var(--success, #16a34a)', fontWeight: 600 }}>
                ✓ Email successfully dispatched
              </span>
            )}
          </div>
        </div>

        {/* Persistent Inline Error Banner (Law 12) */}
        {inlineError && (
          <div
            data-testid="document-share-inline-error"
            style={{
              padding: '10px 12px',
              borderRadius: 'var(--r-card, 6px)',
              background: 'color-mix(in srgb, var(--danger, #dc2626) 8%, var(--card))',
              border: '1px solid color-mix(in srgb, var(--danger, #dc2626) 30%, transparent)',
              color: 'var(--danger, #dc2626)',
              fontSize: 'var(--t-meta, 12px)',
              display: 'flex',
              alignItems: 'center',
              gap: 8,
            }}
          >
            <Icon name="alert_triangle" size={14} />
            <span>{inlineError}</span>
          </div>
        )}

        {/* 4 Share Action Verbs (Touch targets ≥ 44px) */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: 10,
            marginTop: 4,
          }}
        >
          {/* Channel 1: WhatsApp */}
          <Button
            variant="secondary"
            icon="message"
            style={{
              minHeight: 48,
              justifyContent: 'center',
              border: hasValidPhone ? '1px solid #16a34a' : undefined,
              color: hasValidPhone ? '#15803d' : undefined,
            }}
            disabled={!isAllowed || !hasValidPhone || isSharingNative}
            onClick={handleWhatsAppShare}
            title={!hasValidPhone ? waShare.disabledReason : 'Share via WhatsApp'}
          >
            {isSharingNative ? 'Preparing…' : 'WhatsApp'}
          </Button>

          {/* Channel 2: Email */}
          <Button
            variant="secondary"
            icon="mail"
            style={{ minHeight: 48, justifySelf: 'stretch', justifyContent: 'center' }}
            disabled={!isAllowed || !emailInput || isSendingEmail}
            onClick={handleSendEmail}
          >
            {isSendingEmail ? 'Sending…' : 'Send Email'}
          </Button>

          {/* Channel 3: Print (A4) */}
          <Button
            variant="secondary"
            icon="printer"
            style={{ minHeight: 48, justifySelf: 'stretch', justifyContent: 'center' }}
            disabled={!isAllowed || isPrinting}
            onClick={handlePrint}
          >
            {isPrinting ? 'Preparing…' : 'Print (A4)'}
          </Button>

          {/* Channel 4: Copy Text */}
          <Button
            variant="secondary"
            icon="copy"
            style={{ minHeight: 48, justifySelf: 'stretch', justifyContent: 'center' }}
            disabled={!isAllowed}
            onClick={handleCopyText}
          >
            Copy Text
          </Button>
        </div>

        {/* Footer */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', borderTop: '1px solid var(--border)', paddingTop: 12 }}>
          <Button variant="secondary" onClick={onClose} style={{ minHeight: 44 }}>
            Close
          </Button>
        </div>
      </div>
    </Modal>
  )
}
