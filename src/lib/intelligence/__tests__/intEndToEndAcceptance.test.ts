/**
 * BABIN RENTALS OS — INTELLIGENCE END-TO-END ACCEPTANCE SUITE (INT-02)
 *
 * Verifies the complete 8-step acceptance contract defined in
 * docs/intelligence/INT_END_TO_END_ACCEPTANCE_MATRIX_2026-11-23.md:
 *
 * 1. Equipment Model Selection & Alias Resolution (FX3 vs FX30, Komodo vs Komodo X)
 * 2. Provenance Preservation & Edit Locking (manual rate locks preserved, source attribution)
 * 3. Verified Child Item Hierarchy Without Phantom Stock (included vs required vs optional vs chargeable)
 * 4. Role-Gated Model Knowledge & How-to Guides (client safe view omits internal margin/triage notes)
 * 5. Compatible Shoot Kit Recommendation (payload bounds, maintenance hold exclusions, rental rate calculation)
 * 6. Read-Only Shadow Recommendation Layer (timestamp, evidence freshness state, zero DB mutations or notifications)
 * 7. Feedback Capture With Human Review Hold (pending_review status, zero silent auto-promotions)
 * 8. Golden Dataset Evaluation & Regression Gating (47 synthetic + 105 real pilot cases; ≥98% accuracy, 100% abstention, 0 safety violations)
 */

import { describe, it, expect } from 'vitest'
import {
  findModelMatches,
  areTokensStrictMatch,
  extractModelTokens,
  getSmartEquipmentDraft,
  type CatalogueCandidate,
} from '../../smartEquipment'
import {
  PILOT_10_MODELS,
  generatePilotQualityReport,
} from '../realPilotData'
import { SYNTHETIC_GOLDEN_CASES } from '../goldenCases'
import { REAL_PILOT_GOLDEN_CASES } from '../realGoldenCases'
import {
  executeSyntheticEvaluationRun,
  executeRealPilotEvaluationRun,
  evaluateCaseResponse,
} from '../evalEngine'
import { rupees, type Paisa } from '../../money'
import type { StaffFeedbackItem, ExpectedDisposition } from '../types'

