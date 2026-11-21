/**
 * src/modules/rentals/OnlineRequestsQueue.tsx
 *
 * Online booking requests staff queue (T7-04).
 * Shows incoming requests, response countdown (orange at 45m, 1h guarantee),
 * with prefilled Confirm navigation and Decline reason flow.
 */

import React, { useEffect, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  type BookingRequestRow,
  fetchBookingRequests,
} from '../../lib/queries/bookingRequests'
import { declineBookingRequest } from '../../actions/rentals/declineBookingRequest'
import { formatMoney, type Paisa } from '../../lib/money'
import { useCanViewMoney } from '../../lib/moneyVisibility'
import { useAuth } from '../../lib/auth'
import Icon from '../../components/ui/Icon'
import { Button } from '../../components/ui/Button'
import { useToast } from '../../components/ui/Toast'

export const OnlineRequestsQueue: React.FC = () => {
  const navigate = useNavigate()
  const { user } = useAuth()
  const canMoney = useCanViewMoney()
  const toast = useToast()

  const [requests, setRequests] = useState<BookingRequestRow[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedDeclineReq, setSelectedDeclineReq] = useState<BookingRequestRow | null>(null)
  const [declineReason, setDeclineReason] = useState('')
  const [declining, setDeclining] = useState(false)

  const loadRequests = useCallback(async () => {
    setLoading(true)
    try {
      const data = await fetchBookingRequests()
      setRequests(data)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadRequests()
  }, [loadRequests])

  const canManage = ['Owner', 'Admin', 'Manager', 'Coordinator'].includes(user?.role || '')

  const handleConfirm = (req: BookingRequestRow) => {
    navigate(`/rentals?action=new&request_id=${req.id}`)
  }

  const handleOpenDecline = (req: BookingRequestRow) => {
    setSelectedDeclineReq(req)
    setDeclineReason('')
  }

  const handleDeclineSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedDeclineReq || !declineReason.trim()) return

    setDeclining(true)
    try {
      await declineBookingRequest({
        requestId: selectedDeclineReq.id,
        reason: declineReason.trim(),
      })
      toast?.showSuccessToast?.('Request Declined', `Request ${selectedDeclineReq.request_number} has been declined.`)
      setSelectedDeclineReq(null)
      await loadRequests()
    } catch (err) {
      toast?.showSuccessToast?.('Error', err instanceof Error ? err.message : 'Failed to decline request')
    } finally {
      setDeclining(false)
    }
  }

  const formatAge = (createdAt: string) => {
    const elapsedMinutes = Math.floor((Date.now() - new Date(createdAt).getTime()) / (60 * 1000))
    if (elapsedMinutes < 1) return 'Just now'
    if (elapsedMinutes < 60) return `${elapsedMinutes}m ago`
    const hours = Math.floor(elapsedMinutes / 60)
    const mins = elapsedMinutes % 60
    return `${hours}h ${mins}m ago`
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', background: 'var(--card)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border)' }}>
        <div>
          <h3 style={{ fontSize: '1rem', fontWeight: 700, margin: 0, color: 'var(--text)' }}>
            Online Booking Requests
          </h3>
          <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
            Client requests from public catalogue. Staff promise an answer within 1 hour.
          </span>
        </div>
        <Button size="sm" variant="outline" onClick={loadRequests} disabled={loading}>
          <Icon name="refresh" size={14} style={{ marginRight: 4 }} />
          Refresh
        </Button>
      </div>

      {loading ? (
        <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>
          Loading online requests...
        </div>
      ) : requests.length === 0 ? (
        <div style={{ padding: 40, textAlign: 'center', background: 'var(--card)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border)' }}>
          <p style={{ margin: 0, color: 'var(--text-muted)' }}>No online requests pending.</p>
        </div>
      ) : (
        <div style={{ overflowX: 'auto', background: 'var(--card)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border)' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.85rem' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border)', background: 'var(--card2)', color: 'var(--text2)' }}>
                <th style={{ padding: '12px 16px' }}>Request #</th>
                <th style={{ padding: '12px 16px' }}>Client</th>
                <th style={{ padding: '12px 16px' }}>Dates</th>
                <th style={{ padding: '12px 16px' }}>Project / Location</th>
                {canMoney && <th style={{ padding: '12px 16px' }}>Total (w/ VAT)</th>}
                <th style={{ padding: '12px 16px' }}>Response Time</th>
                <th style={{ padding: '12px 16px' }}>Status</th>
                {canManage && <th style={{ padding: '12px 16px', textAlign: 'right' }}>Actions</th>}
              </tr>
            </thead>
            <tbody>
              {requests.map((r) => {
                const isOverdue = r.isOverdue45Min && r.status === 'pending'
                return (
                  <tr
                    key={r.id}
                    style={{
                      borderBottom: '1px solid var(--border)',
                      background: isOverdue ? 'rgba(234, 179, 8, 0.08)' : undefined,
                    }}
                  >
                    <td style={{ padding: '12px 16px', fontWeight: 600, fontFamily: 'var(--font-mono)' }}>
                      {r.request_number}
                    </td>
                    <td style={{ padding: '12px 16px' }}>
                      <div style={{ fontWeight: 600 }}>{r.client_name}</div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                        {r.client_phone} · {r.client_email}
                      </div>
                    </td>
                    <td style={{ padding: '12px 16px', whiteSpace: 'nowrap' }}>
                      <div>{r.start_date} to {r.end_date}</div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'capitalize' }}>
                        {r.fulfillment_type}
                      </div>
                    </td>
                    <td style={{ padding: '12px 16px' }}>
                      <div>{r.project_name || '—'}</div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                        {r.shoot_location || '—'}
                      </div>
                    </td>
                    {canMoney && (
                      <td style={{ padding: '12px 16px', fontFamily: 'var(--font-mono)' }}>
                        {r.total_paisa != null && r.vat_paisa != null
                          ? formatMoney((r.total_paisa + r.vat_paisa) as Paisa)
                          : '—'}
                      </td>
                    )}
                    <td style={{ padding: '12px 16px', whiteSpace: 'nowrap' }}>
                      <div>{formatAge(r.created_at)}</div>
                      {isOverdue && (
                        <span
                          style={{
                            display: 'inline-block',
                            background: 'rgba(234, 179, 8, 0.25)',
                            color: '#b45309',
                            padding: '2px 6px',
                            borderRadius: '4px',
                            fontSize: '0.7rem',
                            fontWeight: 700,
                            marginTop: 2,
                          }}
                        >
                          45m+ awaiting response
                        </span>
                      )}
                    </td>
                    <td style={{ padding: '12px 16px' }}>
                      <span
                        style={{
                          display: 'inline-block',
                          padding: '3px 8px',
                          borderRadius: '4px',
                          fontSize: '0.75rem',
                          fontWeight: 600,
                          textTransform: 'uppercase',
                          background:
                            r.status === 'confirmed'
                              ? 'rgba(34, 197, 94, 0.15)'
                              : r.status === 'declined'
                              ? 'rgba(239, 68, 68, 0.15)'
                              : 'rgba(234, 179, 8, 0.15)',
                          color:
                            r.status === 'confirmed'
                              ? '#16a34a'
                              : r.status === 'declined'
                              ? '#dc2626'
                              : '#d97706',
                        }}
                      >
                        {r.status}
                      </span>
                    </td>
                    {canManage && (
                      <td style={{ padding: '12px 16px', textAlign: 'right' }}>
                        {r.status === 'pending' && (
                          <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                            <Button size="sm" variant="primary" onClick={() => handleConfirm(r)}>
                              Confirm
                            </Button>
                            <Button size="sm" variant="danger" onClick={() => handleOpenDecline(r)}>
                              Decline
                            </Button>
                          </div>
                        )}
                        {r.status === 'confirmed' && r.booking_id && (
                          <Button size="sm" variant="outline" onClick={() => navigate(`/rentals/${r.booking_id}`)}>
                            View Booking
                          </Button>
                        )}
                        {r.status === 'declined' && r.decline_reason && (
                          <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }} title={r.decline_reason}>
                            Declined: {r.decline_reason.slice(0, 20)}...
                          </span>
                        )}
                      </td>
                    )}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Decline Reason Modal */}
      {selectedDeclineReq && (
        <div
          role="dialog"
          aria-modal="true"
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.6)',
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
              borderRadius: 'var(--radius-md)',
              width: '100%',
              maxWidth: 480,
              padding: 20,
            }}
          >
            <h3 style={{ margin: '0 0 10px 0', fontSize: '1.1rem', fontWeight: 700 }}>
              Decline Request {selectedDeclineReq.request_number}
            </h3>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: 14 }}>
              State the reason for declining. This reason is sent to {selectedDeclineReq.client_name}.
            </p>
            <form onSubmit={handleDeclineSubmit}>
              <textarea
                required
                rows={4}
                value={declineReason}
                onChange={(e) => setDeclineReason(e.target.value)}
                placeholder="e.g. Requested gear is scheduled for routine overhaul on these dates."
                style={{
                  width: '100%',
                  padding: 10,
                  borderRadius: 'var(--radius-sm)',
                  border: '1px solid var(--border)',
                  background: 'var(--bg)',
                  color: 'var(--text)',
                  fontSize: '0.85rem',
                  marginBottom: 16,
                }}
              />
              <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setSelectedDeclineReq(null)}
                  disabled={declining}
                >
                  Cancel
                </Button>
                <Button type="submit" variant="danger" disabled={declining}>
                  {declining ? 'Declining...' : 'Confirm Decline'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
