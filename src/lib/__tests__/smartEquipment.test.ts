import { describe, expect, it } from 'vitest'
import {
  findModelMatches,
  extractModelTokens,
  areTokensStrictMatch,
  getSmartEquipmentDraft,
  type CatalogueCandidate,
} from '../smartEquipment'
import { rupees } from '../money'

describe('Smart Equipment Intelligence Engine (T1)', () => {
  const mockCatalogue: CatalogueCandidate[] = [
    {
      id: 'M-FX3-BODY',
      name: 'Sony FX3 Camera Body',
      sku: 'CAM-SONY-FX3-BODY',
      brand: 'Sony',
      category: 'Camera',
      stock: 4,
      available: 3,
      aliases: ['fx3', 'ilme-fx3', 'sony fx3'],
    },
    {
      id: 'M-FX30-BODY',
      name: 'Sony FX30 Cinema Line Camera',
      sku: 'CAM-SONY-FX30-BODY',
      brand: 'Sony',
      category: 'Camera',
      stock: 2,
      available: 2,
      aliases: ['fx30', 'ilme-fx30', 'sony fx30'],
    },
    {
      id: 'M-A7S3-BODY',
      name: 'Sony A7S III Camera Body',
      sku: 'CAM-SONY-A7S3',
      brand: 'Sony',
      category: 'Camera',
      stock: 3,
      available: 2,
      aliases: ['a7s3', 'a7s iii', 'ilce-7sm3'],
    },
    {
      id: 'M-600X',
      name: 'Aputure LS 600x Pro',
      sku: 'LGT-AP-600X',
      brand: 'Aputure',
      category: 'Lighting',
      stock: 2,
      available: 2,
      aliases: ['600x', 'aputure 600x', 'ls 600x'],
    },
  ]

  describe('Acceptance Criteria 1 & 2: Model Deduplication & Strict Token Boundaries', () => {
    it('finds existing Sony FX3 before fuzzy external matches', () => {
      const results = findModelMatches('Sony FX3', undefined, mockCatalogue)
      expect(results.length).toBeGreaterThan(0)
      const top = results[0]!
      expect(top.candidate.id).toBe('M-FX3-BODY')
      expect(top.candidate.sku).toBe('CAM-SONY-FX3-BODY')
      expect(top.isExactOrPrimary).toBe(true)
      expect(top.warningText).toContain('Sony FX3')
    })

    it('finds Sony FX3 when typing alias "ILME-FX3"', () => {
      const results = findModelMatches('ILME-FX3', undefined, mockCatalogue)
      expect(results.length).toBeGreaterThan(0)
      expect(results[0]!.candidate.id).toBe('M-FX3-BODY')
    })

    it('strictly separates FX3 and FX30 — never merges or overwrites', () => {
      // Querying specifically for FX3 must NOT return FX30 as top match
      const fx3Results = findModelMatches('Sony FX3', undefined, mockCatalogue)
      expect(fx3Results.some((r) => r.candidate.id === 'M-FX30-BODY')).toBe(false)

      // Querying specifically for FX30 must match FX30 and NOT FX3
      const fx30Results = findModelMatches('Sony FX30', undefined, mockCatalogue)
      expect(fx30Results.length).toBeGreaterThan(0)
      expect(fx30Results[0]!.candidate.id).toBe('M-FX30-BODY')
      expect(fx30Results.some((r) => r.candidate.id === 'M-FX3-BODY')).toBe(false)
    })

    it('enforces token boundary safety on model tokens', () => {
      expect(areTokensStrictMatch('fx3', 'fx3')).toBe(true)
      expect(areTokensStrictMatch('fx-3', 'fx3')).toBe(true)
      expect(areTokensStrictMatch('fx3', 'fx30')).toBe(false)
      expect(areTokensStrictMatch('a7s3', 'a7s4')).toBe(false)
      expect(areTokensStrictMatch('600x', '600d')).toBe(false)
    })

    it('extracts discrete normalized model tokens', () => {
      expect(extractModelTokens('Sony FX3 Body')).toEqual(['sony', 'fx3', 'body'])
      expect(extractModelTokens('Aputure 600x Pro')).toEqual(['aputure', '600x', 'pro'])
      expect(extractModelTokens('• २ Sony FX30')).toEqual(['2', 'sony', 'fx30'])
    })
  })

  describe('Acceptance Criteria 4, 5 & 8: Smart Draft Proposals, Provenance & Money Masking', () => {
    it('proposes OEM documented specs for verified gear without altering database', () => {
      const draft = getSmartEquipmentDraft('Sony FX3', 'ILME-FX3', { canViewMoney: true })
      expect(draft).not.toBeNull()
      expect(draft!.isExistingCatalogueItem).toBe(true)
      expect(draft!.suggestions.name?.proposedValue).toContain('Sony FX3')
      expect(draft!.suggestions.name?.provenance.badge).toBe('oem_documented')
      expect(draft!.suggestions.mount?.proposedValue).toBe('Sony E-mount')
      expect(draft!.suggestions.powerRequirement?.proposedValue).toContain('NP-FZ100')
      expect(draft!.suggestions.weightGrams?.proposedValue).toBe(715)

      // Mandatory included accessories
      expect(draft!.accessories.some((a) => a.name.includes('XLR Top Handle'))).toBe(true)

      // Operational How-To guidance
      expect(draft!.howTo.setupSteps.length).toBeGreaterThan(0)
      expect(draft!.howTo.cautions.length).toBeGreaterThan(0)
      expect(draft!.howTo.preRentalChecklist.length).toBeGreaterThan(0)
    })

    it('hides all financial suggestions when canViewMoney is false (Law 6 / Warehouse role)', () => {
      const blindDraft = getSmartEquipmentDraft('Sony FX3', 'ILME-FX3', { canViewMoney: false })
      expect(blindDraft).not.toBeNull()
      // Zero financial fields exposed
      expect(blindDraft!.suggestions.dailyRatePaisa).toBeUndefined()
      expect(blindDraft!.suggestions.replacementValuePaisa).toBeUndefined()

      // Allowed fields are still present
      expect(blindDraft!.suggestions.brand?.proposedValue).toBe('Sony')
      expect(blindDraft!.suggestions.category?.proposedValue).toBe('Camera')
    })

    it('populates financial suggestions when canViewMoney is true (Owner/Manager role)', () => {
      const privilegedDraft = getSmartEquipmentDraft('Sony FX3', 'ILME-FX3', { canViewMoney: true })
      expect(privilegedDraft).not.toBeNull()
      expect(privilegedDraft!.suggestions.dailyRatePaisa?.proposedValue).toEqual(rupees(8000))
      expect(privilegedDraft!.suggestions.replacementValuePaisa?.proposedValue).toEqual(rupees(480000))
    })

    it('flags unverified or novel equipment as AI Draft — Needs Review (no false "verified")', () => {
      const novelDraft = getSmartEquipmentDraft('Custom Weird Lens Prototype', undefined, { canViewMoney: false })
      expect(novelDraft).not.toBeNull()
      expect(novelDraft!.suggestions.name?.provenance.badge).toBe('ai_draft')
      expect(novelDraft!.suggestions.name?.provenance.label).toContain('Needs Review')
      expect(novelDraft!.isExistingCatalogueItem).toBe(false)
    })
  })
})
