import { toBs, formatBs, kathmanduCivil } from '../lib/bs'
import { rentalDaysBetween } from '../lib/rentalDays'
import { rupees, type Paisa } from '../lib/money'

export interface PublicCatalogueItem {
  id: string
  name: string
  category: 'Camera' | 'Lens' | 'Lighting' | 'Audio' | 'Support' | 'Power' | 'Media' | 'Accessory'
  brand: string
  description: string
  dailyRatePaisa: Paisa
  totalStock: number
  /** Booked or held unit count in the chosen window */
  bookedCount?: number
  features: string[]
  seed: string
}

export const PUBLIC_CATALOGUE_ITEMS: PublicCatalogueItem[] = [
  {
    id: 'PUB-CAM-FX6',
    name: 'Sony FX6 Cinema Camera',
    category: 'Camera',
    brand: 'Sony',
    description: 'Full-frame cinema line body with electronic variable ND, 4K 120fps, high dynamic range, and top handle audio build.',
    dailyRatePaisa: rupees(6000),
    totalStock: 3,
    features: ['Full-Frame 4K Sensor', 'Electronic Variable ND', 'Dual Base ISO (800/12800)', '16-bit RAW Output'],
    seed: 'cinema-camera-body',
  },
  {
    id: 'PUB-CAM-ALEXA',
    name: 'ARRI Alexa Mini LF',
    category: 'Camera',
    brand: 'ARRI',
    description: 'Large-format ARRI cinema package with titanium PL mount, Codex compact drives, and complete cage & battery build.',
    dailyRatePaisa: rupees(25000),
    totalStock: 2,
    features: ['Large-Format LF Sensor', 'Uncompressed ARRIRAW', 'ARRI Look Management', 'LBUS Lens Control'],
    seed: 'alexa-body',
  },
  {
    id: 'PUB-CAM-KOMODO',
    name: 'RED Komodo 6K',
    category: 'Camera',
    brand: 'RED',
    description: 'Ultra-compact cinema body with global shutter 6K sensor, RF mount, and SDI live video output.',
    dailyRatePaisa: rupees(12000),
    totalStock: 2,
    features: ['6K Global Shutter', 'REDCODE RAW', 'Canon RF Mount', 'Phase-Detect AF'],
    seed: 'komodo-rig',
  },
  {
    id: 'PUB-CAM-FX3',
    name: 'Sony FX3 Cinema Body',
    category: 'Camera',
    brand: 'Sony',
    description: 'Compact handheld cinema body with active cooling, in-body image stabilisation, and XLR handle unit.',
    dailyRatePaisa: rupees(8000),
    totalStock: 4,
    features: ['Full-Frame 4K 120p', 'Active Cooling Fan', '5-Axis In-Body IS', 'XLR Top Handle'],
    seed: 'sony-fx-body',
  },
  {
    id: 'PUB-LNS-NISI',
    name: 'NISI Athena Prime Set (5-Lens)',
    category: 'Lens',
    brand: 'NISI',
    description: 'Full frame cinema prime lens set: 14mm, 24mm, 35mm, 50mm, 85mm T1.9/T2.4 with matched gear positioning and colour.',
    dailyRatePaisa: rupees(4500),
    totalStock: 3,
    features: ['Matched T1.9 Speed', 'Standard 80mm Front Ring', 'Zero Breathing Design', 'Full-Frame Coverage'],
    seed: 'cine-primes',
  },
  {
    id: 'PUB-LNS-SIGMA',
    name: 'Sigma 24-70mm f/2.8 DG DN Art',
    category: 'Lens',
    brand: 'Sigma',
    description: 'Versatile standard zoom with fast f/2.8 constant aperture, exceptional sharpness across full-frame sensors.',
    dailyRatePaisa: rupees(1500),
    totalStock: 4,
    features: ['Constant f/2.8 Aperture', 'Sony E-Mount', 'Dust & Splash Proof', 'Nano Porous Coating'],
    seed: 'cine-lens-glass',
  },
  {
    id: 'PUB-LGT-600D',
    name: 'Aputure LS 600d Pro',
    category: 'Lighting',
    brand: 'Aputure',
    description: 'High-output 600W daylight-balanced COB LED light fixture with Bowens mount, wireless control, and weather resistance.',
    dailyRatePaisa: rupees(5000),
    totalStock: 3,
    features: ['600W Daylight COB', 'Weather-Resistant', 'Sidus Link Mesh Control', 'Standard Bowens Mount'],
    seed: 'film-lighting',
  },
  {
    id: 'PUB-SUP-RONIN4D',
    name: 'DJI Ronin 4D 6K Cinema System',
    category: 'Support',
    brand: 'DJI',
    description: 'Integrated 4-axis stabilised cinema camera system with LiDAR autofocus, wireless transmission, and active Z-axis.',
    dailyRatePaisa: rupees(16000),
    totalStock: 2,
    features: ['Active 4-Axis Z-Axis', 'LiDAR Rangefinder AF', 'ProRes RAW 6K', '20,000ft Video Transmission'],
    seed: 'gimbal-move',
  },
  {
    id: 'PUB-SUP-RS3',
    name: 'DJI RS 3 Pro Gimbal Stabilizer',
    category: 'Support',
    brand: 'DJI',
    description: 'Carbon-fibre 3-axis camera gimbal with automated axis locks, extended arms, and 4.5kg payload capacity.',
    dailyRatePaisa: rupees(2000),
    totalStock: 4,
    features: ['4.5kg Tested Payload', 'Carbon-Fibre Arms', 'Automated Axis Locks', 'OLED Touchscreen'],
    seed: 'gimbal-operator',
  },
  {
    id: 'PUB-AUD-WGO2',
    name: 'Rode Wireless GO II Dual Mic System',
    category: 'Audio',
    brand: 'Rode',
    description: 'Dual-channel wireless microphone system with onboard recording, 200m range, and rechargeable batteries.',
    dailyRatePaisa: rupees(700),
    totalStock: 5,
    features: ['Dual-Channel Receiver', '24+ Hours Onboard Memory', '200m Line-of-Sight Range', 'USB-C / 3.5mm Output'],
    seed: 'gear-handover',
  },
  {
    id: 'PUB-PWR-CORE98',
    name: 'Core SWX NANO Micro 98 V-Mount (Set of 4)',
    category: 'Power',
    brand: 'Core SWX',
    description: 'Ultra-compact 98Wh 14.8V lithium-ion battery pack with P-Tap, USB-A outputs, and 4-bay rapid charger.',
    dailyRatePaisa: rupees(1200),
    totalStock: 6,
    features: ['98Wh Flight-Safe Capacity', 'P-Tap & USB Power', '4-Bay Simultaneous Charger', 'LCD Runtime Meter'],
    seed: 'lens-cleaning',
  },
  {
    id: 'PUB-MED-CFA',
    name: 'Sony CFexpress Type A 160GB (Set of 2)',
    category: 'Media',
    brand: 'Sony',
    description: 'High-speed TOUGH specification memory cards offering up to 700MB/s write speeds for high frame-rate video recording.',
    dailyRatePaisa: rupees(500),
    totalStock: 6,
    features: ['800MB/s Read, 700MB/s Write', 'TOUGH Rigid Build', 'VPG 400 Certified', 'Dual-Slot Card Reader Included'],
    seed: 'packing-cases',
  },
]

