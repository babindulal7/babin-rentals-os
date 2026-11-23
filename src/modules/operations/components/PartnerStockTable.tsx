import { useState, useMemo } from 'react'
import { Card } from '../../../components/ui/Card'
import { DataTableShell } from '../../../components/ui/DataTable'
import { Button } from '../../../components/ui/Button'
import { SearchInput } from '../../../components/ui/SearchInput'
import { EmptyState } from '../../../components/ui/StateViews'
import { Badge } from '../../../components/ui/Badge'
import { formatMoney } from '../../../lib/money'
import type { PartnerStockRecord } from '../../../lib/queries/partnerStock'
import { IconPlus, IconArrowBackUp } from '@tabler/icons-react'

type PartnerFilter = 'All' | 'Active' | 'Returned' | 'Expired'

interface PartnerStockTableProps {
  rows: PartnerStockRecord[]
  canSeeFinance: boolean
  canAddStock: boolean
  canReturnStock: boolean
  onAddStock: () => void
  onReturnStock: (record: PartnerStockRecord) => void
  search: string
  onSearchChange: (q: string) => void
}

export function PartnerStockTable({
  rows,
  canSeeFinance,
  canAddStock,
  canReturnStock,
  onAddStock,
  onReturnStock,
  search,
  onSearchChange,
}: PartnerStockTableProps) {
  const [filter, setFilter] = useState<PartnerFilter>('All')

  const counts = useMemo(() => {
    return {
      All: rows.length,
      Active: rows.filter((r) => r.status === 'Active' && !r.isExpired).length,
      Returned: rows.filter((r) => r.status === 'Returned to partner').length,
      Expired: rows.filter((r) => r.isExpired && r.status === 'Active').length,
    }
  }, [rows])

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      if (filter === 'Active' && (r.status !== 'Active' || r.isExpired)) return false
      if (filter === 'Returned' && r.status !== 'Returned to partner') return false
      if (filter === 'Expired' && (!r.isExpired || r.status !== 'Active')) return false

      if (search.trim()) {
        const q = search.toLowerCase()
        const matchPartner = r.partnerName.toLowerCase().includes(q)
        const matchProduct = r.productName.toLowerCase().includes(q)
        const matchUnits = r.units.some(
          (u) => u.assetCode.toLowerCase().includes(q) || (u.serialNumber && u.serialNumber.toLowerCase().includes(q)),
        )
        const matchNotes = r.notes ? r.notes.toLowerCase().includes(q) : false
        if (!matchPartner && !matchProduct && !matchUnits && !matchNotes) return false
      }
      return true
    })
  }, [rows, filter, search])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-md)' }}>
      {/* Search and Action Bar */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 'var(--sp-md)', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-sm)', flex: 1, minWidth: 260 }}>
          <SearchInput
            placeholder="Search partner name, equipment, serial number… (press /)"
            value={search}
            onChange={onSearchChange}
            onClear={() => onSearchChange('')}
          />
        </div>

        {canAddStock && (
          <Button
            variant="primary"
            icon={<IconPlus size={16} />}
            onClick={onAddStock}
            style={{ minHeight: 44 }}
          >
            Add Partner Stock
          </Button>
        )}
      </div>

      {/* Filter Chips */}
      <div style={{ display: 'flex', gap: 'var(--sp-xs)', flexWrap: 'wrap' }}>
        {(['All', 'Active', 'Returned', 'Expired'] as const).map((key) => (
          <button
            key={key}
            type="button"
            onClick={() => setFilter(key)}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              padding: '6px 12px',
              borderRadius: 'var(--radius-sm, 6px)',
              fontSize: 'var(--t-meta, 12px)',
              fontWeight: filter === key ? 600 : 400,
              background: filter === key ? 'var(--primary)' : 'var(--card)',
              color: filter === key ? '#fff' : 'var(--text2)',
              border: `1px solid ${filter === key ? 'var(--primary)' : 'var(--border)'}`,
              cursor: 'pointer',
            }}
          >
            <span>{key}</span>
            <span
              style={{
                fontSize: 10,
                padding: '1px 5px',
                borderRadius: 99,
                background: filter === key ? 'rgba(255,255,255,0.2)' : 'var(--bg2)',
                color: filter === key ? '#fff' : 'var(--text)',
                fontWeight: 600,
              }}
            >
              {counts[key]}
            </span>
          </button>
        ))}
      </div>

      {/* Table */}
      <Card padding="none" style={{ overflow: 'hidden' }}>
        {rows.length === 0 ? (
          <div style={{ padding: 'var(--sp-xl)' }}>
            {canAddStock ? (
              <EmptyState
                kind="nothing-yet"
                title="No partner stock recorded"
                description="Temporary stock agreements with industry partners for sub-rental or shortage coverage will appear here."
                actionLabel="Add Partner Stock"
                onAction={onAddStock}
              />
            ) : (
              <EmptyState
                kind="nothing-yet"
                title="No partner stock recorded"
                description="Temporary stock agreements with industry partners for sub-rental or shortage coverage will appear here."
              />
            )}
          </div>
        ) : filtered.length === 0 ? (
          <div style={{ padding: 'var(--sp-xl)' }}>
            <EmptyState
              title="No partner stock matching filters"
              description="Try adjusting your search terms or selecting a different status filter."
              actionLabel="Clear Filters"
              onAction={() => {
                setFilter('All')
                onSearchChange('')
              }}
            />
          </div>
        ) : (
          <DataTableShell ariaLabel="Partner Stock Agreements">
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: 'var(--t-meta, 13px)' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border)', background: 'var(--bg2)', color: 'var(--text2)' }}>
                  <th style={{ padding: '10px 14px', fontWeight: 600 }}>Partner / Agreement</th>
                  <th style={{ padding: '10px 14px', fontWeight: 600 }}>Equipment</th>
                  <th style={{ padding: '10px 14px', fontWeight: 600 }}>Units & Tagging</th>
                  <th style={{ padding: '10px 14px', fontWeight: 600 }}>Bounded Window</th>
                  {canSeeFinance && <th style={{ padding: '10px 14px', fontWeight: 600 }}>Agreed Rate</th>}
                  <th style={{ padding: '10px 14px', fontWeight: 600 }}>Status</th>
                  <th style={{ padding: '10px 14px', fontWeight: 600, textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((r) => {
                  const isReturned = r.status === 'Returned to partner'
                  return (
                    <tr
                      key={r.id}
                      style={{
                        borderBottom: '1px solid var(--border)',
                        background: isReturned ? 'var(--bg-subtle, rgba(0,0,0,0.02))' : undefined,
                        opacity: isReturned ? 0.75 : 1,
                      }}
                    >
                      {/* Partner */}
                      <td style={{ padding: '12px 14px' }}>
                        <div style={{ fontWeight: 600, color: 'var(--text)' }}>{r.partnerName}</div>
                        {r.notes && (
                          <div style={{ fontSize: '11px', color: 'var(--text3, #888)', marginTop: 2, maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {r.notes}
                          </div>
                        )}
                      </td>

                      {/* Equipment */}
                      <td style={{ padding: '12px 14px' }}>
                        <div style={{ fontWeight: 600, color: 'var(--text)' }}>{r.productName}</div>
                        <div style={{ fontSize: '11px', color: 'var(--text2)' }}>
                          {r.productBrand} {r.productModel}
                        </div>
                      </td>

                      {/* Units & Tagging (T2-08, B13) */}
                      <td style={{ padding: '12px 14px' }}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <span style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: 3,
                              fontSize: '10px',
                              fontWeight: 700,
                              padding: '2px 6px',
                              borderRadius: 4,
                              background: 'var(--warn-surface, rgba(234, 179, 8, 0.15))',
                              color: 'var(--warn-text)',
                              border: '1px solid var(--warn-border, rgba(234, 179, 8, 0.3))',
                              letterSpacing: '0.04em',
                            }}>
                              PARTNER
                            </span>
                            <span style={{ fontWeight: 600, fontSize: '12px' }}>
                              {r.trackingMode === 'Serialised' ? `${r.units.length} unit(s)` : `${r.quantity} qty`}
                            </span>
                          </div>

                          {r.trackingMode === 'Serialised' && r.units.length > 0 && (
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, maxWidth: 240 }}>
                              {r.units.map((u) => (
                                <span
                                  key={u.id}
                                  className="figure"
                                  style={{
                                    fontSize: '11px',
                                    padding: '1px 5px',
                                    borderRadius: 3,
                                    background: 'var(--bg2)',
                                    border: '1px solid var(--border)',
                                    color: u.status === 'Retired' ? 'var(--text3)' : 'var(--text)',
                                  }}
                                >
                                  {u.serialNumber ? `${u.assetCode} (${u.serialNumber})` : u.assetCode}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                      </td>

                      {/* Bounded Window */}
                      <td style={{ padding: '12px 14px' }}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                          <span className="figure" style={{ fontWeight: 600, fontSize: '12px', color: 'var(--text)' }}>
                            {r.availableFrom.slice(0, 10)} → {r.availableUntil.slice(0, 10)}
                          </span>
                          <span className="figure" style={{ fontSize: '11px', color: 'var(--text2)' }}>
                            BS: {r.availableFromBs} → {r.availableUntilBs}
                          </span>
                          {r.isExpired && r.status === 'Active' && (
                            <span style={{ fontSize: '10px', fontWeight: 700, color: 'var(--bad)', marginTop: 2 }}>
                              Agreement Expired — Return Due
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Cost under Law 6 */}
                      {canSeeFinance && (
                        <td style={{ padding: '12px 14px' }}>
                          {r.costPaisa != null ? (
                            <div>
                              <div className="figure" style={{ fontWeight: 600, color: 'var(--text)' }}>
                                {formatMoney(r.costPaisa)}
                              </div>
                              <div style={{ fontSize: '11px', color: 'var(--text2)', textTransform: 'capitalize' }}>
                                per {r.costKind ?? 'agreement'}
                              </div>
                            </div>
                          ) : (
                            <span style={{ color: 'var(--muted)' }}>—</span>
                          )}
                        </td>
                      )}

                      {/* Status */}
                      <td style={{ padding: '12px 14px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          {r.status === 'Active' ? (
                            r.isExpired ? (
                              <Badge tone="danger" label="Expired" size="sm" />
                            ) : (
                              <Badge tone="in" label="Active" size="sm" />
                            )
                          ) : r.status === 'Returned to partner' ? (
                            <Badge tone="dim" label="Returned" size="sm" />
                          ) : (
                            <Badge tone="dim" label={r.status} size="sm" />
                          )}
                        </div>
                        {r.returnedAt && (
                          <div style={{ fontSize: '10px', color: 'var(--text2)', marginTop: 3 }}>
                            Ret. {r.returnedAt.slice(0, 10)}
                          </div>
                        )}
                      </td>

                      {/* Floor Action: Return to partner (B36, Law 3) */}
                      <td style={{ padding: '12px 14px', textAlign: 'right' }}>
                        {r.status === 'Active' && canReturnStock ? (
                          <Button
                            variant="secondary"
                            size="sm"
                            icon={<IconArrowBackUp size={14} />}
                            style={{ minHeight: 44 }}
                            onClick={() => onReturnStock(r)}
                          >
                            Return to Partner
                          </Button>
                        ) : r.status === 'Returned to partner' ? (
                          <span style={{ fontSize: '11px', color: 'var(--good)', fontWeight: 600 }}>
                            Units Retired
                          </span>
                        ) : null}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </DataTableShell>
        )}
      </Card>
    </div>
  )
}
