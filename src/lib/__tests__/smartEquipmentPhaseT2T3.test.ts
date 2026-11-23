import { describe, it, expect } from 'vitest'
import {
  resolveAccessoryCatalogueMatch,
  checkChildRelationshipCycle,
  calculateKitInclusions,
  projectHowToGuideForRole,
  getSmartEquipmentDraft,
  type SmartAccessorySuggestion,
  type SmartHowToGuide,
} from '../smartEquipment'
import { rupees } from '../money'

describe('SmartEquipment Phase T2 — Child Items Hierarchy & Real Inventory Linking', () => {
  it('resolves known accessories to canonical catalogue models with available stock', () => {
    // Test known Sony FX3 accessories
    const handleMatch = resolveAccessoryCatalogueMatch('Sony XLR Top Handle Unit', 'CAM-ACC-XLR-H')
    expect(handleMatch.isMatchedInCatalogue).toBe(true)
    expect(handleMatch.id).toBe('M-FX3-HANDLE')
    expect(handleMatch.stockAvailable).toBeGreaterThan(0)
    expect(handleMatch.sku).toBe('ACC-TH-001')

    const batteryMatch = resolveAccessoryCatalogueMatch('Sony NP-FZ100 Rechargeable Battery', 'ACC-BATT-FZ100')
    expect(batteryMatch.isMatchedInCatalogue).toBe(true)
    expect(batteryMatch.id).toBe('M-FZ100')
    expect(batteryMatch.stockAvailable).toBe(6)

    const cageMatch = resolveAccessoryCatalogueMatch('SmallRig Camera Cage for FX3/FX30', 'RIG-SR-FX3-CAGE')
    expect(cageMatch.isMatchedInCatalogue).toBe(true)
    expect(cageMatch.id).toBe('M-SR-CAGE')
    expect(cageMatch.stockAvailable).toBe(3)
  })

  it('flags unstocked/unmatched accessories as not in inventory to prevent phantom serials', () => {
    // Unmatched item not in INVENTORY_MODELS
    const unknownMatch = resolveAccessoryCatalogueMatch(
      'Fictional Laser Distance Meter 9000',
      'UNKNOWN-SKU-999'
    )
    expect(unknownMatch.isMatchedInCatalogue).toBe(false)
    expect(unknownMatch.id).toBeUndefined()
    expect(unknownMatch.stockAvailable).toBe(0)
    expect(unknownMatch.sku).toBe('UNKNOWN-SKU-999')
  })

  it('detects and blocks direct self-containment cycles (A -> A)', () => {
    const existingEdges: Array<[string, string]> = [
      ['M-FX3-BODY', 'M-FX3-HANDLE'],
    ]

    const cycleResult = checkChildRelationshipCycle('M-FX3-BODY', 'M-FX3-BODY', existingEdges)
    expect(cycleResult.hasCycle).toBe(true)
    expect(cycleResult.path).toEqual(['M-FX3-BODY', 'M-FX3-BODY'])
    expect(cycleResult.reason).toContain('Direct self-reference')
  })

  it('detects and blocks multi-hop circular containment cycles (A -> B -> C -> A)', () => {
    // Setup chain: Body -> Rig Cage -> Baseplate -> Shoulder Pad
    const existingEdges: Array<[string, string]> = [
      ['M-FX3-BODY', 'M-SR-CAGE'],
      ['M-SR-CAGE', 'M-BASEPLATE-15'],
      ['M-BASEPLATE-15', 'M-SHOULDER-PAD'],
    ]

    // Propose adding M-SHOULDER-PAD -> M-FX3-BODY (closes the loop)
    const cycleResult = checkChildRelationshipCycle('M-SHOULDER-PAD', 'M-FX3-BODY', existingEdges)
    expect(cycleResult.hasCycle).toBe(true)
    expect(cycleResult.path[0]).toBe('M-SHOULDER-PAD')
    expect(cycleResult.path[cycleResult.path.length - 1]).toBe('M-SHOULDER-PAD')
    expect(cycleResult.reason).toContain('Circular containment loop detected')
  })

  it('allows valid acyclic hierarchical relationships (DAG trees)', () => {
    const existingEdges: Array<[string, string]> = [
      ['M-FX3-BODY', 'M-FX3-HANDLE'],
      ['M-FX3-BODY', 'M-SR-CAGE'],
      ['M-SR-CAGE', 'M-ROD-CLAMP'],
    ]

    // Propose adding M-SR-CAGE -> M-TOP-HANDLE-EXT (valid branch)
    const validResult = checkChildRelationshipCycle('M-SR-CAGE', 'M-TOP-HANDLE-EXT', existingEdges)
    expect(validResult.hasCycle).toBe(false)
    expect(validResult.path).toHaveLength(0)
    expect(validResult.reason).toBeUndefined()
  })

  it('calculates kit inclusions without double-billing mandatory box items', () => {
    const candidateAccessories: SmartAccessorySuggestion[] = [
      {
        name: 'Sony XLR Top Handle Unit',
        sku: 'CAM-ACC-XLR-H',
        quantity: 1,
        relationType: 'included_mandatory',
        isMatchedInCatalogue: true,
        stockAvailable: 2,
        isChargeable: false,
        unitRatePaisa: rupees(0),
        description: 'Standard included box item',
      },
      {
        name: 'Sony NP-FZ100 Rechargeable Battery',
        sku: 'ACC-BATT-FZ100',
        quantity: 1,
        relationType: 'included_mandatory',
        isMatchedInCatalogue: true,
        stockAvailable: 12,
        isChargeable: false,
        unitRatePaisa: rupees(0),
        description: 'Standard 1x included battery',
      },
      {
        name: 'Extra NP-FZ100 Battery',
        sku: 'ACC-BATT-FZ100',
        quantity: 1,
        relationType: 'chargeable_extra',
        isMatchedInCatalogue: true,
        stockAvailable: 12,
        isChargeable: true,
        unitRatePaisa: rupees(400), // Rs 400/day = 40,000 paisa
        description: 'Additional spare battery',
      },
      {
        name: 'SmallRig Camera Cage',
        sku: 'RIG-SR-FX3-CAGE',
        quantity: 1,
        relationType: 'recommended_addon',
        isMatchedInCatalogue: true,
        stockAvailable: 3,
        isChargeable: true,
        unitRatePaisa: rupees(600), // Rs 600/day = 60,000 paisa
        description: 'Protective modular cage',
      },
      {
        name: 'Custom Matte Box 99',
        sku: 'MATTE-99',
        quantity: 1,
        relationType: 'chargeable_extra',
        isMatchedInCatalogue: false, // Unstocked!
        stockAvailable: 0,
        isChargeable: true,
        unitRatePaisa: rupees(500), // Rs 500/day = 50,000 paisa
        description: 'Third-party matte box',
      },
    ]

    const inclusions = calculateKitInclusions(candidateAccessories)

    expect(inclusions.mandatoryCount).toBe(2)
    expect(inclusions.extraCount).toBe(3)
    expect(inclusions.unstockedCount).toBe(1)
    expect(inclusions.unstockedItems).toContain('Custom Matte Box 99')

    // Financial check: Rs 0 + Rs 0 + Rs 400 + Rs 600 + Rs 500 = Rs 1,500 (150,000 paisa)
    expect(inclusions.totalExtraRatePaisa).toBe(150000)

    // Packing checklist contains mandatory items marked as included and zero cost
    const mandatoryEntries = inclusions.packingChecklist.filter((p) => p.relationType === 'included_mandatory')
    expect(mandatoryEntries).toHaveLength(2)
    mandatoryEntries.forEach((m) => {
      expect(m.isChargeable).toBe(false)
      expect(m.unitRatePaisa).toBe(0)
    })
  })
})

