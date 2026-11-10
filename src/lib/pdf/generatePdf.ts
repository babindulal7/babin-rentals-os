import { BarcodeFormat, QRCodeWriter } from '@zxing/library'
import { formatAd, formatAdDateTime } from '../bs'
import { isNonPackableLineType } from '../bookingLineTypes'
/**
 * # Pure-TypeScript PDF 1.4 Binary Generator
 *
 * Synthesizes standard, valid PDF 1.4 binary documents (A4 commercial invoices,
 * rental agreements, handover slips) with zero runtime dependencies.
 *
 * Complies with the PDF 1.4 specification:
 *  - Header with binary marker (%PDF-1.4)
 *  - Standard object catalog, pages, font dictionaries (Helvetica, Helvetica-Bold, Courier)
 *  - Content stream with text positioning, line drawing, and table styling
 *  - Exact 20-byte fixed-width cross-reference (xref) table
 *  - Trailer dictionary with Root, Info, and startxref pointer
 */

import { formatMoney, type Paisa } from '../money.ts'

export interface InvoicePdfLine {
  description: string
  serialNo?: string
  quantity: number
  rentalDays?: number
  ratePaisa?: Paisa | number
  totalPaisa: Paisa | number
}

export interface InvoicePdfCompany {
  name: string
  panVat?: string
  address?: string
  phone?: string
  email?: string
  description?: string
}

export interface InvoicePdfData {
  invoiceNo?: string | null
  documentTitle?: string
  status?: string
  issueDateAd?: string | null
  dueDateAd?: string | null
  bookingNo?: string | null
  project?: string | null
  client: {
    name: string
    phone?: string | null
    email?: string | null
    address?: string | null
    panVat?: string | null
  }
  company?: InvoicePdfCompany
  lines: InvoicePdfLine[]
  subtotalPaisa: Paisa | number
  discountPercent?: number | null
  discountPaisa?: Paisa | number | null
  taxablePaisa: Paisa | number
  vatPercent?: number | null
  vatPaisa: Paisa | number
  totalPaisa: Paisa | number
  paidPaisa?: Paisa | number | null
  outstandingPaisa?: Paisa | number | null
  notes?: string | null
  isProForma?: boolean
  advanceDuePaisa?: Paisa | number | null
  validityDays?: number
}

export interface DocumentPdfData {
  documentNo: string
  title: string
  docType: string
  clientName?: string | null
  bookingNo?: string | null
  project?: string | null
  dateAd?: string | null
  contentParagraphs?: string[]
  notes?: string | null
}

/**
 * Escapes characters for PDF literal string syntax: ( ... ).
 * Escapes `\`, `(`, `)` and maps non-ASCII characters to safe ASCII.
 */
function escapePdfText(text: string): string {
  if (!text) return ''
  return text
    .replace(/\\/g, '\\\\')
    .replace(/\(/g, '\\(')
    .replace(/\)/g, '\\)')
    .replace(/[\u2010-\u2015]/g, '-') // Normalize dashes
    .replace(/[\u2018\u2019]/g, "'") // Normalize smart single quotes
    .replace(/[\u201C\u201D]/g, '"') // Normalize smart double quotes
    .replace(/[^\x20-\x7E]/g, ' ') // Strip non-printable / non-ASCII for Type1 font safety
}

function formatPaisaOrZero(amount?: Paisa | number | null): string {
  if (amount === undefined || amount === null) return '—'
  return formatMoney(amount as Paisa)
}

/**
 * Low-level PDF builder that manages objects and generates compliant PDF bytes.
 */
class PdfDocumentBuilder {
  private objects: string[] = []
  private offsets: number[] = []

  addObject(content: string): number {
    this.objects.push(content.trim())
    return this.objects.length // 1-based object number
  }

  build(): Uint8Array {
    const encoder = new TextEncoder()
    // Standard PDF 1.4 binary header (with 4 binary comment bytes >= 128)
    const headerStr = '%PDF-1.4\n%\xE2\xE3\xCF\xD3\n'
    const headerBytes = encoder.encode(headerStr)

    const chunks: Uint8Array[] = [headerBytes]
    this.offsets = []
    let currentByteOffset = headerBytes.length

    for (let i = 0; i < this.objects.length; i++) {
      const objNum = i + 1
      this.offsets.push(currentByteOffset)
      const objStr = `${objNum} 0 obj\n${this.objects[i]}\nendobj\n`
      const objBytes = encoder.encode(objStr)
      chunks.push(objBytes)
      currentByteOffset += objBytes.length
    }

    const startxref = currentByteOffset
    const size = this.objects.length + 1

    let trailerStr = 'xref\n'
    trailerStr += `0 ${size}\n`
    trailerStr += '0000000000 65535 f \n'

    for (let i = 0; i < this.offsets.length; i++) {
      const offsetStr = String(this.offsets[i]).padStart(10, '0')
      trailerStr += `${offsetStr} 00000 n \n`
    }

    trailerStr += 'trailer\n'
    trailerStr += `<<\n  /Size ${size}\n  /Root 1 0 R\n  /Info ${this.objects.length} 0 R\n>>\n`
    trailerStr += 'startxref\n'
    trailerStr += `${startxref}\n`
    trailerStr += '%%EOF\n'

    chunks.push(encoder.encode(trailerStr))

    const totalLength = chunks.reduce((sum, c) => sum + c.length, 0)
    const result = new Uint8Array(totalLength)
    let offset = 0
    for (const c of chunks) {
      result.set(c, offset)
      offset += c.length
    }
    return result
  }
}

function buildPagedPdf(
  builder: PdfDocumentBuilder,
  contentStreams: readonly string[],
  info: string,
): Uint8Array {
  const pageCount = contentStreams.length
  const firstPageObject = 3
  const firstContentObject = firstPageObject + pageCount
  const firstFontObject = firstContentObject + pageCount
  const pageReferences = Array.from({ length: pageCount }, (_, index) => `${firstPageObject + index} 0 R`).join(' ')

  builder.addObject(`<<\n  /Type /Catalog\n  /Pages 2 0 R\n>>`)
  builder.addObject(`<<\n  /Type /Pages\n  /Kids [${pageReferences}]\n  /Count ${pageCount}\n>>`)

  for (let index = 0; index < pageCount; index += 1) {
    builder.addObject(
      `<<\n  /Type /Page\n  /Parent 2 0 R\n  /MediaBox [0 0 595.28 841.89]\n  /Contents ${firstContentObject + index} 0 R\n  /Resources <<\n    /Font <<\n      /F1 ${firstFontObject} 0 R\n      /F2 ${firstFontObject + 1} 0 R\n      /F3 ${firstFontObject + 2} 0 R\n    >>\n  >>\n>>`,
    )
  }

  for (const contentStream of contentStreams) {
    const byteLength = new TextEncoder().encode(contentStream).length
    builder.addObject(`<<\n  /Length ${byteLength}\n>>\nstream\n${contentStream}\nendstream`)
  }

  builder.addObject(`<<\n  /Type /Font\n  /Subtype /Type1\n  /BaseFont /Helvetica\n  /Encoding /WinAnsiEncoding\n>>`)
  builder.addObject(`<<\n  /Type /Font\n  /Subtype /Type1\n  /BaseFont /Helvetica-Bold\n  /Encoding /WinAnsiEncoding\n>>`)
  builder.addObject(`<<\n  /Type /Font\n  /Subtype /Type1\n  /BaseFont /Courier\n  /Encoding /WinAnsiEncoding\n>>`)
  builder.addObject(info)
  return builder.build()
}

