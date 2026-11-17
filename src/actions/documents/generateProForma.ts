/**
 * src/actions/documents/generateProForma.ts — Babin Rentals OS
 *
 * T3-27: Pro forma invoice from the draft (B18, B55, Law 6, Law 7, Law 8).
 *
 * Requirements:
 * - Generates a Pro Forma PDF from an existing Draft invoice.
 * - Titled "PRO FORMA INVOICE — not a tax invoice".
 * - NO invoice number (names the booking number instead).
 * - Never calls `next_document_number()` (Law 7).
 * - Prints project name (T3-26), lines, estimated VAT, advance due, payment details, and "valid for 7 days".
 * - Never counts in sales or VAT registers (draft invoices stay Draft; pro forma lives in document_registry).
 * - Kept as a document record in document_registry so it can be shared (T3-16) and re-sent.
 * - Forbidden to money-blind roles (Warehouse, Technician, Driver, Client) under Law 6.
 */

import { createAction, type ActionContext, type ActionConfig } from '../core'
import { idempotentInsert, generateClientUuid } from '../../lib/dataAccess'
import { supabase } from '../../lib/supabase'
import { exportProFormaPdf } from '../../lib/pdf/exportPdf'
import { fetchInvoiceCompany } from '../../lib/queries/invoiceCompany'
import { fetchInvoiceLines } from '../../lib/queries/finance'
import { calculateAdvanceRequired } from '../../lib/pricingPipeline'
import { rupees, type Paisa } from '../../lib/money'
import { canViewMoney } from '../../lib/rbac'
import type { InvoicePdfData } from '../../lib/pdf/generatePdf'

export type GenerateProFormaInput = {
  bookingId: string
  invoiceId?: string | undefined
  clientUuid?: string | undefined
  download?: boolean | undefined
}

export type GenerateProFormaResult = {
  success: boolean
  documentId: string
  documentNo: string
  bookingNo: string
  fileUrl?: string | undefined
  signedUrl?: string | undefined
}

