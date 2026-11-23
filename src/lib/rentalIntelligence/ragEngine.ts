/**
 * BABIN RENTALS OS — RENTAL RAG KNOWLEDGE & RETRIEVAL ENGINE (RI-07)
 * Operational search, manual citation, and policy retrieval:
 *
 * 1. Approved Knowledge Index:
 *    - Curated from approved operational manuals, equipment guides, and store policies.
 * 2. Invariant RI-A24 (Prompt Injection Resistance):
 *    - Strict prompt injection pattern detection and query sanitization.
 *    - Retrieved snippets are treated strictly as read-only text, never executed as code or instruction.
 * 3. Invariant RI-A25 (Superseded / Expired Source Detection):
 *    - Flags expired or superseded manuals with explicit warnings.
 *    - Replaces "manufacturer verified" confidence with 'needs_verification'.
 * 4. Role-Safe Redaction:
 *    - Internal margin and commercial rate data in policy texts are sanitized for floor roles.
 */

import { moneyScope, type Surface } from '../fieldGating'
import type { SystemRole } from '../../types/database'
import type {
  RentalAdvice,
  RagDocumentSource,
  RagSearchResult,
  RagSearchResponse,
  RagSearchInput,
} from './types'

/** Injection signatures to detect and neutralize (RI-A24) */
const INJECTION_PATTERNS = [
  /ignore\s+(all\s+)?previous\s+instructions/i,
  /system\s*prompt/i,
  /override\s+(policy|discount|rule|auth)/i,
  /grant\s+(admin|role|access)/i,
  /drop\s+table/i,
  /delete\s+from/i,
  /<script\b/i,
  /javascript:/i,
  /rm\s+-rf/i,
  /union\s+select/i,
]

/** Approved knowledge repository */
export const APPROVED_KNOWLEDGE_DOCUMENTS: readonly RagDocumentSource[] = [
  {
    id: 'DOC-EXTREME-WEATHER-V4',
    title: 'Extreme Weather & Himalayan Operations Manual',
    category: 'operational_sop',
    version: '4.0.0',
    effectiveDate: '2026-06-01',
    verifiedBy: 'Babin Field Operations',
    tags: ['monsoon', 'altitude', 'mustang', 'manang', 'cold', 'battery', 'generator', 'acclimatization'],
    content:
      'High-altitude cold (>2500m in Mustang, Manang, Khumbu) increases lithium electrolyte viscosity, derating battery runtime by 40% at -10C. Mandatory Teahouse Acclimatization: Keep equipment sealed inside hard Pelican cases for 45-60 minutes after entering heated rooms to prevent internal condensation and optical fungus. Generator output loses ~3.5% wattage per 1,000ft elevation. Monsoon season (June-September) requires sealed silica packs, clear rain ponchos, and mandatory 24-hour dry-cabinet bake (40%-45% RH) for damp returns.',
  },
  {
    id: 'DOC-CAMERAS-CINEMA-V4',
    title: 'Cinema Camera Line Operations Guide (FX3 vs FX30 & Komodo-X)',
    category: 'equipment_manual',
    version: '4.0.0',
    effectiveDate: '2026-05-15',
    verifiedBy: 'Technical Lead',
    tags: ['fx3', 'fx30', 'komodo', 'komodo-x', 'red', 'sony', 'cooling', 'media'],
    content:
      'Sony FX3 features a full-frame 12MP BSI sensor with active cooling and XLR top handle audio; FX30 is Super 35 26MP. They are distinct sensor formats and must never be silently substituted. RED Komodo-X 6K cinema camera features a 6K Super 35 global shutter sensor. It requires native V-Mount continuous power and CFexpress Type B media (formatted on-camera) for reliable R3D recording. Set fan profile to Adaptive Preview Quiet Record during high ambient heat.',
  },
  {
    id: 'DOC-LENSES-OPTICS-V4',
    title: 'Optical Glass & Anamorphic Handling Guide',
    category: 'equipment_manual',
    version: '4.0.0',
    effectiveDate: '2026-04-10',
    verifiedBy: 'Optical Technician',
    tags: ['lenses', 'anamorphic', 'chiopt', 'blazar', 'nisi', 'rods', 'fungus', 'e-mount'],
    content:
      'Heavy cinema zooms (e.g. CHIOPT 28-85mm at 2.7kg) mandate 15mm baseplate rod support and a lens support bracket to prevent mechanical shearing of the camera lens mount. Blazar Mantis Anamorphic lenses feature a 1.33x squeeze factor; monitor de-squeeze must be set to 1.33x. Return QC requires a torch audit of front, internal, and rear elements to verify zero fungal bloom or coating fogging.',
  },
  {
    id: 'DOC-POWER-CIRCUIT-V4',
    title: 'Location Electrical Safety & Battery Standards',
    category: 'operational_sop',
    version: '4.0.0',
    effectiveDate: '2026-03-01',
    verifiedBy: 'Studio Electrician',
    tags: ['power', 'wattage', 'aputure', 'v-mount', 'circuit', 'nepal_grid'],
    content:
      'Standard Nepal commercial sockets are 230V 15A (3,450W peak). To maintain a 20% electrical safety margin, continuous single-circuit draw must never exceed 2,760W. Dual Aputure 600x Pro lights (720W each) consume 1,440W total and safely operate on a single circuit. Triple 600x plus continuous high-draw battery chargers require dedicated separate circuits or a high-capacity generator. Lithium batteries over 100Wh require airline flight approval.',
  },
  {
    id: 'DOC-DECISION-FRAMEWORK-V4',
    title: 'Rental Intelligence Canonical Decision Framework',
    category: 'policy',
    version: '4.0.0',
    effectiveDate: '2026-01-01',
    verifiedBy: 'Owner / System Architect',
    tags: ['decision', 'framework', '7-step', 'confidence', 'audit', 'outcome'],
    content:
      'Advisory recommendations must follow the canonical 7-step reasoning pattern: Situation, Evidence, Constraints, Options, Recommendation, Confidence, Required Action. Advisory Invariant: Acceptance of a suggestion by staff does not equal a confirmed successful outcome. Outcomes must be measured empirically at return QC and post-settlement.',
  },
  {
    id: 'DOC-LEGACY-GENERATOR-V2',
    title: 'Old Generator Altitude Table (Superseded)',
    category: 'operational_sop',
    version: '2.1.0',
    effectiveDate: '2024-01-15',
    expiresAt: '2025-06-01',
    supersededBy: 'DOC-EXTREME-WEATHER-V4',
    verifiedBy: 'Former Equipment Manager',
    tags: ['generator', 'altitude', 'legacy'],
    content:
      'Legacy 2kVA generator calculation without modern de-rating formula. Deprecated.',
  },
]