function qrCodeOperations(value: string, x: number, y: number, size: number): string[] {
  const matrix = new QRCodeWriter().encode(value, BarcodeFormat.QR_CODE, 33, 33, new Map())
  const moduleSize = size / matrix.getWidth()
  const operations = [`% QR booking route: ${value}`, '0 0 0 rg']

  for (let row = 0; row < matrix.getHeight(); row += 1) {
    for (let column = 0; column < matrix.getWidth(); column += 1) {
      if (!matrix.get(column, row)) continue
      const moduleX = x + column * moduleSize
      const moduleY = y + (matrix.getHeight() - row - 1) * moduleSize
      operations.push(`${moduleX.toFixed(2)} ${moduleY.toFixed(2)} ${moduleSize.toFixed(2)} ${moduleSize.toFixed(2)} re f`)
    }
  }

  return operations
}

/**
 * Generates an A4 commercial invoice PDF as standard binary bytes.
 */
export function generateInvoicePdf(data: InvoicePdfData): Uint8Array {
  const builder = new PdfDocumentBuilder()

  // Colors
  const darkSlate = '0.09 0.13 0.24' // #17213c
  const mutedText = '0.38 0.44 0.52' // #617084
  const borderGray = '0.80 0.84 0.88' // #ccd6e0
  const bgLight = '0.96 0.97 0.98' // #f5f7fa

  const isProForma = Boolean(
    data.isProForma ||
    (data.documentTitle && data.documentTitle.toLowerCase().includes('pro forma')) ||
    (data.status && data.status.toLowerCase().includes('pro forma'))
  )

  const docTitle = isProForma
    ? (data.documentTitle || 'PRO FORMA INVOICE — not a tax invoice')
    : (data.documentTitle || (data.status === 'Draft' ? 'DRAFT INVOICE' : 'TAX INVOICE'))
  const invNo = isProForma
    ? (data.bookingNo && data.bookingNo !== '—' ? `BOOKING: ${data.bookingNo}` : 'PRO FORMA')
    : (data.invoiceNo || 'DRAFT (NO NUMBER)')
  const bookingNo = data.bookingNo || '—'
  const issueDate = formatAd(data.issueDateAd ? new Date(data.issueDateAd) : new Date())
  const dueDate = isProForma
    ? 'Valid for 7 days'
    : (data.dueDateAd ? formatAd(new Date(data.dueDateAd)) : 'Due on Receipt')

  const companyName = data.company?.name.trim()
  if (!companyName) throw new Error('Save the organisation name in Settings before exporting an invoice.')
  const companyVat = data.company?.panVat?.trim()
  if ((Number(data.vatPaisa) > 0 || companyVat) && !/^\d{9}$/.test(companyVat ?? '')) {
    throw new Error('Save a valid nine-digit VAT/PAN in Settings before exporting this invoice.')
  }
  const companyContact = [
    companyVat ? `PAN/VAT: ${companyVat}` : '',
    data.company?.address?.trim(),
    data.company?.phone?.trim(),
  ].filter(Boolean).join(' · ')
  const companyDescription = [data.company?.description?.trim(), data.company?.email?.trim()].filter(Boolean).join(' · ')
  const firstPageLineCount = Math.min(data.lines.length, 11)
  const continuationPageSize = 25
  const continuationPageCount = Math.ceil(Math.max(0, data.lines.length - firstPageLineCount) / continuationPageSize)
  const invoicePageCount = 1 + continuationPageCount

  const streamOps: string[] = []

  // Top header accent band
  streamOps.push(`${darkSlate} rg`)
  streamOps.push(`40 802 515 6 re f`)

  // Company Name & Info
  streamOps.push(`BT /F2 16 Tf 40 776 Td (${escapePdfText(companyName)}) Tj ET`)
  streamOps.push(`${mutedText} rg`)
  if (companyContact) streamOps.push(`BT /F1 9 Tf 40 762 Td (${escapePdfText(companyContact)}) Tj ET`)
  if (companyDescription) streamOps.push(`BT /F1 9 Tf 40 750 Td (${escapePdfText(companyDescription)}) Tj ET`)

  // Document Title (Top Right)
  streamOps.push(`${darkSlate} rg`)
  if (isProForma) {
    streamOps.push(`BT /F2 12.5 Tf 270 776 Td (${escapePdfText(docTitle)}) Tj ET`)
    streamOps.push(`${mutedText} rg`)
    streamOps.push(`BT /F3 10 Tf 270 760 Td (${escapePdfText(invNo)}) Tj ET`)
    streamOps.push(`BT /F2 8.5 Tf 270 746 Td (STATUS: PRO FORMA) Tj ET`)
  } else {
    streamOps.push(`BT /F2 18 Tf 380 776 Td (${escapePdfText(docTitle)}) Tj ET`)
    streamOps.push(`${mutedText} rg`)
    streamOps.push(`BT /F3 11 Tf 380 760 Td (${escapePdfText(invNo)}) Tj ET`)
    if (data.status) {
      const statusText = `STATUS: ${data.status.toUpperCase()}`
      streamOps.push(`BT /F2 9 Tf 380 746 Td (${escapePdfText(statusText)}) Tj ET`)
    }
  }
  streamOps.push(`BT /F2 8 Tf 380 732 Td (${escapePdfText(`Page 1 of ${invoicePageCount}`)}) Tj ET`)

  // Header Divider
  streamOps.push(`${borderGray} RG 0.75 w`)
  streamOps.push(`40 735 m 555 735 l S`)

  // Bill To & Invoice Info Blocks (y: 720 to 650)
  streamOps.push(`${bgLight} rg`)
  streamOps.push(`40 655 245 70 re f`)
  streamOps.push(`310 655 245 70 re f`)
  streamOps.push(`${borderGray} RG 0.5 w`)
  streamOps.push(`40 655 245 70 re S`)
  streamOps.push(`310 655 245 70 re S`)

  // Bill To content
  streamOps.push(`${darkSlate} rg`)
  streamOps.push(`BT /F2 9 Tf 50 710 Td (BILLED TO:) Tj ET`)
  streamOps.push(`BT /F2 10 Tf 50 696 Td (${escapePdfText(data.client.name)}) Tj ET`)
  streamOps.push(`${mutedText} rg`)
  if (data.client.phone) {
    streamOps.push(`BT /F1 8.5 Tf 50 684 Td (Phone: ${escapePdfText(data.client.phone)}) Tj ET`)
  }
  if (data.client.email) {
    streamOps.push(`BT /F1 8.5 Tf 50 673 Td (Email: ${escapePdfText(data.client.email)}) Tj ET`)
  }
  if (data.client.panVat) {
    streamOps.push(`BT /F1 8.5 Tf 50 662 Td (PAN/VAT: ${escapePdfText(data.client.panVat)}) Tj ET`)
  }

  // Invoice Details content
  streamOps.push(`${darkSlate} rg`)
  streamOps.push(`BT /F2 9 Tf 320 710 Td (RENTAL REFERENCE:) Tj ET`)
  streamOps.push(`${mutedText} rg`)
  streamOps.push(`BT /F1 9 Tf 320 696 Td (Booking Reference: ) Tj /F3 9 Tf (${escapePdfText(bookingNo)}) Tj ET`)
  if (isProForma) {
    if (data.project) {
      streamOps.push(`BT /F1 9 Tf 320 682 Td (Project: ) Tj /F2 9 Tf (${escapePdfText(data.project)}) Tj ET`)
      streamOps.push(`BT /F1 9 Tf 320 668 Td (Issue Date: ${escapePdfText(issueDate)}) Tj ET`)
      streamOps.push(`BT /F2 9 Tf 320 654 Td (Validity: Valid for 7 days) Tj ET`)
    } else {
      streamOps.push(`BT /F1 9 Tf 320 682 Td (Issue Date: ${escapePdfText(issueDate)}) Tj ET`)
      streamOps.push(`BT /F2 9 Tf 320 668 Td (Validity: Valid for 7 days) Tj ET`)
    }
  } else if (data.project) {
    streamOps.push(`BT /F1 9 Tf 320 682 Td (Project: ) Tj /F2 9 Tf (${escapePdfText(data.project)}) Tj ET`)
    streamOps.push(`BT /F1 9 Tf 320 668 Td (Issue Date: ${escapePdfText(issueDate)}) Tj ET`)
    streamOps.push(`BT /F1 9 Tf 320 654 Td (Due Date: ${escapePdfText(dueDate)}) Tj ET`)
  } else {
    streamOps.push(`BT /F1 9 Tf 320 682 Td (Issue Date: ${escapePdfText(issueDate)}) Tj ET`)
    streamOps.push(`BT /F1 9 Tf 320 668 Td (Due Date: ${escapePdfText(dueDate)}) Tj ET`)
  }

  // Items Table Header
  const tableTopY = 635
  streamOps.push(`${darkSlate} rg`)
  streamOps.push(`40 ${tableTopY - 18} 515 20 re f`)
  streamOps.push(`1 1 1 rg`) // White text
  streamOps.push(`BT /F2 8.5 Tf 48 ${tableTopY - 13} Td (#) Tj ET`)
  streamOps.push(`BT /F2 8.5 Tf 75 ${tableTopY - 13} Td (DESCRIPTION / ASSET) Tj ET`)
  streamOps.push(`BT /F2 8.5 Tf 290 ${tableTopY - 13} Td (QTY) Tj ET`)
  streamOps.push(`BT /F2 8.5 Tf 340 ${tableTopY - 13} Td (DAYS) Tj ET`)
  streamOps.push(`BT /F2 8.5 Tf 395 ${tableTopY - 13} Td (RATE) Tj ET`)
  streamOps.push(`BT /F2 8.5 Tf 475 ${tableTopY - 13} Td (TOTAL (NPR)) Tj ET`)

  // Line items
  let curY = tableTopY - 20
  const maxRows = firstPageLineCount

  for (let i = 0; i < maxRows; i++) {
    const line = data.lines[i]
    if (!line) continue
    curY -= 22
    const rowBg = i % 2 === 1 ? bgLight : '1 1 1'
    streamOps.push(`${rowBg} rg`)
    streamOps.push(`40 ${curY} 515 22 re f`)
    streamOps.push(`${borderGray} RG 0.5 w`)
    streamOps.push(`40 ${curY} 515 22 re S`)

    streamOps.push(`${darkSlate} rg`)
    streamOps.push(`BT /F1 8.5 Tf 48 ${curY + 7} Td (${i + 1}) Tj ET`)

    const itemDesc = line.description.length > 35 ? line.description.slice(0, 32) + '…' : line.description
    streamOps.push(`BT /F2 8.5 Tf 75 ${curY + 11} Td (${escapePdfText(itemDesc)}) Tj ET`)
    if (line.serialNo) {
      streamOps.push(`${mutedText} rg`)
      streamOps.push(`BT /F3 7 Tf 75 ${curY + 2} Td (S/N: ${escapePdfText(line.serialNo)}) Tj ET`)
      streamOps.push(`${darkSlate} rg`)
    }

    streamOps.push(`BT /F1 8.5 Tf 295 ${curY + 7} Td (${line.quantity}) Tj ET`)
    streamOps.push(`BT /F1 8.5 Tf 345 ${curY + 7} Td (${line.rentalDays ?? 1}) Tj ET`)
    streamOps.push(`BT /F1 8.5 Tf 395 ${curY + 7} Td (${escapePdfText(formatPaisaOrZero(line.ratePaisa))}) Tj ET`)
    streamOps.push(`BT /F2 8.5 Tf 475 ${curY + 7} Td (${escapePdfText(formatPaisaOrZero(line.totalPaisa))}) Tj ET`)
  }

  // Financial summary block
  const hasAdvance = isProForma && data.advanceDuePaisa !== undefined && data.advanceDuePaisa !== null
  const summaryBoxHeight = hasAdvance ? 122 : 110
  const summaryBoxY = curY - 10
  const sumLeft = 320
  const sumWidth = 235

  streamOps.push(`${bgLight} rg`)
  streamOps.push(`${sumLeft} ${summaryBoxY - summaryBoxHeight} ${sumWidth} ${summaryBoxHeight} re f`)
  streamOps.push(`${borderGray} RG 0.5 w`)
  streamOps.push(`${sumLeft} ${summaryBoxY - summaryBoxHeight} ${sumWidth} ${summaryBoxHeight} re S`)

  const addSummaryRow = (label: string, value: string, yOffset: number, bold = false) => {
    streamOps.push(bold ? `${darkSlate} rg` : `${mutedText} rg`)
    streamOps.push(`BT /${bold ? 'F2' : 'F1'} 8.5 Tf ${sumLeft + 12} ${summaryBoxY - yOffset} Td (${escapePdfText(label)}) Tj ET`)
    streamOps.push(bold ? `${darkSlate} rg` : `${mutedText} rg`)
    streamOps.push(`BT /${bold ? 'F2' : 'F1'} 8.5 Tf ${sumLeft + 140} ${summaryBoxY - yOffset} Td (${escapePdfText(value)}) Tj ET`)
  }

  addSummaryRow('Subtotal:', formatPaisaOrZero(data.subtotalPaisa), 16)
  if (data.discountPaisa && Number(data.discountPaisa) > 0) {
    const discLabel = data.discountPercent ? `Discount (${data.discountPercent}%):` : 'Discount:'
    addSummaryRow(discLabel, `-${formatPaisaOrZero(data.discountPaisa)}`, 28)
  }
  addSummaryRow('Taxable Amount:', formatPaisaOrZero(data.taxablePaisa), 40)
  const vatLabel = isProForma
    ? (data.vatPercent !== undefined && data.vatPercent !== null ? `Estimated VAT (${data.vatPercent}%):` : 'Estimated VAT (13%):')
    : (data.vatPercent !== undefined && data.vatPercent !== null ? `VAT (${data.vatPercent}%):` : 'VAT (13%):')
  addSummaryRow(vatLabel, formatPaisaOrZero(data.vatPaisa), 52)

  // Grand Total highlight bar
  const totalBarY = hasAdvance ? 76 : 88
  streamOps.push(`${darkSlate} rg`)
  streamOps.push(`${sumLeft} ${summaryBoxY - totalBarY} ${sumWidth} 22 re f`)
  streamOps.push(`1 1 1 rg`)
  streamOps.push(`BT /F2 9.5 Tf ${sumLeft + 12} ${summaryBoxY - totalBarY + 6} Td (TOTAL AMOUNT:) Tj ET`)
  streamOps.push(`BT /F2 9.5 Tf ${sumLeft + 135} ${summaryBoxY - totalBarY + 6} Td (${escapePdfText(formatPaisaOrZero(data.totalPaisa))}) Tj ET`)

  if (hasAdvance) {
    addSummaryRow('Advance Due:', formatPaisaOrZero(data.advanceDuePaisa), 90, true)
    addSummaryRow('Paid Amount:', formatPaisaOrZero(data.paidPaisa || 0), 102)
    addSummaryRow('Estimated Balance:', formatPaisaOrZero(data.outstandingPaisa ?? data.totalPaisa), 114, true)
  } else {
    addSummaryRow('Paid Amount:', formatPaisaOrZero(data.paidPaisa || 0), 98)
    addSummaryRow('Outstanding Balance:', formatPaisaOrZero(data.outstandingPaisa ?? data.totalPaisa), 108, true)
  }

  // Notes and payment details (left of summary box)
  if (isProForma) {
    streamOps.push(`${darkSlate} rg`)
    streamOps.push(`BT /F2 8.5 Tf 40 ${summaryBoxY - 16} Td (PRO FORMA ESTIMATE & PAYMENT:) Tj ET`)
    streamOps.push(`${mutedText} rg`)
    streamOps.push(`BT /F1 8 Tf 40 ${summaryBoxY - 28} Td (This pro forma is not a tax invoice. Valid for 7 days.) Tj ET`)
    streamOps.push(`BT /F1 8 Tf 40 ${summaryBoxY - 40} Td (Payment details: Bank transfer, Fonepay, eSewa or Cash at desk.) Tj ET`)
    if (data.notes) {
      const cleanNotes = escapePdfText(data.notes).slice(0, 100)
      streamOps.push(`BT /F1 8 Tf 40 ${summaryBoxY - 54} Td (Notes: ${cleanNotes}) Tj ET`)
    }
  } else if (data.notes) {
    streamOps.push(`${darkSlate} rg`)
    streamOps.push(`BT /F2 8.5 Tf 40 ${summaryBoxY - 18} Td (NOTES & REMARKS:) Tj ET`)
    streamOps.push(`${mutedText} rg`)
    const cleanNotes = escapePdfText(data.notes).slice(0, 120)
    streamOps.push(`BT /F1 8 Tf 40 ${summaryBoxY - 32} Td (${cleanNotes}) Tj ET`)
  }

  // Legal and banking footer
  const footerY = 90
  streamOps.push(`${borderGray} RG 0.5 w`)
  streamOps.push(`40 ${footerY} 515 0.5 re S`)

  // Signature lines
  streamOps.push(`${mutedText} rg`)
  streamOps.push(`40 ${footerY - 35} 150 0.5 re S`)
  streamOps.push(`BT /F1 8 Tf 40 ${footerY - 45} Td (Prepared By / Warehouse Staff) Tj ET`)

  streamOps.push(`405 ${footerY - 35} 150 0.5 re S`)
  streamOps.push(`BT /F1 8 Tf 405 ${footerY - 45} Td (Client / Authorized Signatory) Tj ET`)

  streamOps.push(`BT /F1 7.5 Tf 40 25 Td (${escapePdfText(
    isProForma
      ? `PRO FORMA INVOICE · NOT A TAX INVOICE · VALID FOR 7 DAYS · ${companyName}`
      : `Thank you for choosing ${companyName}. Generated by Babin Rentals OS.`
  )}) Tj ET`)

  const continuationStreams = Array.from({ length: continuationPageCount }, (_, continuationIndex) => {
    const pageNumber = continuationIndex + 2
    const startIndex = firstPageLineCount + continuationIndex * continuationPageSize
    const pageLines = data.lines.slice(startIndex, startIndex + continuationPageSize)
    const ops = [
      `${darkSlate} rg`,
      '40 802 515 6 re f',
      `BT /F2 16 Tf 40 776 Td (${escapePdfText(companyName)}) Tj ET`,
      `BT /F2 16 Tf 380 776 Td (${escapePdfText(docTitle)}) Tj ET`,
      `${mutedText} rg`,
      `BT /F3 10 Tf 380 760 Td (${escapePdfText(invNo)}) Tj ET`,
      `BT /F2 8 Tf 380 744 Td (${escapePdfText(`Page ${pageNumber} of ${invoicePageCount}`)}) Tj ET`,
      `BT /F1 9 Tf 40 744 Td (Booking: ${escapePdfText(bookingNo)}) Tj ET`,
      `${darkSlate} rg`,
      '40 710 515 20 re f',
      '1 1 1 rg',
      'BT /F2 8.5 Tf 48 715 Td (#) Tj ET',
      'BT /F2 8.5 Tf 75 715 Td (DESCRIPTION / ASSET) Tj ET',
      'BT /F2 8.5 Tf 290 715 Td (QTY) Tj ET',
      'BT /F2 8.5 Tf 340 715 Td (DAYS) Tj ET',
      'BT /F2 8.5 Tf 395 715 Td (RATE) Tj ET',
      'BT /F2 8.5 Tf 475 715 Td (TOTAL \\(NPR\\)) Tj ET',
    ]
    let pageY = 708
    pageLines.forEach((line, localIndex) => {
      const absoluteIndex = startIndex + localIndex
      pageY -= 24
      ops.push(`${absoluteIndex % 2 === 1 ? bgLight : '1 1 1'} rg`, `40 ${pageY} 515 24 re f`, `${borderGray} RG 0.5 w`, `40 ${pageY} 515 24 re S`)
      ops.push(`${darkSlate} rg`, `BT /F1 8.5 Tf 48 ${pageY + 8} Td (${absoluteIndex + 1}) Tj ET`)
      const description = line.description.length > 35 ? `${line.description.slice(0, 32)}...` : line.description
      ops.push(`BT /F2 8.5 Tf 75 ${pageY + 12} Td (${escapePdfText(description)}) Tj ET`)
      if (line.serialNo) ops.push(`${mutedText} rg`, `BT /F3 7 Tf 75 ${pageY + 3} Td (S/N: ${escapePdfText(line.serialNo)}) Tj ET`)
      ops.push(`${darkSlate} rg`, `BT /F1 8.5 Tf 295 ${pageY + 8} Td (${line.quantity}) Tj ET`)
      ops.push(`BT /F1 8.5 Tf 345 ${pageY + 8} Td (${line.rentalDays ?? 1}) Tj ET`)
      ops.push(`BT /F1 8.5 Tf 395 ${pageY + 8} Td (${escapePdfText(formatPaisaOrZero(line.ratePaisa))}) Tj ET`)
      ops.push(`BT /F2 8.5 Tf 475 ${pageY + 8} Td (${escapePdfText(formatPaisaOrZero(line.totalPaisa))}) Tj ET`)
    })
    ops.push(`${mutedText} rg`, `BT /F1 7.5 Tf 40 25 Td (${escapePdfText(`Invoice ${invNo} - Booking ${bookingNo} - Page ${pageNumber} of ${invoicePageCount}`)}) Tj ET`)
    return ops.join('\n')
  })

  return buildPagedPdf(
    builder,
    [streamOps.join('\n'), ...continuationStreams],
    `<<\n  /Title (${escapePdfText(docTitle)} - ${escapePdfText(invNo)})\n  /Author (${escapePdfText(companyName)})\n  /Creator (Babin Rentals OS PDF Engine)\n  /CreationDate (D:${new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14)}Z)\n>>`,
  )
}