export const generateProFormaConfig: ActionConfig<GenerateProFormaInput, GenerateProFormaResult> = {
  name: 'GENERATE_PRO_FORMA',
  permissions: ['document.create'],
  implemented: true,

  validate: (input) => {
    if (!input.bookingId || !input.bookingId.trim()) {
      throw new Error('Booking ID is required to generate a pro forma invoice.')
    }
  },

  execute: async (input, ctx: ActionContext) => {
    // Law 6: strictly forbidden to money-blind roles
    if (!canViewMoney(ctx.role)) {
      throw new Error('Only financial staff may generate a pro forma invoice (Law 6 money-blindness).')
    }

    const bRef = input.bookingId.trim()

    // 1. Resolve booking row
    const { data: booking, error: bErr } = await supabase
      .from('bookings')
      .select('id, booking_no, client_id, project_name, shoot_location, deposit_required')
      .or(`id.eq.${bRef},booking_no.eq.${bRef}`)
      .maybeSingle()

    if (bErr || !booking) {
      throw new Error(`Booking ${bRef} was not found. Cannot generate pro forma.`)
    }

    // 2. Resolve client info
    let clientName = 'Client'
    let clientPhone: string | null = null
    let clientEmail: string | null = null
    let clientPan: string | null = null

    if (booking.client_id) {
      const { data: cl } = await supabase
        .from('clients')
        .select('name, phone, email, pan_vat')
        .eq('id', booking.client_id)
        .maybeSingle()

      if (cl) {
        clientName = cl.name || clientName
        clientPhone = cl.phone || null
        clientEmail = cl.email || null
        clientPan = cl.pan_vat || null
      }
    }

    // 3. Resolve Draft invoice
    let draftInvoice: {
      id: string
      invoice_no: string | null
      status: string
      subtotal: number
      discount_amount: number
      discount_percent: number | null
      taxable_amount: number
      vat_rate: number
      vat_amount: number
      total_amount: number
      paid_amount: number
      outstanding_amount: number
      notes: string | null
      project_name: string | null
      issue_date: string | null
      due_date: string | null
    } | null = null

    if (input.invoiceId && input.invoiceId.trim()) {
      const { data: inv } = await supabase
        .from('invoices')
        .select('id, invoice_no, status, subtotal, discount_amount, discount_percent, taxable_amount, vat_rate, vat_amount, total_amount, paid_amount, outstanding_amount, notes, project_name, issue_date, due_date')
        .eq('id', input.invoiceId.trim())
        .maybeSingle()
      if (inv) draftInvoice = inv
    }

    if (!draftInvoice) {
      const { data: inv } = await supabase
        .from('invoices')
        .select('id, invoice_no, status, subtotal, discount_amount, discount_percent, taxable_amount, vat_rate, vat_amount, total_amount, paid_amount, outstanding_amount, notes, project_name, issue_date, due_date')
        .eq('booking_id', booking.id)
        .eq('status', 'Draft')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      if (inv) draftInvoice = inv
    }

    if (!draftInvoice) {
      throw new Error(
        `Booking ${booking.booking_no} has no draft invoice. Raise a draft invoice first before generating a pro forma.`,
      )
    }

    // 4. Resolve lines from invoice_lines or booking_lines
    const invLines = await fetchInvoiceLines(draftInvoice.id).catch(() => [])
    let lines = invLines.map((l) => ({
      description: l.description,
      quantity: l.quantity,
      rentalDays: l.days,
      ratePaisa: rupees(l.unitRate),
      totalPaisa: rupees(l.lineTotal),
    }))

    if (lines.length === 0) {
      const { data: bLines } = await supabase
        .from('booking_lines')
        .select('item_name, quantity, days, unit_price, line_total')
        .eq('booking_id', booking.id)

      if (bLines && bLines.length > 0) {
        lines = bLines.map((bl) => ({
          description: bl.item_name || 'Equipment',
          quantity: bl.quantity || 1,
          rentalDays: bl.days || 1,
          ratePaisa: rupees(bl.unit_price || 0),
          totalPaisa: rupees(bl.line_total || 0),
        }))
      }
    }

    if (lines.length === 0) {
      // Fallback line item from invoice total if lines table has no entries
      lines = [
        {
          description: `Rental equipment for ${booking.booking_no}`,
          quantity: 1,
          rentalDays: 1,
          ratePaisa: rupees(draftInvoice.subtotal),
          totalPaisa: rupees(draftInvoice.subtotal),
        },
      ]
    }

    // 5. Company info & Advance due
    const company = await fetchInvoiceCompany(booking.id).catch(() => ({
      name: 'Babin Rentals',
      panVat: '123456789',
    }))

    const advanceDue = calculateAdvanceRequired(draftInvoice.total_amount as Paisa)

    // 6. Generate Pro Forma PDF Data
    const pdfData: InvoicePdfData = {
      invoiceNo: null, // No invoice number (Law 7)
      documentTitle: 'PRO FORMA INVOICE — not a tax invoice',
      status: 'Pro Forma',
      issueDateAd: draftInvoice.issue_date || new Date().toISOString().slice(0, 10),
      dueDateAd: draftInvoice.due_date,
      bookingNo: booking.booking_no,
      project: draftInvoice.project_name || booking.project_name || null,
      client: {
        name: clientName,
        phone: clientPhone,
        email: clientEmail,
        panVat: clientPan,
      },
      company,
      lines,
      subtotalPaisa: draftInvoice.subtotal,
      discountPaisa: draftInvoice.discount_amount,
      discountPercent: draftInvoice.discount_percent,
      taxablePaisa: draftInvoice.taxable_amount,
      vatPercent: (draftInvoice.vat_rate ?? 0.13) * 100,
      vatPaisa: draftInvoice.vat_amount,
      totalPaisa: draftInvoice.total_amount,
      paidPaisa: draftInvoice.paid_amount || 0,
      outstandingPaisa: draftInvoice.outstanding_amount || draftInvoice.total_amount,
      advanceDuePaisa: advanceDue,
      notes: draftInvoice.notes,
      isProForma: true,
    }

    // 7. Format document number (does NOT touch next_document_number() - Law 7)
    const { count } = await supabase
      .from('document_registry')
      .select('*', { count: 'exact', head: true })
      .eq('booking_id', booking.id)
      .eq('document_type', 'Pro Forma')

    const seq = (count ?? 0) + 1
    const documentNo = seq === 1 ? `PF-${booking.booking_no}` : `PF-${booking.booking_no}-R${seq}`

    // 8. Generate and upload PDF
    const exportResult = await exportProFormaPdf(pdfData, {
      filename: `${documentNo}.pdf`,
      download: input.download ?? false,
    })

    // 9. Persist to document_registry and booking_documents
    const actionUuid = input.clientUuid || generateClientUuid()
    const docRow = {
      client_uuid: actionUuid,
      document_no: documentNo,
      document_type: 'Pro Forma',
      booking_id: booking.id,
      client_id: booking.client_id,
      lifecycle_status: 'Draft',
      file_url: exportResult.storagePath || `documents/${documentNo}.pdf`,
      file_size_bytes: exportResult.fileSizeBytes,
      generated_by: ctx.userId,
      created_by: ctx.userId,
    }

    const inserted = await idempotentInsert('document_registry' as never, docRow as never, {
      queueOnFailure: false,
      returningColumns: 'id',
    })
    const insertedId = (inserted as { id?: string })?.id || actionUuid

    await idempotentInsert('booking_documents' as never, {
      client_uuid: generateClientUuid(),
      booking_id: booking.id,
      document_id: insertedId,
      doc_type: 'Pro Forma',
      origin: 'Generated',
      created_by: ctx.userId,
    } as never)

    const result: GenerateProFormaResult = {
      success: true,
      documentId: insertedId,
      documentNo,
      bookingNo: booking.booking_no,
      fileUrl: exportResult.storagePath,
      signedUrl: exportResult.signedUrl,
    }

    const events = [
      {
        type: 'document.created',
        payload: {
          documentId: insertedId,
          documentNo,
          docType: 'Pro Forma',
          bookingId: booking.id,
          timestamp: new Date().toISOString(),
          userId: ctx.userId,
        },
      },
    ]

    return {
      result,
      events,
    }
  },
}

export const generateProForma = createAction<GenerateProFormaInput, GenerateProFormaResult>(generateProFormaConfig)
