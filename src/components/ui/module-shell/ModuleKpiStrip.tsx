import React from 'react'
import Icon, { type IconName } from '../Icon'
import './module-shell.css'

export interface ModuleKpiItem {
  id: string
  label: string
  count: number | string
  subtitle: string
  icon: IconName
  tone?: 'primary' | 'warn' | 'danger' | 'success'
  active?: boolean
  onClick?: () => void
}

export interface ModuleKpiStripProps {
  items: readonly ModuleKpiItem[]
  className?: string
  style?: React.CSSProperties
}

/**
 * Zone 2: 3-Card KPI Strip
 * Reuses the exact card styling from the bottom of Today screen:
 * - UPPERCASE LABEL + top-right subtle icon
 * - Large Bold Count (Outfit/font-display, 1.5rem, 700)
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

        const handleKeyDown = (e: React.KeyboardEvent) => {
          if (isInteractive && (e.key === 'Enter' || e.key === ' ')) {
            e.preventDefault()
            item.onClick?.()
          }
        }

        return (
          <div
            key={item.id}
            className={`module-kpi-card ${item.active ? 'is-active' : ''} ${isInteractive ? 'press' : ''}`.trim()}
            role={isInteractive ? 'button' : undefined}
            tabIndex={isInteractive ? 0 : undefined}
            onClick={item.onClick}
            onKeyDown={isInteractive ? handleKeyDown : undefined}
            aria-pressed={isInteractive ? item.active : undefined}
            aria-label={`${item.label}: ${item.count}, ${item.subtitle}`}
          >
            <div>
              <div className="module-kpi-card__top">
                <span className="module-kpi-card__label">{item.label}</span>
                <span className={`module-kpi-card__icon module-kpi-card__icon--${tone}`}>
                  <Icon name={item.icon} size={18} />
                </span>
              </div>
              <div className="module-kpi-card__count">{item.count}</div>
            </div>
            <p className="module-kpi-card__subtitle">{item.subtitle}</p>
          </div>
        )
      })}
    </div>
  )
}
