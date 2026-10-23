import React from 'react'
import Icon, { type IconName } from '../Icon'
import { SearchInput } from '../SearchInput'
import './module-shell.css'

export interface FilterTabOption {
  id: string
  label: string
  count?: number | string | null | undefined
  icon?: IconName | undefined
}

export interface ModuleFilterBarProps {
  tabs: readonly FilterTabOption[]
  activeTab: string
  onTabChange: (id: string) => void
  searchValue?: string | undefined
  onSearchChange?: ((val: string) => void) | undefined
  searchPlaceholder?: string | undefined
  dropdownFilters?: React.ReactNode | undefined
  rightActions?: React.ReactNode | undefined
  children?: React.ReactNode | undefined
  className?: string | undefined
  style?: React.CSSProperties | undefined
}

/**
 * Zone 3: Unified Filter & Tab Bar
 * Left: Segmented status pills with inline count badges (matching Today dispatch filter style).
 * Right: Dropdown filters (category, date, sorting) + table search input.
 */
export const ModuleFilterBar: React.FC<ModuleFilterBarProps> = ({
  tabs,
  activeTab,
  onTabChange,
  searchValue,
  onSearchChange,
  searchPlaceholder = 'Filter records…',
  dropdownFilters,
  rightActions,
  children,
  className = '',
  style,
}) => {
  return (
    <div className={`module-filter-bar ${className}`.trim()} style={style} role="toolbar" aria-label="Module filters and view controls">
      <div className="module-filter-bar__left" role="tablist" aria-label="Status filter pills">
        {tabs.map((tab) => {
          const isActive = tab.id === activeTab
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-label={tab.label}
              aria-selected={isActive}
              aria-pressed={isActive}
              tabIndex={isActive ? 0 : -1}
              className={`module-filter-bar__tab press ${isActive ? 'is-active' : ''}`.trim()}
              onClick={() => onTabChange(tab.id)}
              onKeyDown={(event) => {
                const backwards = event.key === 'ArrowLeft' || event.key === 'ArrowUp'
                const forwards = event.key === 'ArrowRight' || event.key === 'ArrowDown'
                if (!backwards && !forwards && event.key !== 'Home' && event.key !== 'End') return
                const index = tabs.findIndex((t) => t.id === tab.id)
                const next =
                  event.key === 'Home'
                    ? tabs[0]
                    : event.key === 'End'
                      ? tabs[tabs.length - 1]
                      : tabs[(index + (backwards ? -1 : 1) + tabs.length) % tabs.length]
                if (!next) return
                event.preventDefault()
                onTabChange(next.id)
                const buttons = event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>('[role="tab"]')
                buttons?.[tabs.findIndex((t) => t.id === next.id)]?.focus()
              }}
            >
              {tab.icon && <Icon name={tab.icon} size={14} />}
              <span data-view-label>{tab.label}</span>
              {tab.count !== undefined && tab.count !== null && (
                <span className="module-filter-bar__tab-count">
                  {tab.count}
                </span>
              )}
            </button>
          )
        })}
      </div>

      <div className="module-filter-bar__right">
        {dropdownFilters}
        {children}
        {onSearchChange && (
          <div className="module-filter-bar__search">
            <SearchInput
              value={searchValue ?? ''}
              onChange={onSearchChange}
              onClear={() => onSearchChange('')}
              placeholder={searchPlaceholder}
              aria-label={searchPlaceholder}
            />
          </div>
        )}
        {rightActions}
      </div>
    </div>
  )
}
