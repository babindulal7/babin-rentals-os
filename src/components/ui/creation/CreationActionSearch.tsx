/**
 * src/components/ui/creation/CreationActionSearch.tsx — Babin Rentals OS
 *
 * Searchable All Creation Actions panel.
 *
 * Implements:
 * - Live filter across all 22 creation actions and 7 canonical groups
 * - Role permission filtering (omits actions/groups user cannot access)
 * - Full keyboard navigation (Arrow Up/Down, Enter, Escape)
 * - Law 15: >= 44x44px touch targets
 * - Direct action triggering via callback
 */

import { useEffect, useRef, useState } from 'react'
import { Modal } from '../Modal'
import Icon from '../Icon'
import { useAuth } from '../../../lib/auth'
import {
  CREATION_ACTIONS,
  CANONICAL_CREATION_GROUPS,
  isCreationActionReady,
  type CreationActionDefinition,
  type CreationGroupKey,
} from './CreationActionRegistry'

export interface CreationActionSearchProps {
  isOpen: boolean
  onClose: () => void
  onSelectAction: (action: CreationActionDefinition) => void
}

export function CreationActionSearch({
  isOpen,
  onClose,
  onSelectAction,
}: CreationActionSearchProps) {
  const { user } = useAuth()
  const [query, setQuery] = useState('')
  const [selectedIndex, setSelectedIndex] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  const [selectedGroup, setSelectedGroup] = useState<CreationGroupKey | 'all'>('all')

  // Filter actions based on role, readiness and query
  const permittedActions = CREATION_ACTIONS.filter(
    (act) => (!user || act.isPermitted(user.role)) && isCreationActionReady(act)
  )

  const filteredActions = permittedActions.filter((act) => {
    if (selectedGroup !== 'all' && act.group !== selectedGroup) return false
    if (!query.trim()) return true
    const q = query.toLowerCase()
    const groupDef = CANONICAL_CREATION_GROUPS[act.group]
    return (
      act.label.toLowerCase().includes(q) ||
      (act.description && act.description.toLowerCase().includes(q)) ||
      (groupDef && groupDef.label.toLowerCase().includes(q)) ||
      act.module.toLowerCase().includes(q)
    )
  })

  // Group filtered actions
  const groupedActions = new Map<CreationGroupKey, CreationActionDefinition[]>()
  for (const act of filteredActions) {
    const list = groupedActions.get(act.group) ?? []
    list.push(act)
    groupedActions.set(act.group, list)
  }

  // Flattened list for keyboard index mapping
  const flatMatches = filteredActions

  // Category counts based on permitted actions
  const availableGroups = Array.from(
    new Set(permittedActions.map((a) => a.group))
  )

  useEffect(() => {
    if (isOpen) {
      setQuery('')
      setSelectedGroup('all')
      setSelectedIndex(0)
      setTimeout(() => inputRef.current?.focus(), 50)
    }
  }, [isOpen])

  useEffect(() => {
    setSelectedIndex(0)
  }, [query, selectedGroup])

  // Scroll focused option into view (guarded for environments like jsdom)
  useEffect(() => {
    if (!listRef.current) return
    const focusedEl = listRef.current.querySelector<HTMLElement>(`[data-action-index="${selectedIndex}"]`)
    if (typeof focusedEl?.scrollIntoView === 'function') {
      focusedEl.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
    }
  }, [selectedIndex])

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setSelectedIndex((idx) => (idx + 1) % Math.max(1, flatMatches.length))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setSelectedIndex((idx) =>
        idx <= 0 ? Math.max(0, flatMatches.length - 1) : idx - 1
      )
    } else if (e.key === 'Enter') {
      e.preventDefault()
      const selected = flatMatches[selectedIndex]
      if (selected) {
        onSelectAction(selected)
        onClose()
      }
    } else if (e.key === 'Escape') {
      e.preventDefault()
      onClose()
    }
  }

  const kbdStyle: React.CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 20,
    height: 20,
    padding: '0 5px',
    fontSize: '11px',
    fontWeight: 600,
    fontFamily: 'inherit',
    color: 'var(--text2)',
    background: 'var(--card2)',
    border: '1px solid var(--border)',
    borderRadius: 'var(--r-xs, 4px)',
  }

  const GROUP_ACCENTS: Record<
    CreationGroupKey,
    {
      badgeBg: string
      badgeFg: string
      iconBg: string
      iconFg: string
      border: string
    }
  > = {
    rentals: {
      badgeBg: 'var(--nav-active-bg)',
      badgeFg: 'var(--primary-text)',
      iconBg: 'rgba(36, 86, 214, 0.12)',
      iconFg: 'var(--primary)',
      border: 'rgba(36, 86, 214, 0.25)',
    },
    clients: {
      badgeBg: 'rgba(30, 134, 74, 0.10)',
      badgeFg: 'var(--success-text)',
      iconBg: 'rgba(30, 134, 74, 0.14)',
      iconFg: 'var(--success)',
      border: 'rgba(30, 134, 74, 0.25)',
    },
    inventory: {
      badgeBg: 'rgba(212, 98, 24, 0.10)',
      badgeFg: 'var(--warn-text)',
      iconBg: 'rgba(212, 98, 24, 0.14)',
      iconFg: 'var(--warn)',
      border: 'rgba(212, 98, 24, 0.25)',
    },
    operations: {
      badgeBg: 'rgba(99, 102, 241, 0.10)',
      badgeFg: 'var(--primary-text)',
      iconBg: 'rgba(99, 102, 241, 0.14)',
      iconFg: 'var(--primary)',
      border: 'rgba(99, 102, 241, 0.25)',
    },
    crew: {
      badgeBg: 'rgba(2, 132, 199, 0.10)',
      badgeFg: 'var(--primary-text)',
      iconBg: 'rgba(2, 132, 199, 0.14)',
      iconFg: 'var(--primary)',
      border: 'rgba(2, 132, 199, 0.25)',
    },
    billing: {
      badgeBg: 'rgba(30, 134, 74, 0.10)',
      badgeFg: 'var(--success-text)',
      iconBg: 'rgba(30, 134, 74, 0.14)',
      iconFg: 'var(--success)',
      border: 'rgba(30, 134, 74, 0.25)',
    },
    admin: {
      badgeBg: 'var(--card2)',
      badgeFg: 'var(--text2)',
      iconBg: 'rgba(100, 116, 139, 0.14)',
      iconFg: 'var(--text2)',
      border: 'var(--border)',
    },
  }

  let cumulativeIndex = 0

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="All Creation Actions"
      subtitle="Search and launch workflows, register clients, or add gear to your inventory"
      size="lg"
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {/* Search Bar */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            padding: '0 14px',
            minHeight: 48,
            borderRadius: 'var(--r-card, 10px)',
            border: '1px solid var(--border)',
            background: 'var(--card)',
            boxShadow: 'var(--shadow-xs)',
            transition: 'border-color var(--dur-fast) var(--ease), box-shadow var(--dur-fast) var(--ease)',
          }}
        >
          <span style={{ color: 'var(--primary)', display: 'flex', alignItems: 'center' }}>
            <Icon name="search" size={18} />
          </span>
          <input
            ref={inputRef}
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Search all creation actions, workflows, records… (press /)"
            aria-label="Search all creation actions"
            style={{
              flex: 1,
              minHeight: 44,
              border: 'none',
              background: 'transparent',
              color: 'var(--text)',
              fontSize: 'var(--t-body, 14px)',
              fontWeight: 500,
              outline: 'none',
            }}
          />
          {query ? (
            <button
              type="button"
              onClick={() => {
                setQuery('')
                inputRef.current?.focus()
              }}
              aria-label="Clear search query"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: 28,
                height: 28,
                borderRadius: 'var(--r-full, 9999px)',
                background: 'var(--card2)',
                border: 'none',
                color: 'var(--muted)',
                cursor: 'pointer',
                transition: 'background var(--dur-fast) var(--ease)',
              }}
            >
              <Icon name="close" size={14} />
            </button>
          ) : (
            <kbd style={kbdStyle}>/</kbd>
          )}
        </div>

        {/* Category Filter Chips */}
        {availableGroups.length > 1 && (
          <div
            style={{
              display: 'flex',
              gap: 6,
              overflowX: 'auto',
              paddingBottom: 2,
              scrollbarWidth: 'none',
            }}
          >
            <button
              type="button"
              onClick={() => setSelectedGroup('all')}
              style={{
                minHeight: 32,
                padding: '0 12px',
                borderRadius: 'var(--r-full, 9999px)',
                border: selectedGroup === 'all' ? '1px solid var(--select-bg)' : '1px solid var(--border)',
                background: selectedGroup === 'all' ? 'var(--select-bg)' : 'var(--card2)',
                color: selectedGroup === 'all' ? 'var(--select-fg)' : 'var(--text2)',
                fontSize: '12px',
                fontWeight: selectedGroup === 'all' ? 600 : 500,
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                cursor: 'pointer',
                whiteSpace: 'nowrap',
                transition: 'all var(--dur-fast) var(--ease)',
              }}
            >
              <span>All</span>
              <span style={{ fontSize: '11px', opacity: selectedGroup === 'all' ? 1 : 0.75, fontWeight: 700 }}>
                {permittedActions.length}
              </span>
            </button>

            {availableGroups.map((gKey) => {
              const def = CANONICAL_CREATION_GROUPS[gKey]
              if (!def) return null
              const isSelected = selectedGroup === gKey
              const count = permittedActions.filter((a) => a.group === gKey).length
              return (
                <button
                  key={gKey}
                  type="button"
                  onClick={() => setSelectedGroup(gKey)}
                  style={{
                    minHeight: 32,
                    padding: '0 12px',
                    borderRadius: 'var(--r-full, 9999px)',
                    border: isSelected ? '1px solid var(--primary)' : '1px solid var(--border)',
                    background: isSelected ? 'var(--nav-active-bg)' : 'var(--card2)',
                    color: isSelected ? 'var(--primary-text)' : 'var(--text2)',
                    fontSize: '12px',
                    fontWeight: isSelected ? 600 : 500,
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 6,
                    cursor: 'pointer',
                    whiteSpace: 'nowrap',
                    transition: 'all var(--dur-fast) var(--ease)',
                  }}
                >
                  <Icon name={def.icon} size={13} />
                  <span>{def.label.split('&')[0]?.trim() ?? def.label}</span>
                  <span style={{ fontSize: '11px', opacity: isSelected ? 1 : 0.75, fontWeight: 700 }}>
                    {count}
                  </span>
                </button>
              )
            })}
          </div>
        )}

        {/* Grouped Actions List */}
        <div
          ref={listRef}
          role="listbox"
          style={{
            maxHeight: 420,
            overflowY: 'auto',
            display: 'flex',
            flexDirection: 'column',
            gap: 16,
            paddingRight: 4,
          }}
        >
          {flatMatches.length === 0 ? (
            <div
              style={{
                padding: '48px 16px',
                textAlign: 'center',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 10,
              }}
            >
              <span
                style={{
                  width: 44,
                  height: 44,
                  borderRadius: 'var(--r-full, 9999px)',
                  background: 'var(--card2)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: 'var(--muted)',
                }}
              >
                <Icon name="search" size={20} />
              </span>
              <div style={{ color: 'var(--text)', fontWeight: 600, fontSize: 'var(--t-body, 14px)' }}>
                No creation workflows found
              </div>
              <div style={{ color: 'var(--muted)', fontSize: 'var(--t-meta, 13px)', maxWidth: 320 }}>
                No actions match &ldquo;{query}&rdquo; in this category.
              </div>
              {selectedGroup !== 'all' && (
                <button
                  type="button"
                  onClick={() => setSelectedGroup('all')}
                  style={{
                    marginTop: 6,
                    minHeight: 36,
                    padding: '0 14px',
                    borderRadius: 'var(--r-btn, 8px)',
                    border: '1px solid var(--border)',
                    background: 'var(--card)',
                    color: 'var(--primary-text)',
                    fontSize: 'var(--t-meta, 13px)',
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  Search in all categories
                </button>
              )}
            </div>
          ) : (
            Array.from(groupedActions.entries()).map(([gKey, acts]) => {
              const groupDef = CANONICAL_CREATION_GROUPS[gKey]
              const accent = GROUP_ACCENTS[gKey] ?? GROUP_ACCENTS.rentals

              return (
                <div key={gKey} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {/* Category Header */}
                  <div
                    style={{
                      fontSize: '11px',
                      fontWeight: 700,
                      textTransform: 'uppercase',
                      letterSpacing: '0.07em',
                      color: 'var(--text2)',
                      padding: '2px 8px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span
                        style={{
                          width: 18,
                          height: 18,
                          borderRadius: 'var(--r-xs, 4px)',
                          background: accent.iconBg,
                          color: accent.iconFg,
                          display: 'inline-flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}
                      >
                        <Icon name={groupDef.icon} size={12} />
                      </span>
                      <span>{groupDef.label}</span>
                    </div>
                    <span
                      style={{
                        fontSize: '11px',
                        color: 'var(--muted)',
                        fontWeight: 600,
                      }}
                    >
                      {acts.length} {acts.length === 1 ? 'action' : 'actions'}
                    </span>
                  </div>

                  {/* Actions Grid / List */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {acts.map((act) => {
                      const thisIndex = cumulativeIndex++
                      const isFocused = thisIndex === selectedIndex

                      // Opening mode badge label and visual styling
                      const modeLabel =
                        act.openingMode === 'route'
                          ? '↗ Workspace'
                          : act.openingMode === 'dialog'
                            ? '⚡ Quick Dialog'
                            : act.openingMode === 'drawer'
                              ? '◨ Side Drawer'
                              : act.openingMode === 'wizard'
                                ? '✦ Multi-step'
                                : '◻ Modal'

                      return (
                        <button
                          key={act.id}
                          type="button"
                          role="option"
                          className="action-search-match"
                          data-action-index={thisIndex}
                          aria-selected={isFocused}
                          onClick={() => {
                            onSelectAction(act)
                            onClose()
                          }}
                          onMouseEnter={() => setSelectedIndex(thisIndex)}
                          style={{
                            minHeight: 56,
                            width: '100%',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            padding: '10px 14px',
                            borderRadius: 'var(--r-card, 10px)',
                            border: `1px solid ${isFocused ? 'var(--primary)' : 'var(--border)'}`,
                            background: isFocused ? 'var(--surface-2)' : 'var(--card)',
                            boxShadow: isFocused ? '0 0 0 1px var(--primary), var(--shadow-sm)' : 'none',
                            cursor: 'pointer',
                            textAlign: 'left',
                            transition: 'all var(--dur-fast) var(--ease)',
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0, flex: 1 }}>
                            <span
                              style={{
                                width: 36,
                                height: 36,
                                borderRadius: 'var(--r-btn, 8px)',
                                background: isFocused ? 'var(--primary)' : accent.iconBg,
                                color: isFocused ? 'var(--on-primary)' : accent.iconFg,
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                flexShrink: 0,
                                transition: 'all var(--dur-fast) var(--ease)',
                              }}
                            >
                              <Icon name={act.icon} size={18} />
                            </span>
                            <div style={{ minWidth: 0, flex: 1 }}>
                              <div
                                style={{
                                  fontWeight: 600,
                                  fontSize: 'var(--t-body, 14px)',
                                  color: 'var(--text)',
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: 6,
                                }}
                              >
                                <span>{act.label}</span>
                                {act.isMoneyAction && (
                                  <span
                                    style={{
                                      fontSize: '10px',
                                      fontWeight: 700,
                                      padding: '1px 5px',
                                      borderRadius: 'var(--r-xs, 4px)',
                                      background: 'var(--chip-amber-bg)',
                                      color: 'var(--chip-amber-fg)',
                                    }}
                                  >
                                    Financial
                                  </span>
                                )}
                              </div>
                              {act.description && (
                                <div
                                  style={{
                                    fontSize: 'var(--t-caption, 12px)',
                                    color: 'var(--muted)',
                                    overflow: 'hidden',
                                    textOverflow: 'ellipsis',
                                    whiteSpace: 'nowrap',
                                    marginTop: 2,
                                  }}
                                >
                                  {act.description}
                                </div>
                              )}
                            </div>
                          </div>

                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0, marginLeft: 12 }}>
                            <span
                              style={{
                                fontSize: '11px',
                                fontWeight: 600,
                                padding: '3px 8px',
                                borderRadius: 'var(--r-xs, 4px)',
                                background: 'var(--card2)',
                                color: 'var(--text2)',
                                border: '1px solid var(--border)',
                              }}
                            >
                              {modeLabel}
                            </span>

                            {isFocused && (
                              <span
                                style={{
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: 3,
                                  padding: '3px 8px',
                                  borderRadius: 'var(--r-xs, 4px)',
                                  background: 'var(--primary)',
                                  color: 'var(--on-primary)',
                                  fontSize: '11px',
                                  fontWeight: 700,
                                }}
                              >
                                Open ↵
                              </span>
                            )}
                          </div>
                        </button>
                      )
                    })}
                  </div>
                </div>
              )
            })
          )}
        </div>

        {/* Footer Shortcut Bar */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            paddingTop: 12,
            borderTop: '1px solid var(--border)',
            fontSize: '12px',
            color: 'var(--muted)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
              <kbd style={kbdStyle}>↑</kbd>
              <kbd style={kbdStyle}>↓</kbd>
              <span>Navigate</span>
            </span>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
              <kbd style={kbdStyle}>↵</kbd>
              <span>Open</span>
            </span>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
              <kbd style={kbdStyle}>Esc</kbd>
              <span>Close</span>
            </span>
          </div>
          <div style={{ fontWeight: 600, color: 'var(--text2)' }}>
            {flatMatches.length} {flatMatches.length === 1 ? 'action' : 'actions'} available
          </div>
        </div>
      </div>
    </Modal>
  )
}
