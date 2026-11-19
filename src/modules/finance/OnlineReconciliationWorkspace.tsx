/**
 * src/modules/finance/OnlineReconciliationWorkspace.tsx
 *
 * Online Payment Reconciliation & Refunds Workspace (T7-07, B39, Law 4, Law 6).
 *
 * Displays:
 * 1. Online provider settlement aggregates (Fonepay, eSewa, Khalti).
 * 2. Stale / unallocated intent warnings (> 3 days unallocated/unrefunded).
 * 3. Daily transaction breakdown & recent intents ledger.
 * 4. Refund / Account credit action modal for staff (Owner, Admin, Manager, Accounts).
 */

import React, { useState, useEffect, useCallback, useMemo } from 'react'
import Icon from '../../components/ui/Icon'
import { Button } from '../../components/ui/Button'
import { formatMoney, type Paisa } from '../../lib/money'
import { useCanViewMoney } from '../../lib/moneyVisibility'
import { useToast } from '../../components/ui/Toast'
import {
  fetchOnlineReconciliation,
  fetchPaymentIntents,
  type OnlineReconciliationRow,
  type PaymentIntentRow,
} from '../../lib/queries/reconciliation'
import { refundPaymentIntent } from '../../actions/finance/refundPaymentIntent'

export const OnlineReconciliationWorkspace: React.FC = () => {
  const canMoney = useCanViewMoney()
  const toast = useToast()

  const [loading, setLoading] = useState(true)
  const [reconRows, setReconRows] = useState<OnlineReconciliationRow[]>([])
  const [intents, setIntents] = useState<PaymentIntentRow[]>([])
  const [statusFilter, setStatusFilter] = useState<string>('all')

  // Refund modal state
  const [refundTarget, setRefundTarget] = useState<PaymentIntentRow | null>(null)
  const [refundType, setRefundType] = useState<'wallet_refund' | 'account_credit'>('wallet_refund')
  const [refundRef, setRefundRef] = useState('')
  const [refundReason, setRefundReason] = useState('')
  const [isSubmittingRefund, setIsSubmittingRefund] = useState(false)

  const loadData = useCallback(async () => {
    if (!canMoney) return
    setLoading(true)
    try {
      const [recon, list] = await Promise.all([
        fetchOnlineReconciliation(),
        fetchPaymentIntents(statusFilter),
      ])
      setReconRows(recon)
      setIntents(list)
    } catch (err) {
      toast?.showSuccessToast?.('Error', err instanceof Error ? err.message : 'Failed to load reconciliation')
    } finally {
      setLoading(false)
    }
  }, [canMoney, statusFilter, toast])

  useEffect(() => {
    void loadData()
  }, [loadData])

  // Aggregate KPIs
  const { totalCollected, totalAllocated, totalRefunded, staleCount } = useMemo(() => {
    let collected = 0
    let allocated = 0
    let refunded = 0
    let stale = 0

    for (const r of reconRows) {
      collected += r.total_collected_paisa
      allocated += r.total_allocated_paisa
      refunded += r.total_refunded_paisa
      stale += r.flagged_unreconciled_intents
    }

    return {
      totalCollected: collected as Paisa,
      totalAllocated: allocated as Paisa,
      totalRefunded: refunded as Paisa,
      staleCount: stale,
    }
  }, [reconRows])

  // Provider totals
  const providerStats = useMemo(() => {
    const map = new Map<string, { collected: number; allocated: number; refunded: number; count: number }>()
    for (const r of reconRows) {
      const cur = map.get(r.provider) || { collected: 0, allocated: 0, refunded: 0, count: 0 }
      cur.collected += r.total_collected_paisa
      cur.allocated += r.total_allocated_paisa
      cur.refunded += r.total_refunded_paisa
      cur.count += r.total_intents
      map.set(r.provider, cur)
    }
    return Array.from(map.entries()).map(([provider, stats]) => ({
      provider,
      ...stats,
    }))
  }, [reconRows])

  const handleOpenRefund = (intent: PaymentIntentRow) => {
    setRefundTarget(intent)
    setRefundType('wallet_refund')
    setRefundRef('')
    setRefundReason('')
  }

  const handleSubmitRefund = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!refundTarget) return

    setIsSubmittingRefund(true)
    try {
      const res = await refundPaymentIntent({
        intentId: refundTarget.id,
        refundType,
        refundRef: refundRef.trim() || undefined,
        reason: refundReason.trim() || undefined,
      })

      if (res.success) {
        toast?.showSuccessToast?.(
          refundType === 'wallet_refund' ? 'Refund Processed' : 'Store Credit Issued',
          refundType === 'wallet_refund'
            ? `Online payment of ${formatMoney(refundTarget.amount_paisa)} refunded.`
            : `Store credit of ${formatMoney(refundTarget.amount_paisa)} added to client account.`
        )
        setRefundTarget(null)
        await loadData()
      } else {
        toast?.showSuccessToast?.('Refund Failed', res.error || 'Operation refused by server')
      }
    } catch (err) {
      toast?.showSuccessToast?.('Error', err instanceof Error ? err.message : 'Failed to record refund')
    } finally {
      setIsSubmittingRefund(false)
    }
  }

  if (!canMoney) {
    return (
      <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>
        <Icon name="lock" size={24} style={{ marginBottom: 8 }} />
        <p>Access restricted: Money-blind role cannot view online payment reconciliation.</p>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* Header */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: 12,
        }}
      >
        <div>
          <h2 style={{ fontSize: '1.25rem', fontWeight: 700, margin: 0, color: 'var(--text)' }}>
            Online Payment Reconciliation & Refunds
          </h2>
          <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
            Reconcile online provider deposits (Fonepay, eSewa, Khalti), process wallet refunds or store credits.
          </span>
        </div>
        <Button variant="outline" size="sm" onClick={loadData} disabled={loading}>
          <Icon name="refresh" size={14} style={{ marginRight: 6 }} />
          Refresh
        </Button>
      </div>

      {/* Stale Alert Banner if any */}
      {staleCount > 0 && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            padding: '12px 16px',
            background: 'rgba(239, 68, 68, 0.12)',
            border: '1px solid rgba(239, 68, 68, 0.3)',
            borderRadius: 'var(--radius-md)',
            color: '#dc2626',
          }}
        >
          <Icon name="alert_triangle" size={20} />
          <div>
            <div style={{ fontWeight: 700, fontSize: '0.9rem' }}>
              {staleCount} Unallocated Online Payment{staleCount > 1 ? 's' : ''} Older Than 3 Days
            </div>
            <div style={{ fontSize: '0.8rem', opacity: 0.9 }}>
              Intents marked paid but not yet linked to an active booking invoice or refunded. Action required.
            </div>
          </div>
        </div>
      )}

      {/* KPI Cards */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
          gap: 16,
        }}
      >
        <div
          style={{
            padding: 16,
            background: 'var(--card)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius-md)',
          }}
        >
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>
            Total Collected Online
          </div>
          <div style={{ fontSize: '1.5rem', fontWeight: 700, fontFamily: 'var(--font-mono)', marginTop: 4 }}>
            {formatMoney(totalCollected)}
          </div>
        </div>
        <div
          style={{
            padding: 16,
            background: 'var(--card)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius-md)',
          }}
        >
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>
            Allocated to Bookings
          </div>
          <div
            style={{
              fontSize: '1.5rem',
              fontWeight: 700,
              fontFamily: 'var(--font-mono)',
              marginTop: 4,
              color: 'var(--color-success, #16a34a)',
            }}
          >
            {formatMoney(totalAllocated)}
          </div>
        </div>
        <div
          style={{
            padding: 16,
            background: 'var(--card)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius-md)',
          }}
        >
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>
            Refunded / Credited
          </div>
          <div
            style={{
              fontSize: '1.5rem',
              fontWeight: 700,
              fontFamily: 'var(--font-mono)',
              marginTop: 4,
              color: '#d97706',
            }}
          >
            {formatMoney(totalRefunded)}
          </div>
        </div>
        <div
          style={{
            padding: 16,
            background: staleCount > 0 ? 'rgba(239, 68, 68, 0.08)' : 'var(--card)',
            border: staleCount > 0 ? '1px solid rgba(239, 68, 68, 0.4)' : '1px solid var(--border)',
            borderRadius: 'var(--radius-md)',
          }}
        >
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>
            Unreconciled (&gt;3 Days)
          </div>
          <div
            style={{
              fontSize: '1.5rem',
              fontWeight: 700,
              fontFamily: 'var(--font-mono)',
              marginTop: 4,
              color: staleCount > 0 ? '#dc2626' : 'var(--text)',
            }}
          >
            {staleCount}
          </div>
        </div>
      </div>

      {/* Provider Summaries */}
      {providerStats.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: 12 }}>
          {providerStats.map((p) => (
            <div
              key={p.provider}
              style={{
                padding: '12px 16px',
                background: 'var(--card)',
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius-md)',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontWeight: 700, textTransform: 'uppercase', fontSize: '0.85rem' }}>
                  {p.provider}
                </span>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                  {p.count} transactions
                </span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8, fontSize: '0.8rem' }}>
                <span>Collected:</span>
                <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 600 }}>
                  {formatMoney(p.collected as Paisa)}
                </span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', color: '#16a34a' }}>
                <span>Allocated:</span>
                <span style={{ fontFamily: 'var(--font-mono)' }}>{formatMoney(p.allocated as Paisa)}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', color: '#d97706' }}>
                <span>Refunded:</span>
                <span style={{ fontFamily: 'var(--font-mono)' }}>{formatMoney(p.refunded as Paisa)}</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Payment Intents Filter & Table */}
      <div
        style={{
          background: 'var(--card)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius-md)',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: '12px 16px',
            borderBottom: '1px solid var(--border)',
            background: 'var(--card2)',
          }}
        >
          <div style={{ fontWeight: 600, fontSize: '0.9rem' }}>Recent Online Payment Intents</div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Status:</span>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              style={{
                fontSize: '0.8rem',
                padding: '4px 8px',
                borderRadius: 'var(--radius-sm)',
                border: '1px solid var(--border)',
                background: 'var(--card)',
                color: 'var(--text)',
              }}
            >
              <option value="all">All</option>
              <option value="paid">Paid (Unallocated)</option>
              <option value="allocated">Allocated</option>
              <option value="refunded">Refunded</option>
            </select>
          </div>
        </div>

        {loading ? (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>
            Loading payment intents...
          </div>
        ) : intents.length === 0 ? (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>
            No online payment intents found for the selected filter.
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.85rem' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border)', color: 'var(--text2)' }}>
                  <th style={{ padding: '10px 14px' }}>Date</th>
                  <th style={{ padding: '10px 14px' }}>Provider / Ref</th>
                  <th style={{ padding: '10px 14px' }}>Target</th>
                  <th style={{ padding: '10px 14px' }}>Amount</th>
                  <th style={{ padding: '10px 14px' }}>Status</th>
                  <th style={{ padding: '10px 14px', textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {intents.map((i) => {
                  const isStale =
                    i.status === 'paid' &&
                    new Date(i.created_at).getTime() < Date.now() - 3 * 24 * 60 * 60 * 1000
                  const canRefund = i.status === 'paid' || i.status === 'allocated'

                  return (
                    <tr
                      key={i.id}
                      style={{
                        borderBottom: '1px solid var(--border)',
                        background: isStale ? 'rgba(239, 68, 68, 0.08)' : undefined,
                      }}
                    >
                      <td style={{ padding: '10px 14px', whiteSpace: 'nowrap' }}>
                        {new Date(i.created_at).toLocaleDateString()}
                      </td>
                      <td style={{ padding: '10px 14px' }}>
                        <div style={{ fontWeight: 600, textTransform: 'capitalize' }}>{i.provider}</div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                          {i.provider_ref || 'Pending'}
                        </div>
                      </td>
                      <td style={{ padding: '10px 14px', fontSize: '0.8rem' }}>
                        {i.booking_id ? (
                          <span>Booking #{i.booking_id.slice(0, 8)}</span>
                        ) : i.booking_request_id ? (
                          <span>Request #{i.booking_request_id.slice(0, 8)}</span>
                        ) : (
                          <span style={{ color: 'var(--text-muted)' }}>—</span>
                        )}
                      </td>
                      <td style={{ padding: '10px 14px', fontFamily: 'var(--font-mono)', fontWeight: 600 }}>
                        {formatMoney(i.amount_paisa)}
                      </td>
                      <td style={{ padding: '10px 14px' }}>
                        <span
                          style={{
                            display: 'inline-block',
                            padding: '2px 8px',
                            borderRadius: '4px',
                            fontSize: '0.75rem',
                            fontWeight: 600,
                            textTransform: 'uppercase',
                            background:
                              i.status === 'allocated'
                                ? 'rgba(34, 197, 94, 0.15)'
                                : i.status === 'refunded'
                                ? 'rgba(217, 119, 6, 0.15)'
                                : i.status === 'paid'
                                ? 'rgba(59, 130, 246, 0.15)'
                                : 'rgba(156, 163, 175, 0.15)',
                            color:
                              i.status === 'allocated'
                                ? '#16a34a'
                                : i.status === 'refunded'
                                ? '#d97706'
                                : i.status === 'paid'
                                ? '#2563eb'
                                : 'var(--text-muted)',
                          }}
                        >
                          {i.status}
                        </span>
                        {isStale && (
                          <div
                            style={{
                              fontSize: '0.7rem',
                              color: '#dc2626',
                              fontWeight: 700,
                              marginTop: 2,
                            }}
                          >
                            Unallocated &gt; 3d
                          </div>
                        )}
                        {i.status === 'refunded' && i.refund_type && (
                          <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: 2 }}>
                            {i.refund_type === 'wallet_refund' ? 'Wallet Refund' : 'Store Credit'}
                          </div>
                        )}
                      </td>
                      <td style={{ padding: '10px 14px', textAlign: 'right' }}>
                        {canRefund && (
                          <Button size="sm" variant="outline" onClick={() => handleOpenRefund(i)}>
                            Refund / Credit
                          </Button>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Refund Modal */}
      {refundTarget && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0, 0, 0, 0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
            padding: 16,
          }}
        >
          <div
            style={{
              background: 'var(--card)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-lg, 12px)',
              padding: 24,
              maxWidth: 480,
              width: '100%',
              boxShadow: 'var(--shadow-lg, 0 10px 25px rgba(0,0,0,0.2))',
            }}
          >
            <h3 style={{ margin: '0 0 8px 0', fontSize: '1.1rem', fontWeight: 700 }}>
              Process Online Payment Refund
            </h3>
            <p style={{ margin: '0 0 16px 0', fontSize: '0.85rem', color: 'var(--text-muted)' }}>
              Total amount: <strong>{formatMoney(refundTarget.amount_paisa)}</strong> ({refundTarget.provider}).
              {refundTarget.status === 'allocated' && (
                <span style={{ display: 'block', color: '#d97706', marginTop: 4, fontWeight: 600 }}>
                  Note: Payment is already allocated. An immutable payment reversal record will be issued.
                </span>
              )}
            </p>

            <form onSubmit={handleSubmitRefund} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: 6 }}>
                  Resolution Method
                </label>
                <div style={{ display: 'flex', gap: 12 }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.85rem', cursor: 'pointer' }}>
                    <input
                      type="radio"
                      name="refundType"
                      value="wallet_refund"
                      checked={refundType === 'wallet_refund'}
                      onChange={() => setRefundType('wallet_refund')}
                    />
                    Refund to Wallet / Source
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.85rem', cursor: 'pointer' }}>
                    <input
                      type="radio"
                      name="refundType"
                      value="account_credit"
                      checked={refundType === 'account_credit'}
                      onChange={() => setRefundType('account_credit')}
                    />
                    Store Account Credit
                  </label>
                </div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: 4 }}>
                  {refundType === 'wallet_refund'
                    ? 'Return funds to client via payment provider or reverse transfer.'
                    : 'Add exact amount to client account credit for future rental bookings.'}
                </div>
              </div>

              {refundType === 'wallet_refund' && (
                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: 4 }}>
                    Provider Refund Reference
                  </label>
                  <input
                    type="text"
                    value={refundRef}
                    onChange={(e) => setRefundRef(e.target.value)}
                    placeholder="e.g. FP-RET-12345 or Bank Ref"
                    style={{
                      width: '100%',
                      padding: '8px 12px',
                      borderRadius: 'var(--radius-sm)',
                      border: '1px solid var(--border)',
                      background: 'var(--bg)',
                      color: 'var(--text)',
                      fontFamily: 'var(--font-mono)',
                    }}
                  />
                </div>
              )}

              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: 4 }}>
                  Reason / Notes
                </label>
                <textarea
                  value={refundReason}
                  onChange={(e) => setRefundReason(e.target.value)}
                  placeholder="e.g. Booking declined due to equipment clash / client requested cancellation"
                  rows={2}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    borderRadius: 'var(--radius-sm)',
                    border: '1px solid var(--border)',
                    background: 'var(--bg)',
                    color: 'var(--text)',
                  }}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 8 }}>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setRefundTarget(null)}
                  disabled={isSubmittingRefund}
                >
                  Cancel
                </Button>
                <Button type="submit" variant="primary" disabled={isSubmittingRefund}>
                  {isSubmittingRefund
                    ? 'Processing...'
                    : refundType === 'wallet_refund'
                    ? 'Confirm Wallet Refund'
                    : 'Issue Store Credit'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