/**
 * Generates an A4 operational or commercial document PDF.
 */
export function generateDocumentPdf(data: DocumentPdfData): Uint8Array {
  const builder = new PdfDocumentBuilder()

  const darkSlate = '0.09 0.13 0.24'
  const mutedText = '0.38 0.44 0.52'
  const borderGray = '0.80 0.84 0.88'

  const streamOps: string[] = []

  // Top header accent
  streamOps.push(`${darkSlate} rg`)
  streamOps.push(`40 802 515 6 re f`)

  // Header Title & Doc No
  streamOps.push(`BT /F2 16 Tf 40 776 Td (BABIN RENTALS KATHMANDU) Tj ET`)
  streamOps.push(`${mutedText} rg`)
  streamOps.push(`BT /F1 9 Tf 40 762 Td (Document Registry · Commercial & Operations) Tj ET`)

  streamOps.push(`${darkSlate} rg`)
  streamOps.push(`BT /F2 16 Tf 380 776 Td (${escapePdfText(data.docType.toUpperCase())}) Tj ET`)
  streamOps.push(`${mutedText} rg`)
  streamOps.push(`BT /F3 11 Tf 380 760 Td (${escapePdfText(data.documentNo)}) Tj ET`)

  // Divider
  streamOps.push(`${borderGray} RG 0.75 w`)
  streamOps.push(`40 740 m 555 740 l S`)

  // Title
  streamOps.push(`${darkSlate} rg`)
  streamOps.push(`BT /F2 14 Tf 40 710 Td (${escapePdfText(data.title)}) Tj ET`)

  // Metadata line
  streamOps.push(`${mutedText} rg`)
  const metaLine = `Client: ${data.clientName || 'General'} | Booking: ${data.bookingNo || '—'}${data.project ? ` | Project: ${data.project}` : ''} | Date: ${formatAd(data.dateAd ? new Date(data.dateAd) : new Date())}`
  streamOps.push(`BT /F1 9 Tf 40 690 Td (${escapePdfText(metaLine)}) Tj ET`)

  // Content Paragraphs
  let curY = 660
  const paragraphs = data.contentParagraphs || [
    'This document certifies the registration and execution of the specified commercial and operational terms.',
    'Equipment listed under this agreement remains the sole property of Babin Rentals Kathmandu.',
    'All parties agree to the standard terms of rental, maintenance, and insurance.',
  ]

  for (const para of paragraphs) {
    streamOps.push(`${darkSlate} rg`)
    streamOps.push(`BT /F1 9.5 Tf 40 ${curY} Td (${escapePdfText(para)}) Tj ET`)
    curY -= 28
  }

  // Footer & Signatures
  const footerY = 120
  streamOps.push(`${borderGray} RG 0.5 w`)
  streamOps.push(`40 ${footerY} 515 0.5 re S`)

  streamOps.push(`40 ${footerY - 35} 150 0.5 re S`)
  streamOps.push(`BT /F1 8 Tf 40 ${footerY - 45} Td (Authorized Signatory) Tj ET`)

  streamOps.push(`405 ${footerY - 35} 150 0.5 re S`)
  streamOps.push(`BT /F1 8 Tf 405 ${footerY - 45} Td (Client Representative) Tj ET`)

  streamOps.push(`BT /F1 7.5 Tf 175 25 Td (Official record produced by Babin Rentals OS.) Tj ET`)

  const contentStream = streamOps.join('\n')

  builder.addObject(`<<\n  /Type /Catalog\n  /Pages 2 0 R\n>>`)
  builder.addObject(`<<\n  /Type /Pages\n  /Kids [3 0 R]\n  /Count 1\n>>`)
  builder.addObject(
    `<<\n  /Type /Page\n  /Parent 2 0 R\n  /MediaBox [0 0 595.28 841.89]\n  /Contents 4 0 R\n  /Resources <<\n    /Font <<\n      /F1 5 0 R\n      /F2 6 0 R\n      /F3 7 0 R\n    >>\n  >>\n>>`
  )
  builder.addObject(`<<\n  /Length ${contentStream.length}\n>>\nstream\n${contentStream}\nendstream`)
  builder.addObject(`<<\n  /Type /Font\n  /Subtype /Type1\n  /BaseFont /Helvetica\n  /Encoding /WinAnsiEncoding\n>>`)
  builder.addObject(`<<\n  /Type /Font\n  /Subtype /Type1\n  /BaseFont /Helvetica-Bold\n  /Encoding /WinAnsiEncoding\n>>`)
  builder.addObject(`<<\n  /Type /Font\n  /Subtype /Type1\n  /BaseFont /Courier\n  /Encoding /WinAnsiEncoding\n>>`)
  builder.addObject(
    `<<\n  /Title (${escapePdfText(data.title)})\n  /Creator (Babin Rentals OS PDF Engine)\n  /CreationDate (D:${new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14)}Z)\n>>`
  )

  return builder.build()
}

