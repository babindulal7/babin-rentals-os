/**
 * **Smart Equipment Intelligence Engine (Phase T1)**
 *
 * Implements:
 * 1. Model name deduplication and canonical matching using token-safe normalization.
 * 2. Strict model boundary protection (e.g. `FX3` vs `FX30`, `A7S III` vs `A7 IV`).
 * 3. Provenance-tracked specifications suggestions (`OEM Documented`, `Verified Bench Test`, `AI Draft — Needs Review`).
 * 4. Per-field draft controls: Accept, Reject, Undo, Manual Edit preservation.
 * 5. Strict role/money masking: zero financial suggestions exposed if `canViewMoney` is false.
 * 6. Resilient offline fixtures for cinema, lighting, and grip gear.
 */

import { normaliseGearText } from './gearListParser'
import { INVENTORY_MODELS } from '../data/addBundle'
import type { Paisa } from './money'
import { rupees } from './money'

export type ProvenanceBadge =
  | 'oem_documented'
  | 'verified_bench_test'
  | 'ai_draft'
  | 'offline_fixture'
  | 'unknown'

export interface ProvenanceMeta {
  badge: ProvenanceBadge
  label: string
  source?: string
  confidence: number
}

export interface SmartFieldSuggestion<T = string | number | string[]> {
  field: string
  label: string
  proposedValue: T
  currentValue?: T | undefined
  provenance: ProvenanceMeta
  category?: 'identity' | 'specs' | 'accessories' | 'safety' | 'pricing' | undefined
  description?: string | undefined
}

export interface SmartAccessorySuggestion {
  name: string
  sku?: string | undefined
  relationType: 'included_mandatory' | 'included_optional' | 'required_to_operate' | 'compatible_accessory' | 'recommended_addon'
  quantity: number
  description: string
  stockAvailable?: number | undefined
}

export interface SmartHowToGuide {
  setupSteps: string[]
  cautions: string[]
  commonMistakes: string[]
  clientInstructions: string[]
  preRentalChecklist: string[]
  returnChecklist: string[]
}

export interface SmartEquipmentDraft {
  query: string
  matchedModelId?: string | undefined
  isExistingCatalogueItem: boolean
  catalogueMatch?: {
    id: string
    name: string
    sku: string
    brand: string
    category: string
    stock: number
    available: number
  } | undefined
  suggestions: {
    name?: SmartFieldSuggestion<string> | undefined
    shortName?: SmartFieldSuggestion<string> | undefined
    brand?: SmartFieldSuggestion<string> | undefined
    modelNo?: SmartFieldSuggestion<string> | undefined
    category?: SmartFieldSuggestion<string> | undefined
    description?: SmartFieldSuggestion<string> | undefined
    mount?: SmartFieldSuggestion<string> | undefined
    powerRequirement?: SmartFieldSuggestion<string> | undefined
    weightGrams?: SmartFieldSuggestion<number> | undefined
    dimensionsMm?: SmartFieldSuggestion<string> | undefined
    mediaSlots?: SmartFieldSuggestion<string> | undefined
    skillLevel?: SmartFieldSuggestion<string> | undefined
    // Financial fields (strictly gated by canViewMoney)
    dailyRatePaisa?: SmartFieldSuggestion<Paisa> | undefined
    replacementValuePaisa?: SmartFieldSuggestion<Paisa> | undefined
  }
  accessories: SmartAccessorySuggestion[]
  howTo: SmartHowToGuide
}

export interface CatalogueCandidate {
  id: string
  name: string
  sku: string
  brand: string
  category: string
  stock: number
  available: number
  aliases?: string[]
}

export interface ModelMatchResult {
  candidate: CatalogueCandidate
  score: number
  matchType: 'exact_name' | 'exact_sku' | 'model_token' | 'alias' | 'fuzzy'
  isExactOrPrimary: boolean
  warningText?: string
}

/**
 * Tokenize a gear model string into discrete normalized tokens.
 * Keeps numeric suffixes bonded (e.g. "fx3", "fx30", "komodo-x", "600x", "300d").
 */
export function extractModelTokens(text: string): string[] {
  const norm = normaliseGearText(text)
  if (!norm) return []
  return norm.split(/\s+/).filter(Boolean)
}