describe('SmartEquipment Phase T3 — Model-Aware How-To Guides & Role-Gated Projections', () => {
  const baseGuide: SmartHowToGuide = {
    setupSteps: [
      'Install fully charged NP-FZ100 battery into base compartment.',
      'Mount E-mount lens aligning the white index mark and rotate clockwise until it clicks.',
    ],
    cautions: [
      'Always power off before removing the XLR audio handle to prevent contact arcing.',
      'Never touch or wipe the image sensor directly with dry cloths.',
    ],
    commonMistakes: [
      'Leaving phantom power +48V active when plugging in dynamic microphones.',
    ],
    clientInstructions: [
      'Handle with care and return with all lens caps and port covers.',
    ],
    preRentalChecklist: [
      'Check sensor cleanliness at f/16 against a flat white card.',
      'Verify active cooling fan spins under 4K 120p high-frame stress test.',
    ],
    returnChecklist: [
      'Inspect lens mount bayonet screws and gold electronic pins.',
      'Check XLR handle latch pins for mechanical play or looseness.',
    ],
    casePackingInstructions: [
      'Body packed with sensor body cap secured.',
      'XLR top handle stored in custom die-cut top tray compartment.',
    ],
    technicianSop: {
      preRentalDiagnosticSteps: [
        'Connect multimeter to XLR handle pins 1 and 2/3 to test +48V phantom rail tolerance.',
        'Benchmark USB-PD negotiated draw: must sustain 9V 3A under active recording.',
      ],
      returnDecontaminationSteps: [
        'Wipe external magnesium shell with 70% isopropyl alcohol; do not touch sensor glass.',
      ],
      quarantineTriggers: [
        'Persistent sensor dead pixels visible below ISO 800.',
        'Internal cooling fan failure error code E:61:00.',
      ],
      fieldRepairLimits: [
        'Authorized: replacement of rubber port covers and XLR handle thumbscrews.',
        'Forbidden: opening camera body shell or recalibrating IBIS sensor assembly.',
      ],
      pinoutDiagram: 'Sony Multi-Interface Shoe (MIS) 24-pin gold contact matrix + Dual XLR 3-pin balanced.',
      voltageLimits: '7.2V nominal, 8.4V max battery; USB-PD 9V 3A (27W) continuous.',
      phantomPowerTolerance: '48V ± 4V under 10mA test load.',
      maxContinuousRuntimeMinutes: 120,
      thermalShutdownCelsius: 48,
    },
    internalMarginNotes: 'Target rental margin is 68% after maintenance reserve and calibration amortisation.',
    nepaliTranslations: {
      setupSteps: [
        'क्यामेराको तल्लो भागमा पूर्ण चार्ज भएको NP-FZ100 ब्याट्री हाल्नुहोस्।',
        'सेतो चिन्ह मिलाएर E-माउन्ट लेन्स घुमाएर क्लिक आवाज आउने गरी कस्नुहोस्।',
      ],
      cautions: [
        'XLR अडियो ह्यान्डल निकाल्नु अघि अनिवार्य रूपमा क्यामेरा बन्द गर्नुहोस्।',
        'इमेज सेन्सरलाई कहिल्यै पनि सुक्खा कपडाले नपुछ्नुहोस्।',
      ],
      commonMistakes: [
        'डाइनामिक माइक जोड्दा +48V फ्यान्टम पावर अन नै छोड्नु।',
      ],
    },
    approvalStatus: 'approved_internal',
    approvedVersion: 'v2.1',
  }

  it('projects safe client/public view: completely redacts technician SOP and wholesale margins', () => {
    const clientView = projectHowToGuideForRole(baseGuide, { role: 'client', language: 'en' })

    // Must NOT contain technician SOP
    expect(clientView.technicianSop).toBeUndefined()

    // Must NOT contain internal financial margin notes
    expect(clientView.internalMarginNotes).toBeUndefined()

    // Must preserve setup steps, cautions, checklists, and case packing
    expect(clientView.setupSteps).toHaveLength(2)
    expect(clientView.setupSteps[0]).toContain('NP-FZ100 battery')
    expect(clientView.cautions).toHaveLength(2)
    expect(clientView.commonMistakes).toHaveLength(1)
    expect(clientView.casePackingInstructions).toHaveLength(2)
    expect(clientView.preRentalChecklist).toHaveLength(2)
    expect(clientView.returnChecklist).toHaveLength(2)
  })

  it('projects internal technician view: includes electrical pinouts, thermal bounds, and quarantine alerts', () => {
    const techView = projectHowToGuideForRole(baseGuide, { role: 'technician', language: 'en' })

    // Must contain full technician SOP
    expect(techView.technicianSop).toBeDefined()
    expect(techView.technicianSop?.voltageLimits).toBe('7.2V nominal, 8.4V max battery; USB-PD 9V 3A (27W) continuous.')
    expect(techView.technicianSop?.phantomPowerTolerance).toBe('48V ± 4V under 10mA test load.')
    expect(techView.technicianSop?.maxContinuousRuntimeMinutes).toBe(120)
    expect(techView.technicianSop?.thermalShutdownCelsius).toBe(48)
    expect(techView.technicianSop?.quarantineTriggers).toContain('Internal cooling fan failure error code E:61:00.')

    // Must retain internal margin notes
    expect(techView.internalMarginNotes).toContain('Target rental margin is 68%')
  })

  it('switches to Nepali language translations when requested', () => {
    const nepaliClientView = projectHowToGuideForRole(baseGuide, { role: 'client', language: 'ne' })

    expect(nepaliClientView.setupSteps[0]).toContain('क्यामेराको तल्लो भागमा पूर्ण चार्ज भएको NP-FZ100 ब्याट्री हाल्नुहोस्।')
    expect(nepaliClientView.cautions[0]).toContain('XLR अडियो ह्यान्डल निकाल्नु अघि अनिवार्य रूपमा क्यामेरा बन्द गर्नुहोस्।')
    expect(nepaliClientView.commonMistakes[0]).toContain('डाइनामिक माइक जोड्दा +48V फ्यान्टम पावर अन नै छोड्नु।')

    // Untranslated items fallback cleanly to English
    expect(nepaliClientView.casePackingInstructions).toHaveLength(2)
    expect(nepaliClientView.casePackingInstructions?.[0]).toContain('Body packed with sensor body cap secured.')
  })

  it('populates full technician SOP and Nepali translations in getSmartEquipmentDraft for Sony FX3', () => {
    const fx3Draft = getSmartEquipmentDraft('Sony FX3', 'ILME-FX3', { canViewMoney: true })
    expect(fx3Draft).not.toBeNull()
    expect(fx3Draft?.approvalStatus).toBe('approved_internal')
    expect(fx3Draft?.howTo.technicianSop).toBeDefined()
    expect(fx3Draft?.howTo.technicianSop?.pinoutDiagram).toContain('(MIS) 24-pin')
    expect(fx3Draft?.howTo.nepaliTranslations?.setupSteps?.[0]).toContain('क्यामेराको पावर अन गर्न')

    // Accessories are resolved against real catalog
    const matchedAccs = fx3Draft!.accessories.filter((a) => a.isMatchedInCatalogue)
    expect(matchedAccs.length).toBeGreaterThan(0)
    expect(matchedAccs.some((a) => a.sku === 'ACC-TH-001')).toBe(true)
  })
})
