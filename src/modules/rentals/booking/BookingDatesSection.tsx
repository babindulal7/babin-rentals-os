import Icon from '../../../components/ui/Icon'
import { formatBs, formatAd, type BsDate } from '../../../lib/bs'
import type { Paisa } from '../../../lib/money'
import { Section } from './BookingFormWidgets'
import { DateTimeField } from './DateTimeField'
import { DatePresets } from './DatePresets'
import { SHOOT_PRESETS } from './newRentalUtils'

export interface BookingDatesSectionProps {
  title?: string
  open: boolean
  onToggle: () => void
  days: number
  dayWord: string
  pickup: string
  pickupBs?: BsDate | null | undefined
  pickupTime: string
  ret: string
  returnTime: string
  pricingHints?: Record<number, Paisa> | undefined
  onPickupChange: (date: string) => void
  onPickupTimeChange: (time: string) => void
  onReturnChange: (date: string) => void
  onReturnTimeChange: (time: string) => void
  onPresetDatesPick: (pickup: string, ret: string) => void
  onApplyShootPreset: (presetId: (typeof SHOOT_PRESETS)[number]['id']) => void
}

export function BookingDatesSection({
  title = 'Rental period',
  open,
  onToggle,
  days,
  dayWord,
  pickup,
  pickupBs,
  pickupTime,
  ret,
  returnTime,
  pricingHints,
  onPickupChange,
  onPickupTimeChange,
  onReturnChange,
  onReturnTimeChange,
  onPresetDatesPick,
  onApplyShootPreset,
}: BookingDatesSectionProps) {
  return (
    <Section
      id="section-1"
      collapsible={false}
      title={title}
      badge={
        days > 0 ? (
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4,
              padding: '2px 8px',
              borderRadius: 'var(--r-badge)',
              background: 'var(--st-primary-bg)',
              color: 'var(--st-primary-fg)',
              fontSize: 11,
              fontWeight: 600,
            }}
          >
            <Icon name="calendar" size={11} /> {days} {dayWord}
          </span>
        ) : null
      }
      open={open}
      onToggle={onToggle}
      summary={
        days === 0
          ? 'Return must be later than pickup'
          : `${pickupBs ? formatBs(pickupBs) : formatAd(new Date(pickup))} → ${days} ${dayWord}`
      }
    >
      <div
        className="rental-day-guidance-banner"
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          marginBottom: 12,
          padding: '6px 10px',
          borderRadius: 'var(--r-xs)',
          background: 'var(--surface-2)',
          border: '1px solid var(--border)',
          fontSize: 'var(--t-meta)',
          color: 'var(--text2)',
        }}
      >
        <Icon name="info" size={13} style={{ flexShrink: 0, color: 'var(--primary)' }} />
        <span>
          <strong>Rental day runs 06:00 → 06:00 NPT.</strong> Multi-day rentals calculate continuous 24-hour spans from the 06:00 Kathmandu cut.
        </span>
      </div>
      <div className="new-rental-period-fields">
        <DateTimeField
          label="Out"
          required
          dateValue={pickup}
          timeValue={pickupTime}
          onDateChange={onPickupChange}
          onTimeChange={onPickupTimeChange}
        />
        <DateTimeField
          label="Return"
          required
          dateValue={ret}
          timeValue={returnTime}
          onDateChange={onReturnChange}
          onTimeChange={onReturnTimeChange}
          error={days === 0 ? 'Return must be later than pickup. Change the return date or its time.' : undefined}
        />
      </div>
      <div className="new-rental-date-shortcuts">
        <DatePresets
          outDate={pickup}
          returnDate={ret}
          days={days}
          pickupTime={pickupTime}
          returnTime={returnTime}
          onPick={onPresetDatesPick}
          minReturnDate={pickup}
          {...(pricingHints ? { priceHints: pricingHints } : {})}
        />
      </div>
      <details className="new-rental-preset-disclosure">
        <summary>Use a shoot preset</summary>
        <div className="new-rental-shoot-presets" role="group" aria-label="Production shoot presets">
          {SHOOT_PRESETS.map((p) => (
            <button
              key={p.id}
              type="button"
              className="new-rental-preset-chip"
              onClick={() => onApplyShootPreset(p.id)}
              title={p.description}
            >
              <Icon name={p.icon} size={12} />
              <span>{p.label}</span>
            </button>
          ))}
        </div>
      </details>
    </Section>
  )
}
