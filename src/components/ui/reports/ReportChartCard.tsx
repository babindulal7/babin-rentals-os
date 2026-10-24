import React from 'react'
import Icon from '../Icon'

export interface ReportChartCardProps {
  title: string
  basis: string
  dateWindow?: string | undefined
  source?: string | undefined
  description?: string | undefined
  children: React.ReactNode
  reconciliation?: React.ReactNode | undefined
  ariaLabel?: string | undefined
  action?: React.ReactNode | undefined
}

export function ReportChartCard({
  title,
  basis,
  dateWindow,
  source,
  description,
  children,
  reconciliation,
  ariaLabel,
  action,
}: ReportChartCardProps) {
  return (
    <section
      role="region"
      aria-label={ariaLabel || title}
      style={{
        background: 'var(--card, #ffffff)',
        border: '1px solid var(--border, #e2e8f0)',
        borderRadius: 'var(--r-card, 8px)',
        padding: '20px 22px',
        display: 'flex',
        flexDirection: 'column',
        gap: 16,
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          gap: 16,
          flexWrap: 'wrap',
          borderBottom: '1px solid var(--border, #e2e8f0)',
          paddingBottom: 14,
        }}
      >
        <div style={{ flex: '1 1 280px', minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <h3
              style={{
                margin: 0,
                fontSize: 'var(--t-title, 16px)',
                fontWeight: 700,
                color: 'var(--text, #0f172a)',
              }}
            >
              {title}
            </h3>
            {source && (
              <span
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 4,
                  padding: '2px 8px',
                  borderRadius: 'var(--r-badge, 999px)',
                  fontSize: 11,
                  fontWeight: 600,
                  background: 'var(--card2, #f1f5f9)',
                  color: 'var(--text2, #475569)',
                  border: '1px solid var(--border, #e2e8f0)',
                }}
              >
                <Icon name="check" size={11} />
                {source}
              </span>
            )}
          </div>

          <p
            style={{
              margin: '4px 0 0',
              fontSize: 'var(--t-meta, 12px)',
              color: 'var(--muted, #64748b)',
            }}
          >
            {basis}
            {dateWindow && ` · ${dateWindow}`}
          </p>

          {description && (
            <p
              style={{
                margin: '8px 0 0',
                fontSize: 'var(--t-meta, 12px)',
                color: 'var(--text2, #475569)',
                lineHeight: 1.5,
              }}
            >
              {description}
            </p>
          )}
        </div>

        {action && <div>{action}</div>}
      </div>

      <div style={{ minHeight: 240, width: '100%' }}>{children}</div>

      {reconciliation && (
        <div
          style={{
            borderTop: '1px solid var(--border, #e2e8f0)',
            paddingTop: 14,
            fontSize: 'var(--t-meta, 12px)',
          }}
        >
          {reconciliation}
        </div>
      )}
    </section>
  )
}
