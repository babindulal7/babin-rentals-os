import React from 'react'
import Icon, { type IconName } from '../Icon'

export interface ReportEmptyProps {
  title?: string | undefined
  description: string
  icon?: IconName | undefined
  remedy?: string | undefined
  actionLabel?: string | undefined
  onAction?: (() => void) | undefined
  sourceMissing?: boolean | undefined
}

export function ReportEmpty({
  title = 'No report data available',
  description,
  icon = 'chart',
  remedy,
  actionLabel,
  onAction,
  sourceMissing = false,
}: ReportEmptyProps) {
  return (
    <div
      role="status"
      style={{
        padding: '36px 20px',
        textAlign: 'center',
        background: 'var(--card, #ffffff)',
        border: '1px solid var(--border, #e2e8f0)',
        borderRadius: 'var(--r-card, 8px)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 12,
      }}
    >
      <div
        style={{
          width: 44,
          height: 44,
          borderRadius: '50%',
          background: 'var(--card2, #f1f5f9)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: sourceMissing ? 'var(--st-alert-fg, #f59e0b)' : 'var(--muted, #64748b)',
        }}
      >
        <Icon name={icon} size={22} />
      </div>

      <div style={{ maxWidth: 440 }}>
        <h3
          style={{
            margin: '0 0 6px',
            fontSize: 'var(--t-body, 14px)',
            fontWeight: 600,
            color: 'var(--text, #0f172a)',
          }}
        >
          {title}
        </h3>
        <p
          style={{
            margin: 0,
            fontSize: 'var(--t-meta, 12px)',
            color: 'var(--text2, #475569)',
            lineHeight: 1.5,
          }}
        >
          {description}
        </p>
        {remedy && (
          <p
            style={{
              margin: '8px 0 0',
              fontSize: 'var(--t-meta, 12px)',
              color: 'var(--muted, #64748b)',
              fontStyle: 'italic',
            }}
          >
            {remedy}
          </p>
        )}
      </div>

      {actionLabel && onAction && (
        <button
          type="button"
          onClick={onAction}
          style={{
            minHeight: 'var(--tap, 44px)',
            padding: '8px 16px',
            fontSize: 'var(--t-meta, 12px)',
            fontWeight: 600,
            borderRadius: 'var(--r-btn, 6px)',
            border: '1px solid var(--border, #e2e8f0)',
            background: 'var(--card, #ffffff)',
            color: 'var(--text, #0f172a)',
            cursor: 'pointer',
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
          }}
        >
          {actionLabel}
        </button>
      )}
    </div>
  )
}
