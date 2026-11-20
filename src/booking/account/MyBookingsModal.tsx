/**
 * src/booking/account/MyBookingsModal.tsx — Babin Rentals OS
 *
 * Client Portal Bookings & Invoices View (T7-08).
 * Displays the client's booking timeline (6 steps), invoice balances,
 * receipts, documents, and integrated "Pay balance" trigger (T7-05).
 *
 * Rules:
 *  - Law 1: Business logic in accountApi / formatMoney.
 *  - Law 6 & PERMISSIONS §7: Clients see their own bookings and invoices only.
 *  - Touch targets ≥44px. Responsive at 375px, 820px, and 1440px.
 */

import React, { useState, useEffect, useMemo, useCallback } from 'react'
import type { ClientUser } from '../lib/clientAuthApi'
import {
  type ClientBooking,
  type ClientTimelineStep,
  fetchMyBookings,
  viewClientDocument,
} from './accountApi'
import { formatMoney, type Paisa } from '@/lib/money'
import { OnlinePaymentModal } from '../pay/OnlinePaymentModal'

interface MyBookingsModalProps {
  isOpen: boolean
  onClose: () => void
  user: ClientUser | null
  onOpenAuth?: (() => void) | undefined
}

const TIMELINE_STEPS: { key: ClientTimelineStep; label: string; icon: string }[] = [
  { key: 'submitted', label: 'Requested', icon: '📝' },
  { key: 'confirmed', label: 'Confirmed', icon: '✓' },
  { key: 'packed', label: 'Packed', icon: '📦' },
  { key: 'on_rent', label: 'On Rent', icon: '🎬' },
  { key: 'returned', label: 'Returned', icon: '↩' },
  { key: 'closed', label: 'Settled', icon: '🏁' },
]

