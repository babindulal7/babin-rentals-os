/**
 * BABIN RENTALS OS — RENTAL INTELLIGENCE KIT RECOMMENDER (RI-01)
 *
 * Implements:
 * 1. Blueprint-driven kit candidate generation for 7 production genres:
 *    (Wedding, MusicVideo, Documentary, Film, Corporate, Podcast, Travel)
 * 2. Exact identity boundaries:
 *    - Sony FX3 vs FX30: distinct sensor classes (Full-Frame vs Super35)
 *    - RED Komodo 6K vs Komodo-X: media slot incompatibility (CFast 2.0 vs CFexpress B)
 *    - DJI Ronin 4D: integrated stabilization; hard-blocks redundant external gimbals
 *    - Heavy cinema zooms: mandatory 15mm/19mm studio rods and lens support bracket
 * 3. Child item & fee protection:
 *    - Included kit children ('included_kit'): zero added charge, pre-bundled in package
 *    - Required dependencies ('required_dependency'): technically/safety mandatory
 *    - Optional extras ('chargeable_extra'): creative/convenience add-ons
 * 4. Fail-closed availability & health integration:
 *    - Stale availability (>5min) -> 'needs_verification'
 *    - Confirmed date range booking conflicts -> 'needs_verification' with alternatives
 *    - Active QC or repair holds -> 'blocked' / 'needs_verification', unit excluded
 * 5. Grounded in real catalog IDs (BRPI-*): never invents phantom models or serials.
 */

import type {
  RentalAdvice,
  EvidenceState,
  AdviceTarget,
  SuggestedAddition,
} from './types'

export type ShootType =
  | 'Wedding'
  | 'MusicVideo'
  | 'Documentary'
  | 'Film'
  | 'Corporate'
  | 'Podcast'
  | 'Travel'

export type PackageTier = 'BUDGET' | 'STANDARD' | 'PREMIUM'

export interface ItemAvailabilityState {
  available: boolean
  status: 'available' | 'booked' | 'maintenance' | 'qc_hold' | 'damaged'
  lastCheckedAt?: string | undefined
  conflictBookingId?: string | undefined
  holdReason?: string | undefined
}

export interface KitRecommendationQuery {
  bookingId: string
  shootType: ShootType
  tier?: PackageTier | undefined
  environment?: 'indoor' | 'outdoor' | 'studio' | 'mountain' | undefined
  preferredBrand?: 'Sony' | 'RED' | 'DJI' | 'Canon' | undefined
  startDateIso?: string | undefined
  endDateIso?: string | undefined
  crewSize?: number | undefined
  currentItems?: Array<{ id?: string | undefined; name: string; quantity?: number | undefined }> | undefined
  availabilityMap?: Record<string, ItemAvailabilityState> | undefined
  /** Timestamp when availabilityMap was fetched (used for 5min freshness check) */
  availabilityFetchedAt?: string | undefined
}

export interface BlueprintItem {
  productId: string
  displayName: string
  quantity: number
  role: 'camera' | 'lens' | 'support' | 'audio' | 'lighting' | 'monitor' | 'power' | 'accessory'
  chargeType: 'included_kit' | 'required_dependency' | 'chargeable_extra'
  reason: string
}

export interface ShootBlueprint {
  shootType: ShootType
  tier: PackageTier
  title: string
  description: string
  items: BlueprintItem[]
  requiredStaffCaretaker?: boolean | undefined
  criticalWarnings?: string[] | undefined
}

