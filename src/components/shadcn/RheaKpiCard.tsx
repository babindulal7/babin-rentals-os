import type { ReactNode } from 'react'

export interface RheaKpiCardProps {
  label: string
  value: ReactNode
  meta?: ReactNode
  badge?: {
    text: string
    variant?: 'default' | 'primary'
  }
  icon?: ReactNode
  className?: string
  style?: React.CSSProperties
}

export function RheaKpiCard({
  label,
  value,
  meta,
  badge,
  icon,
  className,
  style,
}: RheaKpiCardProps) {
  const combinedClassName = className ? `rhea-kpi-card ${className}` : 'rhea-kpi-card'

  return (
    <div className={combinedClassName} style={style}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <span className="rhea-kpi-label">{label}</span>
        {icon && <div style={{ color: 'var(--rhea-muted-fg)' }}>{icon}</div>}
      </div>

      <div className="rhea-kpi-value">{value}</div>

      {(meta || badge) && (
        <div className="rhea-kpi-meta">
          {badge && (
            <span
              className={
                badge.variant === 'primary'
                  ? 'rhea-kpi-badge rhea-kpi-badge--primary'
                  : 'rhea-kpi-badge'
              }
            >
              {badge.text}
            </span>
          )}
          {meta && <span>{meta}</span>}
        </div>
      )}
    </div>
  )
}
