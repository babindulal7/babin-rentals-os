/**
 * BABIN RENTALS OS — INTELLIGENCE DATA FEEDING PIPELINE
 * Technical Manual & Source Document Ingestion Engine (TQC-03 / Pipeline)
 *
 * Implements deterministic parsing, structured section chunking,
 * provenance metadata attribution, and review candidate proposal generation.
 * All imported sources are sanitized before review staging.
 */

import type { KnowledgeReviewItem, EvidenceStatus, KnowledgeCandidateCategory } from './types'

export interface IngestedDocumentSource {
  id: string
  filename: string
  publisher: string
  modelId: string
  hardwareRevision: string
  documentType: 'manufacturer_manual' | 'service_bulletin' | 'field_note' | 'catalog_spec'
  pagesExtracted: number
  ingestedAt: string
  contentHash: string
}

export interface ExtractedClaim {
  id: string
  category: KnowledgeCandidateCategory
  claimText: string
  pageNumber: number
  sectionHeading: string
  confidence: EvidenceStatus
}

export interface IngestedSection {
  sectionId: string
  documentId: string
  title: string
  pageNumber: number
  rawText: string
  claims: ExtractedClaim[]
}

/**
 * Sanitizes untrusted manufacturer document text to prevent prompt injection
 * or unsafe instruction execution (Spec §6).
 */
export function sanitizeDocumentText(raw: string): string {
  return raw
    .replace(/<[^>]*>/g, '') // Strip HTML tags
    .replace(/(?:system\s*prompt|ignore\s*previous\s*instructions|dan\s*mode)/gi, '[REDACTED_PROMPT_INSTRUCTION]')
    .trim()
}

/**
 * Parses raw extracted PDF/document text lines into structured sections and claims.
 */
export function parseDocumentIntoSections(
  doc: IngestedDocumentSource,
  rawContent: string
): IngestedSection[] {
  const sanitized = sanitizeDocumentText(rawContent)
  const lines = sanitized.split(/\r?\n/)
  const sections: IngestedSection[] = []

  let currentTitle = 'General Overview'
  let currentPage = 1
  let currentBuffer: string[] = []
  let sectionIndex = 1

  const flushSection = () => {
    if (currentBuffer.length === 0) return
    const text = currentBuffer.join('\n').trim()
    if (!text) return

    const claims: ExtractedClaim[] = []

    // Detect technical specification claims
    if (text.toLowerCase().includes('power') || text.toLowerCase().includes('voltage') || text.toLowerCase().includes('dc in')) {
      claims.push({
        id: `CLM-${doc.id}-${sectionIndex}-PWR`,
        category: 'safety',
        claimText: text.slice(0, 200),
        pageNumber: currentPage,
        sectionHeading: currentTitle,
        confidence: 'verified_primary',
      })
    }

    // Detect included accessories claims
    if (text.toLowerCase().includes('supplied') || text.toLowerCase().includes('in the box') || text.toLowerCase().includes('package contents')) {
      claims.push({
        id: `CLM-${doc.id}-${sectionIndex}-KIT`,
        category: 'included_kit',
        claimText: text.slice(0, 200),
        pageNumber: currentPage,
        sectionHeading: currentTitle,
        confidence: 'verified_primary',
      })
    }

    // Detect mount and lens compatibility claims
    if (text.toLowerCase().includes('mount') || text.toLowerCase().includes('lens') || text.toLowerCase().includes('compatible')) {
      claims.push({
        id: `CLM-${doc.id}-${sectionIndex}-COMPAT`,
        category: 'compatible',
        claimText: text.slice(0, 200),
        pageNumber: currentPage,
        sectionHeading: currentTitle,
        confidence: 'verified_primary',
      })
    }

    sections.push({
      sectionId: `SEC-${doc.id}-${sectionIndex}`,
      documentId: doc.id,
      title: currentTitle,
      pageNumber: currentPage,
      rawText: text,
      claims,
    })

    sectionIndex++
    currentBuffer = []
  }

  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed) continue

    // Detect page headers e.g. "Page 12" or "--- Page 12 ---"
    const pageMatch = trimmed.match(/^(?:---\s*)?(?:page\s*)(\d+)(?:\s*---)?$/i)
    if (pageMatch) {
      flushSection()
      currentPage = parseInt(pageMatch[1]!, 10)
      continue
    }

    // Detect major section titles (e.g., "# 1. Power Supply" or all caps headings)
    if (trimmed.startsWith('#') || (/^[A-Z0-9\s-]{4,40}:?$/.test(trimmed) && trimmed.length < 50)) {
      flushSection()
      currentTitle = trimmed.replace(/^#+\s*/, '')
      continue
    }

    currentBuffer.push(trimmed)
  }

  flushSection()
  return sections
}

/**
 * Transforms ingested sections into Staff Knowledge Review proposals.
 * Never publishes to live models automatically; creates approval candidates only.
 */
export function generateReviewCandidatesFromSections(
  doc: IngestedDocumentSource,
  sections: IngestedSection[]
): KnowledgeReviewItem[] {
  const proposals: KnowledgeReviewItem[] = []

  for (const sec of sections) {
    for (const clm of sec.claims) {
      proposals.push({
        id: `REV-PROP-${clm.id}`,
        modelId: doc.modelId,
        modelName: doc.modelId.replace('CAM-', '').replace('LGT-', '').replace(/-/g, ' '),
        category: clm.category,
        sourceType: doc.documentType,
        publisher: doc.publisher,
        sourceRevision: `${doc.hardwareRevision} (p. ${clm.pageNumber})`,
        currentApprovedValue: 'Pending review baseline.',
        proposedValue: clm.claimText,
        confidence: clm.confidence,
        status: 'pending',
        updatedAt: new Date().toISOString(),
      })
    }
  }

  return proposals
}
