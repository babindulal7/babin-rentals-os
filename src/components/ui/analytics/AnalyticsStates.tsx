import type { ReactNode } from 'react'
import Icon from '../Icon'
import { Button } from '../Page'

export function AnalyticsLoadingSkeleton({ height = 120, label = 'Loading analytics data' }: { height?: number; label?: string }) {
  return (
    <div
      className="analytics-skeleton"
      style={{ minHeight: height }}
      role="status"
      aria-label={label}
      aria-busy="true"
    >
      <div className="analytics-skeleton__line" style={{ width: '40%', height: 14 }} />
      <div className="analytics-skeleton__line" style={{ width: '65%', height: 28, marginTop: 12 }} />
      <div className="analytics-skeleton__line" style={{ width: '50%', height: 12, marginTop: 10 }} />
    </div>
  )
}

export function AnalyticsErrorState({
  error,
  onRetry,
}: {
  error: string
  onRetry?: () => void
}) {
  return (
    <div className="analytics-state-card analytics-state-card--error" role="alert">
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--danger-text)' }}>
        <Icon name="alert" size={16} fill />
        <strong>Analytics unavailable</strong>
      </div>
      <p style={{ margin: '6px 0 10px', fontSize: 'var(--t-meta)', color: 'var(--text2)' }}>{error}</p>
      {onRetry && (
        <Button variant="secondary" size="sm" onClick={onRetry}>
          Retry
        </Button>
      )}
    </div>
  )
}

export function AnalyticsEmptyState({
  title = 'No recorded data',
  description = 'No transactions or events found for the selected period.',
  action,
}: {
  title?: string
  description?: string
  action?: ReactNode
}) {
  return (
    <div className="analytics-state-card analytics-state-card--empty">
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--text2)' }}>
        <Icon name="info" size={16} />
        <strong>{title}</strong>
      </div>
      <p style={{ margin: '6px 0 0', fontSize: 'var(--t-meta)', color: 'var(--muted)' }}>{description}</p>
      {action && <div style={{ marginTop: 10 }}>{action}</div>}
    </div>
  )
}

export function AnalyticsRestrictedState({
  reason = 'This metric contains confidential financial figures restricted to authorized roles.',
}: {
  reason?: string
}) {
  return (
    <div className="analytics-state-card analytics-state-card--restricted" role="status">
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--muted)' }}>
        <Icon name="lock" size={15} />
        <span style={{ fontSize: 'var(--t-meta)', fontWeight: 600 }}>Access restricted</span>
      </div>
      <p style={{ margin: '4px 0 0', fontSize: 'var(--t-meta)', color: 'var(--muted)' }}>{reason}</p>
    </div>
  )
}

export function StaleIndicator({ timestamp }: { timestamp: string }) {
  return (
    <span className="analytics-stale-badge" title={`Cached data generated at ${timestamp}`}>
      Stale · {timestamp.slice(11, 16)} UTC
    </span>
  )
}