export interface PublicScheduleState {
  pickupDate: string // YYYY-MM-DD
  pickupTime: string // HH:mm
  returnDate: string // YYYY-MM-DD
  returnTime: string // HH:mm
}

export interface PublicScheduleEvaluation {
  isFullySelected: boolean
  pickupIso: string | null
  returnIso: string | null
  rentalDays: number | null
  pickupBsFormatted: string | null
  returnBsFormatted: string | null
  validationError: string | null
}

/**
 * Evaluates the public schedule state according to Asia/Kathmandu (+05:45)
 * and the 06:00 AM rental day rollover boundary rule.
 */
export function evaluatePublicSchedule(state: PublicScheduleState): PublicScheduleEvaluation {
  const { pickupDate, pickupTime, returnDate, returnTime } = state

  if (!pickupDate || !pickupTime || !returnDate || !returnTime) {
    return {
      isFullySelected: false,
      pickupIso: null,
      returnIso: null,
      rentalDays: null,
      pickupBsFormatted: null,
      returnBsFormatted: null,
      validationError: null,
    }
  }

  const pickupIso = `${pickupDate}T${pickupTime}:00+05:45`
  const returnIso = `${returnDate}T${returnTime}:00+05:45`

  const pickupMs = Date.parse(pickupIso)
  const returnMs = Date.parse(returnIso)

  if (Number.isNaN(pickupMs) || Number.isNaN(returnMs)) {
    return {
      isFullySelected: false,
      pickupIso: null,
      returnIso: null,
      rentalDays: null,
      pickupBsFormatted: null,
      returnBsFormatted: null,
      validationError: 'Invalid date or time format.',
    }
  }

  if (returnMs <= pickupMs) {
    return {
      isFullySelected: false,
      pickupIso,
      returnIso,
      rentalDays: null,
      pickupBsFormatted: null,
      returnBsFormatted: null,
      validationError: 'Return date & time must be strictly after pickup date & time.',
    }
  }

  const rentalDays = rentalDaysBetween(pickupIso, returnIso)

  // Compute Bikram Sambat representations in Asia/Kathmandu
  const pickupCivil = new Date(kathmanduCivil(new Date(pickupMs)))
  const returnCivil = new Date(kathmanduCivil(new Date(returnMs)))

  const pBs = toBs(pickupCivil)
  const rBs = toBs(returnCivil)

  const pickupBsFormatted = pBs ? `${formatBs(pBs)} ${pBs.year} BS` : null
  const returnBsFormatted = rBs ? `${formatBs(rBs)} ${rBs.year} BS` : null

  return {
    isFullySelected: true,
    pickupIso,
    returnIso,
    rentalDays,
    pickupBsFormatted,
    returnBsFormatted,
    validationError: null,
  }
}