export interface PackingListPdfItem {
  id: string
  name: string
  serialNo?: string | null
  assetCode?: string | null
  quantity: number
  location?: string | null
  isParent?: boolean
  parentLineId?: string | null
  isChild?: boolean
  notes?: string | null
}

export interface PackingListPdfData {
  bookingNo: string
  bookingUrl?: string
  documentNo?: string
  clientName: string
  clientPhone?: string | null
  project?: string | null
  pickupAtAd?: string | null
  returnAtAd?: string | null
  deliveryType?: string | null
  packedBy?: string | null
  company?: InvoicePdfCompany
  items: PackingListPdfItem[]
  notes?: string | null
}

interface PackingListSourceLine {
  id: string
  qty: number
  lineType: string
  description: string | null
  productName: string | null
  parentLineId: string | null
  unitsPresence: 'present' | 'absent'
  units: readonly {
    id: string
    serial: string | null
    assetTag: string | null
    location: string | null
  }[]
}

export function buildPackingListPdfItems(lines: readonly PackingListSourceLine[]): PackingListPdfItem[] {
  const parentIds = new Set(lines.map((line) => line.parentLineId).filter((id): id is string => id !== null))
  const items: PackingListPdfItem[] = []

  for (const line of lines) {
    if (parentIds.has(line.id) || line.lineType === 'Bundle') {
      items.push({
        id: line.id,
        name: line.productName ?? line.description ?? 'Equipment Package',
        quantity: line.qty,
        isParent: true,
        parentLineId: line.parentLineId,
      })
    }
  }

  for (const line of lines) {
    if (parentIds.has(line.id) || isNonPackableLineType(line.lineType)) continue
    const baseName = line.productName ?? line.description ?? 'Equipment'
    if (line.unitsPresence === 'present' && line.units.length > 0) {
      line.units.forEach((unit, index) => {
        items.push({
          id: unit.id,
          name: line.units.length > 1 ? `${baseName} (Unit ${index + 1})` : baseName,
          serialNo: unit.serial,
          assetCode: unit.assetTag,
          quantity: 1,
          location: unit.location,
          parentLineId: line.parentLineId,
        })
      })
    } else {
      items.push({
        id: line.id,
        name: baseName,
        quantity: line.qty,
        location: null,
        parentLineId: line.parentLineId,
      })
    }
  }

  return items
}

