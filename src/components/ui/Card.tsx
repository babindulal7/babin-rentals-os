import React from 'react'
import type { CSSProperties } from 'react'

/**
 * Rewritten from Tailwind utility classNames (`bg-slate-900 border...`) to the
 * app's real inline-style + CSS-variable system. Tailwind's Vite plugin is
 * registered but no CSS file imports `tailwindcss`, so every one of those
 * classes compiled to nothing — this `Card` (used in CasesWorkspace.tsx,
 * CrewBooking.tsx, SubRental.tsx) rendered as an unstyled `<div>`. Same
 * prop/API shape as before, so every existing call site is unaffected.
 *
 * Shape mirrors `Card` in `Page.tsx` (same `cardStyle` token set), with the
 * addition of this component's own optional `subtitle`, `footer`, and
 * `padding` props that `Page.tsx`'s `Card` doesn't have.
 */

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  title?: string
  subtitle?: string
  action?: React.ReactNode
  footer?: React.ReactNode
  padding?: 'none' | 'sm' | 'md' | 'lg'
  as?: 'div' | 'section'
  headingLevel?: 'h2' | 'h3'
  bodyStyle?: CSSProperties
  statusColor?: string
}

const PADDING: Record<NonNullable<CardProps['padding']>, number | string> = {
  none: 0,
  sm: 'var(--section-padding)',
  md: 'var(--space-4)',
  lg: 'var(--space-6)',
}

/** Compatibility recipe for older surface consumers without a Card wrapper. */
export const surfaceStyle = {
  background: 'var(--surface-content)',
  border: 'var(--surface-outline)',
  borderRadius: 'var(--r-card)',
  boxShadow: 'var(--elevation-surface)',
} as const

export function Card({
  title,
  subtitle,
  action,
  footer,
  padding = 'md',
  as: Element = 'div',
  headingLevel: Heading = 'h3',
  bodyStyle,
  statusColor,
  children,
  style,
  className,
  ...props
}: CardProps) {
  const rootStyle: CSSProperties = {
    ...(statusColor ? { borderLeft: `3px solid ${statusColor}` } : {}),
    display: 'flex',
    flexDirection: 'column',
    minWidth: 0,
    ...style,
  }

  return (
    <Element className={['surface-card', className].filter(Boolean).join(' ')} style={rootStyle} {...props}>
      {(title || subtitle || action) && (
        <div className="surface-card__header">
          <div className="surface-card__heading">
            {title && (
              <Heading style={{ margin: 0, fontSize: 'var(--t-h3)', fontWeight: 600, color: 'var(--text)' }}>{title}</Heading>
            )}
            {subtitle && (
              <p style={{ margin: '2px 0 0', fontSize: 'var(--t-meta)', color: 'var(--muted)' }}>{subtitle}</p>
            )}
          </div>
          {action && <div className="surface-card__action">{action}</div>}
        </div>
      )}

      <div className="surface-card__body" style={{ flex: 1, minWidth: 0, padding: PADDING[padding], ...bodyStyle }}>{children}</div>

      {footer && (
        <div className="surface-card__footer">
          {footer}
        </div>
      )}
    </Element>
  )
}

export interface KpiCardProps {
  label: string
  value: string | number
  subtext?: string
  trend?: {
    value: string
    isPositive: boolean
  }
  icon?: React.ReactNode
  onClick?: () => void
}

export function KpiCard({ label, value, subtext, trend, icon, onClick }: KpiCardProps) {
  // A card is only a control when it has somewhere to go. When it does it is a real
  // button: focusable, named, and operable with Enter and Space as well as a click.
  const buttonProps = onClick
    ? {
        role: 'button' as const,
        tabIndex: 0,
        'aria-label': `${label}: ${value}`,
        onClick,
        onKeyDown: (event: React.KeyboardEvent<HTMLDivElement>) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault()
            onClick()
          }
        },
      }
    : {}
  return (
    <div
      {...buttonProps}
      className={['surface-card', 'kpi-card', onClick ? 'lift' : ''].filter(Boolean).join(' ')}
      style={{
        padding: 'var(--sp-lg)',
        display: 'flex',
        flexDirection: 'column',
        gap: 'var(--sp-sm)',
        cursor: onClick ? 'pointer' : undefined,
        transition: 'all 0.2s cubic-bezier(0.16, 1, 0.3, 1)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', color: 'var(--muted)' }}>
        <span style={{ fontSize: 'var(--t-meta)', fontWeight: 600, color: 'var(--muted)' }}>
          {label}
        </span>
        {icon && (
          <span
            style={{
              color: 'var(--select-fg)',
              display: 'grid',
              placeItems: 'center',
              width: 28,
              height: 28,
              borderRadius: 'var(--r-sm)',
              background: 'var(--select-bg)',
            }}
          >
            {icon}
          </span>
        )}
      </div>

      <div style={{ fontSize: 'var(--t-kpi)', fontWeight: 700, color: 'var(--text)', fontVariantNumeric: 'tabular-nums', fontFamily: 'var(--font-id)' }}>
        {value}
      </div>

      {(subtext || trend) && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-sm)', fontSize: 'var(--t-meta)' }}>
          {/* *-text tokens, not st-*-fg: the fg pair is ink for a SOLID status
              fill — white in light theme, invisible on this white card. */}
          {trend && (
            <span
              style={{
                fontWeight: 700,
                color: trend.isPositive ? 'var(--success-text)' : 'var(--ready-text)',
                fontVariantNumeric: 'tabular-nums',
                padding: '1px 6px',
                borderRadius: 'var(--r-xs)',
                background: trend.isPositive ? 'rgba(30, 134, 74, 0.1)' : 'rgba(237, 190, 42, 0.12)',
              }}
            >
              {trend.value}
            </span>
          )}
          {subtext && <span style={{ color: 'var(--muted)' }}>{subtext}</span>}
        </div>
      )}
    </div>
  )
}