export type CatalogueAvailabilityStatus = 'available' | 'unavailable' | 'unknown'

export interface CatalogueItemAvailability {
  status: CatalogueAvailabilityStatus
  isAvailable: boolean
  /**
   * Internal bookable count for calculations.
   * Law §2: NEVER disclose to the public customer UI.
   */
  bookableCount?: number
}

/**
 * Derives equipment availability for a fully-selected schedule.
 * Gated strictly on schedule validity. If not fully selected, availability is LOCKED.
 * Never leaks raw stock counts or internal identifiers to public consumers.
 */
export function getCatalogueItemAvailability(
  item: PublicCatalogueItem,
  schedule: PublicScheduleEvaluation,
): CatalogueItemAvailability | null {
  if (!schedule.isFullySelected || !schedule.rentalDays || schedule.rentalDays < 1) {
    return null
  }

  // Authoritative availability based on stock and commitments
  const booked = item.bookedCount ?? 0
  const bookable = Math.max(0, item.totalStock - booked)
  const isAvailable = bookable > 0

  return {
    status: isAvailable ? 'available' : 'unavailable',
    isAvailable,
    bookableCount: bookable,
  }
}

/**
 * Simulated or RPC-backed query contract for bulk catalogue availability.
 * In accordance with Unified Launch Plan §2: returns available/unavailable/unknown.
 * Unknown is NOT available.
 */
export async function queryCatalogueAvailability(
  items: PublicCatalogueItem[],
  schedule: PublicScheduleEvaluation,
): Promise<Map<string, CatalogueAvailabilityStatus>> {
  const result = new Map<string, CatalogueAvailabilityStatus>()

  if (!schedule.isFullySelected || !schedule.rentalDays || schedule.rentalDays < 1) {
    return result
  }

  for (const item of items) {
    const avail = getCatalogueItemAvailability(item, schedule)
    result.set(item.id, avail ? avail.status : 'unknown')
  }

  return result
}