/**
 * Organizes packing list items according to the 27 Jul hierarchy rule:
 * Parent-first, children nested immediately underneath, followed by loose equipment.
 */
export function organizePackingListItems(items: PackingListPdfItem[]): PackingListPdfItem[] {
  const itemMap = new Map<string, PackingListPdfItem>()
  items.forEach((it) => itemMap.set(it.id, it))

  const childIds = new Set<string>()
  const childrenByParent = new Map<string, PackingListPdfItem[]>()

  for (const it of items) {
    if (it.parentLineId && itemMap.has(it.parentLineId)) {
      childIds.add(it.id)
      const list = childrenByParent.get(it.parentLineId) ?? []
      list.push({ ...it, isChild: true })
      childrenByParent.set(it.parentLineId, list)
    }
  }

  const result: PackingListPdfItem[] = []
  const visited = new Set<string>()
  const append = (item: PackingListPdfItem, nested: boolean): void => {
    if (visited.has(item.id)) return
    visited.add(item.id)
    const children = childrenByParent.get(item.id) ?? []
    result.push({ ...item, ...(children.length ? { isParent: true } : {}), ...(nested ? { isChild: true } : {}) })
    for (const child of children) append(child, true)
  }

  // Keep complete nested packages together, followed by loose equipment.
  for (const item of items) {
    if (!childIds.has(item.id) && (item.isParent || childrenByParent.has(item.id))) append(item, false)
  }
  for (const item of items) {
    if (!childIds.has(item.id)) append(item, false)
  }
  // Malformed cyclic relationships must never silently remove a printed line.
  for (const item of items) append(item, false)

  return result
}

