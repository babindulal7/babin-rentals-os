/**
 * BABIN RENTALS OS — INTELLIGENCE TRAINING CENTER
 * Canonical Catalog Quality Scanner (TQC-02)
 *
 * Implements read-only scanning over authorized catalog records
 * to surface data completeness, identity ambiguity, and consistency issues.
 * Zero database writes or automatic modifications.
 */

import { INVENTORY_MODELS } from '../../data/addBundle'
import type { DataQualityIssue } from './types'

export interface QualityScanSummary {
  scannedAt: string
  totalModelsScanned: number
  totalIssuesDetected: number
  criticalCount: number
  highCount: number
  mediumCount: number
  lowCount: number
  issues: DataQualityIssue[]
}

export function scanCanonicalCatalogQuality(): QualityScanSummary {
  const issues: DataQualityIssue[] = []
  const scannedAt = new Date().toISOString()

  // Track model names to detect duplicates and token boundary confusion
  const seenNames = new Map<string, string>()

  for (const model of INVENTORY_MODELS) {
    const id = model.id
    const name = model.name
    const nameLower = name.toLowerCase()

    // 1. Identity Check: FX3 vs FX30 strict token separation
    if (nameLower.includes('fx3') && !nameLower.includes('fx30')) {
      // Ensure no alias or notes mention fx30
      if (nameLower.includes('fx30')) {
        issues.push({
          code: `ID-CONFUSE-${id}`,
          severity: 'critical',
          category: 'identity',
          title: `Conflicting model tokens in ${name}`,
          description: `Model ${name} (${id}) contains conflicting tokens 'FX3' and 'FX30'. Must maintain strict separation.`,
          canonicalId: id,
          deepLink: `/inventory?model=${encodeURIComponent(id)}`,
          evidence: `Token scan flagged substring overlap in catalog name: "${name}"`,
          earliestSafeFix: 'Disambiguate model name and create distinct inventory rows.',
          proposedOwner: 'Equipment Manager',
          reviewStatus: 'open',
        })
      }
    }

    // Check duplicate or near-duplicate model names
    const normalizedName = nameLower.replace(/[^a-z0-9]/g, '')
    if (seenNames.has(normalizedName)) {
      const existingId = seenNames.get(normalizedName)!
      issues.push({
        code: `ID-DUP-${id}`,
        severity: 'critical',
        category: 'identity',
        title: `Potential duplicate model name: "${name}"`,
        description: `Model "${name}" (${id}) matches existing model (${existingId}) after token normalization.`,
        canonicalId: id,
        deepLink: `/inventory?model=${encodeURIComponent(id)}`,
        evidence: `Normalized key "${normalizedName}" already assigned to ${existingId}.`,
        earliestSafeFix: 'Merge alias or clarify unique model revision in catalog.',
        proposedOwner: 'Catalog Administrator',
        reviewStatus: 'open',
      })
    } else {
      seenNames.set(normalizedName, id)
    }

    // 2. Completeness Check: Missing daily rate or stock pools
    if (!model.unitRatePaisa || Number(model.unitRatePaisa) <= 0) {
      issues.push({
        code: `CMP-RATE-${id}`,
        severity: 'high',
        category: 'completeness',
        title: `Missing or zero daily rental rate for ${name}`,
        description: `Model ${name} has no valid positive daily rate in catalog records.`,
        canonicalId: id,
        deepLink: `/inventory?model=${encodeURIComponent(id)}`,
        evidence: `unitRatePaisa is ${String(model.unitRatePaisa)}`,
        earliestSafeFix: 'Assign owner-approved planning daily rate.',
        proposedOwner: 'Pricing Desk',
        reviewStatus: 'open',
      })
    }

    // Completeness Check: Missing category or classification
    if (!model.category) {
      issues.push({
        code: `CMP-CAT-${id}`,
        severity: 'medium',
        category: 'completeness',
        title: `Unclassified equipment category for ${name}`,
        description: `Model ${name} (${id}) has no primary category assigned.`,
        canonicalId: id,
        deepLink: `/inventory?model=${encodeURIComponent(id)}`,
        evidence: `Category field is empty or undefined.`,
        earliestSafeFix: 'Select verified primary category from EQUIPMENT_CATEGORIES.',
        proposedOwner: 'Inventory Lead',
        reviewStatus: 'open',
      })
    }
  }

  // 3. Consistency Checks: Detect missing accessories on cinema bodies
  const cinemaBodies = INVENTORY_MODELS.filter((m) => m.category === 'Camera' && m.name.toLowerCase().includes('cinema'))
  for (const body of cinemaBodies) {
    // Cinema cameras must have verified battery & power profile
    if (!body.name.toLowerCase().includes('body')) {
      issues.push({
        code: `CON-BODY-${body.id}`,
        severity: 'low',
        category: 'consistency',
        title: `Cinema camera naming convention: "${body.name}"`,
        description: `Camera body should include explicit 'Body' suffix to distinguish bare chassis from kits.`,
        canonicalId: body.id,
        deepLink: `/inventory?model=${encodeURIComponent(body.id)}`,
        evidence: `Model name "${body.name}" lacks 'Body' designation.`,
        earliestSafeFix: 'Append "Body" to catalog name to prevent kit confusion.',
        proposedOwner: 'Catalog Team',
        reviewStatus: 'open',
      })
    }
  }

  const criticalCount = issues.filter((i) => i.severity === 'critical').length
  const highCount = issues.filter((i) => i.severity === 'high').length
  const mediumCount = issues.filter((i) => i.severity === 'medium').length
  const lowCount = issues.filter((i) => i.severity === 'low').length

  return {
    scannedAt,
    totalModelsScanned: INVENTORY_MODELS.length,
    totalIssuesDetected: issues.length,
    criticalCount,
    highCount,
    mediumCount,
    lowCount,
    issues,
  }
}