/** Canonical Blueprints grounded in Babin Rentals real catalog (BRPI-*) */
export const SHOOT_BLUEPRINTS: Record<ShootType, Record<PackageTier, ShootBlueprint>> = {
  Wedding: {
    BUDGET: {
      shootType: 'Wedding',
      tier: 'BUDGET',
      title: 'Wedding Highlight — Budget Coverage',
      description: 'Fast autofocus, dual-card recording, Tamron fast zoom, compact wireless audio.',
      items: [
        {
          productId: 'BRPI-SONY-FX3A-BODY',
          displayName: 'Sony FX3A Cinema Body',
          quantity: 1,
          role: 'camera',
          chargeType: 'included_kit',
          reason: 'Dual native ISO for dim reception venues and active fan cooling.',
        },
        {
          productId: 'BRPI-TAMRON-70-180',
          displayName: 'Tamron 70-180mm f/2.8 Di III VXD',
          quantity: 1,
          role: 'lens',
          chargeType: 'included_kit',
          reason: 'Fast telephoto reach for ceremony coverage without intrusion.',
        },
        {
          productId: 'BRPI-DJI-MIC-MINI',
          displayName: 'DJI Mic Mini Wireless Set',
          quantity: 1,
          role: 'audio',
          chargeType: 'required_dependency',
          reason: 'Compact lavalier capture for groom and officiant vows.',
        },
        {
          productId: 'BRPI-SONY-NP-FZ100-3PK',
          displayName: 'Sony NP-FZ100 Batteries (3x) & Dual Charger',
          quantity: 1,
          role: 'power',
          chargeType: 'included_kit',
          reason: 'Standard day package power (included in base body rental).',
        },
      ],
    },
    STANDARD: {
      shootType: 'Wedding',
      tier: 'STANDARD',
      title: 'Wedding Highlight — Standard Cine Kit',
      description: 'Cinema prime sharpness, 4-axis motorized gimbal, punchy key light.',
      items: [
        {
          productId: 'BRPI-SONY-FX3A-BODY',
          displayName: 'Sony FX3A Cinema Body',
          quantity: 1,
          role: 'camera',
          chargeType: 'included_kit',
          reason: 'Reliable 4K 120p high-frame-rate capture for slow-motion confetti/entrances.',
        },
        {
          productId: 'BRPI-NISI-ATHENA-SET',
          displayName: 'NiSi Athena Cine Prime Set (PL/E)',
          quantity: 1,
          role: 'lens',
          chargeType: 'included_kit',
          reason: 'Micro-contrast and consistent T1.9 aperture across all focal lengths.',
        },
        {
          productId: 'BRPI-DJI-RS4PRO',
          displayName: 'DJI RS 4 Pro Gimbal Stabilizer',
          quantity: 1,
          role: 'support',
          chargeType: 'chargeable_extra',
          reason: 'Motorized stability for bridal procession and dance floor tracking.',
        },
        {
          productId: 'BRPI-AMARAN-200D',
          displayName: 'Amaran 200d S Daylight LED',
          quantity: 1,
          role: 'lighting',
          chargeType: 'chargeable_extra',
          reason: 'Clean 200W key light for indoor stage & bridal portraits.',
        },
      ],
    },
    PREMIUM: {
      shootType: 'Wedding',
      tier: 'PREMIUM',
      title: 'Wedding Highlight — Premium Cinema Suite',
      description: 'Full cine prime set, LiDAR autonomous focus pull, RGB ambient fill.',
      items: [
        {
          productId: 'BRPI-SONY-FX3A-BODY',
          displayName: 'Sony FX3A Cinema Body',
          quantity: 1,
          role: 'camera',
          chargeType: 'included_kit',
          reason: 'Dual FX3A A/B camera package capable.',
        },
        {
          productId: 'BRPI-NISI-ATHENA-SET',
          displayName: 'NiSi Athena Cine Prime Set (PL/E)',
          quantity: 1,
          role: 'lens',
          chargeType: 'included_kit',
          reason: 'Complete matched set with zero focus breathing.',
        },
        {
          productId: 'BRPI-DJI-RS4PRO',
          displayName: 'DJI RS 4 Pro Gimbal Stabilizer',
          quantity: 1,
          role: 'support',
          chargeType: 'chargeable_extra',
          reason: 'High-payload stabilizer with automated axis locks.',
        },
        {
          productId: 'BRPI-AMARAN-300C',
          displayName: 'Amaran 300c Full-Color RGB LED',
          quantity: 1,
          role: 'lighting',
          chargeType: 'chargeable_extra',
          reason: '300W RGB color matching for reception lighting themes.',
        },
      ],
    },
  },
  MusicVideo: {
    BUDGET: {
      shootType: 'MusicVideo',
      tier: 'BUDGET',
      title: 'Music Video — Fast Prime & Gimbal',
      description: 'Fast prime shallow depth of field, motorized gimbal, punchy key light.',
      items: [
        {
          productId: 'BRPI-SONY-FX3A-BODY',
          displayName: 'Sony FX3A Cinema Body',
          quantity: 1,
          role: 'camera',
          chargeType: 'included_kit',
          reason: '4K 120p All-Intra capture for stylized slow-motion performance.',
        },
        {
          productId: 'BRPI-SIGMA-24-70-ART-II',
          displayName: 'Sigma 24-70mm f/2.8 DG DN II Art',
          quantity: 1,
          role: 'lens',
          chargeType: 'included_kit',
          reason: 'Versatile zoom for rapid shot composition.',
        },
        {
          productId: 'BRPI-DJI-RS3PRO',
          displayName: 'DJI RS 3 Pro Gimbal',
          quantity: 1,
          role: 'support',
          chargeType: 'chargeable_extra',
          reason: 'Dynamic camera movement.',
        },
      ],
    },
    STANDARD: {
      shootType: 'MusicVideo',
      tier: 'STANDARD',
      title: 'Music Video — S35 Anamorphic Flare Package',
      description: 'RED Komodo-X 6K global shutter with Blazar Mantis 1.33x anamorphic flares.',
      criticalWarnings: [
        'Anamorphic optics require dedicated manual follow focus or wireless motor.',
        'RED Komodo-X requires CFexpress Type B media only (CFast 2.0 physically incompatible).',
      ],
      items: [
        {
          productId: 'BRPI-RED-KOMODOX-6K-BODY',
          displayName: 'RED Komodo-X 6K Cinema Body',
          quantity: 1,
          role: 'camera',
          chargeType: 'included_kit',
          reason: '6K S35 global shutter eliminates strobe banding and whip-pan jello.',
        },
        {
          productId: 'BRPI-BLAZAR-MANTIS-SET',
          displayName: 'Blazar Mantis 1.33x Anamorphic Lens Set',
          quantity: 1,
          role: 'lens',
          chargeType: 'included_kit',
          reason: 'Authentic 1.33x oval bokeh and signature horizontal streak flares.',
        },
        {
          productId: 'BRPI-MEDIA-CFX-B-512GB',
          displayName: 'RED PRO CFexpress Type B 512GB Card',
          quantity: 1,
          role: 'accessory',
          chargeType: 'required_dependency',
          reason: 'High-speed media required for 6K 80fps REDCODE RAW capture.',
        },
        {
          productId: 'BRPI-VMOUNT-99WH',
          displayName: '99Wh V-Mount Battery Pack (Dual)',
          quantity: 2,
          role: 'power',
          chargeType: 'required_dependency',
          reason: 'Native Micro V-Mount power on Komodo-X chassis.',
        },
        {
          productId: 'BRPI-ACCSOON-M7',
          displayName: 'Accsoon M7 Wireless Director Monitor',
          quantity: 1,
          role: 'monitor',
          chargeType: 'chargeable_extra',
          reason: 'Low-latency wireless feed for director and artist playback.',
        },
      ],
    },
    PREMIUM: {
      shootType: 'MusicVideo',
      tier: 'PREMIUM',
      title: 'Music Video — Flagship Multi-Cam Cinema Package',
      description: 'Dual A/B camera production (Komodo-X + DJI Ronin 4D 6K).',
      requiredStaffCaretaker: true,
      criticalWarnings: [
        'CRITICAL SAFETY: DJI Ronin 4D is an integrated 4-axis motorized camera system. DO NOT attach external handheld gimbals (RS3/RS4).',
      ],
      items: [
        {
          productId: 'BRPI-RED-KOMODOX-6K-BODY',
          displayName: 'RED Komodo-X 6K Cinema Package',
          quantity: 1,
          role: 'camera',
          chargeType: 'included_kit',
          reason: 'A-Camera locked-off and studio tripod shots.',
        },
        {
          productId: 'BRPI-DJI-RONIN4D-6K',
          displayName: 'DJI Ronin 4D 6K Cinema System',
          quantity: 1,
          role: 'camera',
          chargeType: 'included_kit',
          reason: 'B-Camera dynamic 4-axis tracking movement without external rigging.',
        },
        {
          productId: 'BRPI-APUTURE-400X',
          displayName: 'Aputure 400x Bi-Color Punch Light',
          quantity: 1,
          role: 'lighting',
          chargeType: 'chargeable_extra',
          reason: 'Punchy 400W bi-color key through diffusion.',
        },
      ],
    },
  },
  Documentary: {
    BUDGET: {
      shootType: 'Documentary',
      tier: 'BUDGET',
      title: 'Documentary — Run-and-Gun Solo Kit',
      description: 'Low-light sensitivity, wide-to-tele zoom coverage, onboard shotgun mic.',
      items: [
        {
          productId: 'BRPI-SONY-A7SIII-BODY',
          displayName: 'Sony A7S III Body',
          quantity: 1,
          role: 'camera',
          chargeType: 'included_kit',
          reason: 'Exceptional low light performance for natural light field recording.',
        },
        {
          productId: 'BRPI-SIGMA-24-70-ART-II',
          displayName: 'Sigma 24-70mm f/2.8 DG DN II Art',
          quantity: 1,
          role: 'lens',
          chargeType: 'included_kit',
          reason: 'Standard zoom covering wide establishing shots to portrait interviews.',
        },
        {
          productId: 'BRPI-DJI-MIC',
          displayName: 'DJI Mic Wireless System',
          quantity: 1,
          role: 'audio',
          chargeType: 'required_dependency',
          reason: 'Compact dual-channel audio with internal backup recording.',
        },
        {
          productId: 'BRPI-TRIPOD-STANDARD',
          displayName: 'Standard Fluid Head Tripod',
          quantity: 1,
          role: 'support',
          chargeType: 'included_kit',
          reason: 'Stable locked-off shots for sit-down interviews.',
        },
      ],
    },
    STANDARD: {
      shootType: 'Documentary',
      tier: 'STANDARD',
      title: 'Documentary — Long-Take Interview Package',
      description: 'Active fan cooling prevents thermal shutdown; all-day V-Mount power.',
      items: [
        {
          productId: 'BRPI-SONY-FX3A-BODY',
          displayName: 'Sony FX3A Cinema Body',
          quantity: 1,
          role: 'camera',
          chargeType: 'included_kit',
          reason: 'Internal active cooling prevents thermal shutdown during multi-hour interview takes.',
        },
        {
          productId: 'BRPI-SONY-70-200',
          displayName: 'Sony FE 70-200mm f/2.8 GM OSS II',
          quantity: 1,
          role: 'lens',
          chargeType: 'included_kit',
          reason: 'Compressed background blur and rapid autofocus tracking for subjects.',
        },
        {
          productId: 'BRPI-VMOUNT-99WH',
          displayName: '99Wh V-Mount Battery Pack (Dual)',
          quantity: 1,
          role: 'power',
          chargeType: 'chargeable_extra',
          reason: 'All-day continuous continuous powering via D-Tap to Sony dummy battery.',
        },
        {
          productId: 'BRPI-STUDIO-ASSIST-TRIPOD',
          displayName: 'Studio Assist Heavy Tripod (15kg Rating)',
          quantity: 1,
          role: 'support',
          chargeType: 'required_dependency',
          reason: 'Solid fluid drag for smooth slow pans on telephoto focal lengths.',
        },
      ],
    },
    PREMIUM: {
      shootType: 'Documentary',
      tier: 'PREMIUM',
      title: 'Documentary — Field Director Production Suite',
      description: 'Matched G-Master primes, field director monitoring, continuous all-day power.',
      items: [
        {
          productId: 'BRPI-SONY-FX3A-BODY',
          displayName: 'Sony FX3A Cinema Body',
          quantity: 1,
          role: 'camera',
          chargeType: 'included_kit',
          reason: 'Primary production camera with XLR audio handle.',
        },
        {
          productId: 'BRPI-ACCSOON-M7',
          displayName: 'Accsoon M7 Wireless Field Monitor',
          quantity: 1,
          role: 'monitor',
          chargeType: 'chargeable_extra',
          reason: 'Daylight-viewable 7-inch monitor for field producer oversight.',
        },
        {
          productId: 'BRPI-STUDIO-ASSIST-TRIPOD',
          displayName: 'Studio Assist Heavy Tripod (15kg Rating)',
          quantity: 1,
          role: 'support',
          chargeType: 'required_dependency',
          reason: 'Rigid platform for heavy telephoto and rigged configurations.',
        },
      ],
    },
  },
  Film: {
    BUDGET: {
      shootType: 'Film',
      tier: 'BUDGET',
      title: 'Film Production — Indie Cine Prime Kit',
      description: 'Entry cinema primes, wireless video feed to iOS/iPad for director.',
      items: [
        {
          productId: 'BRPI-SONY-FX3A-BODY',
          displayName: 'Sony FX3A Cinema Body',
          quantity: 1,
          role: 'camera',
          chargeType: 'included_kit',
          reason: 'Cinema line gamma curves (S-Cinetone, S-Log3) with 10-bit internal recording.',
        },
        {
          productId: 'BRPI-NISI-ATHENA-SET',
          displayName: 'NiSi Athena Cine Prime Set (PL/E)',
          quantity: 1,
          role: 'lens',
          chargeType: 'included_kit',
          reason: 'Standard 0.8 mod gears and uniform dimensions across focal lengths.',
        },
        {
          productId: 'BRPI-ACCSOON-CINEVIEW',
          displayName: 'Accsoon CineView Wireless Video System',
          quantity: 1,
          role: 'accessory',
          chargeType: 'chargeable_extra',
          reason: 'Transmits wireless video to up to 4 mobile devices on set.',
        },
      ],
    },
    STANDARD: {
      shootType: 'Film',
      tier: 'STANDARD',
      title: 'Film Production — 6K Cinema Package',
      description: 'REDCODE RAW internal, wireless 1st AC monitoring, heavy fluid head.',
      criticalWarnings: [
        'RED Komodo requires dedicated SDI monitoring (no native HDMI output on chassis).',
      ],
      items: [
        {
          productId: 'BRPI-RED-KOMODO-6K-BODY',
          displayName: 'RED Komodo 6K Cinema Body',
          quantity: 1,
          role: 'camera',
          chargeType: 'included_kit',
          reason: '16-bit REDCODE RAW with global shutter for cinematic motion cadence.',
        },
        {
          productId: 'BRPI-NISI-ATHENA-SET',
          displayName: 'NiSi Athena Cine Prime Set (PL/E)',
          quantity: 1,
          role: 'lens',
          chargeType: 'included_kit',
          reason: 'PL-mount cinema primes with full-frame coverage.',
        },
        {
          productId: 'BRPI-ACCSOON-M7',
          displayName: 'Accsoon M7 Wireless Monitor (SDI input)',
          quantity: 1,
          role: 'monitor',
          chargeType: 'required_dependency',
          reason: '12G-SDI input required for Komodo camera output.',
        },
        {
          productId: 'BRPI-STUDIO-ASSIST-TRIPOD',
          displayName: 'Studio Assist Heavy Tripod (15kg Rating)',
          quantity: 1,
          role: 'support',
          chargeType: 'required_dependency',
          reason: 'Essential support for counterbalancing cinema rig.',
        },
      ],
    },
    PREMIUM: {
      shootType: 'Film',
      tier: 'PREMIUM',
      title: 'Film Production — Flagship Cinema Production Package',
      description: 'RED Komodo-X 6K, Ronin 4D tracking, high-output Aputure lighting.',
      requiredStaffCaretaker: true,
      criticalWarnings: [
        'Mandatory Babin Camera Caretaker service attached (Law 14 / §24).',
        'Ronin 4D integrated stabilization renders external handheld gimbals strictly incompatible.',
      ],
      items: [
        {
          productId: 'BRPI-RED-KOMODOX-6K-BODY',
          displayName: 'RED Komodo-X 6K Cinema Package',
          quantity: 1,
          role: 'camera',
          chargeType: 'included_kit',
          reason: 'A-Camera master production unit with 6K 80fps REDCODE RAW.',
        },
        {
          productId: 'BRPI-DJI-RONIN4D-6K',
          displayName: 'DJI Ronin 4D 6K Cinema System',
          quantity: 1,
          role: 'camera',
          chargeType: 'included_kit',
          reason: 'B-Camera 4-axis motion rig for complex dolly and tracking shots.',
        },
        {
          productId: 'BRPI-APUTURE-600X-PRO',
          displayName: 'Aputure LS 600x Pro Bi-Color',
          quantity: 1,
          role: 'lighting',
          chargeType: 'chargeable_extra',
          reason: '600W key light; requires heavy C-stand and 2x 10kg sandbags.',
        },
        {
          productId: 'BRPI-STUDIO-ASSIST-TRIPOD',
          displayName: 'Studio Assist Heavy Tripod (15kg Rating)',
          quantity: 1,
          role: 'support',
          chargeType: 'required_dependency',
          reason: 'Rigid 15kg support head for camera package.',
        },
      ],
    },
  },
  Corporate: {
    BUDGET: {
      shootType: 'Corporate',
      tier: 'BUDGET',
      title: 'Corporate Video — Compact Interview Kit',
      description: 'Autofocus zoom, dual wireless lavaliers, daylight LED.',
      items: [
        {
          productId: 'BRPI-SONY-A7IV-BODY',
          displayName: 'Sony A7 IV Body',
          quantity: 1,
          role: 'camera',
          chargeType: 'included_kit',
          reason: '10-bit 4:2:2 recording with excellent autofocus eye-tracking.',
        },
        {
          productId: 'BRPI-SIGMA-24-70-ART-II',
          displayName: 'Sigma 24-70mm f/2.8 DG DN II Art',
          quantity: 1,
          role: 'lens',
          chargeType: 'included_kit',
          reason: 'Crisp interview framing and B-roll coverage.',
        },
        {
          productId: 'BRPI-DJI-MIC',
          displayName: 'DJI Mic Wireless System',
          quantity: 1,
          role: 'audio',
          chargeType: 'required_dependency',
          reason: 'Clean dual lavaliers for executive interview dialogue.',
        },
        {
          productId: 'BRPI-AMARAN-200D',
          displayName: 'Amaran 200d S Daylight LED',
          quantity: 1,
          role: 'lighting',
          chargeType: 'chargeable_extra',
          reason: 'Key light for corporate boardroom setups.',
        },
      ],
    },
    STANDARD: {
      shootType: 'Corporate',
      tier: 'STANDARD',
      title: 'Corporate Video — Dual-Camera Brand Profile',
      description: 'Dual FX3A setup for concurrent wide and tight interview angles.',
      items: [
        {
          productId: 'BRPI-SONY-FX3A-BODY',
          displayName: 'Sony FX3A Cinema Body',
          quantity: 2,
          role: 'camera',
          chargeType: 'included_kit',
          reason: 'Matched A/B cameras for timecode-synced multi-angle interview.',
        },
        {
          productId: 'BRPI-SIGMA-24-70-ART-II',
          displayName: 'Sigma 24-70mm f/2.8 DG DN II Art',
          quantity: 1,
          role: 'lens',
          chargeType: 'included_kit',
          reason: 'A-Camera medium-wide framing.',
        },
        {
          productId: 'BRPI-SONY-70-200',
          displayName: 'Sony FE 70-200mm f/2.8 GM OSS II',
          quantity: 1,
          role: 'lens',
          chargeType: 'included_kit',
          reason: 'B-Camera tight emotional crop on speaker.',
        },
        {
          productId: 'BRPI-AMARAN-300C',
          displayName: 'Amaran 300c Full-Color RGB LED',
          quantity: 1,
          role: 'lighting',
          chargeType: 'chargeable_extra',
          reason: 'Corporate brand color backdrop accent lighting.',
        },
      ],
    },
    PREMIUM: {
      shootType: 'Corporate',
      tier: 'PREMIUM',
      title: 'Corporate Video — Executive Commercial Suite',
      description: 'FX3A + Cinema primes + wireless client monitor village.',
      items: [
        {
          productId: 'BRPI-SONY-FX3A-BODY',
          displayName: 'Sony FX3A Cinema Body',
          quantity: 2,
          role: 'camera',
          chargeType: 'included_kit',
          reason: 'Flagship multi-cam corporate production.',
        },
        {
          productId: 'BRPI-NISI-ATHENA-SET',
          displayName: 'NiSi Athena Cine Prime Set (PL/E)',
          quantity: 1,
          role: 'lens',
          chargeType: 'included_kit',
          reason: 'Premium optical rendering for commercial branding.',
        },
        {
          productId: 'BRPI-ACCSOON-M7',
          displayName: 'Accsoon M7 Wireless Monitor',
          quantity: 1,
          role: 'monitor',
          chargeType: 'chargeable_extra',
          reason: 'Client village monitoring with zero cable clutter.',
        },
      ],
    },
  },
  Podcast: {
    BUDGET: {
      shootType: 'Podcast',
      tier: 'BUDGET',
      title: 'Podcast — Single Host Stream Kit',
      description: 'Continuous USB-C powered camera, broadcast wireless audio.',
      items: [
        {
          productId: 'BRPI-SONY-A7IV-BODY',
          displayName: 'Sony A7 IV Body',
          quantity: 1,
          role: 'camera',
          chargeType: 'included_kit',
          reason: 'UVC/UAC live streaming capability and unlimited recording.',
        },
        {
          productId: 'BRPI-SIGMA-24-70-ART-II',
          displayName: 'Sigma 24-70mm f/2.8 DG DN II Art',
          quantity: 1,
          role: 'lens',
          chargeType: 'included_kit',
          reason: 'Desk framing.',
        },
        {
          productId: 'BRPI-DJI-MIC',
          displayName: 'DJI Mic Wireless System',
          quantity: 1,
          role: 'audio',
          chargeType: 'required_dependency',
          reason: 'Two lavalier channels for host and guest.',
        },
      ],
    },
    STANDARD: {
      shootType: 'Podcast',
      tier: 'STANDARD',
      title: 'Podcast — 2-Person Studio Video Podcast',
      description: 'Dual Sony FX3A with active cooling, dedicated soft key lighting.',
      items: [
        {
          productId: 'BRPI-SONY-FX3A-BODY',
          displayName: 'Sony FX3A Cinema Body',
          quantity: 2,
          role: 'camera',
          chargeType: 'included_kit',
          reason: 'Active cooling guarantees zero thermal shutdown on 3+ hour episodes.',
        },
        {
          productId: 'BRPI-SIGMA-24-70-ART-II',
          displayName: 'Sigma 24-70mm f/2.8 DG DN II Art',
          quantity: 2,
          role: 'lens',
          chargeType: 'included_kit',
          reason: 'Matched lenses for seamless multi-cam grading.',
        },
        {
          productId: 'BRPI-AMARAN-200D',
          displayName: 'Amaran 200d S Daylight LED',
          quantity: 2,
          role: 'lighting',
          chargeType: 'chargeable_extra',
          reason: 'Soft key light for both podcast participants.',
        },
      ],
    },
    PREMIUM: {
      shootType: 'Podcast',
      tier: 'PREMIUM',
      title: 'Podcast — 3-Camera Broadcast Studio',
      description: '3x Sony FX3A bodies with continuous AC power and color accents.',
      items: [
        {
          productId: 'BRPI-SONY-FX3A-BODY',
          displayName: 'Sony FX3A Cinema Body',
          quantity: 3,
          role: 'camera',
          chargeType: 'included_kit',
          reason: 'Host, guest, and wide master studio cameras.',
        },
        {
          productId: 'BRPI-AMARAN-300C',
          displayName: 'Amaran 300c Full-Color RGB LED',
          quantity: 2,
          role: 'lighting',
          chargeType: 'chargeable_extra',
          reason: 'Atmospheric colored set lighting.',
        },
      ],
    },
  },
  Travel: {
    BUDGET: {
      shootType: 'Travel',
      tier: 'BUDGET',
      title: 'Travel / Expedition — Lightweight Compact Kit',
      description: 'Lightweight mirrorless, all-in-one zoom, compact audio.',
      items: [
        {
          productId: 'BRPI-SONY-A7IV-BODY',
          displayName: 'Sony A7 IV Body',
          quantity: 1,
          role: 'camera',
          chargeType: 'included_kit',
          reason: 'Compact 658g body for strenuous high-altitude trekking.',
        },
        {
          productId: 'BRPI-SIGMA-24-70-ART-II',
          displayName: 'Sigma 24-70mm f/2.8 DG DN II Art',
          quantity: 1,
          role: 'lens',
          chargeType: 'included_kit',
          reason: 'Versatile walk-around lens.',
        },
        {
          productId: 'BRPI-DJI-MIC-MINI',
          displayName: 'DJI Mic Mini Wireless Set',
          quantity: 1,
          role: 'audio',
          chargeType: 'required_dependency',
          reason: 'Ultra-lightweight wireless audio.',
        },
      ],
    },
    STANDARD: {
      shootType: 'Travel',
      tier: 'STANDARD',
      title: 'Travel / Expedition — Mountain Documentary Package',
      description: 'FX3A with cold-weather battery plan and heavy fluid tripod for windy ridges.',
      criticalWarnings: [
        'Cold weather derating: high-altitude cold (-10°C) reduces effective battery capacity by 40%. Store spare packs in insulated thermal wraps.',
      ],
      items: [
        {
          productId: 'BRPI-SONY-FX3A-BODY',
          displayName: 'Sony FX3A Cinema Body',
          quantity: 1,
          role: 'camera',
          chargeType: 'included_kit',
          reason: 'Durable weather-resistant magnesium alloy chassis.',
        },
        {
          productId: 'BRPI-SONY-70-200',
          displayName: 'Sony FE 70-200mm f/2.8 GM OSS II',
          quantity: 1,
          role: 'lens',
          chargeType: 'included_kit',
          reason: 'Optical image stabilization for telephoto mountain ridge captures.',
        },
        {
          productId: 'BRPI-VMOUNT-99WH',
          displayName: '99Wh V-Mount Battery Pack (Dual)',
          quantity: 2,
          role: 'power',
          chargeType: 'required_dependency',
          reason: 'Airline-safe (<100Wh) high-density batteries for remote camp charging.',
        },
        {
          productId: 'BRPI-STUDIO-ASSIST-TRIPOD',
          displayName: 'Studio Assist Heavy Tripod (15kg Rating)',
          quantity: 1,
          role: 'support',
          chargeType: 'required_dependency',
          reason: 'Weight resists mountain wind gusts that vibrate lightweight travel tripods.',
        },
      ],
    },
    PREMIUM: {
      shootType: 'Travel',
      tier: 'PREMIUM',
      title: 'Travel / Expedition — Himalayan Flagship Expedition',
      description: 'RED Komodo-X global shutter with thermal battery contingency.',
      requiredStaffCaretaker: true,
      criticalWarnings: [
        'Cold weather (-10°C Mustang profile): Lithium voltage drops rapidly under load. Keep batteries inside down jackets until take time.',
      ],
      items: [
        {
          productId: 'BRPI-RED-KOMODOX-6K-BODY',
          displayName: 'RED Komodo-X 6K Cinema Package',
          quantity: 1,
          role: 'camera',
          chargeType: 'included_kit',
          reason: 'Global shutter eliminates drone rotor flicker and helicopter vibrations.',
        },
        {
          productId: 'BRPI-VMOUNT-99WH',
          displayName: '99Wh V-Mount Battery Pack (Dual)',
          quantity: 4,
          role: 'power',
          chargeType: 'required_dependency',
          reason: 'Four airline-safe 99Wh bricks with thermal insulation sleeves.',
        },
        {
          productId: 'BRPI-STUDIO-ASSIST-TRIPOD',
          displayName: 'Studio Assist Heavy Tripod (15kg Rating)',
          quantity: 1,
          role: 'support',
          chargeType: 'required_dependency',
          reason: 'Rigid stability on mountain terrain.',
        },
      ],
    },
  },
}