/**
 * Generates an A4 Packing List PDF document (parent-first, children nested).
 * Strictly money-blind (Law 6) — carries no pricing or deposit figures.
 */
export function generatePackingListPdf(data: PackingListPdfData): Uint8Array {
  const builder = new PdfDocumentBuilder()

  const darkSlate = '0.09 0.13 0.24'
  const mutedText = '0.38 0.44 0.52'
  const borderGray = '0.80 0.84 0.88'
  const bgLight = '0.96 0.97 0.98'

  const companyName = data.company?.name?.trim() || 'BABIN RENTALS KATHMANDU'
  const bookingNo = data.bookingNo || '—'
  const docNo = data.documentNo || `PK-${bookingNo}`
  const pickupDate = data.pickupAtAd ? formatAdDateTime(data.pickupAtAd) : 'To be scheduled'
  const returnDate = data.returnAtAd ? formatAd(new Date(data.returnAtAd)) : '—'
  const deliveryType = data.deliveryType || 'Client Pickup'
  const organizedItems = organizePackingListItems(data.items)
  const itemsPerPage = 20
  const pageCount = Math.max(1, Math.ceil(organizedItems.length / itemsPerPage))
  const bookingUrl = data.bookingUrl || bookingNo
  const streams = Array.from({ length: pageCount }, (_, pageIndex) => {
    const streamOps: string[] = []
    const pageItems = organizedItems.slice(pageIndex * itemsPerPage, (pageIndex + 1) * itemsPerPage)

    streamOps.push(`${darkSlate} rg`, '40 802 515 6 re f')
    streamOps.push(`BT /F2 16 Tf 40 776 Td (${escapePdfText(companyName)}) Tj ET`)
    streamOps.push(`${mutedText} rg`, 'BT /F1 9 Tf 40 762 Td (Warehouse Floor Operations - Dispatch Checklist) Tj ET')
    streamOps.push(`${darkSlate} rg`, 'BT /F2 12 Tf 310 776 Td (PACKING LIST / PICK LIST) Tj ET')
    streamOps.push(`${mutedText} rg`, `BT /F3 9 Tf 310 760 Td (${escapePdfText(docNo)}) Tj ET`)
    streamOps.push(`BT /F2 8 Tf 310 746 Td (${escapePdfText(`Page ${pageIndex + 1} of ${pageCount}`)}) Tj ET`)
    streamOps.push(...qrCodeOperations(bookingUrl, 500, 744, 48))
    streamOps.push(`${borderGray} RG 0.75 w`, '40 738 m 555 738 l S')
    streamOps.push(`${bgLight} rg`, '40 655 245 70 re f', '310 655 245 70 re f')
    streamOps.push(`${borderGray} RG 0.5 w`, '40 655 245 70 re S', '310 655 245 70 re S')
    streamOps.push(`${darkSlate} rg`, 'BT /F2 9 Tf 50 710 Td (CLIENT & PROJECT:) Tj ET')
    streamOps.push(`BT /F2 10 Tf 50 696 Td (${escapePdfText(data.clientName)}) Tj ET`, `${mutedText} rg`)
    if (data.project) streamOps.push(`BT /F1 8.5 Tf 50 684 Td (Project: ${escapePdfText(data.project)}) Tj ET`)
    if (data.clientPhone) streamOps.push(`BT /F1 8.5 Tf 50 673 Td (Phone: ${escapePdfText(data.clientPhone)}) Tj ET`)
    streamOps.push(`BT /F1 8.5 Tf 50 662 Td (Fulfillment: ${escapePdfText(deliveryType)}) Tj ET`)
    streamOps.push(`${darkSlate} rg`, 'BT /F2 9 Tf 320 710 Td (DISPATCH SCHEDULE:) Tj ET', `${mutedText} rg`)
    streamOps.push(`BT /F1 9 Tf 320 696 Td (Booking: ) Tj /F3 9 Tf (${escapePdfText(bookingNo)}) Tj ET`)
    streamOps.push(`BT /F1 8 Tf 320 682 Td (Pickup: ${escapePdfText(pickupDate)}) Tj ET`)
    streamOps.push(`BT /F1 8 Tf 320 668 Td (Return: ${escapePdfText(returnDate)}) Tj ET`)

    const tableTopY = 635
    streamOps.push(`${darkSlate} rg`, `40 ${tableTopY - 18} 515 20 re f`, '1 1 1 rg')
    streamOps.push(`BT /F2 8.5 Tf 48 ${tableTopY - 13} Td (#) Tj ET`)
    streamOps.push(`BT /F2 8.5 Tf 75 ${tableTopY - 13} Td (ITEM / PACKAGE HIERARCHY) Tj ET`)
    streamOps.push(`BT /F2 8.5 Tf 315 ${tableTopY - 13} Td (ASSET CODE / SERIAL) Tj ET`)
    streamOps.push(`BT /F2 8.5 Tf 425 ${tableTopY - 13} Td (QTY) Tj ET`)
    streamOps.push(`BT /F2 8.5 Tf 465 ${tableTopY - 13} Td (SHELF) Tj ET`)
    streamOps.push(`BT /F2 8.5 Tf 525 ${tableTopY - 13} Td (PICK) Tj ET`)

    let curY = tableTopY - 20
    pageItems.forEach((item, localIndex) => {
      const absoluteIndex = pageIndex * itemsPerPage + localIndex
      curY -= 22
      const isParent = Boolean(item.isParent)
      const isChild = Boolean(item.isChild)
      const rowBg = isParent ? bgLight : absoluteIndex % 2 === 1 ? '0.98 0.99 1.0' : '1 1 1'
      streamOps.push(`${rowBg} rg`, `40 ${curY} 515 22 re f`, `${borderGray} RG 0.5 w`, `40 ${curY} 515 22 re S`)
      streamOps.push(`${darkSlate} rg`, `BT /F1 8.5 Tf 48 ${curY + 7} Td (${absoluteIndex + 1}) Tj ET`)
      const itemLabel = isChild ? `  - ${item.name}` : isParent ? `[PACKAGE] ${item.name}` : item.name
      const safeItemLabel = escapePdfText(itemLabel.length > 38 ? `${itemLabel.slice(0, 35)}...` : itemLabel)
      streamOps.push(`BT ${isParent ? '/F2' : '/F1'} 8.5 Tf 75 ${curY + 7} Td (${safeItemLabel}) Tj ET`)
      const assetText = item.assetCode || item.serialNo || (isParent ? 'Kit Container' : 'Qty tracked')
      streamOps.push(`${mutedText} rg`, `BT /F3 8 Tf 315 ${curY + 7} Td (${escapePdfText(assetText)}) Tj ET`)
      streamOps.push(`${darkSlate} rg`, `BT /F1 8.5 Tf 430 ${curY + 7} Td (${item.quantity}) Tj ET`)
      streamOps.push(`${mutedText} rg`, `BT /F1 8 Tf 465 ${curY + 7} Td (${escapePdfText(item.location || '—')}) Tj ET`)
      streamOps.push(`${borderGray} RG 0.75 w`, `528 ${curY + 5} 12 12 re S`)
    })

    if (pageIndex === pageCount - 1) {
      const footerY = 110
      streamOps.push(`${borderGray} RG 0.5 w`, `40 ${footerY} 515 0.5 re S`, `${mutedText} rg`)
      streamOps.push(`40 ${footerY - 35} 150 0.5 re S`, `BT /F1 8 Tf 40 ${footerY - 45} Td (Packed & Verified By / Warehouse Staff) Tj ET`)
      streamOps.push(`405 ${footerY - 35} 150 0.5 re S`, `BT /F1 8 Tf 405 ${footerY - 45} Td (Received By / Transport Driver) Tj ET`)
    }
    streamOps.push(`${mutedText} rg`, `BT /F1 7.5 Tf 40 25 Td (${escapePdfText(`Booking ${bookingNo} - Page ${pageIndex + 1} of ${pageCount} - Money-blind floor document`)}) Tj ET`)
    return streamOps.join('\n')
  })

  return buildPagedPdf(
    builder,
    streams,
    `<<\n  /Title (Pick List - ${escapePdfText(bookingNo)})\n  /Author (${escapePdfText(companyName)})\n  /Creator (Babin Rentals OS PDF Engine)\n  /CreationDate (D:${new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14)}Z)\n>>`,
  )
}

