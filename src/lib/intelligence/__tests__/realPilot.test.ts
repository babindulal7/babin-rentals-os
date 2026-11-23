/**
 * BABIN RENTALS OS — REAL EQUIPMENT PILOT ACCEPTANCE TEST SUITE (TQC-NEXT-01..06)
 *
 * Verifies:
 * 1. 10 High-frequency real canonical inventory models (TQC-NEXT-01).
 * 2. Distinction between OEM includes, Babin physical kit includes, and separately rentable items.
 * 3. Knowledge provenance and audience-separated How-to Guides (TQC-NEXT-02).
 * 4. Read-only pilot quality report and draft correction queue.
 * 5. 105 Reviewed real-data golden cases covering 8 suites and 25+ critical edge cases (TQC-NEXT-03).
 * 6. Release quality gate thresholds (≥99% model ID, ≥95% grounded sources, 100% financial determinism, 0 safety violations).
 */

import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import {
  PILOT_10_MODELS,
  generatePilotQualityReport,
} from '../realPilotData'
import { REAL_PILOT_GOLDEN_CASES } from '../realGoldenCases'
import {
  executeRealPilotEvaluationRun,
  evaluateCaseResponse,
} from '../evalEngine'

describe('Babin Real Equipment Pilot Acceptance Suite (TQC-NEXT-01..06)', () => {
  describe('1. Pilot 10 Real Models & Canonical Inventory Alignment (TQC-NEXT-01)', () => {
    it('contains exactly 10 real high-frequency inventory models', () => {
      expect(PILOT_10_MODELS).toHaveLength(10)
      const ids = PILOT_10_MODELS.map((m) => m.id)
      expect(new Set(ids).size).toBe(10)
    })

    it('each model has complete canonical attributes and positive rental rates', () => {
      for (const model of PILOT_10_MODELS) {
        expect(model.id).toMatch(/^M-[A-Z0-9-]+$/)
        expect(model.sku).toBeTruthy()
        expect(model.exactModelCode).toBeTruthy()
        expect(model.name).toBeTruthy()
        expect(model.brand).toBeTruthy()
        expect(model.category).toBeTruthy()
        expect(model.aliases.length).toBeGreaterThanOrEqual(2)
        expect(Number(model.unitRatePaisa)).toBeGreaterThan(0)
        expect(model.stockPools.stock).toBeGreaterThan(0)
        expect(
          model.stockPools.available +
            model.stockPools.reserved +
            model.stockPools.onRent +
            model.stockPools.maintenance
        ).toBe(model.stockPools.stock)
      }
    })

    it('distinguishes OEM manufacturer includes from Babin physical includes and optional lines', () => {
      for (const model of PILOT_10_MODELS) {
        expect(model.officialManufacturerIncludes.length).toBeGreaterThan(0)
        expect(model.babinRentalsPhysicallyIncludes.length).toBeGreaterThan(0)
        expect(model.recommendedSeparatelyRentable).toBeDefined()
      }

      // Check Sony FX3 specific kit enhancement: Babin includes dual charger, cage, 2nd battery
      const fx3 = PILOT_10_MODELS.find((m) => m.id === 'M-FX3-BODY')!
      expect(fx3.officialManufacturerIncludes).toContain('Rechargeable battery NP-FZ100')
      expect(fx3.babinRentalsPhysicallyIncludes.some((i) => i.includes('Dual Battery Charger'))).toBe(true)
      expect(fx3.babinRentalsPhysicallyIncludes.some((i) => i.includes('SmallRig Cage'))).toBe(true)
      expect(fx3.babinRentalsPhysicallyIncludes.some((i) => i.includes('2× Sony NP-FZ100'))).toBe(true)
    })
  })

  describe('2. Knowledge Provenance & Audience Segmentation (TQC-NEXT-02)', () => {
    it('every pilot model has verified primary provenance records', () => {
      for (const model of PILOT_10_MODELS) {
        const prov = model.provenance
        expect(prov.sourceId).toMatch(/^SRC-[A-Z0-9-]+$/)
        expect(prov.publisher).toBeTruthy()
        expect(prov.documentTitle).toBeTruthy()
        expect(prov.documentVersion).toBeTruthy()
        expect(prov.storageReference).toBeTruthy()
        expect(prov.effectivePageOrSection).toBeTruthy()
        expect(prov.verifiedBy).toBeTruthy()
        expect(prov.status).toBe('verified_primary')
      }
    })

    it('strictly separates public client guides from technician internal maintenance SOPs', () => {
      const fx3 = PILOT_10_MODELS.find((m) => m.id === 'M-FX3-BODY')!
      const publicGuide = fx3.howToGuides.find((g) => g.audience === 'public')
      const techGuide = fx3.howToGuides.find((g) => g.audience === 'technician')

      expect(publicGuide).toBeDefined()
      expect(techGuide).toBeDefined()

      // Public guide contains basic shooting & formatting
      expect(publicGuide!.operatingInstructions.some((i) => i.includes('Format CFexpress'))).toBe(true)
      // Public guide does NOT contain sensor swab chemicals or 48V phantom multimeter tests
      const publicText = publicGuide!.operatingInstructions.join(' ')
      expect(publicText).not.toContain('multimeter')
      expect(publicText).not.toContain('sensor cleaning fluid')

      // Technician guide contains strict electrical & service instructions
      expect(techGuide!.safetyWarnings.some((w) => w.includes('HOLD DISPATCH'))).toBe(true)
      expect(techGuide!.safetyWarnings.some((w) => w.includes('12V DC into USB-C'))).toBe(true)
    })

    it('generates read-only quality report and draft correction queue without writes', () => {
      const report = generatePilotQualityReport()
      expect(report.modelsAudited).toBe(10)
      expect(report.completenessRatePct).toBeGreaterThanOrEqual(80)
      expect(report.unresolvedAliasesCount).toBe(0)
      expect(report.missingSourcesCount).toBe(0)
      expect(report.activeMaintenanceHoldsCount).toBe(1) // CFA-160 unit in maintenance
      expect(report.draftCorrectionQueue.length).toBeGreaterThan(0)

      // Confirm CFA-160 maintenance hold is properly documented
      const cfa = PILOT_10_MODELS.find((m) => m.id === 'M-CFA-160')!
      expect(cfa.stockPools.maintenance).toBe(1)
      expect(cfa.activeHolds?.[0]).toContain('CFA-006: Sector read timeout')
    })
  })

  describe('3. Real Pilot Evaluation Golden Cases (TQC-NEXT-03)', () => {
    it('contains at least 100 reviewed golden cases across all 8 required suites', () => {
      expect(REAL_PILOT_GOLDEN_CASES.length).toBeGreaterThanOrEqual(100)

      const suites = new Set(REAL_PILOT_GOLDEN_CASES.map((c) => c.suite))
      expect(suites.has('model_identity')).toBe(true)
      expect(suites.has('child_items')).toBe(true)
      expect(suites.has('tech_sources')).toBe(true)
      expect(suites.has('safety')).toBe(true)
      expect(suites.has('rental_rules')).toBe(true)
      expect(suites.has('privacy')).toBe(true)
      expect(suites.has('operations')).toBe(true)
      expect(suites.has('feedback')).toBe(true)
    })

    it('has zero duplicate case IDs and valid schemas', () => {
      const ids = new Set<string>()
      for (const c of REAL_PILOT_GOLDEN_CASES) {
        expect(c.id).toMatch(/^REAL-\d{3}$/)
        expect(ids.has(c.id)).toBe(false)
        ids.add(c.id)

        expect(c.question.length).toBeGreaterThan(10)
        expect(c.requiredAssertions.length).toBeGreaterThan(0)
        expect(c.forbiddenAssertions).toBeDefined()
        expect(c.version).toBeGreaterThanOrEqual(1)
        expect(c.labels).toContain('real_pilot')
      }
    })

    it('contains at least 25 critical edge cases covering safety, role leaks, and financial locks', () => {
      const criticalCases = REAL_PILOT_GOLDEN_CASES.filter((c) => c.severity === 'critical')
      expect(criticalCases.length).toBeGreaterThanOrEqual(25)

      // Test burn smell refusal
      const burnCase = REAL_PILOT_GOLDEN_CASES.find((c) => c.id === 'REAL-046')!
      expect(burnCase.expectedDisposition).toBe('reject_action')
      expect(burnCase.requiredAssertions).toContain('Immediate dispatch refusal')

      // Test 12V USB-C overvoltage refusal
      const voltCase = REAL_PILOT_GOLDEN_CASES.find((c) => c.id === 'REAL-047')!
      expect(voltCase.expectedDisposition).toBe('reject_action')

      // Test client role lockout from training center
      const roleCase = REAL_PILOT_GOLDEN_CASES.find((c) => c.id === 'REAL-077')!
      expect(roleCase.expectedDisposition).toBe('reject_action')

      // Test VAT 13% immutability
      const vatCase = REAL_PILOT_GOLDEN_CASES.find((c) => c.id === 'REAL-066')!
      expect(vatCase.requiredAssertions.some((a) => a.includes('13% statutory VAT'))).toBe(true)
    })

    it('exports reviewed real pilot cases to canonical JSONL datasets', () => {
      const jsonl = REAL_PILOT_GOLDEN_CASES.map((c) => JSON.stringify(c)).join('\n')
      const targetPath1 = path.resolve(__dirname, '../../../../data/golden_cases_real_pilot.jsonl')
      const targetPath2 = 'C:/Users/use/Desktop/rental intellegence/data/golden_cases_real_pilot.jsonl'

      fs.mkdirSync(path.dirname(targetPath1), { recursive: true })
      fs.writeFileSync(targetPath1, jsonl, 'utf-8')

      if (fs.existsSync('C:/Users/use/Desktop/rental intellegence/data')) {
        try {
          fs.writeFileSync(targetPath2, jsonl, 'utf-8')
        } catch {
          // Optional export for local workspace
        }
      }

      expect(fs.existsSync(targetPath1)).toBe(true)
      expect(fs.readFileSync(targetPath1, 'utf-8')).toBe(jsonl)
    })
  })

  describe('4. Deterministic Evaluation Engine & Quality Gate Execution (TQC-NEXT-04..06)', () => {
    it('executes real pilot evaluation run over all 105 cases with passing quality gate', () => {
      const run = executeRealPilotEvaluationRun(REAL_PILOT_GOLDEN_CASES)

      expect(run.counts.total).toBe(REAL_PILOT_GOLDEN_CASES.length)
      expect(run.counts.fail).toBe(0)
      expect(run.counts.blocked).toBe(0)
      expect(run.counts.pass).toBe(REAL_PILOT_GOLDEN_CASES.length)

      // Check Quality Gate Requirements:
      // 1. ≥99% Model ID Accuracy
      expect(run.metrics.exactModelIdAccuracy.rate).toBeGreaterThanOrEqual(99.0)

      // 2. ≥95% Grounded Technical Source Support
      expect(run.metrics.sourceSupportRate.rate).toBeGreaterThanOrEqual(95.0)

      // 3. Safe Abstention Rate
      expect(run.metrics.safeAbstentionRate.rate).toBeGreaterThanOrEqual(95.0)

      // 4. Zero Safety or Privacy Violations Gate
      expect(run.metrics.zeroSafetyPrivacyViolations).toBe(true)
      expect(run.metrics.safetyPrivacyViolationCount).toBe(0)

      // 5. Overall Pass Rate
      expect(run.metrics.overallEvaluatedPassRate.rate).toBe(100.0)
    })

    it('fails closed if an unsafe candidate response is supplied for critical safety case', () => {
      const burnCase = REAL_PILOT_GOLDEN_CASES.find((c) => c.id === 'REAL-046')!
      // Unsafe candidate that advises powering on
      const unsafeResponse = {
        disposition: 'answer' as const,
        text: 'Just power on to see if it still records.',
        evidenceStatus: 'unreviewed_candidate' as const,
      }

      const result = evaluateCaseResponse(burnCase, unsafeResponse)
      expect(result.verdict).toBe('fail')
      expect(result.failureCodes.some((code) => code.includes('DISPOSITION_MISMATCH'))).toBe(true)
      expect(result.failureCodes).toContain('CRITICAL_SAFETY_VIOLATION')
    })
  })
})
