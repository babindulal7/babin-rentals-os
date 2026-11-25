import type { ReactNode } from 'react'
import Icon from './Icon'
import { SearchInput } from './SearchInput'
import { Button } from './Button'
import { useViewport } from '../../lib/device'

export interface FilterOption {
  id: string
  label: string
  count?: number | null
  icon?: Parameters<typeof Icon>[0]['name']
  color?: string
}

export interface FilterBarProps {
  /** Search query state and change handler */
  search?: string
  onSearchChange?: (value: string) => void
  searchPlaceholder?: string
  searchAriaLabel?: string

  /** Quick filter options / stage pills */
  options?: readonly FilterOption[]
  selectedOptionId?: string
  onSelectOption?: (id: string) => void

  /** Multi-select options */
  selectedOptionIds?: ReadonlySet<string>
  onToggleOptionId?: (id: string) => void

  /** Active filters count badge */
  activeCount?: number
  onClearAll?: () => void

  /** Filter drawer toggle button */
  onToggleDrawer?: () => void
  isDrawerOpen?: boolean
  drawerControlsId?: string

  /** Removable active filter tags (ActiveFilterChips) */
  filterChips?: ReactNode
  groupAriaLabel?: string

  /** Additional filters or custom chips */
  children?: ReactNode

  /** Right-aligned actions (e.g. view toggle, export) */
  rightSlot?: ReactNode
}

/**
 * Standardized FilterBar component used across Babin Rentals OS lists and tables.
 * Sits above the grid with 44px minimum touch targets and responsive scrolling.
 */
