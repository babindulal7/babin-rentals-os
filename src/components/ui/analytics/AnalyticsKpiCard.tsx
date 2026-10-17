import { Link } from 'react-router-dom'
import type { KpiViewModel } from '../../../lib/analytics/contracts'
import { formatNumericValue } from '../../../lib/analytics/formatters'
import { comparePeriods } from '../../../lib/analytics/comparison'
import { TrendSparkline } from './TrendSparkline'
import { InfoTooltip } from '../InfoTooltip'
import Icon from '../Icon'
import { AnalyticsLoadingSkeleton } from './AnalyticsStates'

interface AnalyticsKpiCardProps {
  model: KpiViewModel
  loading?: boolean
  className?: string
}

export function AnalyticsKpiCard({ model, loading, className }: AnalyticsKpiCardProps) {
  const { label, value, previous, comparisonLabel, definition, context, href, trend, accent = 'primary' } = model

  if (loading) {
    return <AnalyticsLoadingSkeleton height={120} label={`Loading ${label}`} />
  }

  const formatted = formatNumericValue(value)
  const isZeroOrEmpty = value === null || (value.kind === 'count' && value.value === 0) || (value.kind === 'money' && value.paisa === 0)

  // Compare periods if both current and previous numeric amounts are available
  const delta =
    value && previous && value.kind === previous.kind
      ? comparePeriods(
          value.kind === 'money' ? value.paisa : value.value,
          previous.kind === 'money' ? previous.paisa : previous.value,
        )
      : null

  const colorToken = accent === 'primary' ? 'var(--cat-1)' : accent === 'secondary' ? 'var(--cat-2)' : 'var(--cat-3)'

  const cardContent = (
    <>
      <div className="analytics-kpi-card__top">
        <span className="analytics-kpi-card__label">{label}</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {definition && (
            <InfoTooltip
              label={`Definition of ${label}`}
              size={15}
              content={[
                <p key="def" style={{ margin: 0, fontWeight: 600 }}>
                  {definition}
                </p>,
                <p key="source" style={{ margin: '4px 0 0', fontSize: '11.5px', color: 'var(--muted)' }}>
                  Source: {context.sourceLabel} · Basis: {context.dateBasis}
                </p>,
              ]}
            />
          )}
        </div>
      </div>

      <div className="analytics-kpi-card__middle">
        <div
          className="analytics-kpi-card__value"
          title={formatted.exact}
          aria-label={`${label}: ${formatted.exact}`}
        >
          {formatted.compact}
        </div>
        {trend && trend.length >= 2 && !isZeroOrEmpty && (
          <TrendSparkline points={trend} color={colorToken} width={80} height={26} />
        )}
      </div>

      <div className="analytics-kpi-card__bottom">
        {delta && delta.kind === 'changed' ? (
          <span
            className={`analytics-delta-badge analytics-delta-badge--${delta.isGood ? 'up' : 'down'}`}
            title={`Change of ${delta.percentage.toFixed(1)}% (${delta.absolute >= 0 ? '+' : ''}${delta.absolute})`}
          >
            <Icon name={delta.absolute >= 0 ? 'arrow_up' : 'arrow_down'} size={12} fill />
            {Math.abs(delta.percentage).toFixed(1)}%
          </span>
        ) : delta && delta.kind === 'new' ? (
          <span className="analytics-delta-badge analytics-delta-badge--neutral">New metric</span>
        ) : (
          <span style={{ color: 'var(--muted)', fontSize: '11.5px' }}>{context.provenance === 'scenario' ? 'Hypothetical' : 'No prior baseline'}</span>
        )}

        {comparisonLabel && (
          <span
            style={{
              color: 'var(--muted)',
              fontSize: '11px',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              maxWidth: '65%',
            }}
          >
            {comparisonLabel}
          </span>
        )}
      </div>
    </>
  )

  if (href) {
    return (
      <Link
        to={href}
        className={`analytics-kpi-card ${className ?? ''}`}
        aria-label={`View drilldown for ${label}, currently ${formatted.exact}`}
      >
        {cardContent}
      </Link>
    )
  }

  return (
    <article
      className={`analytics-kpi-card ${className ?? ''}`}
      aria-label={`${label}: ${formatted.exact}`}
      tabIndex={0}
    >
      {cardContent}
    </article>
  )
}
