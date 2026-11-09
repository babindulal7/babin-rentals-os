import { useState, useEffect, useMemo } from 'react'
import { Card, Button } from '../../components/ui/Page'
import { DataTableShell } from '../../components/ui/DataTable'
import { EmptyState, ErrorBanner, LoadingSkeleton } from '../../components/ui/StateViews'
import { StatusPill } from '../../components/ui/module-shell/StatusPill'
import Icon from '../../components/ui/Icon'
import { useAuth } from '../../lib/auth'
import { useCanViewMoney } from '../../lib/moneyVisibility'
import { canManageMembershipPlans } from '../../lib/rbac'
import { listMembershipPlans, type MembershipPlanRecord } from '../../lib/queries/membership'
import { EditMembershipPlanModal } from './modals/EditMembershipPlanModal'
import { RetireMembershipPlanModal } from './modals/RetireMembershipPlanModal'
import { formatMoney, rupees } from '../../lib/money'

type StatusFilter = 'All' | 'Active' | 'Retired'

export default function PlansAdmin() {
  const { user } = useAuth()
  const canViewMoney = useCanViewMoney()
  const canManage = canManageMembershipPlans(user?.role ?? 'Client')

  const [plans, setPlans] = useState<MembershipPlanRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('All')
  const [searchQuery, setSearchQuery] = useState('')
  const [editModalOpen, setEditModalOpen] = useState(false)
  const [selectedPlan, setSelectedPlan] = useState<MembershipPlanRecord | null>(null)
  const [retireModalState, setRetireModalState] = useState<{ plan: MembershipPlanRecord; retire: boolean } | null>(null)

  async function loadPlans() {
    setLoading(true)
    setError(null)
    try {
      const data = await listMembershipPlans()
      setPlans(data)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Could not load membership plans.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadPlans()
  }, [])

  const activeCount = plans.filter((p) => p.status === 'Active').length
  const retiredCount = plans.filter((p) => p.status === 'Retired').length

  const filteredPlans = useMemo(() => {
    return plans.filter((p) => {
      if (statusFilter !== 'All' && p.status !== statusFilter) return false
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase()
        const matchLevel = p.level.toLowerCase().includes(q)
        const matchLabel = p.label.toLowerCase().includes(q)
        const matchPerk = p.perks.some((perk) => perk.toLowerCase().includes(q))
        if (!matchLevel && !matchLabel && !matchPerk) return false
      }
      return true
    })
  }, [plans, statusFilter, searchQuery])

  function handleCreate() {
    setSelectedPlan(null)
    setEditModalOpen(true)
  }

  function handleEdit(plan: MembershipPlanRecord) {
    setSelectedPlan(plan)
    setEditModalOpen(true)
  }

  function handleRetireToggle(plan: MembershipPlanRecord) {
    setRetireModalState({
      plan,
      retire: plan.status === 'Active',
    })
  }

  const headers = [
    '#',
    'Plan Tier & Label',
    'Annual Fee',
    'Discounts',
    'Rental Limits',
    'Default Credit',
    'Term',
    'Included Perks',
    'Status',
    'Actions',
  ]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-md)' }}>
      {/* Header Bar */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: 'var(--sp-sm)',
          paddingBottom: 'var(--sp-sm)',
          borderBottom: '1px solid var(--border)',
        }}
      >
        <div>
          <h2 style={{ fontSize: '18px', fontWeight: 700, margin: 0, color: 'var(--text1)' }}>
            Membership Plans
          </h2>
          <span style={{ fontSize: '13px', color: 'var(--text2)' }}>
            {plans.length} configured plans ({activeCount} active, {retiredCount} retired)
            {!canManage && ' — Read-only access for Coordinator'}
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-sm)' }}>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => void loadPlans()}
            disabled={loading}
          >
            <Icon name="refresh" size={14} /> Refresh
          </Button>

          {canManage && (
            <Button
              type="button"
              variant="primary"
              size="sm"
              icon="plus"
              onClick={handleCreate}
            >
              + Create Plan
            </Button>
          )}
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: 'var(--sp-sm)',
        }}
      >
        <div style={{ display: 'flex', gap: 'var(--sp-xs)' }}>
          <Button
            type="button"
            size="sm"
            variant={statusFilter === 'All' ? 'primary' : 'ghost'}
            onClick={() => setStatusFilter('All')}
          >
            All ({plans.length})
          </Button>
          <Button
            type="button"
            size="sm"
            variant={statusFilter === 'Active' ? 'primary' : 'ghost'}
            onClick={() => setStatusFilter('Active')}
          >
            Active ({activeCount})
          </Button>
          <Button
            type="button"
            size="sm"
            variant={statusFilter === 'Retired' ? 'primary' : 'ghost'}
            onClick={() => setStatusFilter('Retired')}
          >
            Retired ({retiredCount})
          </Button>
        </div>

        <div style={{ minWidth: 220 }}>
          <input
            type="text"
            placeholder="Search plans by level, label, perk..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{
              padding: '6px 12px',
              borderRadius: 'var(--radius-sm, 6px)',
              border: '1px solid var(--border)',
              background: 'var(--bg-surface)',
              color: 'var(--text1)',
              fontSize: '13px',
              width: '100%',
              boxSizing: 'border-box',
            }}
          />
        </div>
      </div>

      {error && <ErrorBanner message={error} onRetry={() => void loadPlans()} />}

      {loading ? (
        <LoadingSkeleton type="table" rows={5} />
      ) : plans.length === 0 ? (
        canManage ? (
          <EmptyState
            title="No membership plans found"
            description="Membership plans define client pricing discounts, credit limits, and perks."
            actionLabel="+ Create Plan"
            onAction={handleCreate}
          />
        ) : (
          <EmptyState
            title="No membership plans found"
            description="Membership plans define client pricing discounts, credit limits, and perks."
          />
        )
      ) : filteredPlans.length === 0 ? (
        <EmptyState
          title="No matching plans"
          description={`No membership plans matched filter "${statusFilter}" and search "${searchQuery}".`}
          actionLabel="Clear Filters"
          onAction={() => { setStatusFilter('All'); setSearchQuery('') }}
        />
      ) : (
        <Card style={{ padding: 0, overflow: 'hidden' }}>
          <DataTableShell ariaLabel="Membership Plans">
            <table
              className="data-table"
              style={{
                width: '100%',
                borderCollapse: 'collapse',
                textAlign: 'left',
                fontSize: '13px',
              }}
            >
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border)', background: 'var(--bg-subtle, rgba(0,0,0,0.02))' }}>
                  {headers.map((h) => (
                    <th key={h} style={{ padding: '10px 12px', fontWeight: 600, color: 'var(--text2)' }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filteredPlans.map((p) => {
                  const isActive = p.status === 'Active'
                  return (
                    <tr
                      key={p.id}
                      style={{
                        opacity: isActive ? 1 : 0.75,
                        background: isActive ? 'transparent' : 'var(--bg-subtle, rgba(0, 0, 0, 0.02))',
                        borderBottom: '1px solid var(--border)',
                      }}
                    >
                      <td style={{ padding: '10px 12px', fontFamily: 'var(--font-mono, monospace)', fontWeight: 600, width: 40 }}>
                        {p.displayOrder}
                      </td>

                      <td style={{ padding: '10px 12px' }}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                          <span style={{ fontWeight: 700, color: 'var(--text1)' }}>{p.level}</span>
                          <span style={{ fontSize: '12px', color: 'var(--text2)' }}>{p.label}</span>
                        </div>
                      </td>

                      <td style={{ padding: '10px 12px', fontFamily: 'var(--font-mono, monospace)', fontWeight: 600 }}>
                        {!canViewMoney ? (
                          <span className="select-none">—</span>
                        ) : p.annualFee != null && p.annualFee > 0 ? (
                          `Rs ${formatMoney(rupees(p.annualFee))}`
                        ) : (
                          <span style={{ color: 'var(--text2)', fontStyle: 'italic' }}>Custom / Free</span>
                        )}
                      </td>

                      <td style={{ padding: '10px 12px' }}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 2, fontSize: '12px' }}>
                          <span>
                            Ind: <strong>{p.individualDiscountPct != null ? `${p.individualDiscountPct}%` : '0%'}</strong>
                          </span>
                          <span>
                            Bundle: <strong>{p.bundleDiscountPct != null ? `${p.bundleDiscountPct}%` : '0%'}</strong>
                          </span>
                        </div>
                      </td>

                      <td style={{ padding: '10px 12px' }}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 2, fontSize: '12px' }}>
                          <span>
                            Bookings: <strong>{p.monthlyBookingLimit != null ? `${p.monthlyBookingLimit}/mo` : 'Unlimited'}</strong>
                          </span>
                          <span>
                            Simultaneous: <strong>{p.simultaneousRentalLimit ?? 'Unlimited'}</strong>
                          </span>
                          <span>
                            Users: <strong>{p.authorizedUsers ?? 1}</strong>
                          </span>
                        </div>
                      </td>

                      <td style={{ padding: '10px 12px', fontFamily: 'var(--font-mono, monospace)' }}>
                        {!canViewMoney ? (
                          <span className="select-none">—</span>
                        ) : p.defaultCreditLimit != null && p.defaultCreditLimit > 0 ? (
                          `Rs ${formatMoney(rupees(p.defaultCreditLimit))}`
                        ) : (
                          <span style={{ color: 'var(--text2)' }}>Rs 0</span>
                        )}
                      </td>

                      <td style={{ padding: '10px 12px', fontSize: '12px' }}>
                        {p.termMonths} mo
                      </td>

                      <td style={{ padding: '10px 12px' }}>
                        {p.perks && p.perks.length > 0 ? (
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                            {p.perks.map((perk, idx) => (
                              <span
                                key={idx}
                                style={{
                                  fontSize: '11px',
                                  padding: '2px 6px',
                                  borderRadius: 4,
                                  background: 'var(--bg-card, #f0f4f8)',
                                  border: '1px solid var(--border)',
                                }}
                              >
                                {perk}
                              </span>
                            ))}
                          </div>
                        ) : (
                          <span style={{ fontSize: '12px', color: 'var(--text2)', fontStyle: 'italic' }}>None</span>
                        )}
                      </td>

                      <td style={{ padding: '10px 12px' }}>
                        <StatusPill label={p.status} tone={isActive ? 'emerald' : 'slate'} />
                      </td>

                      <td style={{ padding: '10px 12px' }}>
                        {canManage ? (
                          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-xs)' }}>
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              onClick={() => handleEdit(p)}
                              aria-label={`Edit ${p.level}`}
                            >
                              Edit
                            </Button>

                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              onClick={() => handleRetireToggle(p)}
                              aria-label={isActive ? `Retire ${p.level}` : `Reactivate ${p.level}`}
                              style={{
                                color: isActive ? 'var(--danger, #d32f2f)' : 'var(--nav-active-accent, #0070f3)',
                              }}
                            >
                              {isActive ? 'Retire' : 'Reactivate'}
                            </Button>
                          </div>
                        ) : (
                          <span style={{ fontSize: '12px', color: 'var(--text2)', fontStyle: 'italic' }}>
                            View only
                          </span>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </DataTableShell>
        </Card>
      )}

      {editModalOpen && (
        <EditMembershipPlanModal
          isOpen={editModalOpen}
          onClose={() => setEditModalOpen(false)}
          onSaved={() => void loadPlans()}
          plan={selectedPlan}
        />
      )}

      {retireModalState && (
        <RetireMembershipPlanModal
          isOpen={Boolean(retireModalState)}
          onClose={() => setRetireModalState(null)}
          onConfirmed={() => void loadPlans()}
          plan={retireModalState.plan}
          retire={retireModalState.retire}
        />
      )}
    </div>
  )
}
