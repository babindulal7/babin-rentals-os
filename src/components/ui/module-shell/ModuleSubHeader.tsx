import React from 'react'
import Icon, { type IconName } from '../Icon'
import { DataAgeBadge } from '../DataAgeBadge'
import './module-shell.css'

export interface ModulePrimaryAction {
  label: string
  onClick: () => void
  icon?: IconName | undefined
  disabled?: boolean | undefined
  ariaLabel?: string | undefined
  title?: string | undefined
}

export interface ModuleSecondaryAction {
  label: string
  onClick: () => void
  icon?: IconName | undefined
  disabled?: boolean | undefined
  ariaLabel?: string | undefined
  title?: string | undefined
}

export interface ModuleSubHeaderProps {
  counter?: React.ReactNode
  loadedAt?: Date | number | string | null | undefined
  loading?: boolean | undefined
  onRefresh?: (() => void) | undefined
  secondaryActions?: React.ReactNode | ModuleSecondaryAction[] | undefined
  primaryAction?: ModulePrimaryAction | undefined
  children?: React.ReactNode | undefined
  className?: string | undefined
  style?: React.CSSProperties | undefined
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
  const hasSecondaryActions = Array.isArray(secondaryActions) ? secondaryActions.length > 0 : Boolean(secondaryActions)
  if (React.Children.toArray(counter).length === 0 && loadedAt === undefined &&
    !hasSecondaryActions && !primaryAction &&
    React.Children.toArray(children).length === 0) return null
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
        {Array.isArray(secondaryActions)
          ? secondaryActions.map((act, idx) => {
              if (React.isValidElement(act)) return <React.Fragment key={idx}>{act}</React.Fragment>
              if (act && typeof act === 'object' && 'label' in act && 'onClick' in act) {
                const action = act as ModuleSecondaryAction
                return (
                  <button
                    key={action.label || idx}
                    type="button"
                    className="module-sub-header__secondary-btn tap"
                    onClick={action.onClick}
                    disabled={action.disabled}
                    aria-label={action.ariaLabel || action.label}
                    title={action.title || action.label}
                    style={{ minHeight: 44 }}
                  >
                    {action.icon && <Icon name={action.icon} size={15} />}
                    <span>{action.label}</span>
                  </button>
                )
              }
              return null
            })
          : secondaryActions}
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