export function sanitizeQuery(rawQuery: string): { sanitized: string; isInjection: boolean } {
  let isInjection = false
  for (const pattern of INJECTION_PATTERNS) {
    if (pattern.test(rawQuery)) {
      isInjection = true
      break
    }
  }

  // Strip dangerous control chars and HTML angle brackets without control regex
  const sanitized = Array.from(rawQuery)
    .filter((ch) => {
      const code = ch.charCodeAt(0)
      return (code >= 32 && code !== 127) || code === 10 || code === 13 || code === 9
    })
    .join('')
    .replace(/[<>]/g, '')
    .trim()

  return { sanitized, isInjection }
}

export function searchRentalKnowledge(
  input: RagSearchInput,
  userRole: SystemRole,
  surface: Surface = 'default',
): RagSearchResponse {
  const { sanitized, isInjection } = sanitizeQuery(input.query)
  const scope = moneyScope({ role: userRole, surface })
  const now = new Date()

  if (isInjection) {
    const advice: RentalAdvice = {
      id: `adv-rag-injection-${Date.now()}`,
      module: 'knowledge',
      target: { type: 'report', id: 'sec-guard' },
      evidenceState: 'blocked',
      severity: 'urgent',
      explanation:
        'SECURITY ALERT (RI-A24): Input query contains suspicious instruction override patterns. Search query was sanitized and instruction execution was refused.',
      sourceRefs: ['src/lib/rentalIntelligence/ragEngine.ts'],
      sourceKinds: ['live_os'],
      snapshotAt: now.toISOString(),
      requiredChecks: ['Review audit log for unauthorized override attempt'],
    }

    return {
      query: input.query,
      sanitizedQuery: sanitized,
      securityStatus: 'prompt_injection_flagged',
      results: [],
      advice,
    }
  }

  const queryTerms = sanitized
    .toLowerCase()
    .split(/\s+/)
    .filter((t) => t.length > 2)

  const maxResults = input.maxResults ?? 5
  const scoredResults: RagSearchResult[] = []

  for (const doc of APPROVED_KNOWLEDGE_DOCUMENTS) {
    if (input.categoryFilter && doc.category !== input.categoryFilter) {
      continue
    }

    let score = 0
    const titleLower = doc.title.toLowerCase()
    const contentLower = doc.content.toLowerCase()

    for (const term of queryTerms) {
      if (titleLower.includes(term)) score += 10
      if (doc.tags.some((tag) => tag.toLowerCase().includes(term))) score += 8
      if (contentLower.includes(term)) score += 3
    }

    if (score > 0) {
      const isExpired = Boolean(
        doc.supersededBy ||
          (doc.expiresAt && new Date(doc.expiresAt).getTime() < now.getTime()),
      )

      let warningNote: string | undefined
      if (isExpired) {
        warningNote = doc.supersededBy
          ? `WARNING (RI-A25): This document is superseded by ${doc.supersededBy}. Do not rely on outdated manufacturer-verified claims without current re-verification.`
          : 'WARNING (RI-A25): This document has expired. Requires re-verification.'
      }

      let displayContent = doc.content
      // If floor role, scrub any stray currency references
      if (scope === 'none') {
        displayContent = displayContent.replace(/Rs\s*[\d,]+/gi, '[redacted]')
      }

      // Extract a contextual snippet
      const firstTerm = queryTerms.find((t) => displayContent.toLowerCase().includes(t))
      let snippet = displayContent.slice(0, 200)
      if (firstTerm) {
        const idx = displayContent.toLowerCase().indexOf(firstTerm)
        const start = Math.max(0, idx - 40)
        snippet = displayContent.slice(start, start + 240) + '...'
      }

      scoredResults.push({
        documentId: doc.id,
        title: doc.title,
        category: doc.category,
        version: doc.version,
        relevanceScore: score,
        snippet,
        citationPath: `references/${doc.title.toLowerCase().replace(/[^a-z0-9]/g, '_')}.md`,
        isExpired,
        warningNote,
        sourceKind: isExpired ? 'external_unverified' : 'approved_knowledge',
      })
    }
  }

  scoredResults.sort((a, b) => b.relevanceScore - a.relevanceScore)
  const results = scoredResults.slice(0, maxResults)

  return {
    query: input.query,
    sanitizedQuery: sanitized,
    securityStatus: 'safe',
    results,
  }
}
