import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  generateInvoicePdf,
  generateRentalAgreementPdf,
  generateDocumentPdf,
} from '../src/lib/pdf/generatePdf.js'
import { rupees } from '../src/lib/money.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const outDir = path.resolve(__dirname, '../artifacts/accountant-review')
fs.mkdirSync(outDir, { recursive: true })

console.log('Generating Accountant Sample Package in:', outDir)

// 1. Synthetic Sample Tax Invoice (13% VAT, Pre-printed Paper Invoice Mode D1/D2 — Sample Not For Issuance)
const sampleTaxInvoice = generateInvoicePdf({
  invoiceNo: 'INV-2083-0042',
  bookingNo: 'BK-2083-0108',
  status: 'Issued',
  issueDateAd: '2026-11-19T06:00:00.000Z',
  dueDateAd: '2026-11-26T06:00:00.000Z',
  company: {
    name: 'Babin Rentals (Synthetic Sample - Not For Issuance)',
    panVat: '000000000',
    address: 'Synthetic Address (Test Environment Only), Kathmandu, Nepal',
    phone: '+977-00-0000000',
  },
  client: {
    name: 'Synthetic Client Corp (Sample Not For Issuance)',
    panVat: '999999999',
    address: 'Synthetic Client Address, Lalitpur, Nepal',
    phone: '+977-00-0000001',
    email: 'synthetic-accounts@example.invalid',
  },
  lines: [
    {
      description: 'Sony FX3 Full-Frame Cinema Camera Kit',
      serialNo: 'SN-FX3-001',
      quantity: 1,
      rentalDays: 3,
      ratePaisa: rupees(7500),
      totalPaisa: rupees(22500),
    },
    {
      description: 'Sony FE 24-70mm f/2.8 GM II Lens',
      serialNo: 'SN-SEL2470GM2-108',
      quantity: 1,
      rentalDays: 3,
      ratePaisa: rupees(3500),
      totalPaisa: rupees(10500),
    },
    {
      description: 'DJI RS3 Pro Gimbal Stabilizer Combo',
      serialNo: 'SN-RS3P-042',
      quantity: 1,
      rentalDays: 3,
      ratePaisa: rupees(4000),
      totalPaisa: rupees(12000),
    },
    {
      description: 'ProGrade Digital V90 128GB SDXC Card (Consumable/Media)',
      quantity: 2,
      rentalDays: 1, // Consumables sold per unit, not multiplied by days (T3-30)
      ratePaisa: rupees(3000),
      totalPaisa: rupees(6000),
    },
  ],
  subtotalPaisa: rupees(51000),
  discountPercent: 10,
  discountPaisa: rupees(5100),
  taxablePaisa: rupees(45900),
  vatPercent: 13,
  vatPaisa: rupees(5967), // 13% of 45,900 = 5,967
  totalPaisa: rupees(51867),
  paidPaisa: rupees(20000), // Advance deposit/payment
  outstandingPaisa: rupees(31867),
  notes: 'SYNTHETIC SAMPLE — NOT FOR ISSUANCE. Payment terms: Net 7 days. Bank: Synthetic Test Bank, A/C: 000000000000. Fonepay Merchant: 0000000000.',
})

fs.writeFileSync(path.join(outDir, '01_Sample_Tax_Invoice_INV-2083-0042.pdf'), sampleTaxInvoice)
console.log('✓ Wrote 01_Sample_Tax_Invoice_INV-2083-0042.pdf')

// 2. Synthetic Pro Forma Invoice (Not in VAT Register, T3-27 / B18 / Law 7)
const sampleProForma = generateInvoicePdf({
  isProForma: true,
  documentTitle: 'PRO FORMA INVOICE — not a tax invoice (Synthetic Sample)',
  bookingNo: 'BK-2083-0109',
  status: 'Pro Forma',
  issueDateAd: '2026-11-19T06:00:00.000Z',
  company: {
    name: 'Babin Rentals (Synthetic Sample - Not For Issuance)',
    panVat: '000000000',
    address: 'Synthetic Address (Test Environment Only), Kathmandu, Nepal',
    phone: '+977-00-0000000',
  },
  client: {
    name: 'Synthetic Client Two (Sample Not For Issuance)',
    phone: '+977-00-0000002',
    address: 'Synthetic Client Address Two, Kathmandu',
  },
  lines: [
    {
      description: 'ARRI Alexa Mini LF Package',
      quantity: 1,
      rentalDays: 2,
      ratePaisa: rupees(45000),
      totalPaisa: rupees(90000),
    },
    {
      description: 'Cooke Full Frame Plus Prime 5-Lens Set',
      quantity: 1,
      rentalDays: 2,
      ratePaisa: rupees(35000),
      totalPaisa: rupees(70000),
    },
  ],
  subtotalPaisa: rupees(160000),
  taxablePaisa: rupees(160000),
  vatPercent: 13,
  vatPaisa: rupees(20800),
  totalPaisa: rupees(180800),
  paidPaisa: rupees(0),
  outstandingPaisa: rupees(180800),
  notes: 'SYNTHETIC SAMPLE — NOT FOR ISSUANCE. Estimate only. Subject to equipment availability at confirmation. Takes no tax invoice number and stays out of the VAT register (Law 7).',
})