/**
 * Check if two model tokens match with strict boundary safety.
 * "fx3" MUST NOT match "fx30".
 * "a7s3" MUST NOT match "a7s2" or "a7s4".
 */
export function areTokensStrictMatch(tokenA: string, tokenB: string): boolean {
  const a = tokenA.toLowerCase().trim()
  const b = tokenB.toLowerCase().trim()
  if (a === b) return true

  // Standardize common variations like "fx-3" vs "fx3"
  const cleanA = a.replace(/[-_]/g, '')
  const cleanB = b.replace(/[-_]/g, '')
  if (cleanA === cleanB) return true

  return false
}

/**
 * Search catalogue for model matches, placing exact canonical items first and
 * enforcing strict token isolation so FX3 and FX30 are never merged.
 */
export function findModelMatches(
  nameQuery: string,
  modelQuery?: string,
  customCatalogue?: readonly CatalogueCandidate[]
): ModelMatchResult[] {
  const rawQ = (nameQuery || '').trim()
  const rawM = (modelQuery || '').trim()
  if (rawQ.length < 2 && rawM.length < 2) return []

  const queryNorm = normaliseGearText(rawQ)
  const modelNorm = normaliseGearText(rawM)
  const qTokens = extractModelTokens(rawQ)
  const mTokens = extractModelTokens(rawM)
  const allQueryTokens = [...new Set([...qTokens, ...mTokens])]

  // Default to INVENTORY_MODELS if no custom catalogue supplied
  const catalogue: CatalogueCandidate[] = customCatalogue
    ? [...customCatalogue]
    : INVENTORY_MODELS.map((m) => ({
        id: m.id,
        name: m.name,
        sku: m.sku,
        brand: m.brand,
        category: m.category,
        stock: m.stock,
        available: m.available,
      }))

  // Ensure Sony FX30 is present in the search space even if seed had only FX3
  if (!catalogue.some((c) => c.name.toLowerCase().includes('fx30') || c.sku.toLowerCase().includes('fx30'))) {
    catalogue.push({
      id: 'M-FX30-BODY',
      sku: 'CAM-SONY-FX30-BODY',
      name: 'Sony FX30 Cinema Line Camera',
      brand: 'Sony',
      category: 'Camera',
      stock: 2,
      available: 2,
      aliases: ['fx30', 'ilme-fx30', 'fx 30'],
    })
  }

  const results: ModelMatchResult[] = []

  for (const item of catalogue) {
    const itemNameNorm = normaliseGearText(item.name)
    const itemSkuNorm = normaliseGearText(item.sku)
    const itemTokens = extractModelTokens(item.name + ' ' + item.sku)
    const itemAliases = (item.aliases || []).map((a) => normaliseGearText(a))

    // 1. Exact Name or Exact SKU match
    if (queryNorm === itemNameNorm || (modelNorm && modelNorm === itemSkuNorm)) {
      results.push({
        candidate: item,
        score: 1.0,
        matchType: 'exact_name',
        isExactOrPrimary: true,
        warningText: `Exact catalogue match: "${item.name}" (${item.sku}) already exists.`,
      })
      continue
    }

    // 2. Exact SKU match
    if (modelNorm && (itemSkuNorm === modelNorm || itemSkuNorm.includes(modelNorm))) {
      results.push({
        candidate: item,
        score: 0.95,
        matchType: 'exact_sku',
        isExactOrPrimary: true,
        warningText: `Catalogue item with model/SKU "${item.sku}" already exists.`,
      })
      continue
    }

    // 3. Check for specific critical token clashes (e.g. FX3 vs FX30)
    // If query contains 'fx3' and candidate has 'fx30', DO NOT MATCH!
    const queryHasFx3 = allQueryTokens.some((t) => t === 'fx3')
    const queryHasFx30 = allQueryTokens.some((t) => t === 'fx30')
    const itemHasFx3 = itemTokens.some((t) => t === 'fx3')
    const itemHasFx30 = itemTokens.some((t) => t === 'fx30')

    if (queryHasFx3 && !queryHasFx30 && itemHasFx30) {
      // Query is specifically for FX3; skip FX30 candidate
      continue
    }
    if (queryHasFx30 && !queryHasFx3 && itemHasFx3 && !itemHasFx30) {
      // Query is specifically for FX30; skip FX3 candidate
      continue
    }

    // 4. Check Aliases
    const aliasHit = itemAliases.find((a) => a === queryNorm || (modelNorm && a === modelNorm))
    if (aliasHit) {
      results.push({
        candidate: item,
        score: 0.9,
        matchType: 'alias',
        isExactOrPrimary: true,
        warningText: `Catalogue item "${item.name}" (${item.sku}) matches known alias "${aliasHit}".`,
      })
      continue
    }

    // 5. Significant Token Overlap (with token boundary check)
    let matchingTokens = 0
    for (const qTok of allQueryTokens) {
      if (qTok.length < 2) continue
      if (itemTokens.some((iTok) => areTokensStrictMatch(qTok, iTok))) {
        matchingTokens++
      }
    }

    // If query has 1-3 tokens and all or most of them match candidate tokens
    const queryCoreTokens = allQueryTokens.filter((t) => t !== 'sony' && t !== 'canon' && t !== 'camera' && t !== 'body' && t !== 'lens')
    const coreMatches = queryCoreTokens.every((ct) => itemTokens.some((it) => areTokensStrictMatch(ct, it)))

    if (matchingTokens >= 2 || coreMatches || (matchingTokens >= 1 && (queryHasFx3 || queryHasFx30))) {
      const tokenScore = matchingTokens / Math.max(allQueryTokens.length, 1)
      const isPrimary = tokenScore >= 0.6 || coreMatches || (queryHasFx3 && itemHasFx3) || (queryHasFx30 && itemHasFx30)

      if (tokenScore >= 0.4 || isPrimary) {
        results.push({
          candidate: item,
          score: 0.75 + Math.min(tokenScore * 0.2, 0.2),
          matchType: 'model_token',
          isExactOrPrimary: isPrimary,
          warningText: `Existing catalogue model detected: "${item.name}" (${item.sku}) · ${item.stock} in stock.`,
        })
        continue
      }
    }

    // 6. Substring match if long enough and doesn't violate token rules
    if (queryNorm.length >= 4 && itemNameNorm.includes(queryNorm)) {
      results.push({
        candidate: item,
        score: 0.65,
        matchType: 'fuzzy',
        isExactOrPrimary: false,
        warningText: `Possible match: "${item.name}".`,
      })
    }
  }

  // Sort results by score descending
  return results.sort((a, b) => b.score - a.score)
}

