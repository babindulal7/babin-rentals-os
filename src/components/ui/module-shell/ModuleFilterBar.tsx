import React from 'react'
import Icon, { type IconName } from '../Icon'
import { SearchInput } from '../SearchInput'
import './module-shell.css'

export interface FilterTabOption {
  id: string
  label: string
  count?: number | string | null
  icon?: IconName
}

export interface ModuleFilterBarProps {
  tabs: readonly FilterTabOption[]
  activeTab: string
  onTabChange: (id: string) => void
  searchValue?: string
  onSearchChange?: (val: string) => void
  searchPlaceholder?: string
  dropdownFilters?: React.ReactNode
  rightActions?: React.ReactNode
  className?: string
  style?: React.CSSProperties
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
              aria-selected={isActive}
              className={`module-filter-bar__tab press ${isActive ? 'is-active' : ''}`.trim()}
              onClick={() => onTabChange(tab.id)}
            >
              {tab.icon && <Icon name={tab.icon} size={14} />}
              <span>{tab.label}</span>
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
