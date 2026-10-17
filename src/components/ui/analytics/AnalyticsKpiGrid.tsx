import type { CSSProperties, ReactNode } from 'react'
import './analytics.css'

interface AnalyticsKpiGridProps {
  children: ReactNode
  columns?: 1 | 2 | 3 | 4
  ariaLabel?: string
  style?: CSSProperties
  className?: string
}

export function AnalyticsKpiGrid({
  children,
  columns = 4,
  ariaLabel = 'Key Performance Indicators',
  style,
  className,
}: AnalyticsKpiGridProps) {
  return (
    <section
      className={`analytics-kpi-grid ${className ?? ''}`}
      aria-label={ariaLabel}
      style={{
        '--analytics-grid-cols': columns,
        ...style,
      } as CSSProperties}
    >
      {children}
    </section>
  )
}