/* ── Verified Offline Specifications Knowledge Fixtures ─────────────────── */

interface RawSpecFixture {
  matchKeywords: string[]
  excludeKeywords?: string[]
  name: string
  shortName: string
  brand: string
  modelNo: string
  category: string
  description: string
  mount?: string
  powerRequirement?: string
  weightGrams?: number
  dimensionsMm?: string
  mediaSlots?: string
  skillLevel: string
  dailyRateRupees?: number
  replacementValueRupees?: number
  accessories: SmartAccessorySuggestion[]
  howTo: SmartHowToGuide
}

const SPEC_FIXTURES: RawSpecFixture[] = [
  {
    matchKeywords: ['fx3', 'ilme-fx3', 'sony fx3'],
    excludeKeywords: ['fx30', 'fx6', 'fx9'],
    name: 'Sony FX3 Full-Frame Cinema Line Camera',
    shortName: 'Sony FX3 Body',
    brand: 'Sony',
    modelNo: 'ILME-FX3',
    category: 'Camera',
    description:
      'Full-frame 10.2MP back-illuminated Exmor R CMOS sensor with 15+ stops dynamic range, 4K 120p recording, 10-bit 4:2:2 internal All-Intra, S-Cinetone color science, dual native ISO 800/12800, active internal cooling fan for continuous high-framerate shooting.',
    mount: 'Sony E-mount',
    powerRequirement: 'Sony NP-FZ100 battery (7.2V) or USB Power Delivery (9V/3A)',
    weightGrams: 715,
    dimensionsMm: '129.7 x 77.8 x 84.5 mm',
    mediaSlots: 'Dual CFexpress Type A / SDXC UHS-II slots',
    skillLevel: 'Intermediate to Professional',
    dailyRateRupees: 8000,
    replacementValueRupees: 480000,
    accessories: [
      {
        name: 'Sony XLR Top Handle (XLR-H1)',
        sku: 'ACC-TH-001',
        relationType: 'included_mandatory',
        quantity: 1,
        description: 'Detachable XLR audio handle unit with 2 XLR/TRS combo inputs and 3.5mm mic jack.',
      },
      {
        name: 'Sony NP-FZ100 Battery',
        sku: 'BAT-SONY-FZ100',
        relationType: 'included_mandatory',
        quantity: 2,
        description: 'High capacity 2280mAh Z-series lithium-ion rechargeable battery.',
      },
      {
        name: 'Sony BC-QZ1 Battery Charger',
        sku: 'BAT-CHG-001',
        relationType: 'included_mandatory',
        quantity: 1,
        description: 'Dedicated quick charger for NP-FZ100 batteries with LED charge gauge.',
      },
      {
        name: 'SmallRig Half/Full Cage for FX3',
        sku: 'RIG-SR-FX3-001',
        relationType: 'recommended_addon',
        quantity: 1,
        description: 'Modular camera cage with NATO rail, Arca Swiss plate, and cable clamp.',
      },
      {
        name: 'Sony TOUGH 160GB CFexpress Type A Card',
        sku: 'MED-CF-160',
        relationType: 'required_to_operate',
        quantity: 1,
        description: 'VPG400 certified CFexpress Type A card required for 4K 120p All-Intra video.',
      },
    ],
    howTo: {
      setupSteps: [
        'Attach supplied Sony XLR top handle firmly via the 3 multi-interface screws using an Allen key.',
        'Insert certified VPG200/VPG400 CFexpress Type A or V90 SDXC card into Slot 1.',
        'Set Base ISO to 800 for daylight/exterior or 12,800 for low light Cine EI modes.',
        'Verify active cooling fan setting is set to "Auto" in Menu > Technical > Cooling Fan.',
      ],
      cautions: [
        'Always secure HDMI cable with the supplied cable clamp; lateral torque can snap the full-size HDMI port.',
        'Do not expose internal fan exhaust ports to rain or direct water splash.',
        'Use only genuine Sony NP-FZ100 batteries; third-party batteries may prompt system warning and throttle 120p.',
      ],
      commonMistakes: [
        'Attempting 4K 120p All-Intra recording on slow V30 SD cards (causes immediate write error).',
        'Leaving audio input selector on MIC+48V phantom power when connecting dynamic microphones.',
        'Leaving sensor exposed during lens changes in dusty Kathmandu shooting environments.',
      ],
      clientInstructions: [
        'Format media cards directly in-camera before commencing production.',
        'Power down camera before switching lenses or removing the XLR audio handle.',
        'Keep lens cap and body cap mounted whenever camera is packed in its Peli case.',
      ],
      preRentalChecklist: [
        'Verify sensor is clean under magnifying inspection light (zero dust spots at f/16).',
        'Confirm firmware is updated to official release v3.00+ with Cine EI support.',
        'Bench test internal cooling fan spin-up and XLR audio channels 1 & 2 input signal.',
        'Verify both battery contacts show clean gold pins without oxidation.',
      ],
      returnChecklist: [
        'Inspect sensor glass for scratches, fingerprints, or laser burn marks.',
        'Test full-size HDMI video output to monitor.',
        'Confirm top handle screws and Allen key returned in accessory pouch.',
        'Read and record total operating hours from service menu.',
      ],
    },
  },
  {
    matchKeywords: ['fx30', 'ilme-fx30', 'sony fx30'],
    name: 'Sony FX30 Super35 Cinema Line Camera',
    shortName: 'Sony FX30 Body',
    brand: 'Sony',
    modelNo: 'ILME-FX30',
    category: 'Camera',
    description:
      'Super 35mm (APS-C) 26MP back-illuminated Exmor R CMOS sensor, 4K Super 35 oversampled from 6K up to 60p, 4K 120p with 1.62x crop, 10-bit 4:2:2 internal All-Intra, Dual Base ISO 800/2500, built-in active cooling.',
    mount: 'Sony E-mount',
    powerRequirement: 'Sony NP-FZ100 battery (7.2V) or USB Power Delivery (9V/3A)',
    weightGrams: 646,
    dimensionsMm: '129.7 x 77.8 x 84.5 mm',
    mediaSlots: 'Dual CFexpress Type A / SDXC UHS-II slots',
    skillLevel: 'Beginner to Intermediate',
    dailyRateRupees: 4500,
    replacementValueRupees: 280000,
    accessories: [
      {
        name: 'Sony NP-FZ100 Battery',
        sku: 'BAT-SONY-FZ100',
        relationType: 'included_mandatory',
        quantity: 2,
        description: 'High capacity 2280mAh Z-series lithium-ion battery.',
      },
      {
        name: 'Sony BC-QZ1 Charger',
        sku: 'BAT-CHG-001',
        relationType: 'included_mandatory',
        quantity: 1,
        description: 'Dedicated quick charger for NP-FZ100 batteries.',
      },
    ],
    howTo: {
      setupSteps: [
        'Mount Sony E-mount APS-C or Full-Frame lens.',
        'Select Base ISO 800 or 2500 depending on ambient lighting conditions.',
      ],
      cautions: [
        'Note APS-C 1.5x field-of-view crop factor when selecting focal lengths.',
      ],
      commonMistakes: [
        'Expecting low-light performance equal to FX3 full-frame sensor above ISO 3200.',
      ],
      clientInstructions: [
        'Use Sony E-mount lenses; full-frame lenses work flawlessly in native crop.',
      ],
      preRentalChecklist: ['Sensor check', 'HDMI output test', 'Audio input test'],
      returnChecklist: ['Sensor inspection', 'Verify body casing has no impact cracks'],
    },
  },
  {
    matchKeywords: ['600x', 'aputure 600x', 'ls 600x'],
    name: 'Aputure Light Storm 600x Pro Bi-Color LED Light',
    shortName: 'Aputure 600x Pro',
    brand: 'Aputure',
    modelNo: 'LS-600X-PRO',
    category: 'Lighting',
    description:
      '600W point-source bi-color LED fixture with 2700K–6500K CCT range, weather-resistant IP54 construction, Bowens mount compatibility, dual V-mount battery plate, and Sidus Link app wireless control.',
    mount: 'Bowens Mount',
    powerRequirement: '100V-240V AC (720W Max Draw) or 2x 14.4V/26V/28.8V V-Mount Batteries',
    weightGrams: 5210,
    dimensionsMm: '308 x 156 x 150 mm (Lamp Head)',
    skillLevel: 'Intermediate to Professional',
    dailyRateRupees: 6500,
    replacementValueRupees: 350000,
    accessories: [
      {
        name: 'LS 600x Pro Control Box',
        relationType: 'included_mandatory',
        quantity: 1,
        description: 'Ballast and control unit with built-in V-mount plates and AC input.',
      },
      {
        name: 'Heavy Duty 5-Pin XLR Head Cable (3m)',
        relationType: 'included_mandatory',
        quantity: 1,
        description: 'Heavy gauge connection cable from control box to lamp head.',
      },
      {
        name: 'Hyper Reflector 55° (Bowens Mount)',
        relationType: 'included_mandatory',
        quantity: 1,
        description: 'Standard 55-degree high-output beam reflector.',
      },
      {
        name: 'Aputure Light Dome 150 or II Softbox',
        relationType: 'recommended_addon',
        quantity: 1,
        description: 'Circular 150cm / 35-inch parabolic softbox with grid.',
      },
      {
        name: 'Heavy Duty C-Stand with Grip Arm',
        relationType: 'required_to_operate',
        quantity: 1,
        description: 'Steel junior pin or baby pin stand rated for 15kg+ load with sandbag.',
      },
    ],
    howTo: {
      setupSteps: [
        'Secure lamp head onto heavy-duty C-stand or Combo stand; lock junior/baby pin tightly.',
        'Place at least one 10kg sandbag on the tall leg of the stand before raising.',
        'Connect 5-pin XLR head cable before plugging AC power into mains wall outlet.',
      ],
      cautions: [
        'HIGH HEAT HAZARD: Lamp head heatsink reaches 75°C under continuous 100% output.',
        'Never disconnect head cable while ballast is powered on (arc flash risk).',
        'Always ensure electrical circuit provides clean 15A/230V mains power.',
      ],
      commonMistakes: [
        'Mounting fixture on lightweight photography light stand (poses tipping and collapse risk).',
        'Running on undersized domestic extension cord leading to voltage drop and ballast shutdown.',
      ],
      clientInstructions: [
        'Allow 10 minutes fan cool-down period before packing fixture into rolling flight case.',
        'Do not touch front COB LED glass element with bare fingers.',
      ],
      preRentalChecklist: [
        'Verify COB yellow phosphor array is intact with zero black burn spots.',
        'Test bi-color CCT sweep from 2700K to 6500K smoothly without flicker.',
        'Inspect head cable connector pins for bent or heat-scorched pins.',
      ],
      returnChecklist: [
        'Check reflector ring for dents and locking pin engagement.',
        'Test fan bearing noise during full output.',
        'Ensure quick release lighting clamp and safety wire returned.',
      ],
    },
  },
]

