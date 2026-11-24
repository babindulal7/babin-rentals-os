import { describe, it, expect } from 'vitest'
import {
  recommendKit,
  SHOOT_BLUEPRINTS,
  type KitRecommendationQuery,
} from '../kitRecommender'

describe('Rental Intelligence RI-01: Kit Recommender Engine', () => {
  it('covers all 7 production genres with BUDGET, STANDARD, and PREMIUM tiers', () => {
    const genres = ['Wedding', 'MusicVideo', 'Documentary', 'Film', 'Corporate', 'Podcast', 'Travel'] as const
    for (const g of genres) {
      expect(SHOOT_BLUEPRINTS[g]).toBeDefined()
      expect(SHOOT_BLUEPRINTS[g].BUDGET).toBeDefined()
      expect(SHOOT_BLUEPRINTS[g].STANDARD).toBeDefined()
      expect(SHOOT_BLUEPRINTS[g].PREMIUM).toBeDefined()
      expect(SHOOT_BLUEPRINTS[g].STANDARD.items.length).toBeGreaterThan(0)
    }
  })

  it('generates Wedding Highlight standard package with FX3A and NiSi cine primes', () => {
    const query: KitRecommendationQuery = {
      bookingId: 'BK-WED-001',
      shootType: 'Wedding',
      tier: 'STANDARD',
      availabilityFetchedAt: new Date().toISOString(),
      availabilityMap: {
        'BRPI-SONY-FX3A-BODY': { available: true, status: 'available' },
        'BRPI-NISI-ATHENA-SET': { available: true, status: 'available' },
        'BRPI-DJI-RS4PRO': { available: true, status: 'available' },
        'BRPI-AMARAN-200D': { available: true, status: 'available' },
      },
    }

    const result = recommendKit(query)
    expect(result.blueprint.shootType).toBe('Wedding')
    expect(result.blueprint.tier).toBe('STANDARD')
    expect(result.proposedItems.some((i) => i.productId === 'BRPI-SONY-FX3A-BODY')).toBe(true)
    expect(result.proposedItems.some((i) => i.productId === 'BRPI-NISI-ATHENA-SET')).toBe(true)
    expect(result.evidenceState).toBe('supported')
  })

  it('generates Music Video standard package with RED Komodo-X and Blazar Mantis anamorphic', () => {
    const query: KitRecommendationQuery = {
      bookingId: 'BK-MV-001',
      shootType: 'MusicVideo',
      tier: 'STANDARD',
      availabilityFetchedAt: new Date().toISOString(),
    }

    const result = recommendKit(query)
    expect(result.proposedItems.some((i) => i.productId === 'BRPI-RED-KOMODOX-6K-BODY')).toBe(true)
    expect(result.proposedItems.some((i) => i.productId === 'BRPI-BLAZAR-MANTIS-SET')).toBe(true)
    // Asserts CFexpress Type B is marked as required dependency for Komodo-X (RI-A03)
    const cfxItem = result.proposedItems.find((i) => i.productId === 'BRPI-MEDIA-CFX-B-512GB')
    expect(cfxItem).toBeDefined()
    expect(cfxItem?.chargeType).toBe('required_dependency')
  })

  it('attaches mandatory Caretaker rule for flagship cinema packages under Law 14', () => {
    const query: KitRecommendationQuery = {
      bookingId: 'BK-FILM-PREM-001',
      shootType: 'Film',
      tier: 'PREMIUM',
      availabilityFetchedAt: new Date().toISOString(),
    }

    const result = recommendKit(query)
    const caretakerAdv = result.advices.find((a) => a.id.includes('caretaker'))
    expect(caretakerAdv).toBeDefined()
    expect(caretakerAdv?.severity).toBe('review')
    expect(caretakerAdv?.explanation).toContain('MANDATORY CARETAKER ATTACHED (Law 14)')
  })

  it('distinguishes included kit items from required dependencies and chargeable extras (RI-A08)', () => {
    const query: KitRecommendationQuery = {
      bookingId: 'BK-DOC-001',
      shootType: 'Documentary',
      tier: 'STANDARD',
      availabilityFetchedAt: new Date().toISOString(),
    }

    const result = recommendKit(query)
    const fx3Item = result.proposedItems.find((i) => i.productId === 'BRPI-SONY-FX3A-BODY')
    expect(fx3Item?.chargeType).toBe('included_kit')

    const tripodItem = result.proposedItems.find((i) => i.productId === 'BRPI-STUDIO-ASSIST-TRIPOD')
    expect(tripodItem?.chargeType).toBe('required_dependency')

    const vmountItem = result.proposedItems.find((i) => i.productId === 'BRPI-VMOUNT-99WH')
    expect(vmountItem?.chargeType).toBe('chargeable_extra')
  })

  it('fails closed when availability snapshot is stale >5 minutes (RI-A07)', () => {
    const staleTime = new Date(Date.now() - 360000).toISOString() // 6 minutes ago
    const query: KitRecommendationQuery = {
      bookingId: 'BK-STALE-001',
      shootType: 'Corporate',
      tier: 'STANDARD',
      availabilityFetchedAt: staleTime,
    }

    const result = recommendKit(query)
    expect(result.evidenceState).toBe('needs_verification')
    const freshnessAdv = result.advices.find((a) => a.id.includes('freshness'))
    expect(freshnessAdv).toBeDefined()
    expect(freshnessAdv?.explanation).toContain('AVAILABILITY STALE')
  })

  it('fails closed and excludes unit when item is in active QC or repair hold (RI-A06)', () => {
    const query: KitRecommendationQuery = {
      bookingId: 'BK-HOLD-001',
      shootType: 'Documentary',
      tier: 'STANDARD',
      availabilityFetchedAt: new Date().toISOString(),
      availabilityMap: {
        'BRPI-SONY-FX3A-BODY': {
          available: false,
          status: 'qc_hold',
          holdReason: 'Audio XLR pin continuity repair',
        },
      },
    }

    const result = recommendKit(query)
    expect(result.evidenceState).toBe('blocked')
    expect(result.unavailableItems.length).toBeGreaterThan(0)
    expect(result.unavailableItems[0]?.productId).toBe('BRPI-SONY-FX3A-BODY')
    expect(result.unavailableItems[0]?.reason).toContain('QC_HOLD')
    expect(result.unavailableItems[0]?.alternative?.productId).toBe('BRPI-SONY-A7SIII-BODY')
  })

  it('flags overlapping confirmed booking conflicts with alternative recommendations (RI-A04)', () => {
    const query: KitRecommendationQuery = {
      bookingId: 'BK-CONF-001',
      shootType: 'Documentary',
      tier: 'STANDARD',
      availabilityFetchedAt: new Date().toISOString(),
      availabilityMap: {
        'BRPI-STUDIO-ASSIST-TRIPOD': {
          available: false,
          status: 'booked',
          conflictBookingId: 'BK-2026-0881',
        },
      },
    }

    const result = recommendKit(query)
    expect(result.evidenceState).toBe('needs_verification')
    const confItem = result.unavailableItems.find((i) => i.productId === 'BRPI-STUDIO-ASSIST-TRIPOD')
    expect(confItem).toBeDefined()
    expect(confItem?.alternative?.productId).toBe('BRPI-TRIPOD-STANDARD')
  })

  it('detects Ronin 4D + external handheld gimbal hard block (RI-A10)', () => {
    const query: KitRecommendationQuery = {
      bookingId: 'BK-RONIN-001',
      shootType: 'MusicVideo',
      tier: 'PREMIUM',
      availabilityFetchedAt: new Date().toISOString(),
      currentItems: [{ name: 'DJI RS 4 Pro Gimbal' }],
    }

    const result = recommendKit(query)
    expect(result.evidenceState).toBe('blocked')
    const roninBlock = result.advices.find((a) => a.id.includes('ronin-gimbal'))
    expect(roninBlock).toBeDefined()
    expect(roninBlock?.severity).toBe('urgent')
    expect(roninBlock?.explanation).toContain('HARD BLOCK')
  })

  it('detects heavy CHIOPT zoom without rods hard block (RI-A10)', () => {
    const query: KitRecommendationQuery = {
      bookingId: 'BK-CHIOPT-001',
      shootType: 'Film',
      tier: 'BUDGET',
      availabilityFetchedAt: new Date().toISOString(),
      currentItems: [{ name: 'CHIOPT 28-85mm Cinema Zoom' }],
    }

    const result = recommendKit(query)
    expect(result.evidenceState).toBe('blocked')
    const chioptBlock = result.advices.find((a) => a.id.includes('chiopt-support'))
    expect(chioptBlock).toBeDefined()
    expect(chioptBlock?.suggestedAdditions?.[0]?.displayName).toContain('15mm Rods')
  })

  it('never outputs unknown phantom IDs; all products conform to BRPI-* namespace (RI-A09)', () => {
    const genres = ['Wedding', 'MusicVideo', 'Documentary', 'Film', 'Corporate', 'Podcast', 'Travel'] as const
    for (const g of genres) {
      for (const tier of ['BUDGET', 'STANDARD', 'PREMIUM'] as const) {
        const bp = SHOOT_BLUEPRINTS[g][tier]
        for (const item of bp.items) {
          expect(item.productId.startsWith('BRPI-')).toBe(true)
          expect(item.displayName.length).toBeGreaterThan(0)
          expect(item.quantity).toBeGreaterThan(0)
        }
      }
    }
  })

  describe('RI-FIX-01: Canonical Availability Evidence and Freshness Gates', () => {
    it('fails closed with needs_verification when availabilityMap is missing despite fresh timestamp', () => {
      const query: KitRecommendationQuery = {
        bookingId: 'BK-FIX01-01',
        shootType: 'Wedding',
        tier: 'STANDARD',
        availabilityFetchedAt: new Date().toISOString(),
      }
      const result = recommendKit(query)
      expect(result.evidenceState).toBe('needs_verification')
      expect(result.advices.some((a) => a.explanation.includes('AVAILABILITY STALE: Equipment availability data is missing'))).toBe(true)
    })

    it('fails closed with needs_verification when availabilityMap is empty object', () => {
      const query: KitRecommendationQuery = {
        bookingId: 'BK-FIX01-02',
        shootType: 'Wedding',
        tier: 'STANDARD',
        availabilityFetchedAt: new Date().toISOString(),
        availabilityMap: {},
      }
      const result = recommendKit(query)
      expect(result.evidenceState).toBe('needs_verification')
      expect(result.advices.some((a) => a.explanation.includes('snapshot is empty'))).toBe(true)
    })

    it('fails closed when availabilityMap is present but availabilityFetchedAt is missing', () => {
      const query: KitRecommendationQuery = {
        bookingId: 'BK-FIX01-03',
        shootType: 'Wedding',
        tier: 'STANDARD',
        availabilityMap: {
          'BRPI-SONY-FX3A-BODY': { available: true, status: 'available' },
        },
      }
      const result = recommendKit(query)
      expect(result.evidenceState).toBe('needs_verification')
      expect(result.advices.some((a) => a.explanation.includes('lacks an authoritative fetch timestamp'))).toBe(true)
    })

    it('fails closed when availabilityFetchedAt is invalid unparseable string', () => {
      const query: KitRecommendationQuery = {
        bookingId: 'BK-FIX01-04',
        shootType: 'Wedding',
        tier: 'STANDARD',
        availabilityFetchedAt: 'not-a-valid-iso-date',
        availabilityMap: {
          'BRPI-SONY-FX3A-BODY': { available: true, status: 'available' },
        },
      }
      const result = recommendKit(query)
      expect(result.evidenceState).toBe('needs_verification')
      expect(result.advices.some((a) => a.explanation.includes('unparseable timestamp'))).toBe(true)
    })

    it('fails closed when availabilityFetchedAt exhibits future clock skew (> 60s)', () => {
      const futureTime = new Date(Date.now() + 120000).toISOString() // +2 minutes
      const query: KitRecommendationQuery = {
        bookingId: 'BK-FIX01-05',
        shootType: 'Wedding',
        tier: 'STANDARD',
        availabilityFetchedAt: futureTime,
        availabilityMap: {
          'BRPI-SONY-FX3A-BODY': { available: true, status: 'available' },
        },
      }
      const result = recommendKit(query)
      expect(result.evidenceState).toBe('needs_verification')
      expect(result.advices.some((a) => a.explanation.includes('clock skew detected'))).toBe(true)
    })

    it('fails closed when date window mismatch is detected between rental and availability query', () => {
      const query: KitRecommendationQuery = {
        bookingId: 'BK-FIX01-06',
        shootType: 'Wedding',
        tier: 'STANDARD',
        availabilityFetchedAt: new Date().toISOString(),
        rentalWindow: {
          pickupAtIso: '2026-12-01T06:00:00+05:45',
          returnAtIso: '2026-12-03T18:00:00+05:45',
        },
        availabilityWindow: {
          pickupAtIso: '2026-12-01T06:00:00+05:45',
          returnAtIso: '2026-12-02T18:00:00+05:45', // mismatched return window
        },
        availabilityMap: {
          'BRPI-SONY-FX3A-BODY': { available: true, status: 'available' },
        },
      }
      const result = recommendKit(query)
      expect(result.evidenceState).toBe('needs_verification')
      expect(result.advices.some((a) => a.explanation.includes('date window mismatch'))).toBe(true)
    })

    it('emits unconfirmed advice for items missing from partial availabilityMap', () => {
      const query: KitRecommendationQuery = {
        bookingId: 'BK-FIX01-07',
        shootType: 'Wedding',
        tier: 'STANDARD',
        availabilityFetchedAt: new Date().toISOString(),
        availabilityMap: {
          'BRPI-SONY-FX3A-BODY': { available: true, status: 'available' },
          // Missing NiSi, RS 4 Pro, Amaran 200d
        },
      }
      const result = recommendKit(query)
      expect(result.evidenceState).toBe('needs_verification')
      const unconfirmed = result.advices.filter((a) => a.explanation.includes('AVAILABILITY UNCONFIRMED'))
      expect(unconfirmed.length).toBeGreaterThan(0)
    })
  })
})