fs.writeFileSync(path.join(outDir, '02_Sample_Pro_Forma_Invoice_PRO-0109.pdf'), sampleProForma)
console.log('✓ Wrote 02_Sample_Pro_Forma_Invoice_PRO-0109.pdf')

// 3. Synthetic Rental Agreement (Signed at Handover, T2-02, T3-06)
const sampleAgreement = generateRentalAgreementPdf({
  agreementNo: 'AGR-2083-0108',
  bookingNo: 'BK-2083-0108',
  project: 'Synthetic Commercial Shoot Sample',
  issueDateAd: '2026-11-19T06:00:00.000Z',
  rentalStartAd: '2026-11-19T08:00:00.000Z',
  rentalEndAd: '2026-11-22T08:00:00.000Z',
  company: {
    name: 'Babin Rentals (Synthetic Sample - Not For Issuance)',
    panVat: '000000000',
    address: 'Synthetic Address (Test Environment Only), Kathmandu, Nepal',
    phone: '+977-00-0000000',
  },
  client: {
    name: 'Synthetic Client Corp (Sample Not For Issuance)',
    phone: '+977-00-0000001',
    email: 'synthetic-production@example.invalid',
    address: 'Synthetic Client Address, Lalitpur, Nepal',
    panVat: '999999999',
    idNumber: 'SYNTHETIC-DOC-00-00-00-00000',
  },
  equipment: [
    {
      description: 'Sony FX3 Full-Frame Cinema Camera Kit',
      serialNo: 'SN-FX3-001',
      quantity: 1,
    },
    {
      description: 'Sony FE 24-70mm f/2.8 GM II Lens',
      serialNo: 'SN-SEL2470GM2-108',
      quantity: 1,
    },
    {
      description: 'DJI RS3 Pro Gimbal Stabilizer Combo',
      serialNo: 'SN-RS3P-042',
      quantity: 1,
    },
  ],
  depositPaisa: rupees(50000), // Refundable security deposit (Law 5 liability)
  totalRentalPaisa: rupees(51867),
  handoverNotes: 'SYNTHETIC SAMPLE — NOT FOR ISSUANCE. Gear checked and tested in working condition by Warehouse lead. Client verified all sensors clean and accessories complete.',
})

fs.writeFileSync(path.join(outDir, '03_Sample_Rental_Agreement_AGR-2083-0108.pdf'), sampleAgreement)
console.log('✓ Wrote 03_Sample_Rental_Agreement_AGR-2083-0108.pdf')

// 4. Synthetic Credit Note (Invoice Correction & Voiding, Law 4 / R-15 / L24)
const sampleCreditNote = generateDocumentPdf({
  documentNo: 'CRN-2083-0005',
  title: 'CREDIT NOTE — Babin Rentals (Synthetic Sample - Not For Issuance)',
  docType: 'Credit Note',
  clientName: 'Synthetic Client Corp (Sample Not For Issuance)',
  bookingNo: 'BK-2083-0105',
  contentParagraphs: [
    'SYNTHETIC SAMPLE — NOT FOR ISSUANCE.',
    'Original Tax Invoice Ref: INV-2083-0039 (Voided per Law 4 / R-15)',
    'Original Invoice Date: 2026-11-12 AD (2083-07-27 BS)',
    'Client PAN: 999999999 | Seller PAN: 000000000',
    'Reason for Adjustment: Shoot cancelled due to weather; equipment returned pre-handover. Full credit issued against original billing.',
    'Taxable Credit Amount: NPR 25,000.00',
    '13% VAT Adjustment: NPR 3,250.00',
    'Total Credit Note Amount: NPR 28,250.00',
    'Settlement: Credited to client account ledger. Can be offset against future bookings or refunded upon formal request.',
  ],
})

fs.writeFileSync(path.join(outDir, '04_Sample_Credit_Note_CRN-2083-0005.pdf'), sampleCreditNote)
console.log('✓ Wrote 04_Sample_Credit_Note_CRN-2083-0005.pdf')

console.log('All 4 sample PDFs generated successfully in artifacts/accountant-review/')
