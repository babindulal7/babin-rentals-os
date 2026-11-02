import React from 'react'
import Icon, { type IconName } from '../Icon'
import { StatusPill, type StatusTone } from './StatusPill'
import { OverflowMenu, type OverflowMenuItem } from '../OverflowMenu'
import './module-shell.css'

export interface ModuleTableRowData {
  id: string
  code: string
  codePrefix?: string
  entityTitle: React.ReactNode
  entitySubtitle?: React.ReactNode
  contextPrimary: React.ReactNode
  contextSecondary?: React.ReactNode
  statusLabel: string
  statusTone: StatusTone
  statusIcon?: IconName
  metricValue?: React.ReactNode
  metricSub?: React.ReactNode
  primaryAction?: {
    label: string
    onClick: (e: React.MouseEvent) => void
    icon?: IconName
    tone?: 'dominant' | 'prep'
    disabled?: boolean
  }
  overflowActions?: OverflowMenuItem[]
  onClick?: () => void
}

export interface ModuleTableColumnTitles {
  code?: string
  entity?: string
  context?: string
  status?: string
  metric?: string
  actions?: string
}

export interface ModuleTableProps {
  rows: readonly ModuleTableRowData[]
  columnTitles?: ModuleTableColumnTitles
  emptyMessage?: string
  emptySubtitle?: string
  loading?: boolean
  className?: string
  style?: React.CSSProperties
}

/**
 * Zone 4: Standard Data Table
 * Standardized 6-column layout:
 * 1. Code/ID: Monospace badge
 * 2. Primary Entity: Bold title + muted secondary subtitle
 * 3. Context / Dates / Specs: Standardized dates or specs
 * 4. Status: Unified semantic status pill
 * 5. Metric: Right-aligned NPR or quantity figure
 * 6. Actions: Pinned context action button + overflow menu
 */
export const ModuleTable: React.FC<ModuleTableProps> = ({
  rows,
  columnTitles,
  emptyMessage = 'No records found',
  emptySubtitle = 'Try adjusting your filters or search query.',
  loading = false,
  className = '',
  style,
}) => {
  const titles = {
    code: columnTitles?.code || 'ID',
    entity: columnTitles?.entity || 'Primary Entity',
    context: columnTitles?.context || 'Schedule & Context',
    status: columnTitles?.status || 'Status',
    metric: columnTitles?.metric || 'Financial / Metric',
    actions: columnTitles?.actions || 'Actions',
  }

  return (
    <div className={`module-table-container ${className}`.trim()} style={style}>
      <div className="module-table-scroll">
        <table className="module-table">
          <thead>
            <tr>
              <th style={{ width: '130px' }}>{titles.code}</th>
              <th style={{ minWidth: '220px' }}>{titles.entity}</th>
              <th style={{ minWidth: '180px' }}>{titles.context}</th>
              <th style={{ width: '150px' }}>{titles.status}</th>
              <th style={{ width: '160px', textAlign: 'right' }}>{titles.metric}</th>
              <th style={{ width: '170px', textAlign: 'right' }}>{titles.actions}</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={6} style={{ padding: '36px', textAlign: 'center', color: 'var(--muted)' }}>
                  <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                    <Icon name="refresh" size={18} className="spin" />
                    <span>Loading records…</span>
                  </div>
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={6} style={{ padding: '48px 24px', textAlign: 'center' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
                    <Icon name="search" size={24} style={{ color: 'var(--muted)' }} />
                    <strong style={{ color: 'var(--text)', fontSize: 'var(--t-ui, 14px)' }}>{emptyMessage}</strong>
                    <span style={{ color: 'var(--text2)', fontSize: 'var(--t-meta, 13px)' }}>{emptySubtitle}</span>
                  </div>
                </td>
              </tr>
            ) : (
              rows.map((row) => {
                const isClickable = Boolean(row.onClick)

                const handleRowKeyDown = (e: React.KeyboardEvent<HTMLTableRowElement>) => {
                  const target = e.target as HTMLElement
                  if (target.closest('button, a, input, select')) return
                  if (isClickable && (e.key === 'Enter' || e.key === ' ')) {
                    e.preventDefault()
                    row.onClick?.()
                  }
                }

                return (
                  <tr
                    key={row.id}
                    className={isClickable ? 'is-clickable' : ''}
                    onClick={row.onClick}
                    onKeyDown={isClickable ? handleRowKeyDown : undefined}
                    tabIndex={isClickable ? 0 : undefined}
                  >
                    {/* Col 1: Code / ID */}
                    <td>
                      <span className="module-table__code-badge">
                        {row.codePrefix || ''}{row.code}
                      </span>
                    </td>

                    {/* Col 2: Primary Entity */}
                    <td>
                      <div className="module-table__entity">
                        <div className="module-table__entity-title">{row.entityTitle}</div>
                        {row.entitySubtitle && (
                          <div className="module-table__entity-sub">{row.entitySubtitle}</div>
                        )}
                      </div>
                    </td>

                    {/* Col 3: Context / Dates / Specs */}
                    <td>
                      <div className="module-table__context">
                        <span className="module-table__context-primary">{row.contextPrimary}</span>
                        {row.contextSecondary && (
                          <span className="module-table__context-secondary">{row.contextSecondary}</span>
                        )}
                      </div>
                    </td>

                    {/* Col 4: Unified Status Pill */}
                    <td>
                      <StatusPill
                        label={row.statusLabel}
                        {...(row.statusTone ? { tone: row.statusTone } : {})}
                        {...(row.statusIcon ? { icon: row.statusIcon } : {})}
                      />
                    </td>

                    {/* Col 5: Financial / Metric */}
                    <td className="module-table__metric">
                      <div>{row.metricValue ?? '—'}</div>
                      {row.metricSub && (
                        <div style={{ fontSize: '11px', color: 'var(--muted)', fontWeight: 500 }}>
                          {row.metricSub}
                        </div>
                      )}
                    </td>

                    {/* Col 6: Pinned Row Action + Overflow */}
                    <td>
                      {/* Containment only: a click here must not also open the row. The row's own key
                          handler already ignores keys that come from these buttons. */}
                      <div className="module-table__actions" role="presentation" onClick={(e) => e.stopPropagation()}>
                        {row.primaryAction && (
                          <button
                            type="button"
                            className={`module-table__row-cta press ${row.primaryAction.tone === 'prep' ? 'module-table__row-cta--prep' : ''}`}
                            onClick={row.primaryAction.onClick}
                            disabled={row.primaryAction.disabled}
                          >
                            <span>{row.primaryAction.label}</span>
                            <Icon name={row.primaryAction.icon || 'arrow_right'} size={14} />
                          </button>
                        )}
                        {row.overflowActions && row.overflowActions.length > 0 && (
                          <OverflowMenu
                            ariaLabel={`Actions for ${row.code}`}
                            items={row.overflowActions}
                          />
                        )}
                      </div>
                    </td>
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
