import type { ReactNode } from 'react'
import Icon, { type IconName } from '../Icon'

export interface ReportKpiCardProps {
  label: string
  value: string | number
  unit?: string | undefined
  icon?: IconName | undefined
  note?: string | undefined
  delta?: {
    value: string
    isPositive?: boolean | undefined
    isNeutral?: boolean | undefined
  } | undefined
  ariaLabel?: string | undefined
}

export function ReportKpiCard({
  label,
  value,
  unit,
  icon,
  note,
  delta,
  ariaLabel,
}: ReportKpiCardProps) {
  return (
    <div
      className="babin-report-kpi-card"
      role="region"
      aria-label={ariaLabel || `${label}: ${value}${unit ? ` ${unit}` : ''}`}
    >
      <div className="babin-report-kpi-card__header">
        <span className="babin-report-kpi-card__label">{label}</span>
        {icon && (
          <span style={{ color: 'var(--muted)', display: 'inline-flex' }}>
            <Icon name={icon} size={16} />
          </span>
        )}
      </div>

      <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, flexWrap: 'wrap' }}>
        <span className="babin-report-kpi-card__value">{value}</span>
        {unit && (
          <span
            style={{
              fontSize: 'var(--t-meta, 12px)',
              color: 'var(--muted)',
              fontWeight: 500,
            }}
          >
            {unit}
          </span>
        )}
        {delta && (
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 2,
              padding: '1px 6px',
              borderRadius: 'var(--r-badge, 999px)',
              fontSize: 11,
              fontWeight: 600,
              background: delta.isNeutral
                ? 'var(--card2)'
                : delta.isPositive
                  ? 'rgba(16, 185, 129, 0.12)'
                  : 'rgba(239, 68, 68, 0.12)',
              color: delta.isNeutral
                ? 'var(--text2)'
                : delta.isPositive
                  ? 'var(--st-confirmed-fg, #10b981)'
                  : 'var(--st-cancelled-fg, #ef4444)',
            }}
          >
            {delta.isPositive ? '↑' : delta.isNeutral ? '•' : '↓'} {delta.value}
          </span>
        )}
      </div>

      {note && <div className="babin-report-kpi-card__note">{note}</div>}
    </div>
  )
}

export interface ReportKpiStripProps {
  children: ReactNode
  ariaLabel?: string | undefined
}

export function ReportKpiStrip({
  children,
  ariaLabel = 'Report summary key performance indicators',
}: ReportKpiStripProps) {
  return (
    <section className="babin-report-kpis" aria-label={ariaLabel}>
      {children}
    </section>
  )
}