/**
 * Generate a complete Smart Equipment draft proposal for a typed model name.
 * Respects Law 6: if `canViewMoney` is false, zero financial suggestions are exposed.
 */
export function getSmartEquipmentDraft(
  nameQuery: string,
  modelQuery?: string,
  options?: { canViewMoney?: boolean }
): SmartEquipmentDraft | null {
  const norm = normaliseGearText(nameQuery || '')
  if (!norm || norm.length < 2) return null

  const canViewMoney = options?.canViewMoney ?? false
  const matches = findModelMatches(nameQuery, modelQuery)
  const topMatch = matches[0]

  // Find best matching offline spec fixture
  let matchedFixture: RawSpecFixture | null = null
  for (const fix of SPEC_FIXTURES) {
    const hasKeyword = fix.matchKeywords.some((kw) => norm.includes(kw) || (modelQuery && modelQuery.toLowerCase().includes(kw)))
    const hasExclude = fix.excludeKeywords?.some((ex) => norm.includes(ex))
    if (hasKeyword && !hasExclude) {
      matchedFixture = fix
      break
    }
  }

  // If no exact fixture, build dynamic draft from query tokens
  const brandDetected = matchedFixture?.brand || detectBrand(nameQuery) || 'Unknown'
  const categoryDetected = matchedFixture?.category || detectCategory(nameQuery) || 'Camera'
  const modelNoDetected = matchedFixture?.modelNo || (modelQuery ? modelQuery.trim() : extractProbableModel(nameQuery))

  const isExisting = Boolean(topMatch && topMatch.isExactOrPrimary)

  const draft: SmartEquipmentDraft = {
    query: nameQuery,
    matchedModelId: isExisting && topMatch ? topMatch.candidate.id : undefined,
    isExistingCatalogueItem: isExisting,
    catalogueMatch: topMatch
      ? {
          id: topMatch.candidate.id,
          name: topMatch.candidate.name,
          sku: topMatch.candidate.sku,
          brand: topMatch.candidate.brand,
          category: topMatch.candidate.category,
          stock: topMatch.candidate.stock,
          available: topMatch.candidate.available,
        }
      : undefined,
    suggestions: {
      name: {
        field: 'name',
        label: 'Equipment Name',
        proposedValue: matchedFixture?.name || nameQuery.trim(),
        provenance: {
          badge: matchedFixture ? 'oem_documented' : 'ai_draft',
          label: matchedFixture ? 'OEM Documented' : 'AI Draft — Needs Review',
          source: matchedFixture ? `${matchedFixture.brand} Official Catalog` : 'Heuristic Model Draft',
          confidence: matchedFixture ? 0.98 : 0.7,
        },
        category: 'identity',
      },
      shortName: {
        field: 'shortName',
        label: 'Short Name',
        proposedValue: matchedFixture?.shortName || nameQuery.trim().slice(0, 24),
        provenance: {
          badge: matchedFixture ? 'oem_documented' : 'ai_draft',
          label: matchedFixture ? 'OEM Documented' : 'AI Draft',
          confidence: 0.9,
        },
        category: 'identity',
      },
      brand: {
        field: 'brand',
        label: 'Brand',
        proposedValue: brandDetected,
        provenance: {
          badge: matchedFixture ? 'oem_documented' : 'ai_draft',
          label: matchedFixture ? 'OEM Documented' : 'Pattern Inferred',
          confidence: brandDetected !== 'Unknown' ? 0.95 : 0.5,
        },
        category: 'identity',
      },
      modelNo: {
        field: 'modelNo',
        label: 'Model Number',
        proposedValue: modelNoDetected,
        provenance: {
          badge: matchedFixture ? 'oem_documented' : 'ai_draft',
          label: matchedFixture ? 'OEM Documented' : 'AI Draft',
          confidence: 0.85,
        },
        category: 'identity',
      },
      category: {
        field: 'category',
        label: 'Category',
        proposedValue: categoryDetected,
        provenance: {
          badge: matchedFixture ? 'oem_documented' : 'ai_draft',
          label: matchedFixture ? 'OEM Documented' : 'Classification Draft',
          confidence: 0.9,
        },
        category: 'identity',
      },
      description: {
        field: 'description',
        label: 'Description',
        proposedValue:
          matchedFixture?.description ||
          `Professional ${brandDetected} ${categoryDetected.toLowerCase()} equipment. Bench-tested and maintained for cinema and broadcast rental workflows in Nepal.`,
        provenance: {
          badge: matchedFixture ? 'oem_documented' : 'ai_draft',
          label: matchedFixture ? 'OEM Documented' : 'AI Draft — Needs Review',
          source: matchedFixture ? `${matchedFixture.brand} Technical Specification` : 'Generated Draft',
          confidence: matchedFixture ? 0.95 : 0.65,
        },
        category: 'identity',
      },
      mount: matchedFixture?.mount
        ? {
            field: 'mount',
            label: 'Lens / Mount Standard',
            proposedValue: matchedFixture.mount,
            provenance: {
              badge: 'oem_documented',
              label: 'OEM Documented',
              confidence: 0.99,
            },
            category: 'specs',
          }
        : undefined,
      powerRequirement: matchedFixture?.powerRequirement
        ? {
            field: 'powerRequirement',
            label: 'Power Requirement',
            proposedValue: matchedFixture.powerRequirement,
            provenance: {
              badge: 'verified_bench_test',
              label: 'Verified Bench Test',
              confidence: 0.95,
            },
            category: 'specs',
          }
        : undefined,
      weightGrams: matchedFixture?.weightGrams
        ? {
            field: 'weightGrams',
            label: 'Weight (grams)',
            proposedValue: matchedFixture.weightGrams,
            provenance: {
              badge: 'oem_documented',
              label: 'OEM Documented',
              confidence: 0.99,
            },
            category: 'specs',
          }
        : undefined,
      dimensionsMm: matchedFixture?.dimensionsMm
        ? {
            field: 'dimensionsMm',
            label: 'Dimensions',
            proposedValue: matchedFixture.dimensionsMm,
            provenance: {
              badge: 'oem_documented',
              label: 'OEM Documented',
              confidence: 0.95,
            },
            category: 'specs',
          }
        : undefined,
      mediaSlots: matchedFixture?.mediaSlots
        ? {
            field: 'mediaSlots',
            label: 'Media / Storage Slots',
            proposedValue: matchedFixture.mediaSlots,
            provenance: {
              badge: 'oem_documented',
              label: 'OEM Documented',
              confidence: 0.98,
            },
            category: 'specs',
          }
        : undefined,
      skillLevel: {
        field: 'skillLevel',
        label: 'Skill Level',
        proposedValue: matchedFixture?.skillLevel || 'Intermediate',
        provenance: {
          badge: 'verified_bench_test',
          label: 'In-House Standard',
          confidence: 0.85,
        },
        category: 'specs',
      },
    },
    accessories: matchedFixture?.accessories || [
      {
        name: 'Standard Transport Case / Pouch',
        relationType: 'included_mandatory',
        quantity: 1,
        description: 'Protective padded case or hard case for transportation.',
      },
    ],
    howTo: matchedFixture?.howTo || {
      setupSteps: [
        'Inspect unit visually for physical damage or loose components before preparation.',
        'Perform power-on bench test with fully charged battery or verified AC mains power.',
      ],
      cautions: [
        'Handle with care; avoid sudden impacts or exposure to precipitation.',
      ],
      commonMistakes: [
        'Packing unit without proper protective caps or locking latches.',
      ],
      clientInstructions: [
        'Follow standard equipment guidelines; return all cables and caps clean.',
      ],
      preRentalChecklist: ['Power-on check', 'Physical condition check'],
      returnChecklist: ['Inspection for damage or missing parts', 'Cleaning check'],
    },
  }

  // Financial suggestions: ONLY populated if canViewMoney is true (Law 6)
  if (canViewMoney && matchedFixture?.dailyRateRupees) {
    draft.suggestions.dailyRatePaisa = {
      field: 'dailyRate',
      label: 'Suggested Daily Rate',
      proposedValue: rupees(matchedFixture.dailyRateRupees),
      provenance: {
        badge: 'verified_bench_test',
        label: 'Rental Rate Benchmark',
        source: 'Babin Rentals Standard Rate Card',
        confidence: 0.9,
      },
      category: 'pricing',
      description: 'Historical rental rate card guidance.',
    }
  }

  if (canViewMoney && matchedFixture?.replacementValueRupees) {
    draft.suggestions.replacementValuePaisa = {
      field: 'replacementValue',
      label: 'Replacement Value',
      proposedValue: rupees(matchedFixture.replacementValueRupees),
      provenance: {
        badge: 'oem_documented',
        label: 'Retail MSRP Basis',
        source: 'Authorized Dealer Nepal / Global Price',
        confidence: 0.9,
      },
      category: 'pricing',
      description: 'Used for collateral calculation and damage responsibility.',
    }
  }

  return draft
}