export interface ReturnReportPdfLine {
  id: string
  name: string
  serialNo?: string | null
  quantity: number
  outcome: string
  problemRoute?: string | null
  notes?: string | null
}

export interface ReturnReportPdfData {
  bookingNo: string
  documentNo?: string
  clientName: string
  clientPhone?: string | null
  project?: string | null
  pickupAtAd?: string | null
  expectedReturnAtAd?: string | null
  actualReturnAtAd?: string | null
  inspectedBy?: string | null
  totalUnits: number
  returnedUnits: number
  missingUnits: number
  damagedUnits: number
  photosCount: number
  flags?: string[]
  lines: ReturnReportPdfLine[]
  company?: InvoicePdfCompany
  notes?: string | null
}

/**
 * Generates an A4 Return Inspection Report PDF.
 * Strictly money-blind (Law 6) — carries no pricing, deposit, or fine figures.
 */
export function generateReturnReportPdf(data: ReturnReportPdfData): Uint8Array {
  const builder = new PdfDocumentBuilder()

  const darkSlate = '0.09 0.13 0.24'
  const mutedText = '0.38 0.44 0.52'
  const borderGray = '0.80 0.84 0.88'
  const bgLight = '0.96 0.97 0.98'

  const companyName = data.company?.name?.trim() || 'BABIN RENTALS KATHMANDU'
  const bookingNo = data.bookingNo || '—'
  const docNo = data.documentNo || `RET-${bookingNo}`
  const pickupDate = data.pickupAtAd ? formatAd(new Date(data.pickupAtAd)) : '—'
  const expReturnDate = data.expectedReturnAtAd ? formatAd(new Date(data.expectedReturnAtAd)) : '—'
  const actReturnDate = data.actualReturnAtAd ? formatAd(new Date(data.actualReturnAtAd)) : formatAd(new Date())
  const firstPageLineCount = Math.min(data.lines.length, 14)
  const continuationPageSize = 26
  const continuationPageCount = Math.ceil(Math.max(0, data.lines.length - firstPageLineCount) / continuationPageSize)
  const returnPageCount = 1 + continuationPageCount

  const streamOps: string[] = []

  // Top accent bar
  streamOps.push(`${darkSlate} rg`)
  streamOps.push(`40 802 515 6 re f`)

  // Header Title & Company
  streamOps.push(`BT /F2 16 Tf 40 776 Td (${escapePdfText(companyName)}) Tj ET`)
  streamOps.push(`${mutedText} rg`)
  streamOps.push(`BT /F1 9 Tf 40 762 Td (Warehouse Floor Operations · Equipment Intake & QC) Tj ET`)

  // Document Title (Top Right)
  streamOps.push(`${darkSlate} rg`)
  streamOps.push(`BT /F2 17 Tf 350 776 Td (RETURN INSPECTION REPORT) Tj ET`)
  streamOps.push(`${mutedText} rg`)
  streamOps.push(`BT /F3 11 Tf 350 760 Td (${escapePdfText(docNo)}) Tj ET`)
  streamOps.push(`BT /F2 8 Tf 350 746 Td (${escapePdfText(`Page 1 of ${returnPageCount}`)}) Tj ET`)

  // Divider
  streamOps.push(`${borderGray} RG 0.75 w`)
  streamOps.push(`40 738 m 555 738 l S`)

  // Details Cards (y: 725 to 655)
  streamOps.push(`${bgLight} rg`)
  streamOps.push(`40 655 245 70 re f`)
  streamOps.push(`310 655 245 70 re f`)
  streamOps.push(`${borderGray} RG 0.5 w`)
  streamOps.push(`40 655 245 70 re S`)
  streamOps.push(`310 655 245 70 re S`)

  // Client Details (Left)
  streamOps.push(`${darkSlate} rg`)
  streamOps.push(`BT /F2 9 Tf 50 710 Td (CLIENT & PRODUCTION:) Tj ET`)
  streamOps.push(`BT /F2 10 Tf 50 696 Td (${escapePdfText(data.clientName)}) Tj ET`)
  streamOps.push(`${mutedText} rg`)
  if (data.project) {
    streamOps.push(`BT /F1 8.5 Tf 50 684 Td (Project: ${escapePdfText(data.project)}) Tj ET`)
  }
  if (data.clientPhone) {
    streamOps.push(`BT /F1 8.5 Tf 50 673 Td (Phone: ${escapePdfText(data.clientPhone)}) Tj ET`)
  }
  if (data.inspectedBy) {
    streamOps.push(`BT /F1 8.5 Tf 50 662 Td (Inspector: ${escapePdfText(data.inspectedBy)}) Tj ET`)
  }

  // Return Details (Right)
  streamOps.push(`${darkSlate} rg`)
  streamOps.push(`BT /F2 9 Tf 320 710 Td (INTAKE SCHEDULE:) Tj ET`)
  streamOps.push(`${mutedText} rg`)
  streamOps.push(`BT /F1 9 Tf 320 696 Td (Booking Reference: ) Tj /F3 9 Tf (${escapePdfText(bookingNo)}) Tj ET`)
  streamOps.push(`BT /F1 9 Tf 320 682 Td (Out / Pickup: ${escapePdfText(pickupDate)}) Tj ET`)
  streamOps.push(`BT /F1 9 Tf 320 668 Td (Expected: ${escapePdfText(expReturnDate)} | Actual: ${escapePdfText(actReturnDate)}) Tj ET`)

  // Summary Metrics Bar (y: 645 to 605)
  const metricsY = 612
  streamOps.push(`${bgLight} rg`)
  streamOps.push(`40 ${metricsY} 515 30 re f`)
  streamOps.push(`${borderGray} RG 0.5 w`)
  streamOps.push(`40 ${metricsY} 515 30 re S`)

  const addMetric = (label: string, count: number, x: number) => {
    streamOps.push(`${mutedText} rg`)
    streamOps.push(`BT /F1 8 Tf ${x} ${metricsY + 18} Td (${escapePdfText(label)}) Tj ET`)
    streamOps.push(`${darkSlate} rg`)
    streamOps.push(`BT /F2 11 Tf ${x} ${metricsY + 6} Td (${count}) Tj ET`)
  }

  addMetric('Total Items', data.totalUnits, 50)
  addMetric('Returned Clean', data.returnedUnits, 140)
  addMetric('Missing Items', data.missingUnits, 240)
  addMetric('Damaged / QC', data.damagedUnits, 340)
  addMetric('Photos Captured', data.photosCount, 440)

  // Table Header (y: 595)
  const tableTopY = 595
  streamOps.push(`${darkSlate} rg`)
  streamOps.push(`40 ${tableTopY - 18} 515 20 re f`)
  streamOps.push(`1 1 1 rg`)
  streamOps.push(`BT /F2 8.5 Tf 48 ${tableTopY - 13} Td (#) Tj ET`)
  streamOps.push(`BT /F2 8.5 Tf 75 ${tableTopY - 13} Td (EQUIPMENT ITEM) Tj ET`)
  streamOps.push(`BT /F2 8.5 Tf 270 ${tableTopY - 13} Td (SERIAL / ID) Tj ET`)
  streamOps.push(`BT /F2 8.5 Tf 360 ${tableTopY - 13} Td (QTY) Tj ET`)
  streamOps.push(`BT /F2 8.5 Tf 395 ${tableTopY - 13} Td (OUTCOME) Tj ET`)
  streamOps.push(`BT /F2 8.5 Tf 470 ${tableTopY - 13} Td (ACTION / ROUTE) Tj ET`)

  // Line items
  let curY = tableTopY - 20
  const maxRows = firstPageLineCount

  for (let i = 0; i < maxRows; i++) {
    const line = data.lines[i]
    if (!line) continue
    curY -= 22

    const isException = line.outcome === 'Missing' || line.outcome === 'Damaged' || line.outcome.includes('Problem')
    const rowBg = isException ? '1.0 0.97 0.97' : i % 2 === 1 ? bgLight : '1 1 1'

    streamOps.push(`${rowBg} rg`)
    streamOps.push(`40 ${curY} 515 22 re f`)
    streamOps.push(`${borderGray} RG 0.5 w`)
    streamOps.push(`40 ${curY} 515 22 re S`)

    streamOps.push(`${darkSlate} rg`)
    streamOps.push(`BT /F1 8.5 Tf 48 ${curY + 7} Td (${i + 1}) Tj ET`)

    const itemDesc = line.name.length > 32 ? line.name.slice(0, 29) + '…' : line.name
    streamOps.push(`BT /F2 8.5 Tf 75 ${curY + 7} Td (${escapePdfText(itemDesc)}) Tj ET`)

    const serialText = line.serialNo || 'Qty tracked'
    streamOps.push(`${mutedText} rg`)
    streamOps.push(`BT /F3 8 Tf 270 ${curY + 7} Td (${escapePdfText(serialText)}) Tj ET`)

    streamOps.push(`${darkSlate} rg`)
    streamOps.push(`BT /F1 8.5 Tf 365 ${curY + 7} Td (${line.quantity}) Tj ET`)

    streamOps.push(isException ? '0.78 0.15 0.15 rg' : '0.12 0.55 0.30 rg')
    streamOps.push(`BT /F2 8.5 Tf 395 ${curY + 7} Td (${escapePdfText(line.outcome)}) Tj ET`)

    const routeText = line.problemRoute || (isException ? 'Exception Review' : 'Ready for Reset')
    streamOps.push(`${mutedText} rg`)
    streamOps.push(`BT /F1 8 Tf 470 ${curY + 7} Td (${escapePdfText(routeText)}) Tj ET`)
  }

  // Footer & Signatures
  const footerY = 110
  streamOps.push(`${borderGray} RG 0.5 w`)
  streamOps.push(`40 ${footerY} 515 0.5 re S`)

  streamOps.push(`${mutedText} rg`)
  streamOps.push(`40 ${footerY - 35} 150 0.5 re S`)
  streamOps.push(`BT /F1 8 Tf 40 ${footerY - 45} Td (Inspected By / Warehouse Staff) Tj ET`)

  streamOps.push(`405 ${footerY - 35} 150 0.5 re S`)
  streamOps.push(`BT /F1 8 Tf 405 ${footerY - 45} Td (Returned By / Client Representative) Tj ET`)

  streamOps.push(`BT /F1 7.5 Tf 40 25 Td (${escapePdfText(`Babin Rentals OS Return Report · Verified for booking ${bookingNo}. Money-blind floor document.`)} ) Tj ET`)

  const continuationStreams = Array.from({ length: continuationPageCount }, (_, continuationIndex) => {
    const pageNumber = continuationIndex + 2
    const startIndex = firstPageLineCount + continuationIndex * continuationPageSize
    const pageLines = data.lines.slice(startIndex, startIndex + continuationPageSize)
    const ops = [
      `${darkSlate} rg`, '40 802 515 6 re f',
      `BT /F2 16 Tf 40 776 Td (${escapePdfText(companyName)}) Tj ET`,
      'BT /F2 16 Tf 330 776 Td (RETURN INSPECTION REPORT) Tj ET',
      `${mutedText} rg`,
      `BT /F3 10 Tf 380 760 Td (${escapePdfText(docNo)}) Tj ET`,
      `BT /F2 8 Tf 380 744 Td (${escapePdfText(`Page ${pageNumber} of ${returnPageCount}`)}) Tj ET`,
      `BT /F1 9 Tf 40 744 Td (Booking: ${escapePdfText(bookingNo)}) Tj ET`,
      `${darkSlate} rg`, '40 710 515 20 re f', '1 1 1 rg',
      'BT /F2 8.5 Tf 48 715 Td (#) Tj ET',
      'BT /F2 8.5 Tf 75 715 Td (EQUIPMENT ITEM) Tj ET',
      'BT /F2 8.5 Tf 270 715 Td (SERIAL / ID) Tj ET',
      'BT /F2 8.5 Tf 360 715 Td (QTY) Tj ET',
      'BT /F2 8.5 Tf 395 715 Td (OUTCOME) Tj ET',
      'BT /F2 8.5 Tf 470 715 Td (ACTION / ROUTE) Tj ET',
    ]
    let pageY = 708
    pageLines.forEach((line, localIndex) => {
      const absoluteIndex = startIndex + localIndex
      pageY -= 24
      const isException = line.outcome === 'Missing' || line.outcome === 'Damaged' || line.outcome.includes('Problem')
      const rowBg = isException ? '1.0 0.97 0.97' : absoluteIndex % 2 === 1 ? bgLight : '1 1 1'
      ops.push(`${rowBg} rg`, `40 ${pageY} 515 24 re f`, `${borderGray} RG 0.5 w`, `40 ${pageY} 515 24 re S`)
      ops.push(`${darkSlate} rg`, `BT /F1 8.5 Tf 48 ${pageY + 8} Td (${absoluteIndex + 1}) Tj ET`)
      const itemDescription = line.name.length > 32 ? `${line.name.slice(0, 29)}...` : line.name
      ops.push(`BT /F2 8.5 Tf 75 ${pageY + 8} Td (${escapePdfText(itemDescription)}) Tj ET`)
      ops.push(`${mutedText} rg`, `BT /F3 8 Tf 270 ${pageY + 8} Td (${escapePdfText(line.serialNo || 'Qty tracked')}) Tj ET`)
      ops.push(`${darkSlate} rg`, `BT /F1 8.5 Tf 365 ${pageY + 8} Td (${line.quantity}) Tj ET`)
      ops.push(isException ? '0.78 0.15 0.15 rg' : '0.12 0.55 0.30 rg')
      ops.push(`BT /F2 8.5 Tf 395 ${pageY + 8} Td (${escapePdfText(line.outcome)}) Tj ET`)
      const routeText = line.problemRoute || (isException ? 'Exception Review' : 'Ready for Reset')
      ops.push(`${mutedText} rg`, `BT /F1 8 Tf 470 ${pageY + 8} Td (${escapePdfText(routeText)}) Tj ET`)
    })
    ops.push(`${mutedText} rg`, `BT /F1 7.5 Tf 40 25 Td (${escapePdfText(`Return report - Booking ${bookingNo} - Page ${pageNumber} of ${returnPageCount}`)}) Tj ET`)
    return ops.join('\n')
  })

  return buildPagedPdf(
    builder,
    [streamOps.join('\n'), ...continuationStreams],
    `<<\n  /Title (Return Report - ${escapePdfText(bookingNo)})\n  /Author (${escapePdfText(companyName)})\n  /Creator (Babin Rentals OS PDF Engine)\n  /CreationDate (D:${new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14)}Z)\n>>`,
  )
}