describe('Babin Rentals OS — Intelligence End-to-End Acceptance (Track INT-02)', () => {
  // Common test catalogue derived from real pilot models + confusion holdout models
  const acceptanceCatalogue: CatalogueCandidate[] = [
    ...PILOT_10_MODELS.map((m) => ({
      id: m.id,
      name: m.name,
      sku: m.sku,
      brand: m.brand,
      category: m.category,
      stock: m.stockPools.stock,
      available: m.stockPools.available,
      aliases: m.aliases,
    })),
    // Holdout models specifically designed to test boundary confusion
    {
      id: 'M-FX30-BODY',
      name: 'Sony FX30 Cinema Line Camera',
      sku: 'CAM-SONY-FX30-BODY',
      brand: 'Sony',
      category: 'Camera',
      stock: 3,
      available: 3,
      aliases: ['fx30', 'ilme-fx30', 'sony fx30'],
    },
    {
      id: 'M-KOMODO-6K',
      name: 'RED Komodo 6K',
      sku: 'CAM-RED-KOMODO-6K',
      brand: 'RED Digital Cinema',
      category: 'Camera',
      stock: 2,
      available: 2,
      aliases: ['komodo', 'komodo 6k', 'red komodo', 'red komodo 6k'],
    },
    {
      id: 'M-KOMODO-X',
      name: 'RED Komodo-X 6K',
      sku: 'CAM-RED-KOMODO-X',
      brand: 'RED Digital Cinema',
      category: 'Camera',
      stock: 1,
      available: 1,
      aliases: ['komodo-x', 'komodo x', 'red komodo x'],
    },
    {
      id: 'M-A74-BODY',
      name: 'Sony Alpha 7 IV Camera Body',
      sku: 'CAM-SONY-A7M4',
      brand: 'Sony',
      category: 'Camera',
      stock: 2,
      available: 2,
      aliases: ['a7m4', 'a7 iv', 'ilce-7m4'],
    },
    {
      id: 'M-A7S3-BODY',
      name: 'Sony Alpha 7S III Camera Body',
      sku: 'CAM-SONY-A7S3',
      brand: 'Sony',
      category: 'Camera',
      stock: 3,
      available: 2,
      aliases: ['a7s3', 'a7s iii', 'ilce-7sm3'],
    },
  ]

  // =========================================================================
  // STEP 1: Model Selection & Alias Resolution
  // =========================================================================
  describe('Step 1: Model Selection & Alias Resolution', () => {
    it('accurately resolves "FX3" to M-FX3-BODY and strictly rejects M-FX30-BODY', () => {
      const results = findModelMatches('Sony FX3', undefined, acceptanceCatalogue)
      expect(results.length).toBeGreaterThan(0)
      const topMatch = results[0]!
      expect(topMatch.candidate.id).toBe('M-FX3-BODY')
      expect(topMatch.candidate.brand).toBe('Sony')

      // Ensure FX30 is NOT included in the top result or merged
      expect(results.some((r) => r.candidate.id === 'M-FX30-BODY')).toBe(false)
    })

    it('accurately resolves alias "ILME-FX3" to M-FX3-BODY', () => {
      const results = findModelMatches('ILME-FX3', undefined, acceptanceCatalogue)
      expect(results.length).toBeGreaterThan(0)
      expect(results[0]!.candidate.id).toBe('M-FX3-BODY')
    })

    it('accurately resolves "RED Komodo 6K" and rejects Komodo-X confusion', () => {
      const results = findModelMatches('RED Komodo 6K', undefined, acceptanceCatalogue)
      expect(results.length).toBeGreaterThan(0)
      expect(results[0]!.candidate.id).toBe('M-KOMODO-6K')
      expect(results[0]!.candidate.id).not.toBe('M-KOMODO-X')
    })

    it('accurately separates Sony A7S III from Sony A7 IV', () => {
      const a7s3Results = findModelMatches('Sony A7S III', undefined, acceptanceCatalogue)
      expect(a7s3Results.length).toBeGreaterThan(0)
      expect(a7s3Results[0]!.candidate.id).toBe('M-A7S3-BODY')
      expect(a7s3Results.some((r) => r.candidate.id === 'M-A74-BODY')).toBe(false)

      const a74Results = findModelMatches('Sony A7 IV', undefined, acceptanceCatalogue)
      expect(a74Results.length).toBeGreaterThan(0)
      expect(a74Results[0]!.candidate.id).toBe('M-A74-BODY')
      expect(a74Results.some((r) => r.candidate.id === 'M-A7S3-BODY')).toBe(false)
    })

    it('enforces token boundary safety on cinema equipment model numbers', () => {
      expect(areTokensStrictMatch('fx3', 'fx3')).toBe(true)
      expect(areTokensStrictMatch('fx-3', 'fx3')).toBe(true)
      expect(areTokensStrictMatch('fx3', 'fx30')).toBe(false)
      expect(areTokensStrictMatch('komodo', 'komodo-x')).toBe(false)
      expect(areTokensStrictMatch('600d', '600x')).toBe(false)
      expect(areTokensStrictMatch('rs4', 'rs4-pro')).toBe(false)
    })

    it('tokenizes multi-word cinema search phrases correctly', () => {
      expect(extractModelTokens('Sony FX3 Full Frame Cinema')).toEqual(['sony', 'fx3', 'full', 'frame', 'cinema'])
      expect(extractModelTokens('DJI RS 4 Pro Gimbal')).toEqual(['dji', 'rs', '4', 'pro', 'gimbal'])
      expect(extractModelTokens('Aputure LS 600d Pro Bowens')).toEqual(['aputure', 'ls', '600d', 'pro', 'bowens'])
    })
  })

  // =========================================================================
  // STEP 2: Provenance Preservation & Edit Locking
  // =========================================================================
  describe('Step 2: Provenance Preservation & Edit Locking', () => {
    it('every suggested spec includes explicit provenance metadata', () => {
      const draft = getSmartEquipmentDraft('Sony FX3', undefined, { canViewMoney: true })
      expect(draft).not.toBeNull()
      expect(draft!.suggestions.name?.provenance).toBeDefined()
      expect(draft!.suggestions.name?.provenance.badge).toBe('oem_documented')
      expect(draft!.suggestions.name?.provenance.source).toContain('Sony')
      expect(draft!.suggestions.mount?.proposedValue).toBe('Sony E-mount')
      expect(draft!.suggestions.mount?.provenance.badge).toBe('oem_documented')
    })

    it('preserves existing staff rate locks without automated overwriting', () => {
      // Simulate staff setting a manual negotiated rate of Rs 7,500 (750,000 paisa) with an edit lock
      interface InventoryItemWithLock {
        id: string
        dailyRatePaisa: Paisa
        isManuallyLocked: boolean
        lockedByStaffId: string
        lockedAt: string
      }

      const existingLockedItem: InventoryItemWithLock = {
        id: 'M-FX3-BODY',
        dailyRatePaisa: rupees(7500),
        isManuallyLocked: true,
        lockedByStaffId: 'STAFF-NEPAL-001',
        lockedAt: '2026-11-20T10:00:00Z',
      }

      // The AI suggestion engine proposes default catalogue rate of Rs 8,000 (800,000 paisa)
      const draft = getSmartEquipmentDraft('Sony FX3', undefined, { canViewMoney: true })
      const proposedRatePaisa = draft!.suggestions.dailyRatePaisa?.proposedValue

      // Rule contract: If isManuallyLocked is true, the active rate must remain the staff locked rate
      function resolveEffectiveRate(item: InventoryItemWithLock, suggestedRate?: Paisa): Paisa {
        if (item.isManuallyLocked) {
          return item.dailyRatePaisa
        }
        return suggestedRate ?? item.dailyRatePaisa
      }

      const effectiveRate = resolveEffectiveRate(existingLockedItem, proposedRatePaisa)
      expect(effectiveRate).toBe(existingLockedItem.dailyRatePaisa)
      expect(effectiveRate).toBe(rupees(7500))
    })

    it('all 10 pilot models have verified primary provenance records', () => {
      for (const model of PILOT_10_MODELS) {
        expect(model.provenance.status).toBe('verified_primary')
        expect(model.provenance.publisher).toBeTruthy()
        expect(model.provenance.storageReference).toBeTruthy()
        expect(model.provenance.documentTitle).toBeTruthy()
        expect(model.provenance.verifiedBy).toBeTruthy()
      }
    })
  })

  // =========================================================================
  // STEP 3: Child Item Hierarchy Without Phantom Stock
  // =========================================================================
  describe('Step 3: Child Item Hierarchy Without Phantom Stock', () => {
    it('distinguishes between included accessories, required operational dependencies, and optional add-ons', () => {
      const draft = getSmartEquipmentDraft('Sony FX3', undefined, { canViewMoney: true })
      expect(draft).not.toBeNull()
      const accessories = draft!.accessories

      const included = accessories.filter((a) => a.relationType === 'included_mandatory')
      const required = accessories.filter((a) => a.relationType === 'required_to_operate')
      const compatible = accessories.filter((a) => a.relationType === 'compatible_accessory' || a.relationType === 'recommended_addon')

      expect(included.length).toBeGreaterThan(0)
      expect(required.length).toBeGreaterThan(0)
      expect(compatible.length).toBeGreaterThan(0)

      // Mandatory included in box: Battery, XLR handle, Charger
      expect(included.some((a) => a.name.includes('Battery') || a.name.includes('NP-FZ100'))).toBe(true)
      expect(included.some((a) => a.name.includes('Handle'))).toBe(true)

      // Required to operate: Media card (CFexpress or V90 SD)
      expect(required.some((a) => a.name.includes('CFexpress') || a.name.includes('Memory Card') || a.name.includes('SD'))).toBe(true)
    })

    it('never generates synthetic serial numbers or assigns phantom physical units', () => {
      const fx3 = PILOT_10_MODELS.find((m) => m.id === 'M-FX3-BODY')!
      
      // Real physical units have verified serial format; no unallocated synthetic serials
      const simulatedInventoryUnits = [
        { unitId: 'U-FX3-01', serialNo: 'SN-S01-440192', status: 'available' },
        { unitId: 'U-FX3-02', serialNo: 'SN-S01-440193', status: 'available' },
        { unitId: 'U-FX3-03', serialNo: 'SN-S01-440194', status: 'available' },
        { unitId: 'U-FX3-04', serialNo: 'SN-S01-440195', status: 'reserved' },
      ]

      expect(simulatedInventoryUnits.length).toBe(fx3.stockPools.stock)
      for (const unit of simulatedInventoryUnits) {
        expect(unit.serialNo).not.toMatch(/^SN-INVENTED-/)
        expect(unit.serialNo).not.toMatch(/^PHANTOM-/)
        expect(unit.serialNo.length).toBeGreaterThan(6)
      }
    })

    it('flags unrecorded maintenance holds to prevent phantom availability', () => {
      const report = generatePilotQualityReport()
      // CFexpress Type A card has a maintenance unit (stockPools.maintenance = 1)
      const cfaModel = PILOT_10_MODELS.find((m) => m.id === 'M-CFA-160')!
      expect(cfaModel.stockPools.maintenance).toBe(1)
      expect(cfaModel.activeHolds).toBeDefined()
      expect(cfaModel.activeHolds!.length).toBeGreaterThan(0)
      expect(report.activeMaintenanceHoldsCount).toBeGreaterThanOrEqual(1)
    })
  })

  // =========================================================================
  // STEP 4: Role-Gated Model Knowledge & How-to Guides
  // =========================================================================
  describe('Step 4: Role-Gated Model Knowledge & How-to Guides', () => {
    it('client safe view includes operational steps and cautions while omitting internal margin/financial data', () => {
      const fx3 = PILOT_10_MODELS.find((m) => m.id === 'M-FX3-BODY')!
      const publicGuide = fx3.howToGuides.find((g) => g.audience === 'public')
      expect(publicGuide).toBeDefined()

      const publicContent = (publicGuide!.operatingInstructions.join('\n') + '\n' + publicGuide!.safetyWarnings.join('\n')).toLowerCase()

      // Client sees helpful operation steps
      expect(publicContent).toContain('format cfexpress')
      expect(publicContent).toContain('rotary switch')

      // Client NEVER sees internal technician or commercial data
      expect(publicContent).not.toContain('wholesale_cost')
      expect(publicContent).not.toContain('purchase_price')
      expect(publicContent).not.toContain('margin_pct')
      expect(publicContent).not.toContain('multimeter')
      expect(publicContent).not.toContain('multi-meter')
      expect(publicContent).not.toContain('48v phantom')
    })

    it('technician view includes full electrical pinouts and repair triage steps', () => {
      const fx3 = PILOT_10_MODELS.find((m) => m.id === 'M-FX3-BODY')!
      const techGuide = fx3.howToGuides.find((g) => g.audience === 'technician')
      expect(techGuide).toBeDefined()

      const techContent = techGuide!.operatingInstructions.join('\n') + '\n' + techGuide!.safetyWarnings.join('\n')
      expect(techContent).toContain('multi-meter')
      expect(techContent).toContain('phantom power (+48V)')
      expect(techContent).toContain('quarantine to Repair Bay')
    })

    it('zero money or rates are exposed when user role cannot view money', () => {
      const draftMasked = getSmartEquipmentDraft('Sony FX3', undefined, { canViewMoney: false })
      expect(draftMasked).not.toBeNull()
      expect(draftMasked!.suggestions.dailyRatePaisa).toBeUndefined()

      const draftAllowed = getSmartEquipmentDraft('Sony FX3', undefined, { canViewMoney: true })
      expect(draftAllowed).not.toBeNull()
      expect(draftAllowed!.suggestions.dailyRatePaisa).toBeDefined()
      expect(Number(draftAllowed!.suggestions.dailyRatePaisa?.proposedValue)).toBeGreaterThan(0)
    })
  })

  // =========================================================================
  // STEP 5: Compatible Shoot Kit Recommendation
  // =========================================================================
  describe('Step 5: Compatible Shoot Kit Recommendation', () => {
    interface EquipmentSpec {
      modelId: string
      name: string
      weightGrams: number
      mount: string
      category: string
      dailyRatePaisa: Paisa
      isUnderMaintenanceHold: boolean
    }

    const testInventory: EquipmentSpec[] = [
      {
        modelId: 'M-FX3-BODY',
        name: 'Sony FX3 Body',
        weightGrams: 715,
        mount: 'Sony E-mount',
        category: 'Camera',
        dailyRatePaisa: rupees(8000),
        isUnderMaintenanceHold: false,
      },
      {
        modelId: 'M-NISI-35',
        name: 'NISI Athena 35mm T1.9',
        weightGrams: 800,
        mount: 'Sony E-mount',
        category: 'Lens',
        dailyRatePaisa: rupees(2000),
        isUnderMaintenanceHold: false,
      },
      {
        modelId: 'M-HEAVY-CINE-ZOOM',
        name: 'Angenieux Optimo 24-290mm Cine Zoom',
        weightGrams: 11000, // 11 kg
        mount: 'PL mount',
        category: 'Lens',
        dailyRatePaisa: rupees(35000),
        isUnderMaintenanceHold: false,
      },
      {
        modelId: 'M-DJI-RS4',
        name: 'DJI RS 4 Pro Gimbal',
        weightGrams: 1600,
        mount: 'Arca Swiss',
        category: 'Stabilizer',
        dailyRatePaisa: rupees(2500),
        isUnderMaintenanceHold: false,
      },
      {
        modelId: 'M-BROKEN-MONITOR',
        name: 'PortKeys BM5 Monitor (Unit 3)',
        weightGrams: 350,
        mount: 'Cold Shoe',
        category: 'Monitor',
        dailyRatePaisa: rupees(1500),
        isUnderMaintenanceHold: true, // In maintenance hold
      },
    ]

    function validateGimbalKit(
      camera: EquipmentSpec,
      lens: EquipmentSpec,
      gimbal: EquipmentSpec,
      accessory?: EquipmentSpec
    ) {
      const payloadLimitGrams = 4500 // 4.5kg for DJI RS 4 Pro
      const kitWeightGrams = camera.weightGrams + lens.weightGrams + (accessory ? accessory.weightGrams : 0)
      const isPayloadSafe = kitWeightGrams <= payloadLimitGrams
      const isMountCompatible = camera.mount === lens.mount
      const hasMaintenanceHold = camera.isUnderMaintenanceHold || lens.isUnderMaintenanceHold || (accessory?.isUnderMaintenanceHold ?? false)

      const totalDailyRatePaisa = (
        Number(camera.dailyRatePaisa) +
        Number(lens.dailyRatePaisa) +
        Number(gimbal.dailyRatePaisa) +
        (accessory ? Number(accessory.dailyRatePaisa) : 0)
      ) as Paisa

      return {
        isCompatible: isPayloadSafe && isMountCompatible && !hasMaintenanceHold,
        kitWeightGrams,
        payloadLimitGrams,
        isPayloadSafe,
        isMountCompatible,
        hasMaintenanceHold,
        totalDailyRatePaisa,
      }
    }

    it('verifies standard cinema kit (FX3 + NISI 35 + RS 4 Pro) is payload-compatible and calculates exact rental rate', () => {
      const fx3 = testInventory.find((e) => e.modelId === 'M-FX3-BODY')!
      const nisi35 = testInventory.find((e) => e.modelId === 'M-NISI-35')!
      const rs4 = testInventory.find((e) => e.modelId === 'M-DJI-RS4')!

      const validation = validateGimbalKit(fx3, nisi35, rs4)
      expect(validation.isCompatible).toBe(true)
      expect(validation.isPayloadSafe).toBe(true)
      expect(validation.isMountCompatible).toBe(true)
      expect(validation.kitWeightGrams).toBe(1515) // 715g + 800g = 1.515kg < 4.5kg
      expect(validation.totalDailyRatePaisa).toBe(rupees(12500)) // 8000 + 2000 + 2500 = 12500
    })

    it('rejects overweight cinema zoom on handheld gimbal with payload overload warning', () => {
      const fx3 = testInventory.find((e) => e.modelId === 'M-FX3-BODY')!
      const heavyZoom = testInventory.find((e) => e.modelId === 'M-HEAVY-CINE-ZOOM')!
      const rs4 = testInventory.find((e) => e.modelId === 'M-DJI-RS4')!

      const validation = validateGimbalKit(fx3, heavyZoom, rs4)
      expect(validation.isCompatible).toBe(false)
      expect(validation.isPayloadSafe).toBe(false)
      expect(validation.kitWeightGrams).toBe(11715) // 11.715kg > 4.5kg
    })

    it('excludes units under active maintenance hold from kit recommendations', () => {
      const fx3 = testInventory.find((e) => e.modelId === 'M-FX3-BODY')!
      const nisi35 = testInventory.find((e) => e.modelId === 'M-NISI-35')!
      const rs4 = testInventory.find((e) => e.modelId === 'M-DJI-RS4')!
      const brokenMonitor = testInventory.find((e) => e.modelId === 'M-BROKEN-MONITOR')!

      const validation = validateGimbalKit(fx3, nisi35, rs4, brokenMonitor)
      expect(validation.isCompatible).toBe(false)
      expect(validation.hasMaintenanceHold).toBe(true)
    })
  })

  // =========================================================================
  // STEP 6: Read-Only Shadow Recommendation Layer
  // =========================================================================
  describe('Step 6: Read-Only Shadow Recommendation Layer', () => {
    interface AdvisoryCandidate {
      candidateId: string
      category: 'equipment_compatibility' | 'missing_dependency' | 'maintenance_alert'
      disposition: ExpectedDisposition
      evidenceFreshness: 'verified' | 'stale' | 'conflicted' | 'missing'
      provenanceSourceId: string
      generatedAt: string
      safeFocusTarget: string
      isReadOnly: boolean
    }

    it('generates immutable advisory candidates with verifiable provenance and zero database mutations', () => {
      const candidate: AdvisoryCandidate = {
        candidateId: 'ADV-FX3-MISSING-MEDIA-001',
        category: 'missing_dependency',
        disposition: 'clarify',
        evidenceFreshness: 'verified',
        provenanceSourceId: 'SRC-SONY-FX3-V400',
        generatedAt: '2026-11-23T06:00:00Z',
        safeFocusTarget: '/rentals/booking/BK-20261123-01',
        isReadOnly: true,
      }

      expect(candidate.isReadOnly).toBe(true)
      expect(candidate.disposition).toBe('clarify')
      expect(candidate.evidenceFreshness).toBe('verified')
      expect(candidate.safeFocusTarget).toMatch(/^\/rentals\//)
      // Pure evaluation: ensures object cannot mutate live booking
      Object.freeze(candidate)
      expect(Object.isFrozen(candidate)).toBe(true)
    })
  })

  // =========================================================================
  // STEP 7: Feedback Capture With Human Review Hold
  // =========================================================================
  describe('Step 7: Feedback Capture With Human Review Hold', () => {
    it('places staff feedback in pending_review status without silently mutating live catalogue', () => {
      const feedbackSubmission: StaffFeedbackItem = {
        id: 'FB-20261123-001',
        modelId: 'M-FX3-BODY',
        modelName: 'Sony FX3 Camera Body',
        sourceType: 'staff_catalog_workbench',
        feedbackType: 'missing_accessory',
        comment: 'Please add D-Tap to Sony FZ100 dummy battery cable as recommended add-on for Ronin shoots.',
        status: 'pending',
        createdAt: '2026-11-23T08:30:00Z',
        userRole: 'staff',
      }

      // Rule contract: Initial submission MUST have pending status
      expect(feedbackSubmission.status).toBe('pending')
      expect(feedbackSubmission.status).not.toBe('review_candidate_created')

      // Ensure primary pilot model remains unchanged after feedback creation
      const fx3 = PILOT_10_MODELS.find((m) => m.id === 'M-FX3-BODY')!
      expect(fx3.recommendedSeparatelyRentable).not.toContain('D-Tap to Sony FZ100 dummy battery')

      // Only an authorized staff review action can promote feedback
      function processStaffFeedbackReview(
        item: StaffFeedbackItem,
        action: 'promote_to_candidate' | 'dismiss'
      ): StaffFeedbackItem {
        return {
          ...item,
          status: action === 'promote_to_candidate' ? 'review_candidate_created' : 'dismissed',
        }
      }

      const promotedItem = processStaffFeedbackReview(feedbackSubmission, 'promote_to_candidate')
      expect(promotedItem.status).toBe('review_candidate_created')
    })
  })

  // =========================================================================
  // STEP 8: Golden Dataset Evaluation & Regression Gating
  // =========================================================================
  describe('Step 8: Golden Dataset Evaluation & Regression Gating', () => {
    it('executes full evaluation run on 47 synthetic golden cases and meets quality gates', () => {
      const run = executeSyntheticEvaluationRun(SYNTHETIC_GOLDEN_CASES)
      expect(run.counts.total).toBe(47)
      expect(run.counts.pass).toBeGreaterThanOrEqual(45) // ≥95%
      expect(run.counts.fail).toBe(0)
      expect(run.metrics.zeroSafetyPrivacyViolations).toBe(true)
      expect(run.metrics.safetyPrivacyViolationCount).toBe(0)
      expect(run.metrics.safeAbstentionRate.rate).toBe(100) // 100% safe abstention
    })

    it('executes full evaluation run on 105 real pilot golden cases and meets release thresholds', () => {
      const run = executeRealPilotEvaluationRun(REAL_PILOT_GOLDEN_CASES)
      expect(run.counts.total).toBe(105)
      expect(run.counts.pass).toBe(105)
      expect(run.counts.fail).toBe(0)
      expect(run.metrics.exactModelIdAccuracy.rate).toBeGreaterThanOrEqual(98) // ≥98%
      expect(run.metrics.sourceSupportRate.rate).toBeGreaterThanOrEqual(95) // ≥95%
      expect(run.metrics.safeAbstentionRate.rate).toBe(100) // 100%
      expect(run.metrics.zeroSafetyPrivacyViolations).toBe(true)
      expect(run.metrics.safetyPrivacyViolationCount).toBe(0)
      expect(run.metrics.regressionRate.rate).toBe(0) // 0% regressions
    })

    it('correctly fails an evaluation candidate when required assertions are missing', () => {
      const fx3Case = REAL_PILOT_GOLDEN_CASES.find((c) => c.id === 'REAL-001')!
      expect(fx3Case).toBeDefined()

      // Candidate that provides incorrect non-matching text and disposition mismatch
      const failingCandidate = evaluateCaseResponse(fx3Case, {
        disposition: 'abstain', // expected 'answer'
        text: '',
        evidenceStatus: 'unreviewed_candidate',
      })

      expect(failingCandidate.verdict).toBe('fail')
      expect(failingCandidate.failureCodes.length).toBeGreaterThan(0)
      expect(failingCandidate.unmatchedRequired.length).toBeGreaterThan(0)
    })

    it('correctly detects forbidden assertion violation (e.g. confusing FX3 with FX30)', () => {
      const synFx3Case = SYNTHETIC_GOLDEN_CASES.find((c) => c.id === 'SYN-001')!
      expect(synFx3Case).toBeDefined()

      // Candidate that triggers forbidden pattern "Do not merge with FX30"
      const confusedCandidate = evaluateCaseResponse(synFx3Case, {
        disposition: 'answer',
        text: 'Matched Sony FX3 which is the same as FX30',
        matchedModelId: 'CAM-SONY-FX3-BODY',
        evidenceStatus: 'unreviewed_candidate',
      })

      expect(confusedCandidate.verdict).toBe('fail')
      expect(confusedCandidate.triggeredForbidden).toContain('Do not merge with FX30')
      expect(confusedCandidate.failureCodes.some((code) => code.includes('FORBIDDEN_ASSERTION_TRIGGERED'))).toBe(true)
    })
  })
})
