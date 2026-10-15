import { useState } from 'react'
import { CalendarPopover } from './DateField'
import { getBusinessToday } from '../../lib/bs'

export interface FilterDatePreset {
  key: string
  label: string
  active: boolean
  onSelect: () => void
}

/**
 * The date range block for filter drawers: quick presets over the app's own
 * calendar (the same `CalendarPopover` the dashboard picker uses). Tap one day
 * for that day, or tap a start and then an end day for a range.
 */
export function FilterDatePicker({
  from,
  to,
  presets,
  onRange,
}: {
  from: string
  to: string
  presets: readonly FilterDatePreset[]
  onRange: (range: { from: string; to: string }) => void
}) {
  const [start, setStart] = useState<string | null>(null)
  const [draft, setDraft] = useState<{ from: string; to: string }>({ from: from || '', to: to || '' })
  const d = getBusinessToday()
  const today = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`
  const shown = start ? draft : { from: from || '', to: to || '' }

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 'var(--sp-sm)', minWidth: 0 }}>
      <div role="group" aria-label="Quick date ranges" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(64px, 1fr))', gap: 6 }}>
        {presets.map((p) => (
          <button
            key={p.key}
            type="button"
            className="tap filter-chip"
            aria-pressed={p.active}
            onClick={() => { setStart(null); p.onSelect() }}
          >
            {p.label}
          </button>
        ))}
      </div>
      <CalendarPopover
        embedded
        showHeader={false}
        title="Date range"
        value={shown.from}
        range={shown}
        todayDate={today}
        shadePastDates={false}
        onSelectRange={({ from: f, to: t }) => {
          if (start) {
            setStart(null)
            onRange({ from: f, to: t })
          } else {
            setStart(f)
            setDraft({ from: f, to: t })
          }
        }}
        onDismiss={() => {
          if (start) { onRange({ from: start, to: start }); setStart(null) }
        }}
      />
      <p aria-live="polite" style={{ margin: 0, fontSize: 'var(--t-meta)', color: 'var(--muted)' }}>
        {start ? 'Now choose the end day (or tap away for one day).' : 'Tap a day, or a start and an end day.'}
      </p>
    </div>
  )
}
