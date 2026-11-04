// =============================================================================
// src/modules/approvals/ApprovalsInbox.tsx — Unified Approvals Workspace (T5-10)
//
// Rulings:
//   - W57: Approver when Babin is away: A Manager (for all manager-eligible approvals).
//   - W58: How approvals reach Babin: App alert + email (W60: no WhatsApp API).
//   - PERMISSIONS.md §6.2: Owner-only list (damage/write-off ≥ Rs 25k, PR ≥ Rs 50k, restore, etc.).
//   - PERMISSIONS.md P7: Approval follows ladder. Nobody approves their own submission.
//   - Law 6: Zero monetary figures exposed to floor roles (Warehouse, Technician, Driver, Client).
//   - Law 16: Five screen states (loading, empty, error, restricted, offline).
// =============================================================================

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useSearchParams, Link } from 'react-router-dom'
import Icon from '../../components/ui/Icon'
import { LoadingSkeleton, EmptyState, ErrorBanner, RestrictedState } from '../../components/ui/StateViews'
import { useAuth } from '../../lib/auth'
import { canViewMoney } from '../../lib/rbac'
import type { SystemRole } from '../../types/database'
import { formatMoney, rupees } from '../../lib/money'
import {
  fetchApprovals,
  canUserApprove,
  approveApprovalItem,
  declineApprovalItem,
  type ApprovalItem,
  type ApprovalType,
  type ApprovalStatus,
} from '../../lib/queries/approvals'

