import React from 'react'
import Icon, { type IconName } from '../Icon'
import './module-shell.css'

export interface ModuleKpiItem {
  id: string
  label: string
  count?: number | string | undefined
  value?: number | string | undefined
  subtitle: string
  icon: IconName
  tone?: 'primary' | 'warn' | 'danger' | 'success' | 'amber' | 'emerald' | 'red' | 'neutral' | undefined
  active?: boolean | undefined
  onClick?: (() => void) | undefined
}

export interface ModuleKpiStripProps {
  items: readonly ModuleKpiItem[]
  className?: string | undefined
  style?: React.CSSProperties | undefined
}

/**
 * Zone 2: 3-Card KPI Strip
 * Reuses the exact card styling from the bottom of Today screen:
 * - UPPERCASE LABEL + top-right subtle icon
 * - Compact one-row card (icon, label, count) with the subtitle on a thin line below
 * - Muted subtitle
 * - Clicking a card filters the table below
 */
export const ModuleKpiStrip: React.FC<ModuleKpiStripProps> = ({
  items,
  className = '',
  style,
}) => {
  return (
    <div className={`module-kpi-grid ${className}`.trim()} style={style} role="region" aria-label="Module summary KPIs">
      {items.map((item) => {
        const tone = item.tone || 'primary'
        const isInteractive = Boolean(item.onClick)
        const displayCount = item.count ?? item.value ?? ''

        const handleKeyDown = (e: React.KeyboardEvent) => {
          if (isInteractive && (e.key === 'Enter' || e.key === ' ')) {
            e.preventDefault()
            item.onClick?.()
          }
        }

        // Only a card with somewhere to go is a control; then it is a real toggle button:
        // focusable, pressed-state aware, and operable with Enter and Space as well as a click.
        const buttonProps = isInteractive
          ? {
              role: 'button' as const,
              tabIndex: 0,
              onClick: item.onClick,
              onKeyDown: handleKeyDown,
              'aria-pressed': item.active,
            }
          : {}

        return (
          <div
            key={item.id}
            {...buttonProps}
            className={`module-kpi-card ${item.active ? 'is-active' : ''} ${isInteractive ? 'press' : ''}`.trim()}
            aria-label={`${item.label}: ${displayCount}, ${item.subtitle}`}
          >
            <div className="module-kpi-card__head">
              <div className="module-kpi-card__top">
                <span className="module-kpi-card__label">{item.label}</span>
                <span className={`module-kpi-card__icon module-kpi-card__icon--${tone}`}>
                  <Icon name={item.icon} size={16} />
                </span>
              </div>
              <div className="module-kpi-card__count font-mono tabular-nums">{displayCount}</div>
            </div>
            <p className="module-kpi-card__subtitle">{item.subtitle}</p>
          </div>
        )
      })}
    </div>
  )
}