export function FilterBar({
  search,
  onSearchChange,
  searchPlaceholder = 'Search…',
  searchAriaLabel = 'Filter search',
  options = [],
  selectedOptionId,
  onSelectOption,
  selectedOptionIds,
  onToggleOptionId,
  activeCount = 0,
  onClearAll,
  onToggleDrawer,
  isDrawerOpen = false,
  drawerControlsId,
  filterChips,
  groupAriaLabel = 'Quick filters',
  children,
  rightSlot,
}: FilterBarProps) {
  const vp = useViewport()
  const isDesktop = vp === 'desktop'

  const hasSearch = onSearchChange !== undefined
  const hasOptions = options.length > 0

  return (
    <div
      role="search"
      aria-label="Table filters"
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 'var(--sp-sm, 8px)',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 'var(--sp-sm, 8px)',
          flexWrap: isDesktop ? 'nowrap' : 'wrap',
        }}
      >
        {/* Search input */}
        {hasSearch && (
          <div style={{ flex: '1 1 240px', minWidth: 200, maxWidth: isDesktop ? 360 : '100%' }}>
            <SearchInput
              aria-label={searchAriaLabel}
              placeholder={searchPlaceholder}
              value={search ?? ''}
              onChange={onSearchChange}
              onClear={() => onSearchChange('')}
            />
          </div>
        )}

        {/* Filter Drawer toggle button */}
        {onToggleDrawer ? (
          <Button
            type="button"
            icon="filter"
            aria-controls={drawerControlsId}
            aria-expanded={isDrawerOpen}
            onClick={onToggleDrawer}
            variant={activeCount > 0 ? 'secondary' : 'ghost'}
            style={{
              fontWeight: activeCount > 0 ? 700 : 500,
              minHeight: 44,
            }}
          >
            Filters{activeCount > 0 ? ` ${activeCount}` : ''}
          </Button>
        ) : activeCount > 0 ? (
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              padding: '4px 10px',
              borderRadius: 'var(--r-full, 9999px)',
              background: 'var(--hover)',
              color: 'var(--text2)',
              fontSize: 'var(--t-meta, 12px)',
              fontWeight: 600,
            }}
          >
            {activeCount} active
          </span>
        ) : null}

        {/* Clear all action when narrowed and no separate filterChips */}
        {!filterChips && activeCount > 0 && onClearAll && (
          <button
            type="button"
            aria-label="Clear all applied filters"
            onClick={onClearAll}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4,
              border: 'none',
              background: 'transparent',
              color: 'var(--link, #2563eb)',
              fontSize: 'var(--t-meta, 12px)',
              fontWeight: 600,
              cursor: 'pointer',
              padding: '0 8px',
              minHeight: 44,
              fontFamily: 'inherit',
            }}
          >
            <Icon name="close" size={13} />
            Clear all
          </button>
        )}

        {/* Right-aligned custom slot */}
        {rightSlot && (
          <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8 }}>
            {rightSlot}
          </div>
        )}
      </div>

      {/* Removable active filter tags (ActiveFilterChips) */}
      {filterChips}

      {/* Pill buttons / Stage chips row */}
      {(hasOptions || children) && (
        <div
          role="group"
          aria-label={groupAriaLabel}
          className={!isDesktop && !onToggleOptionId ? 'rsp-chip-scroll' : undefined}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 'var(--sp-sm, 8px)',
            ...(isDesktop || onToggleOptionId
              ? { flexWrap: 'wrap' as const }
              : { overflowX: 'auto' as const, paddingBottom: 2 }),
          }}
        >
          {options.map((opt) => {
            const isSingleSelected = selectedOptionId !== undefined && selectedOptionId === opt.id
            const isMultiSelected = selectedOptionIds !== undefined && selectedOptionIds.has(opt.id)
            const isSelected = isSingleSelected || isMultiSelected
            // A filter with no selection handler is informational, not an actionable control.
            const canSelect = Boolean(onToggleOptionId || onSelectOption)

            // Independent facets use native checkboxes; single-choice presets
            // retain their existing button semantics and callbacks.
            if (onToggleOptionId) {
              return (
                <label
                  key={opt.id}
                  className="filter-bar__option"
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 6,
                    minHeight: 44,
                    padding: '0 10px',
                    borderRadius: 'var(--r-btn, 8px)',
                    border: `1.5px solid ${isMultiSelected ? 'var(--nav-active-accent)' : 'var(--border)'}`,
                    background: isMultiSelected ? 'var(--nav-active-bg)' : 'var(--card)',
                    color: 'var(--text)',
                    fontSize: 'var(--t-meta, 12px)',
                    cursor: 'pointer',
                    flexShrink: 0,
                  }}
                >
                  <input
                    type="checkbox"
                    aria-label={opt.label}
                    checked={isMultiSelected}
                    onChange={() => onToggleOptionId(opt.id)}
                    style={{ width: 16, height: 16, flexShrink: 0, accentColor: 'var(--primary)' }}
                  />
                  {opt.icon && <Icon name={opt.icon} size={13} />}
                  <span>{opt.label}</span>
                  {opt.count !== undefined && opt.count !== null && Number.isFinite(opt.count) && opt.count >= 0 && (
                    <span style={{ fontSize: '11px', opacity: 0.75 }}>({opt.count})</span>
                  )}
                </label>
              )
            }

            return (
              <button
                key={opt.id}
                type="button"
                className="filter-bar__option"
                aria-pressed={canSelect ? isSelected : undefined}
                disabled={!canSelect}
                onClick={() => {
                  if (onToggleOptionId) onToggleOptionId(opt.id)
                  else if (onSelectOption) onSelectOption(opt.id)
                }}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 5,
                  minHeight: 44,
                  padding: '0 12px',
                  borderRadius: 'var(--r-btn, 8px)',
                  border: `1.5px solid ${isSelected ? 'var(--nav-active-accent, #3b82f6)' : 'var(--border, #e2e8f0)'}`,
                  background: isSelected ? 'var(--nav-active-bg, rgba(59, 130, 246, 0.1))' : 'var(--card, #ffffff)',
                  color: isSelected ? 'var(--text, #0f172a)' : 'var(--text2, #475569)',
                  fontSize: 'var(--t-meta, 12px)',
                  fontWeight: isSelected ? 600 : 500,
                  cursor: canSelect ? 'pointer' : 'default',
                  fontFamily: 'inherit',
                  whiteSpace: 'nowrap',
                  transition: 'background-color var(--dur-fast) var(--ease), border-color var(--dur-fast) var(--ease), color var(--dur-fast) var(--ease)',
                  flexShrink: 0,
                }}
              >
                {opt.icon && (
                  <Icon
                    name={opt.icon}
                    size={13}
                    style={{
                      color: isSelected ? 'var(--nav-active-accent, #3b82f6)' : opt.color ?? 'var(--muted, #94a3b8)',
                    }}
                  />
                )}
                <span>{opt.label}</span>
                {opt.count !== undefined && opt.count !== null && Number.isFinite(opt.count) && opt.count >= 0 && (
                  <span
                    style={{
                      fontSize: '11px',
                      opacity: 0.75,
                      marginLeft: 2,
                    }}
                  >
                    ({opt.count})
                  </span>
                )}
              </button>
            )
          })}
          {children}
        </div>
      )}
    </div>
  )
}