export const MyBookingsModal: React.FC<MyBookingsModalProps> = ({
  isOpen,
  onClose,
  user,
  onOpenAuth,
}) => {
  const [loading, setLoading] = useState<boolean>(true)
  const [error, setError] = useState<string | null>(null)
  const [bookings, setBookings] = useState<ClientBooking[]>([])
  const [activeTab, setActiveTab] = useState<'all' | 'active' | 'completed'>('all')
  const [searchQuery, setSearchQuery] = useState<string>('')
  const [isOffline, setIsOffline] = useState<boolean>(() => typeof navigator !== 'undefined' && !navigator.onLine)

  // Payment modal state
  const [paymentBooking, setPaymentBooking] = useState<ClientBooking | null>(null)

  const loadBookings = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await fetchMyBookings()
      setBookings(data)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to load booking history.'
      setError(msg)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (!isOpen) return
    loadBookings()

    const handleOnline = () => setIsOffline(false)
    const handleOffline = () => setIsOffline(true)
    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)
    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [isOpen, loadBookings])

  const filteredBookings = useMemo(() => {
    return bookings.filter((b) => {
      // Tab filter
      if (activeTab === 'active') {
        if (b.stage === 'Closed' || b.stage === 'Cancelled') return false
      } else if (activeTab === 'completed') {
        if (b.stage !== 'Closed' && b.stage !== 'Cancelled') return false
      }

      // Search filter
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase()
        const matchesNo = b.booking_no.toLowerCase().includes(q)
        const matchesReq = b.request_no?.toLowerCase().includes(q) ?? false
        const matchesProj = b.project_name.toLowerCase().includes(q)
        const matchesItem = b.lines.some((l) => l.product_name.toLowerCase().includes(q))
        if (!matchesNo && !matchesReq && !matchesProj && !matchesItem) return false
      }

      return true
    })
  }, [bookings, activeTab, searchQuery])

  if (!isOpen) return null

  return (
    <div
      className="modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-labelledby="my-bookings-modal-title"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        background: 'rgba(0, 0, 0, 0.75)',
        backdropFilter: 'blur(6px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16,
      }}
    >
      <div
        className="modal-card"
        style={{
          background: 'var(--bg-surface, #18181b)',
          border: '1px solid var(--border-subtle, #27272a)',
          borderRadius: 12,
          width: '100%',
          maxWidth: 900,
          maxHeight: '92vh',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 20px 40px rgba(0, 0, 0, 0.5)',
          overflow: 'hidden',
          color: 'var(--text-main, #fafafa)',
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: '16px 20px',
            borderBottom: '1px solid var(--border-subtle, #27272a)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <div>
            <h2 id="my-bookings-modal-title" style={{ margin: 0, fontSize: '1.25rem', fontWeight: 700 }}>
              My Bookings & Invoices
            </h2>
            <p style={{ margin: '4px 0 0', fontSize: '0.82rem', color: 'var(--text-muted, #9ca3af)' }}>
              Rental timelines, invoices, receipts, and online payments
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close my bookings dialog"
            style={{
              background: 'transparent',
              border: 'none',
              color: 'var(--text-muted, #9ca3af)',
              fontSize: '1.6rem',
              cursor: 'pointer',
              minWidth: 44,
              minHeight: 44,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: 6,
            }}
          >
            ×
          </button>
        </div>

        {/* Offline Warning */}
        {isOffline && (
          <div
            role="status"
            style={{
              background: 'rgba(234, 179, 8, 0.12)',
              borderBottom: '1px solid rgba(234, 179, 8, 0.3)',
              padding: '8px 20px',
              fontSize: '0.82rem',
              color: 'var(--accent-gold, #eab308)',
              display: 'flex',
              alignItems: 'center',
              gap: 8,
            }}
          >
            <span>📡</span>
            <span>Offline mode • Showing locally saved bookings and receipts.</span>
          </div>
        )}

        {/* Filter bar */}
        <div
          style={{
            padding: '12px 20px',
            borderBottom: '1px solid var(--border-subtle, #27272a)',
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 12,
            background: 'rgba(0, 0, 0, 0.2)',
          }}
        >
          {/* Tabs */}
          <div style={{ display: 'flex', gap: 6 }}>
            {(
              [
                { key: 'all', label: 'All Bookings' },
                { key: 'active', label: 'Active & Upcoming' },
                { key: 'completed', label: 'Completed' },
              ] as const
            ).map((tab) => (
              <button
                key={tab.key}
                type="button"
                onClick={() => setActiveTab(tab.key)}
                style={{
                  background: activeTab === tab.key ? 'var(--accent-gold, #eab308)' : 'transparent',
                  color: activeTab === tab.key ? '#000' : 'var(--text-muted, #9ca3af)',
                  border: activeTab === tab.key ? 'none' : '1px solid var(--border-subtle, #27272a)',
                  padding: '6px 14px',
                  borderRadius: 20,
                  fontSize: '0.82rem',
                  fontWeight: activeTab === tab.key ? 700 : 500,
                  cursor: 'pointer',
                  minHeight: 36,
                }}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Search box */}
          <div style={{ flex: '1 1 200px', maxWidth: 300 }}>
            <input
              type="search"
              placeholder="Search by #BK, project, or gear…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              aria-label="Filter bookings by number, project, or equipment"
              style={{
                width: '100%',
                padding: '8px 12px',
                background: 'var(--bg-card, #27272a)',
                border: '1px solid var(--border-subtle, #3f3f46)',
                borderRadius: 6,
                fontSize: '0.82rem',
                color: '#fff',
                minHeight: 36,
              }}
            />
          </div>
        </div>

        {/* Content Body */}
        <div style={{ flex: 1, overflowY: 'auto', padding: 20 }}>
          {!user ? (
            /* Restricted State: Signed Out */
            <div style={{ textAlign: 'center', padding: '60px 20px' }}>
              <div style={{ fontSize: '2.5rem', marginBottom: 12 }}>🔒</div>
              <h3 style={{ fontSize: '1.1rem', margin: '0 0 8px' }}>Sign in to View Your Bookings</h3>
              <p style={{ color: 'var(--text-muted, #9ca3af)', fontSize: '0.88rem', maxWidth: 440, margin: '0 auto 20px' }}>
                Access your production rentals, verified timelines, invoice balances, and receipts with your verified client email.
              </p>
              {onOpenAuth && (
                <button
                  type="button"
                  onClick={() => {
                    onClose()
                    onOpenAuth()
                  }}
                  style={{
                    background: 'var(--accent-gold, #eab308)',
                    color: '#000',
                    border: 'none',
                    padding: '10px 24px',
                    borderRadius: 6,
                    fontWeight: 700,
                    fontSize: '0.9rem',
                    cursor: 'pointer',
                    minHeight: 44,
                  }}
                >
                  Sign In with Email OTP
                </button>
              )}
            </div>
          ) : loading ? (
            /* Loading State */
            <div style={{ textAlign: 'center', padding: '60px 20px', color: 'var(--text-muted, #9ca3af)' }}>
              <div style={{ fontSize: '2rem', marginBottom: 12 }}>⏳</div>
              <p>Loading your rental timeline and invoices…</p>
            </div>
          ) : error ? (
            /* Error State */
            <div style={{ textAlign: 'center', padding: '40px 20px' }}>
              <div style={{ color: 'var(--rose-text, #f87171)', fontSize: '1rem', marginBottom: 16 }}>{error}</div>
              <button
                type="button"
                onClick={loadBookings}
                style={{
                  background: 'var(--bg-card, #27272a)',
                  color: '#fff',
                  border: '1px solid var(--border-subtle, #3f3f46)',
                  padding: '8px 18px',
                  borderRadius: 6,
                  cursor: 'pointer',
                  minHeight: 44,
                }}
              >
                Retry
              </button>
            </div>
          ) : filteredBookings.length === 0 ? (
            /* Empty State */
            <div style={{ textAlign: 'center', padding: '60px 20px' }}>
              <div style={{ fontSize: '2.5rem', marginBottom: 12 }}>🎬</div>
              <h3 style={{ fontSize: '1.1rem', margin: '0 0 8px' }}>No Bookings Found</h3>
              <p style={{ color: 'var(--text-muted, #9ca3af)', fontSize: '0.88rem', maxWidth: 440, margin: '0 auto 20px' }}>
                {searchQuery || activeTab !== 'all'
                  ? 'No rentals match the selected filters.'
                  : 'You have no rental requests or bookings yet. Browse our cinema gear catalogue and submit your first request!'}
              </p>
              <button
                type="button"
                onClick={onClose}
                style={{
                  background: 'var(--accent-gold, #eab308)',
                  color: '#000',
                  border: 'none',
                  padding: '10px 22px',
                  borderRadius: 6,
                  fontWeight: 700,
                  fontSize: '0.88rem',
                  cursor: 'pointer',
                  minHeight: 44,
                }}
              >
                Browse Equipment Catalogue
              </button>
            </div>
          ) : (
            /* Bookings List */
            <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
              {filteredBookings.map((bkg) => (
                <div
                  key={bkg.id}
                  style={{
                    background: 'var(--bg-card, #27272a)',
                    border: '1px solid var(--border-subtle, #3f3f46)',
                    borderRadius: 8,
                    padding: 18,
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 16,
                  }}
                >
                  {/* Card Header */}
                  <div
                    style={{
                      display: 'flex',
                      flexWrap: 'wrap',
                      alignItems: 'flex-start',
                      justifyContent: 'space-between',
                      gap: 12,
                      borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
                      paddingBottom: 12,
                    }}
                  >
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <span
                          style={{
                            fontFamily: 'var(--font-mono, monospace)',
                            fontWeight: 700,
                            fontSize: '1.05rem',
                            color: 'var(--accent-gold, #eab308)',
                          }}
                        >
                          {bkg.booking_no}
                        </span>
                        <span
                          style={{
                            background:
                              bkg.stage === 'Closed'
                                ? 'rgba(34, 197, 94, 0.15)'
                                : bkg.stage === 'On Rent'
                                  ? 'rgba(59, 130, 246, 0.15)'
                                  : 'rgba(234, 179, 8, 0.15)',
                            color:
                              bkg.stage === 'Closed'
                                ? '#4ade80'
                                : bkg.stage === 'On Rent'
                                  ? '#60a5fa'
                                  : '#facc15',
                            border: '1px solid rgba(255, 255, 255, 0.12)',
                            borderRadius: 12,
                            padding: '2px 10px',
                            fontSize: '0.75rem',
                            fontWeight: 600,
                          }}
                        >
                          {bkg.stage}
                        </span>
                      </div>
                      <div style={{ fontSize: '0.92rem', fontWeight: 600, marginTop: 4 }}>
                        {bkg.project_name}
                      </div>
                      <div style={{ fontSize: '0.8rem', color: 'var(--text-muted, #9ca3af)', marginTop: 2 }}>
                        📅 {bkg.start_date} to {bkg.end_date} (06:00 NPT)
                        {bkg.shoot_location && ` • 📍 ${bkg.shoot_location}`}
                      </div>
                    </div>

                    {/* Financial Overview & Pay Balance Action */}
                    <div style={{ textAlign: 'right', display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6 }}>
                      <div style={{ display: 'flex', gap: 14, fontSize: '0.82rem' }}>
                        <div>
                          <div style={{ color: 'var(--text-muted, #9ca3af)', fontSize: '0.72rem' }}>Total</div>
                          <div style={{ fontFamily: 'var(--font-mono, monospace)', fontWeight: 600 }}>
                            {formatMoney(bkg.total_paisa as Paisa)}
                          </div>
                        </div>
                        <div>
                          <div style={{ color: 'var(--text-muted, #9ca3af)', fontSize: '0.72rem' }}>Paid</div>
                          <div style={{ fontFamily: 'var(--font-mono, monospace)', color: '#4ade80', fontWeight: 600 }}>
                            {formatMoney(bkg.paid_paisa as Paisa)}
                          </div>
                        </div>
                        <div>
                          <div style={{ color: 'var(--text-muted, #9ca3af)', fontSize: '0.72rem' }}>Balance Due</div>
                          <div
                            style={{
                              fontFamily: 'var(--font-mono, monospace)',
                              color: bkg.balance_paisa > 0 ? '#f87171' : 'var(--text-muted, #9ca3af)',
                              fontWeight: 700,
                            }}
                          >
                            {formatMoney(bkg.balance_paisa as Paisa)}
                          </div>
                        </div>
                      </div>

                      {/* Pay Balance/Advance: backend re-checks the authoritative amount. */}
                      {bkg.payment_available === true && bkg.balance_paisa > 0 && (
                        <button
                          type="button"
                          onClick={() => setPaymentBooking(bkg)}
                          style={{
                            background: 'var(--accent-gold, #eab308)',
                            color: '#000',
                            border: 'none',
                            padding: '6px 14px',
                            borderRadius: 6,
                            fontWeight: 700,
                            fontSize: '0.8rem',
                            cursor: 'pointer',
                            minHeight: 36,
                            display: 'flex',
                            alignItems: 'center',
                            gap: 6,
                          }}
                        >
                          <span>💳</span>
                          <span>{bkg.payment_kind === 'advance' ? 'Pay Advance' : 'Pay Balance'} ({formatMoney(bkg.balance_paisa as Paisa)})</span>
                        </button>
                      )}
                    </div>
                  </div>

                  {/* 6-Step Client Timeline (PERMISSIONS §7 P2) */}
                  <div>
                    <div style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-muted, #9ca3af)', textTransform: 'uppercase', marginBottom: 10 }}>
                      Rental Progress Timeline
                    </div>
                    <div
                      style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(6, 1fr)',
                        gap: 4,
                        position: 'relative',
                      }}
                      role="progressbar"
                      aria-valuenow={bkg.timeline_progress}
                      aria-valuemin={1}
                      aria-valuemax={6}
                      aria-label={`Rental timeline: step ${bkg.timeline_progress} of 6 (${bkg.stage})`}
                    >
                      {TIMELINE_STEPS.map((step, idx) => {
                        const stepNum = idx + 1
                        const isCurrent = stepNum === bkg.timeline_progress
                        const isDone = stepNum < bkg.timeline_progress
                        return (
                          <div
                            key={step.key}
                            style={{
                              display: 'flex',
                              flexDirection: 'column',
                              alignItems: 'center',
                              textAlign: 'center',
                              gap: 4,
                            }}
                          >
                            <div
                              style={{
                                width: 28,
                                height: 28,
                                borderRadius: '50%',
                                background: isCurrent
                                  ? 'var(--accent-gold, #eab308)'
                                  : isDone
                                    ? 'rgba(34, 197, 94, 0.3)'
                                    : 'rgba(255, 255, 255, 0.08)',
                                border: isCurrent
                                  ? '2px solid #fff'
                                  : isDone
                                    ? '1px solid #4ade80'
                                    : '1px solid rgba(255, 255, 255, 0.15)',
                                color: isCurrent ? '#000' : isDone ? '#4ade80' : 'var(--text-muted, #9ca3af)',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                fontSize: '0.75rem',
                                fontWeight: 700,
                              }}
                            >
                              {isDone ? '✓' : stepNum}
                            </div>
                            <span
                              style={{
                                fontSize: '0.7rem',
                                color: isCurrent ? 'var(--accent-gold, #eab308)' : isDone ? '#4ade80' : 'var(--text-muted, #9ca3af)',
                                fontWeight: isCurrent ? 700 : 500,
                              }}
                            >
                              {step.label}
                            </span>
                          </div>
                        )
                      })}
                    </div>
                  </div>

                  {/* Equipment List & Documents */}
                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
                      gap: 16,
                      background: 'rgba(0, 0, 0, 0.18)',
                      padding: 12,
                      borderRadius: 6,
                    }}
                  >
                    {/* Equipment Lines */}
                    <div>
                      <div style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-muted, #9ca3af)', textTransform: 'uppercase', marginBottom: 6 }}>
                        Equipment Reserved ({bkg.lines.length})
                      </div>
                      <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 4 }}>
                        {bkg.lines.map((l) => (
                          <li
                            key={l.id}
                            style={{
                              fontSize: '0.82rem',
                              display: 'flex',
                              justifyContent: 'space-between',
                              color: 'var(--text-main, #fafafa)',
                            }}
                          >
                            <span>{l.product_name}</span>
                            <span style={{ fontFamily: 'var(--font-mono, monospace)', color: 'var(--text-muted, #9ca3af)' }}>
                              ×{l.qty}
                            </span>
                          </li>
                        ))}
                      </ul>
                    </div>

                    {/* Verified Documents (P5) */}
                    <div>
                      <div style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-muted, #9ca3af)', textTransform: 'uppercase', marginBottom: 6 }}>
                        Verified Documents ({bkg.documents.length})
                      </div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                        {bkg.documents.map((doc) => (
                          <button
                            key={doc.id}
                            type="button"
                            onClick={() => viewClientDocument(doc, bkg)}
                            style={{
                              background: 'rgba(255, 255, 255, 0.06)',
                              border: '1px solid rgba(255, 255, 255, 0.15)',
                              color: 'var(--text-main, #fafafa)',
                              padding: '6px 10px',
                              borderRadius: 4,
                              fontSize: '0.75rem',
                              cursor: 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              gap: 6,
                              minHeight: 32,
                            }}
                            title={`Download or preview ${doc.title}`}
                          >
                            <span>📄</span>
                            <span>{doc.title}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div
          style={{
            padding: '12px 20px',
            borderTop: '1px solid var(--border-subtle, #27272a)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <div style={{ fontSize: '0.78rem', color: 'var(--text-muted, #9ca3af)' }}>
            Showing {filteredBookings.length} booking{filteredBookings.length === 1 ? '' : 's'}
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{
              background: 'var(--bg-card, #27272a)',
              color: '#fff',
              border: '1px solid var(--border-subtle, #3f3f46)',
              padding: '8px 18px',
              borderRadius: 6,
              fontSize: '0.82rem',
              fontWeight: 600,
              cursor: 'pointer',
              minHeight: 40,
            }}
          >
            Close
          </button>
        </div>
      </div>

      {/* Online Payment Modal for Balance Pay */}
      {paymentBooking && (
        <OnlinePaymentModal
          isOpen={true}
          onClose={() => { setPaymentBooking(null); void loadBookings() }}
          bookingId={paymentBooking.payment_kind === 'balance' ? paymentBooking.id : undefined}
          bookingRequestId={paymentBooking.request_id}
        />
      )}
    </div>
  )
}
