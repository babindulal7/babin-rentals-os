import { useMemo } from 'react'
import { getBusinessToday } from '../../../lib/bs'
import { TouchTarget } from '../../../components/ui/TouchTarget'
import type { Paisa } from '../../../lib/money'
import { formatMoney } from '../../../lib/money'

/** Today as YYYY-MM-DD in UTC (Kathmandu civil day starts at 06:00, but we use UTC for ISO) */
function todayIso(): string {
  return getBusinessToday().toISOString().slice(0, 10)
}

/**
 * Quick date presets for the New Rental flow.
 * 
 * Shows common rental periods as one-tap buttons above the date fields.
 * The "Out" date defaults to today; "Return" adjusts automatically based on preset.
 * 
 * UX goal: 90% of bookings are 1-day, 3-day, or 7-day — make those zero-thought.
 */

export interface DatePreset {
  label: string
  /** Days added to "Out" date for the "Return" date. 0 = same day. */
  days: number
  /** Optional: price hint for this duration (display only) */
  priceHint?: Paisa
}

/** Default presets — ordered by frequency in Babin Rentals operations */
export const DEFAULT_PRESETS: DatePreset[] = [
  { label: '1 day', days: 1 },
  { label: '2 days', days: 2 },
  { label: '3 days', days: 3 },
  { label: '1 week', days: 7 },
]

export interface DatePresetsProps {
  /** The currently selected "Out" date (YYYY-MM-DD) */
  outDate: string
  /** The currently selected "Return" date (YYYY-MM-DD) */
  returnDate?: string
  /** Rental duration in days */
  days?: number
  /** Called when a preset is picked — updates both Out and Return dates */
  onPick: (outDate: string, returnDate: string) => void
  /** Optional: show price hints if pricing engine is available */
  priceHints?: Record<number, Paisa>
  /** Optional: minimum allowed return date (usually same as outDate) */
  minReturnDate?: string
  /** Disable all presets (e.g., when dates are locked after confirmation) */
  disabled?: boolean
  /** Custom presets to show instead of defaults */
  presets?: DatePreset[]
}

/**
 * Quick preset row for rental dates.
 * 
 * Usage in NewRental:
 * ```tsx
 * <DatePresets
 *   outDate={pickup}
 *   returnDate={ret}
 *   days={days}
 *   onPick={(out, ret) => { setPickup(out); setRet(ret); }}
 *   priceHints={pricingHints}
 * />
 * ```
 */
