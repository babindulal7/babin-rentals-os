import {
  useCallback,
  useMemo,
  useState,
  type Dispatch,
  type SetStateAction,
} from 'react'
import { getBusinessToday, toBs, type BsDate } from '../../../lib/bs'
import {
  DAY,
  SHOOT_PRESETS,
  bookingDays,
  bookingInstant,
} from './newRentalUtils'
import type { BookingWindow } from './itemCatalogue'

export interface UseNewRentalTimingOptions {
  searchParams: URLSearchParams
}

export interface UseNewRentalTimingResult {
  pickup: string
  setPickup: Dispatch<SetStateAction<string>>
  ret: string
  setRet: Dispatch<SetStateAction<string>>
  pickupTime: string
  setPickupTime: Dispatch<SetStateAction<string>>
  returnTime: string
  setReturnTime: Dispatch<SetStateAction<string>>
  pickupAt: Date | null
  returnAt: Date | null
  days: number
  dayWord: 'day' | 'days'
  bookingWindow: BookingWindow
  pickupBs: BsDate | null
  applyShootPreset: (presetId: (typeof SHOOT_PRESETS)[number]['id']) => void
}

/**
 * Encapsulates rental window timing, Kathmandu business day defaults,
 * calendar conversion (AD/BS), and fast shoot duration presets.
 */
/**
 * L1 (RULINGS-2026-10-26-workflow.md): New Rental opens with
 * **tomorrow 06:00 → the next day 06:00** and quick length chips
 * 1 day · 2 days · 3 days · 1 week (those chips already live in
 * `DatePresets.DEFAULT_PRESETS`). The 06:00 pair is the operational-day
 * boundary, so the default window measures exactly one rental day —
 * R-39's "defaults are doctrine": the most common booking is opened ready
 * to confirm, not today-09:00-back-to-front as before.
 */
const RENTAL_DAY_CLOCK = '06:00'

/** The L1 default pickup date: tomorrow's business date (Kathmandu civil). */
function defaultPickupIso(): string {
  return new Date(getBusinessToday().getTime() + DAY).toISOString().slice(0, 10)
}

/** The L1 default return date: one day after a pickup date. */
function defaultReturnIso(pickupIso: string): string {
  return new Date(new Date(`${pickupIso}T12:00:00.000Z`).getTime() + DAY).toISOString().slice(0, 10)
}

export function useNewRentalTiming({
  searchParams,
}: UseNewRentalTimingOptions): UseNewRentalTimingResult {
  const fromParam = searchParams.get('from')
  const toParam = searchParams.get('to')

  const [pickup, setPickup] = useState(() =>
    fromParam && !Number.isNaN(Date.parse(fromParam))
      ? fromParam
      : defaultPickupIso(),
  )
  const [ret, setRet] = useState(() => {
    if (toParam && !Number.isNaN(Date.parse(toParam))) return toParam
    /* When only the pickup came in, the default return keeps the window
       anchored to THAT pickup (from + 1 day), not to today — a return
       measured from a different day than its pickup is never what staff
       meant. */
    const base = fromParam && !Number.isNaN(Date.parse(fromParam)) ? fromParam : defaultPickupIso()
    return defaultReturnIso(base)
  })
  const [pickupTime, setPickupTime] = useState(RENTAL_DAY_CLOCK)
  const [returnTime, setReturnTime] = useState(RENTAL_DAY_CLOCK)

  const pickupAt = useMemo(() => bookingInstant(pickup, pickupTime), [pickup, pickupTime])
  const returnAt = useMemo(() => bookingInstant(ret, returnTime), [ret, returnTime])
  const days = useMemo(() => bookingDays(pickupAt, returnAt), [pickupAt, returnAt])
  const dayWord = days === 1 ? 'day' : 'days'
  const bookingWindow = useMemo<BookingWindow>(
    () => ({ pickupAd: pickupAt, returnAd: returnAt }),
    [pickupAt, returnAt],
  )
  const pickupBs = useMemo(() => toBs(new Date(pickup)), [pickup])

  const applyShootPreset = useCallback(
    (presetId: (typeof SHOOT_PRESETS)[number]['id']) => {
      const base = new Date(pickup ? `${pickup}T12:00:00Z` : `${getBusinessToday().toISOString().slice(0, 10)}T12:00:00Z`)
      if (Number.isNaN(base.getTime())) return

      if (presetId === '1-day') {
        const pStr = base.toISOString().slice(0, 10)
        setPickup(pStr)
        setPickupTime('07:00')
        setRet(pStr)
        setReturnTime('20:00')
      } else if (presetId === 'weekend') {
        const dayOfWeek = base.getDay()
        const daysUntilFriday = (5 - dayOfWeek + 7) % 7
        const fri = new Date(base.getTime() + daysUntilFriday * DAY)
        const mon = new Date(fri.getTime() + 3 * DAY)
        setPickup(fri.toISOString().slice(0, 10))
        setPickupTime('14:00')
        setRet(mon.toISOString().slice(0, 10))
        setReturnTime('10:00')
      } else if (presetId === '3-day') {
        const pStr = base.toISOString().slice(0, 10)
        const rDate = new Date(base.getTime() + 2 * DAY)
        setPickup(pStr)
        setPickupTime('08:00')
        setRet(rDate.toISOString().slice(0, 10))
        setReturnTime('20:00')
      } else if (presetId === '1-week') {
        const pStr = base.toISOString().slice(0, 10)
        const rDate = new Date(base.getTime() + 6 * DAY)
        setPickup(pStr)
        setPickupTime('08:00')
        setRet(rDate.toISOString().slice(0, 10))
        setReturnTime('20:00')
      }
    },
    [pickup],
  )

  return {
    pickup,
    setPickup,
    ret,
    setRet,
    pickupTime,
    setPickupTime,
    returnTime,
    setReturnTime,
    pickupAt,
    returnAt,
    days,
    dayWord,
    bookingWindow,
    pickupBs,
    applyShootPreset,
  }
}
