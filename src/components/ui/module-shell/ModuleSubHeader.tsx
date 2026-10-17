import React from 'react'
import Icon, { type IconName } from '../Icon'
import { DataAgeBadge } from '../DataAgeBadge'
import './module-shell.css'

export interface ModulePrimaryAction {
  label: string
  onClick: () => void
  icon?: IconName
  disabled?: boolean
  ariaLabel?: string
  title?: string
}

export interface ModuleSubHeaderProps {
  counter: React.ReactNode
  loadedAt?: Date | number | string | null
  loading?: boolean
  onRefresh?: () => void
  secondaryActions?: React.ReactNode
  primaryAction?: ModulePrimaryAction
  children?: React.ReactNode
  className?: string
  style?: React.CSSProperties
}

/**
 * Zone 1: Sub-Header & Primary Action Bar
 * Left: Live operational counter + sync timestamp (DataAgeBadge).
 * Right: Secondary Ghost/Outline Actions (Export/Scan) + Primary Blue CTA Button pinned to far right.
 */
export const ModuleSubHeader: React.FC<ModuleSubHeaderProps> = ({
  counter,
  loadedAt,
  loading = false,
  onRefresh,
  secondaryActions,
  primaryAction,
  children,
  className = '',
  style,
}) => {
  return (
    <div className={`module-sub-header ${className}`.trim()} style={style}>
      <div className="module-sub-header__left">
        <div className="module-sub-header__counter">
          {counter}
        </div>
        {loadedAt !== undefined && (
          <DataAgeBadge
            loadedAt={loadedAt}
            loading={loading}
            {...(onRefresh ? { onRefresh } : {})}
            variant="muted"
            compact
          />
        )}
      </div>

      <div className="module-sub-header__right">
        {secondaryActions}
        {children}
        {primaryAction && (
          <button
            type="button"
            className="module-sub-header__primary-cta press"
            onClick={primaryAction.onClick}
            disabled={primaryAction.disabled}
            aria-label={primaryAction.ariaLabel || primaryAction.label}
            title={primaryAction.title || primaryAction.label}
          >
            {primaryAction.icon && <Icon name={primaryAction.icon} size={16} />}
            <span>{primaryAction.label}</span>
          </button>
        )}
      </div>
    </div>
  )
}