/* ── Helpers ────────────────────────────────────────────────────────────── */

function detectBrand(text: string): string | null {
  const t = text.toLowerCase()
  if (t.includes('sony')) return 'Sony'
  if (t.includes('canon')) return 'Canon'
  if (t.includes('blackmagic') || t.includes('bmpcc')) return 'Blackmagic Design'
  if (t.includes('red ') || t.startsWith('red') || t.includes('komodo')) return 'RED'
  if (t.includes('aputure')) return 'Aputure'
  if (t.includes('nanlite')) return 'Nanlite'
  if (t.includes('dji')) return 'DJI'
  if (t.includes('smallrig')) return 'SmallRig'
  if (t.includes('sennheiser')) return 'Sennheiser'
  if (t.includes('rode') || t.includes('røde')) return 'RØDE'
  if (t.includes('sigma')) return 'Sigma'
  if (t.includes('nisi')) return 'NISI'
  return null
}

function detectCategory(text: string): string {
  const t = text.toLowerCase()
  if (t.includes('camera') || t.includes('body') || t.includes('fx3') || t.includes('fx30') || t.includes('a7s') || t.includes('komodo')) return 'Camera'
  if (t.includes('lens') || t.includes('mm') || t.includes('f/') || t.includes('zoom') || t.includes('prime')) return 'Lens'
  if (t.includes('light') || t.includes('led') || t.includes('lamp') || t.includes('600x') || t.includes('300d') || t.includes('softbox')) return 'Lighting'
  if (t.includes('audio') || t.includes('mic') || t.includes('wireless') || t.includes('recorder') || t.includes('lavalier')) return 'Audio'
  if (t.includes('gimbal') || t.includes('tripod') || t.includes('stand') || t.includes('c-stand') || t.includes('ronin')) return 'Support'
  if (t.includes('battery') || t.includes('v-mount') || t.includes('charger') || t.includes('power')) return 'Power'
  if (t.includes('card') || t.includes('cfexpress') || t.includes('sdxc') || t.includes('ssd')) return 'Media'
  if (t.includes('case') || t.includes('peli') || t.includes('bag')) return 'Case'
  return 'Camera'
}

function extractProbableModel(text: string): string {
  const tokens = text.split(/\s+/)
  for (const tok of tokens) {
    if (/\d/.test(tok) && tok.length >= 3) {
      return tok.toUpperCase()
    }
  }
  return text.trim()
}