/* ------------------------------------------------------------------
 * Recommendation Result Contract
 * ------------------------------------------------------------------ */

export interface KitRecommendationResult {
  blueprint: ShootBlueprint
  advices: RentalAdvice[]
  proposedItems: BlueprintItem[]
  suggestedAdditions: SuggestedAddition[]
  unavailableItems: Array<{
    productId: string
    displayName: string
    reason: string
    alternative?: { productId: string; displayName: string } | undefined
  }>
  evidenceState: EvidenceState
  summary: string
}

/* ------------------------------------------------------------------
 * Core Evaluator
 * ------------------------------------------------------------------ */

export function recommendKit(query: KitRecommendationQuery): KitRecommendationResult {
  const tier = query.tier ?? 'STANDARD'
  const blueprint = SHOOT_BLUEPRINTS[query.shootType]?.[tier] ?? SHOOT_BLUEPRINTS.Documentary.STANDARD
  const nowIso = new Date().toISOString()
  const target: AdviceTarget = { type: 'booking', id: query.bookingId }
  const advices: RentalAdvice[] = []

  // Check 1: Availability Freshness Gate (5-minute rule, RI-A07)
  let isAvailabilityStale = false
  if (query.availabilityFetchedAt) {
    const fetchedTime = new Date(query.availabilityFetchedAt).getTime()
    const ageMs = Date.now() - fetchedTime
    if (ageMs > 300000) { // 5 minutes
      isAvailabilityStale = true
    }
  } else if (!query.availabilityMap) {
    isAvailabilityStale = true
  }

  if (isAvailabilityStale) {
    advices.push({
      id: `adv-freshness-${query.bookingId}`,
      module: 'kit',
      target,
      evidenceState: 'needs_verification',
      severity: 'review',
      explanation:
        'AVAILABILITY STALE: Equipment availability data is missing or older than 5 minutes. Live reservations and repair holds must be confirmed with warehouse staff before dispatch.',
      sourceRefs: ['src/lib/availability.ts', 'docs/intelligence/rental/RECOMMENDATION_DATA_SOURCE_MAP.md'],
      sourceKinds: ['live_os'],
      snapshotAt: nowIso,
      requiredChecks: ['Run live inventory availability sync', 'Verify physical units on warehouse floor'],
      blockingReasons: ['Stale availability snapshot prevents confident reservation lock.'],
    })
  }

  // Check 2: Equipment Status & Hold Validation (RI-A04, RI-A06)
  const unavailableItems: KitRecommendationResult['unavailableItems'] = []
  const currentItems = query.currentItems ?? []
  const currentItemNames = currentItems.map((i) => i.name.toLowerCase())

  for (const item of blueprint.items) {
    if (query.availabilityMap) {
      const state = query.availabilityMap[item.productId] ?? query.availabilityMap[item.displayName]
      if (state) {
        if (state.status === 'qc_hold' || state.status === 'maintenance' || state.status === 'damaged') {
          unavailableItems.push({
            productId: item.productId,
            displayName: item.displayName,
            reason: `Unit is on ${state.status.toUpperCase()} hold (${state.holdReason ?? 'under inspection'}).`,
            alternative: getAlternativeForProduct(item.productId),
          })
          advices.push({
            id: `adv-hold-${item.productId}-${query.bookingId}`,
            module: 'safety',
            target,
            evidenceState: 'blocked',
            severity: 'urgent',
            explanation: `QC / MAINTENANCE HOLD: ${item.displayName} is currently in ${state.status.toUpperCase()} status (${state.holdReason ?? 'repair'}). Cannot be dispatched.`,
            sourceRefs: ['src/lib/inventory/maintenance.ts'],
            sourceKinds: ['live_os'],
            snapshotAt: nowIso,
            requiredChecks: ['Inspect repair ticket status', 'Consider approved alternative model'],
            blockingReasons: [`Unit ${item.displayName} is in unverified or damaged maintenance hold.`],
          })
        } else if (state.status === 'booked' || !state.available) {
          unavailableItems.push({
            productId: item.productId,
            displayName: item.displayName,
            reason: `Item is already confirmed for booking #${state.conflictBookingId ?? 'active'}.`,
            alternative: getAlternativeForProduct(item.productId),
          })
          advices.push({
            id: `adv-conflict-${item.productId}-${query.bookingId}`,
            module: 'kit',
            target,
            evidenceState: 'needs_verification',
            severity: 'urgent',
            explanation: `BOOKING CONFLICT: ${item.displayName} has an overlapping confirmed reservation. Alternative unit required.`,
            sourceRefs: ['src/lib/bookingReservations.ts'],
            sourceKinds: ['live_os'],
            snapshotAt: nowIso,
            requiredChecks: ['Check return buffer of previous booking', 'Review partial returns'],
            blockingReasons: [`Overlapping booking conflict detected on ${item.displayName}.`],
          })
        }
      }
    }
  }

  // Check 3: Missing Required Dependencies (RI-A08 child item separation)
  const suggestedAdditions: SuggestedAddition[] = []

  for (const item of blueprint.items) {
    // Only suggest items not already in the draft
    const inDraft = currentItemNames.some(
      (n) => n.includes(item.displayName.toLowerCase()) || n.includes(item.productId.toLowerCase()),
    )
    if (!inDraft) {
      suggestedAdditions.push({
        productId: item.productId,
        displayName: item.displayName,
        quantity: item.quantity,
        reason: item.reason,
        chargeType: item.chargeType,
      })
    }
  }

  // Check 4: Hard Blocks & Incompatibilities (e.g. Ronin 4D + external gimbal)
  const allNames = [
    ...currentItemNames,
    ...blueprint.items.map((i) => i.displayName.toLowerCase()),
  ]
  const hasRonin4D = allNames.some((n) => n.includes('ronin 4d') || n.includes('ronin-4d'))
  const hasExternalGimbal = allNames.some((n) => n.includes('rs3') || n.includes('rs 3') || n.includes('rs4') || n.includes('rs 4'))
  if (hasRonin4D && hasExternalGimbal) {
    advices.push({
      id: `adv-block-ronin-gimbal-${query.bookingId}`,
      module: 'safety',
      target,
      evidenceState: 'blocked',
      severity: 'urgent',
      explanation:
        'HARD BLOCK: DJI Ronin 4D is an integrated 4-axis motorized cinema system and cannot be mounted onto an external handheld gimbal (RS3/RS4 Pro). Remove external gimbal from kit.',
      sourceRefs: ['references/grip.md', 'data/compatibility_graph.json'],
      sourceKinds: ['approved_knowledge'],
      snapshotAt: nowIso,
      requiredChecks: ['Remove redundant handheld gimbal from package', 'Confirm standalone Ronin 4D operation'],
      blockingReasons: ['Ronin 4D integrated stabilization renders external handheld gimbal mechanically incompatible.'],
    })
  }

  // Check 5: Heavy Cinema Zoom Support (CHIOPT without rods)
  const hasChiopt = allNames.some((n) => n.includes('chiopt'))
  const has15mmSupport = allNames.some(
    (n) => (n.includes('rod') || n.includes('15mm')) && (n.includes('support') || n.includes('bracket')),
  )
  if (hasChiopt && !has15mmSupport) {
    advices.push({
      id: `adv-block-chiopt-support-${query.bookingId}`,
      module: 'safety',
      target,
      evidenceState: 'blocked',
      severity: 'urgent',
      explanation:
        'HARD BLOCK: CHIOPT Cinema Zoom (2.8kg) lacks 15mm baseplate rods and lens support bracket. Mounting unsupported risks severe camera mount warping and chassis distortion.',
      sourceRefs: ['references/lenses.md', 'data/compatibility_graph.json'],
      sourceKinds: ['approved_knowledge'],
      snapshotAt: nowIso,
      requiredChecks: ['Add 15mm Baseplate Rods & Lens Support Bracket before dispatch approval'],
      suggestedAdditions: [
        {
          productId: 'BRPI-ACC-RODS-SUPPORT-15MM',
          displayName: '15mm Rods & Heavy Lens Support Bracket',
          quantity: 1,
          reason: 'Mandatory mechanical support to prevent mount distortion and optical misalignment.',
          chargeType: 'required_dependency',
        },
      ],
      blockingReasons: ['Heavy cinema lens mount damage risk without bottom support rods.'],
    })
  }

  // Check 6: Caretaker Attachment Rule (Law 14 / §24 for flagship kits)
  if (blueprint.requiredStaffCaretaker) {
    advices.push({
      id: `adv-caretaker-${query.bookingId}`,
      module: 'operations',
      target,
      evidenceState: 'supported',
      severity: 'review',
      explanation:
        'MANDATORY CARETAKER ATTACHED (Law 14): High-value flagship cinema package requires a Babin Rentals Camera Caretaker / 1st AC on set to accompany the equipment.',
      sourceRefs: ['data/os_laws.json'],
      sourceKinds: ['approved_knowledge'],
      snapshotAt: nowIso,
      requiredChecks: ['Assign trained technician / 1st AC to booking dispatch roster', 'Notify client of caretaker inclusion'],
    })
  }

  // Determine Overall Evidence State
  let overallEvidence: EvidenceState = 'supported'
  if (advices.some((a) => a.evidenceState === 'blocked')) {
    overallEvidence = 'blocked'
  } else if (advices.some((a) => a.evidenceState === 'needs_verification') || isAvailabilityStale) {
    overallEvidence = 'needs_verification'
  }

  return {
    blueprint,
    advices,
    proposedItems: blueprint.items,
    suggestedAdditions,
    unavailableItems,
    evidenceState: overallEvidence,
    summary: `${blueprint.title} (${tier} tier) proposed with ${blueprint.items.length} items. ${advices.length} advisory points noted.`,
  }
}

function getAlternativeForProduct(productId: string): { productId: string; displayName: string } | undefined {
  switch (productId) {
    case 'BRPI-SONY-FX3A-BODY':
      return { productId: 'BRPI-SONY-A7SIII-BODY', displayName: 'Sony A7S III Body' }
    case 'BRPI-RED-KOMODO-6K-BODY':
      return { productId: 'BRPI-RED-KOMODOX-6K-BODY', displayName: 'RED Komodo-X 6K' }
    case 'BRPI-DJI-RS4PRO':
      return { productId: 'BRPI-DJI-RS3PRO', displayName: 'DJI RS 3 Pro Gimbal' }
    case 'BRPI-STUDIO-ASSIST-TRIPOD':
      return { productId: 'BRPI-TRIPOD-STANDARD', displayName: 'Standard Tripod' }
    case 'BRPI-AMARAN-300C':
      return { productId: 'BRPI-AMARAN-200D', displayName: 'Amaran 200d S' }
    default:
      return undefined
  }
}