export function ApprovalsInbox() {
  const { user } = useAuth()
  const role = (user?.role as SystemRole) || 'Warehouse'
  const isFloor = !canViewMoney(role)
  const [searchParams] = useSearchParams()
  const targetId = searchParams.get('id')

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [items, setItems] = useState<ApprovalItem[]>([])

  const [typeFilter, setTypeFilter] = useState<ApprovalType | 'all'>('all')
  const [statusFilter, setStatusFilter] = useState<ApprovalStatus | 'all'>('Pending')
  const [searchQuery, setSearchQuery] = useState('')

  // Dialog states
  const [activeItem, setActiveItem] = useState<ApprovalItem | null>(null)
  const [dialogMode, setDialogMode] = useState<'approve' | 'decline' | null>(null)
  const [decisionNote, setDecisionNote] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [dialogError, setDialogError] = useState<string | null>(null)

  const loadData = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await fetchApprovals()
      setItems(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load approvals.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadData()
  }, [loadData])

  // If a deep link is present, ensure status filter includes it
  useEffect(() => {
    if (targetId && items.length > 0) {
      const target = items.find((i) => i.id === targetId || i.entityNumber === targetId)
      if (target && target.status !== 'Pending') {
        setStatusFilter('all')
      }
    }
  }, [targetId, items])

  const filteredItems = useMemo(() => {
    return items.filter((item) => {
      if (typeFilter !== 'all' && item.type !== typeFilter) return false
      if (statusFilter !== 'all' && item.status !== statusFilter) return false
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim()
        const matchTitle = item.title.toLowerCase().includes(q)
        const matchNo = item.entityNumber.toLowerCase().includes(q)
        const matchSubmitter = item.submittedBy.name.toLowerCase().includes(q)
        if (!matchTitle && !matchNo && !matchSubmitter) return false
      }
      return true
    })
  }, [items, typeFilter, statusFilter, searchQuery])

  const pendingCount = useMemo(() => {
    return items.filter((i) => i.status === 'Pending').length
  }, [items])

  const handleOpenApprove = (item: ApprovalItem) => {
    setActiveItem(item)
    setDialogMode('approve')
    setDecisionNote('')
    setDialogError(null)
  }

  const handleOpenDecline = (item: ApprovalItem) => {
    setActiveItem(item)
    setDialogMode('decline')
    setDecisionNote('')
    setDialogError(null)
  }

  const handleCloseDialog = () => {
    setActiveItem(null)
    setDialogMode(null)
    setDecisionNote('')
    setDialogError(null)
  }

  const handleConfirmDecision = async () => {
    if (!activeItem || !user) return
    setSubmitting(true)
    setDialogError(null)

    const approverIdentity = {
      id: user.id,
      name: user.name || 'Management',
      role,
    }

    try {
      if (dialogMode === 'approve') {
        const res = await approveApprovalItem(activeItem.id, approverIdentity, decisionNote)
        if (!res.success) {
          setDialogError(res.error || 'Failed to approve item.')
          setSubmitting(false)
          return
        }
      } else if (dialogMode === 'decline') {
        const res = await declineApprovalItem(activeItem.id, approverIdentity, decisionNote)
        if (!res.success) {
          setDialogError(res.error || 'Failed to decline item.')
          setSubmitting(false)
          return
        }
      }

      await loadData()
      handleCloseDialog()
    } catch (err) {
      setDialogError(err instanceof Error ? err.message : 'Decision processing failed.')
    } finally {
      setSubmitting(false)
    }
  }

  // 1. Five screen states: Restricted State for floor roles (Law 6)
  if (isFloor) {
    return (
      <main style={{ padding: '24px 16px', maxWidth: 1000, margin: '0 auto' }}>
        <RestrictedState
          reason="Floor roles (Warehouse, Technician, Driver, Client) cannot view or decide management authorizations (Law 6)."
          requiredRole="Manager or Owner"
        />
      </main>
    )
  }

  // 2. Loading state
  if (loading && items.length === 0) {
    return (
      <main style={{ padding: '24px 16px', maxWidth: 1000, margin: '0 auto' }}>
        <LoadingSkeleton type="table" label="Loading approvals inbox…" />
      </main>
    )
  }

  return (
    <main
      style={{
        padding: '24px 16px',
        maxWidth: 1080,
        margin: '0 auto',
        display: 'flex',
        flexDirection: 'column',
        gap: 20,
      }}
    >
      {/* Header */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <h1 style={{ fontSize: 'var(--t-title)', fontWeight: 700, margin: 0 }}>Approvals Inbox</h1>
          <span
            style={{
              padding: '2px 10px',
              borderRadius: 'var(--r-badge)',
              fontSize: '12px',
              fontWeight: 700,
              background: pendingCount > 0 ? 'var(--badge-warn-bg, #f59e0b20)' : 'var(--card2)',
              color: pendingCount > 0 ? 'var(--warn)' : 'var(--muted)',
            }}
          >
            {pendingCount} Pending
          </span>
        </div>
        <div style={{ fontSize: 'var(--t-body)', color: 'var(--muted)' }}>
          Authorizations waiting on management: damage charges, late-fee waivers, commercial credit overrides, purchases, and write-offs (W57, W58).
        </div>
      </div>

      {error && <ErrorBanner message={error} onRetry={() => loadData()} />}

      {/* Control Bar: Type Filters, Status Toggle & Search */}
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: 12,
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '12px 16px',
          background: 'var(--card)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--r-card)',
        }}
      >
        {/* Type pills */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {[
            { id: 'all', label: 'All Items' },
            { id: 'damage_charge', label: 'Damage Charges' },
            { id: 'late_fee_waiver', label: 'Waivers' },
            { id: 'commercial_override', label: 'Overrides' },
            { id: 'purchase_request', label: 'Purchases' },
            { id: 'write_off', label: 'Write-offs' },
          ].map((pill) => {
            const active = typeFilter === pill.id
            return (
              <button
                key={pill.id}
                type="button"
                onClick={() => setTypeFilter(pill.id as ApprovalType | 'all')}
                style={{
                  minHeight: 36,
                  padding: '6px 14px',
                  borderRadius: 'var(--r-btn)',
                  border: '1px solid',
                  borderColor: active ? 'var(--primary)' : 'var(--border)',
                  background: active ? 'var(--primary)' : 'var(--card2)',
                  color: active ? '#ffffff' : 'var(--text)',
                  fontSize: 'var(--t-meta)',
                  fontWeight: 600,
                  cursor: 'pointer',
                  transition: 'background 0.15s ease',
                }}
              >
                {pill.label}
              </button>
            )
          })}
        </div>

        {/* Status & Search */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as ApprovalStatus | 'all')}
            style={{
              minHeight: 38,
              padding: '6px 12px',
              borderRadius: 'var(--r-btn)',
              border: '1px solid var(--border)',
              background: 'var(--card2)',
              color: 'var(--text)',
              fontSize: 'var(--t-meta)',
            }}
          >
            <option value="Pending">Pending Decision</option>
            <option value="Approved">Approved</option>
            <option value="Declined">Declined</option>
            <option value="all">All Statuses</option>
          </select>

          <input
            type="search"
            placeholder="Search approvals…"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{
              minHeight: 38,
              padding: '6px 12px',
              borderRadius: 'var(--r-btn)',
              border: '1px solid var(--border)',
              background: 'var(--card2)',
              color: 'var(--text)',
              fontSize: 'var(--t-meta)',
              minWidth: 160,
            }}
          />
        </div>
      </div>

      {/* Approvals List */}
      {filteredItems.length === 0 ? (
        <EmptyState
          icon="checklist"
          title="No approvals found"
          description={
            statusFilter === 'Pending'
              ? 'No items are currently waiting for approval in this view.'
              : 'No matching approval records found.'
          }
        />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {filteredItems.map((item) => {
            const isTarget = item.id === targetId || item.entityNumber === targetId
            const check = canUserApprove(item, role, user?.id || '')
            const isOwnerOnly = item.requiredLevel === 'Owner'
            const isManagerViewingOwnerOnly = isOwnerOnly && role !== 'Owner'

            return (
              <div
                key={item.id}
                id={item.id}
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 12,
                  padding: '16px 20px',
                  borderRadius: 'var(--r-card)',
                  background: 'var(--card)',
                  border: isTarget ? '2px solid var(--primary)' : '1px solid var(--border)',
                  boxShadow: isTarget ? '0 0 12px var(--primary-wash, rgba(56, 106, 247, 0.2))' : 'none',
                }}
              >
                {/* Item Top Row: Badges, Level, Status */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <Link
                      to={item.linkUrl}
                      style={{
                        fontSize: 'var(--t-body)',
                        fontWeight: 700,
                        fontFamily: 'JetBrains Mono, monospace',
                        color: 'var(--primary)',
                        textDecoration: 'none',
                      }}
                    >
                      {item.entityNumber}
                    </Link>

                    <span
                      style={{
                        padding: '2px 8px',
                        borderRadius: 'var(--r-badge)',
                        fontSize: '11px',
                        fontWeight: 600,
                        background: 'var(--card2)',
                        color: 'var(--muted)',
                        textTransform: 'capitalize',
                      }}
                    >
                      {item.type.replace('_', ' ')}
                    </span>

                    {/* Authority Level Badge */}
                    {isOwnerOnly ? (
                      <span
                        style={{
                          padding: '2px 8px',
                          borderRadius: 'var(--r-badge)',
                          fontSize: '11px',
                          fontWeight: 700,
                          background: 'var(--badge-warn-bg, #f59e0b20)',
                          color: 'var(--warn)',
                        }}
                      >
                        Owner only (Babin) §6.2
                      </span>
                    ) : (
                      <span
                        style={{
                          padding: '2px 8px',
                          borderRadius: 'var(--r-badge)',
                          fontSize: '11px',
                          fontWeight: 600,
                          background: 'var(--card2)',
                          color: 'var(--text2)',
                        }}
                      >
                        Manager or Owner
                      </span>
                    )}
                  </div>

                  {/* Status Indicator */}
                  <div>
                    {item.status === 'Pending' && (
                      <span
                        style={{
                          padding: '3px 10px',
                          borderRadius: 'var(--r-badge)',
                          fontSize: '11px',
                          fontWeight: 700,
                          background: 'var(--badge-warn-bg, #f59e0b20)',
                          color: 'var(--warn)',
                        }}
                      >
                        Pending Decision
                      </span>
                    )}
                    {item.status === 'Approved' && (
                      <span
                        style={{
                          padding: '3px 10px',
                          borderRadius: 'var(--r-badge)',
                          fontSize: '11px',
                          fontWeight: 700,
                          background: 'var(--badge-success-bg, #10b98120)',
                          color: 'var(--success)',
                        }}
                      >
                        Approved
                      </span>
                    )}
                    {item.status === 'Declined' && (
                      <span
                        style={{
                          padding: '3px 10px',
                          borderRadius: 'var(--r-badge)',
                          fontSize: '11px',
                          fontWeight: 700,
                          background: 'var(--badge-danger-bg, #ef444420)',
                          color: 'var(--danger)',
                        }}
                      >
                        Declined
                      </span>
                    )}
                  </div>
                </div>

                {/* Title & Description */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <div style={{ fontSize: 'var(--t-body)', fontWeight: 600, color: 'var(--text)' }}>
                    {item.title}
                  </div>
                  <div style={{ fontSize: 'var(--t-meta)', color: 'var(--text2)', lineHeight: 1.5 }}>
                    {item.description}
                  </div>
                </div>

                {/* Amount & Submitter Meta */}
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    flexWrap: 'wrap',
                    gap: 12,
                    paddingTop: 8,
                    borderTop: '1px solid var(--border)',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
                    {item.amountPaisa !== null && (
                      <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
                        <span style={{ fontSize: 'var(--t-meta)', color: 'var(--muted)' }}>Amount:</span>
                        <span
                          style={{
                            fontSize: 'var(--t-body)',
                            fontWeight: 700,
                            fontFamily: 'JetBrains Mono, monospace',
                            color: 'var(--text)',
                          }}
                        >
                          {formatMoney(rupees(item.amountPaisa / 100))}
                        </span>
                      </div>
                    )}

                    <div style={{ fontSize: 'var(--t-meta)', color: 'var(--muted)' }}>
                      Submitted by{' '}
                      <strong style={{ color: 'var(--text2)' }}>{item.submittedBy.name}</strong> ({item.submittedBy.role}) on {item.submittedAtBs} ({item.submittedAtAd.slice(0, 10)})
                    </div>
                  </div>

                  {/* Actions / Decision Badges */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    {item.status === 'Pending' ? (
                      <>
                        {check.allowed ? (
                          <>
                            <button
                              type="button"
                              onClick={() => handleOpenDecline(item)}
                              style={{
                                minHeight: 44,
                                padding: '8px 16px',
                                borderRadius: 'var(--r-btn)',
                                border: '1px solid var(--border)',
                                background: 'var(--card2)',
                                color: 'var(--danger)',
                                fontSize: 'var(--t-meta)',
                                fontWeight: 600,
                                cursor: 'pointer',
                              }}
                            >
                              Decline…
                            </button>
                            <button
                              type="button"
                              onClick={() => handleOpenApprove(item)}
                              style={{
                                minHeight: 44,
                                padding: '8px 20px',
                                borderRadius: 'var(--r-btn)',
                                border: 'none',
                                background: 'var(--primary)',
                                color: '#ffffff',
                                fontSize: 'var(--t-meta)',
                                fontWeight: 700,
                                cursor: 'pointer',
                              }}
                            >
                              Approve
                            </button>
                          </>
                        ) : (
                          // Rule: "an Owner-only item never shows an approve button to a Manager."
                          <div
                            style={{
                              padding: '8px 14px',
                              borderRadius: 'var(--r-badge)',
                              fontSize: '12px',
                              fontWeight: 600,
                              background: 'var(--card2)',
                              color: isManagerViewingOwnerOnly ? 'var(--warn)' : 'var(--muted)',
                              border: '1px solid var(--border)',
                            }}
                          >
                            {isManagerViewingOwnerOnly
                              ? 'Awaiting Owner (Babin) — Owner-only item §6.2'
                              : check.reason || 'Not authorized to decide'}
                          </div>
                        )}
                      </>
                    ) : (
                      <div style={{ fontSize: 'var(--t-meta)', color: 'var(--muted)' }}>
                        Decided by{' '}
                        <strong style={{ color: 'var(--text2)' }}>{item.decidedBy?.name || 'Staff'}</strong> ({item.decidedBy?.role || 'Manager'})
                        {item.decisionReason && ` — "${item.decisionReason}"`}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Decision Dialog Modal */}
      {dialogMode && activeItem && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="decision-dialog-title"
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.5)',
            display: 'grid',
            placeItems: 'center',
            zIndex: 1000,
            padding: 16,
          }}
        >
          <div
            style={{
              background: 'var(--card)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--r-card)',
              padding: 24,
              maxWidth: 480,
              width: '100%',
              display: 'flex',
              flexDirection: 'column',
              gap: 16,
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h2 id="decision-dialog-title" style={{ fontSize: 'var(--t-h2)', fontWeight: 700, margin: 0 }}>
                {dialogMode === 'approve' ? 'Approve Authorization' : 'Decline Authorization'}
              </h2>
              <button
                type="button"
                onClick={handleCloseDialog}
                style={{
                  minHeight: 44,
                  minWidth: 44,
                  border: 'none',
                  background: 'transparent',
                  color: 'var(--muted)',
                  cursor: 'pointer',
                  display: 'grid',
                  placeItems: 'center',
                }}
              >
                <Icon name="x" size={18} />
              </button>
            </div>

            <div style={{ fontSize: 'var(--t-body)', color: 'var(--text2)', lineHeight: 1.5 }}>
              {dialogMode === 'approve' ? (
                <>
                  Confirm approval of <strong>{activeItem.entityNumber}</strong>: {activeItem.title}.
                  {activeItem.amountPaisa && ` Amount: ${formatMoney(rupees(activeItem.amountPaisa / 100))}.`}
                </>
              ) : (
                <>
                  You are declining <strong>{activeItem.entityNumber}</strong>: {activeItem.title}. A mandatory reason of at least 10 characters is required.
                </>
              )}
            </div>

            {dialogError && <ErrorBanner message={dialogError} />}

            {/* Note/Reason Input */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <label style={{ fontSize: 'var(--t-meta)', fontWeight: 600 }}>
                {dialogMode === 'approve' ? 'Approval Note (Optional)' : 'Decline Reason (Mandatory, ≥ 10 chars)'}
              </label>
              <textarea
                rows={3}
                value={decisionNote}
                onChange={(e) => setDecisionNote(e.target.value)}
                placeholder={
                  dialogMode === 'approve'
                    ? 'Optional notes for audit log…'
                    : 'Explain reason for refusal (min 10 characters)…'
                }
                style={{
                  padding: 10,
                  borderRadius: 'var(--r-btn)',
                  border: '1px solid var(--border)',
                  background: 'var(--card2)',
                  color: 'var(--text)',
                  fontSize: 'var(--t-body)',
                  resize: 'vertical',
                }}
              />
              {dialogMode === 'decline' && (
                <div style={{ fontSize: 'var(--t-meta)', color: decisionNote.trim().length >= 10 ? 'var(--success)' : 'var(--muted)' }}>
                  {decisionNote.trim().length} / 10 characters minimum
                </div>
              )}
            </div>

            {/* Buttons */}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 8 }}>
              <button
                type="button"
                onClick={handleCloseDialog}
                disabled={submitting}
                style={{
                  minHeight: 44,
                  padding: '8px 16px',
                  borderRadius: 'var(--r-btn)',
                  border: '1px solid var(--border)',
                  background: 'var(--card2)',
                  color: 'var(--text)',
                  fontSize: 'var(--t-meta)',
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                Cancel
              </button>

              <button
                type="button"
                onClick={handleConfirmDecision}
                disabled={submitting || (dialogMode === 'decline' && decisionNote.trim().length < 10)}
                style={{
                  minHeight: 44,
                  padding: '8px 20px',
                  borderRadius: 'var(--r-btn)',
                  border: 'none',
                  background: dialogMode === 'approve' ? 'var(--primary)' : 'var(--danger)',
                  color: '#ffffff',
                  fontSize: 'var(--t-meta)',
                  fontWeight: 700,
                  cursor: submitting || (dialogMode === 'decline' && decisionNote.trim().length < 10) ? 'not-allowed' : 'pointer',
                  opacity: submitting || (dialogMode === 'decline' && decisionNote.trim().length < 10) ? 0.6 : 1,
                }}
              >
                {submitting ? 'Saving…' : dialogMode === 'approve' ? 'Confirm Approval' : 'Confirm Decline'}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  )
}
export default ApprovalsInbox