export function DatePresets({
  outDate,
  returnDate,
  days,
  onPick,
  priceHints,
  minReturnDate,
  disabled = false,
  presets = DEFAULT_PRESETS,
}: DatePresetsProps) {
  const today = todayIso()
  const effectiveOut = outDate || today

  const presetButtons = useMemo(() => {
    return presets.map((p) => {
      const out = effectiveOut
      const ret = addDays(out, p.days)
      const minRet = minReturnDate || out
      const isValid = ret >= minRet
      const price = priceHints?.[p.days]
      const isActive = (days !== undefined && days === p.days) || (Boolean(returnDate) && ret === returnDate)

      return {
        ...p,
        out,
        ret,
        isValid,
        isActive,
        price,
      }
    })
  }, [effectiveOut, minReturnDate, priceHints, presets, days, returnDate])

  if (presetButtons.length === 0) return null

  return (<>
    <div role="group" aria-label="Start day" style={{ display: 'flex', gap: 8, marginBottom: 8, alignItems: 'center' }}>
      <span style={{ alignSelf: 'center', color: 'var(--muted)', fontSize: 'var(--t-meta)', fontWeight: 500 }}>Start</span>
      {['Today', 'Tomorrow'].map((label, i) => {
        const targetDay = addDays(today, i)
        const isActive = outDate === targetDay
        return (
          <button
            key={label}
            type="button"
            disabled={disabled}
            className={`press${isActive ? ' is-active' : ''}`}
            aria-pressed={isActive}
            style={{
              minHeight: 40,
              padding: '0 14px',
              border: isActive ? '1px solid var(--st-primary-fg, #2563eb)' : '1px solid var(--border)',
              borderRadius: 'var(--r-btn)',
              background: isActive ? 'var(--st-primary-bg, #eff6ff)' : 'var(--card2)',
              color: isActive ? 'var(--st-primary-fg, #1d4ed8)' : 'var(--text)',
              fontSize: 'var(--t-meta)',
              fontWeight: isActive ? 700 : 500,
              cursor: disabled ? 'not-allowed' : 'pointer',
              transition: 'background 120ms, border-color 120ms, color 120ms',
            }}
            onClick={() => {
              const currentDays = days && days > 0 ? days : 1
              onPick(targetDay, addDays(targetDay, currentDays))
            }}
          >
            {label}
          </button>
        )
      })}
    </div>
    <div
      style={{
        display: 'flex',
        flexWrap: 'wrap',
        gap: 8,
        marginBottom: 10,
        padding: '4px 0',
        alignItems: 'center',
      }}
      role="group"
      aria-label="Rental duration"
    >
      <span style={{ alignSelf: 'center', color: 'var(--muted)', fontSize: 'var(--t-meta)', fontWeight: 500 }}>Duration</span>
      {presetButtons.map((p) => (
        <button
          key={p.label}
          type="button"
          className={`press${p.isActive ? ' is-active' : ''}`}
          disabled={disabled || !p.isValid}
          onClick={() => onPick(p.out, p.ret)}
          style={{
            position: 'relative',
            minHeight: 40,
            padding: '0 14px',
            borderRadius: 'var(--r-badge)',
            border: p.isActive ? '1px solid var(--st-primary-fg, #2563eb)' : '1px solid var(--border)',
            background: p.isActive ? 'var(--st-primary-bg, #eff6ff)' : p.isValid ? 'var(--card2)' : 'var(--card)',
            color: p.isActive ? 'var(--st-primary-fg, #1d4ed8)' : p.isValid ? 'var(--text)' : 'var(--muted)',
            fontSize: 'var(--t-meta)',
            fontWeight: p.isActive ? 700 : 600,
            fontFamily: 'inherit',
            cursor: p.isValid ? 'pointer' : 'not-allowed',
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            whiteSpace: 'nowrap',
            transition: 'background 120ms, border-color 120ms, color 120ms',
          }}
          aria-pressed={p.isActive}
          aria-disabled={disabled || !p.isValid}
        >
          <TouchTarget axis="both" />
          <span>{p.label}</span>
          {p.price && (
            <span
              style={{
                fontSize: '11px',
                fontWeight: 700,
                color: 'var(--primary)',
                background: 'var(--primary-bg)',
                padding: '1px 6px',
                borderRadius: 'var(--r-badge)',
              }}
            >
              {formatMoney(p.price)}
            </span>
          )}
          {!p.isValid && (
            <span
              style={{
                fontSize: '10px',
                color: 'var(--muted)',
                opacity: 0.7,
              }}
            >
              (return too early)
            </span>
          )}
        </button>
      ))}
    </div></>
  )
}

/** Add N days to an ISO date string */
function addDays(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00.000Z`)
  d.setUTCDate(d.getUTCDate() + days)
  const y = d.getUTCFullYear()
  const m = String(d.getUTCMonth() + 1).padStart(2, '0')
  const day = String(d.getUTCDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/**
 * Hook for computing rental days between two dates (for pricing hints).
 * Returns a map of { days: price } for common durations.
 */
export function usePricingHints(
  getPrice: (days: number) => Paisa | undefined
): Record<number, Paisa> {
  return useMemo(() => {
    const hints: Record<number, Paisa> = {}
    for (const preset of DEFAULT_PRESETS) {
      const price = getPrice(preset.days || 1)
      if (price !== undefined) hints[preset.days] = price
    }
    return hints
  }, [getPrice])
}

export default DatePresets