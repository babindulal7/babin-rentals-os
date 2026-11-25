import { useEffect, useMemo, useState } from 'react'
import { Modal } from '../../../components/ui/Modal'
import { Button } from '../../../components/ui/Button'
import { useAuth } from '../../../lib/auth'
import { useToast } from '../../../components/ui/Toast'
import { newClientUuid, supabase } from '../../../lib/supabase'
import { cancelRental } from '../../../actions/rentals/cancelRental'
import { formatGateError } from '../../../lib/gates'
import type { BookingStatus } from '../../../lib/workflow'
import {
  calculateOptionACancellationFee,
  type CancellationFeeCalculationResult,
} from '../../../lib/queries/cancellationFeeTiers'
import { formatMoney, rupees, toRupees, type Paisa } from '../../../lib/money'

export interface CancelRentalModalProps {
  isOpen: boolean
  onClose: () => void
  onSuccess: (bookingId: string) => void
  bookingId: string
  bookingNo: string
  stage: BookingStatus | string
  startsAt?: string | null | undefined
  endsAt?: string | null | undefined
  rentalDays?: number | null | undefined
  rentalSubtotalPaisa?: Paisa | null | undefined
  oneDayChargePaisa?: Paisa | null | undefined
  paidAdvancePaisa?: Paisa | null | undefined
}

export function CancelRentalModal({
  isOpen,
  onClose,
  onSuccess,
  bookingId,
  bookingNo,
  stage,
  startsAt,
  endsAt: _endsAt,
  rentalDays,
  rentalSubtotalPaisa,
  oneDayChargePaisa,
  paidAdvancePaisa,
}: CancelRentalModalProps) {
  const { user } = useAuth()
  const { showSuccessToast } = useToast()
  const [reason, setReason] = useState('')
  const [confirmed, setConfirmed] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [fetchedBooking, setFetchedBooking] = useState<{
    startsAt: string | null
    endsAt: string | null
    rentalDays: number
    rentalSubtotalPaisa: Paisa
    paidAdvancePaisa: Paisa
  } | null>(null)

  const [overrideFee, setOverrideFee] = useState(false)
  const [customFeeRupees, setCustomFeeRupees] = useState<number>(0)
  const [feeOverrideReason, setFeeOverrideReason] = useState('')

  const trimmedReason = reason.trim()
  const isReasonValid = trimmedReason.length >= 10
  const isPacked = stage === 'Packed'

  // Fetch booking details if not provided via props
  useEffect(() => {
    if (!isOpen || startsAt !== undefined || bookingId === 'draft-new') return

    let cancelled = false
    void (async () => {
      try {
        const [bookingRes, invoiceRes] = await Promise.all([
          supabase
            .from('bookings')
            .select('pickup_datetime, return_datetime, days')
            .eq('id', bookingId)
            .maybeSingle(),
          supabase
            .from('invoices')
            .select('subtotal, total_amount, paid_amount, status, voided_at')
            .eq('booking_id', bookingId),
        ])

        if (cancelled) return

        let subtotalRupees = 0
        let paidRupees = 0

        if (invoiceRes.data) {
          for (const inv of invoiceRes.data) {
            if (inv.voided_at !== null || inv.status === 'Void') continue
            subtotalRupees += inv.subtotal || inv.total_amount || 0
            paidRupees += inv.paid_amount || 0
          }
        }

        if (bookingRes.data) {
          const row = bookingRes.data
          setFetchedBooking({
            startsAt: row.pickup_datetime,
            endsAt: row.return_datetime,
            rentalDays: row.days ?? 1,
            rentalSubtotalPaisa: rupees(subtotalRupees),
            paidAdvancePaisa: rupees(paidRupees),
          })
        }
      } catch {
        // Fallback to defaults
      }
    })()

    return () => {
      cancelled = true
    }
  }, [isOpen, startsAt, bookingId])

  const resolvedStartsAt = startsAt ?? fetchedBooking?.startsAt ?? null
  const resolvedRentalDays = rentalDays ?? fetchedBooking?.rentalDays ?? 1
  const resolvedSubtotal: Paisa = (rentalSubtotalPaisa ?? fetchedBooking?.rentalSubtotalPaisa ?? (0 as Paisa)) as Paisa
  const resolvedAdvance: Paisa = (paidAdvancePaisa ?? fetchedBooking?.paidAdvancePaisa ?? (0 as Paisa)) as Paisa
  const resolvedOneDay: Paisa =
    (oneDayChargePaisa ??
      (resolvedRentalDays > 0 ? Math.round(resolvedSubtotal / resolvedRentalDays) : resolvedSubtotal)) as Paisa

  const hoursUntilStart = useMemo(() => {
    if (!resolvedStartsAt) return 0
    const startMs = new Date(resolvedStartsAt).getTime()
    return Math.max(0, (startMs - Date.now()) / (1000 * 60 * 60))
  }, [resolvedStartsAt])

  const feeCalc: CancellationFeeCalculationResult | null = useMemo(() => {
    if (!resolvedStartsAt || stage === 'Closed' || stage === 'Cancelled') return null
    return calculateOptionACancellationFee({
      hoursUntilStart,
      rentalDays: resolvedRentalDays,
      rentalSubtotalBeforeVatPaisa: resolvedSubtotal,
      oneDayChargePaisa: resolvedOneDay,
      paidAdvancePaisa: resolvedAdvance,
    })
  }, [resolvedStartsAt, stage, hoursUntilStart, resolvedRentalDays, resolvedSubtotal, resolvedOneDay, resolvedAdvance])

  useEffect(() => {
    if (feeCalc) {
      setCustomFeeRupees(toRupees(feeCalc.suggestedFeePaisa))
    }
  }, [feeCalc])

  const effectiveFeePaisa: Paisa = overrideFee ? rupees(customFeeRupees) : (feeCalc?.suggestedFeePaisa ?? (0 as Paisa))
  const isOverridden = Boolean(feeCalc && effectiveFeePaisa !== feeCalc.suggestedFeePaisa)

  const refundPaisa: Paisa = useMemo(() => {
    if (resolvedAdvance > 0) {
      return (resolvedAdvance >= effectiveFeePaisa ? resolvedAdvance - effectiveFeePaisa : 0) as Paisa
    }
    return 0 as Paisa
  }, [resolvedAdvance, effectiveFeePaisa])

  const handleSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault()
    if (!user) {
      setError('You must be signed in to cancel a booking.')
      return
    }
    if (!isReasonValid) {
      setError('A cancellation reason of at least 10 characters is required.')
      return
    }
    if (isOverridden && feeOverrideReason.trim().length < 10) {
      setError('An override reason of at least 10 characters is required when adjusting the cancellation fee.')
      return
    }
    if (!confirmed) {
      setError('Please confirm that you understand this cancellation is permanent and releases all inventory allocations.')
      return
    }

    setIsSubmitting(true)
    setError(null)

    try {
      const clientUuid = newClientUuid()
      await cancelRental(
        {
          id: bookingId,
          reason: trimmedReason,
          clientUuid,
          cancellationFeePaisa: effectiveFeePaisa,
          feeOverrideReason: isOverridden ? feeOverrideReason.trim() : null,
        },
        { userId: user.id, role: user.role },
      )

      showSuccessToast(
        'Booking Cancelled',
        `${bookingNo} has been cancelled and its inventory reservations have been released.`,
      )
      onSuccess(bookingId)
      onClose()
    } catch (err: unknown) {
      setError(formatGateError(err))
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={`Cancel Booking — ${bookingNo}`}
      subtitle={`Stage: ${stage}. Cancelling releases all inventory reservations and records an immutable audit trail.`}
      size="md"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={isSubmitting}>
            Keep Booking
          </Button>
          <Button
            variant="danger"
            onClick={() => handleSubmit()}
            disabled={
              isSubmitting ||
              !isReasonValid ||
              !confirmed ||
              Boolean(isOverridden && feeOverrideReason.trim().length < 10)
            }
          >
            {isSubmitting ? 'Cancelling…' : 'Cancel Booking'}
          </Button>
        </>
      }
    >
      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-md)' }}>
        {error && (
          <div
            style={{
              padding: '10px 14px',
              borderRadius: 'var(--r-btn)',
              background: 'var(--st-danger-bg)',
              color: 'var(--st-danger-fg)',
              fontSize: 'var(--t-meta)',
              lineHeight: 1.5,
            }}
          >
            {error}
          </div>
        )}

        <div
          style={{
            padding: '10px 14px',
            borderRadius: 'var(--r-btn)',
            background: 'var(--card2)',
            border: '1px solid var(--border)',
            fontSize: 'var(--t-meta)',
            color: 'var(--muted)',
            lineHeight: 1.5,
          }}
        >
          <strong style={{ color: 'var(--text)', display: 'block', marginBottom: 4 }}>
            Inventory Allocation
          </strong>
          Cancelling will immediately release all reserved equipment and inventory allocations for{' '}
          <span style={{ color: 'var(--text)', fontWeight: 600 }}>{bookingNo}</span>. This action is irreversible.
        </div>

        {/* Cancellation Fee Policy (Option A — Ruling 2 Nov 2026) */}
        {feeCalc && (
          <div
            style={{
              padding: '12px 14px',
              borderRadius: 'var(--r-btn)',
              background: 'var(--card2)',
              border: '1px solid var(--border)',
              display: 'flex',
              flexDirection: 'column',
              gap: 8,
              fontSize: 'var(--t-meta)',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontWeight: 600, color: 'var(--text)' }}>
                Cancellation Fee Policy (Option A)
              </span>
              <span
                style={{
                  fontSize: 'var(--t-caption)',
                  color: feeCalc.isFree ? 'var(--st-completed-fg)' : 'var(--chip-amber-fg)',
                  fontWeight: 600,
                }}
              >
                {feeCalc.isFree ? 'Free' : 'Fee applies'}
              </span>
            </div>

            <div style={{ color: 'var(--muted)', fontSize: 'var(--t-caption)' }}>
              {feeCalc.tierDescription} · {feeCalc.feeRateDescription}
            </div>

            <div
              style={{
                display: 'flex',
                alignItems: 'baseline',
                justifyContent: 'space-between',
                paddingTop: 4,
                borderTop: '1px solid var(--border)',
              }}
            >
              <span style={{ color: 'var(--text2)' }}>Suggested cancellation fee:</span>
              <span className="finance-mono" style={{ fontWeight: 700, fontSize: 'var(--t-ui)', color: 'var(--text)' }}>
                {formatMoney(feeCalc.suggestedFeePaisa)}
              </span>
            </div>

            {resolvedAdvance > 0 && (
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 4,
                  fontSize: 'var(--t-caption)',
                  color: 'var(--muted)',
                  background: 'var(--card)',
                  padding: '8px 10px',
                  borderRadius: 'var(--r-sm)',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span>Client advance paid:</span>
                  <span className="finance-mono">{formatMoney(resolvedAdvance)}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span>Estimated fee deduction:</span>
                  <span className="finance-mono">{formatMoney(effectiveFeePaisa)}</span>
                </div>
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    fontWeight: 600,
                    color: refundPaisa > 0 ? 'var(--st-completed-fg)' : 'var(--text)',
                  }}
                >
                  <span>Estimated refund to client:</span>
                  <span className="finance-mono">{formatMoney(refundPaisa)}</span>
                </div>
              </div>
            )}

            <p role="note" style={{ margin: 0, color: 'var(--muted)', fontSize: 'var(--t-caption)' }}>
              These amounts are estimates only. Cancelling the booking records the decision and releases inventory; it does not post a fee or issue a refund. Finance must reconcile the settlement separately.
            </p>

            {/* Staff override / waiver */}
            <div style={{ marginTop: 4, paddingTop: 6, borderTop: '1px dashed var(--border)' }}>
              <label
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  fontSize: 'var(--t-caption)',
                  color: 'var(--text2)',
                  cursor: 'pointer',
                }}
              >
                <input
                  type="checkbox"
                  checked={overrideFee}
                  onChange={(e) => setOverrideFee(e.target.checked)}
                />
                <span>Waive or adjust cancellation fee (Manager / Coordinator)</span>
              </label>

              {overrideFee && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 8 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 'var(--t-caption)', color: 'var(--muted)' }}>Adjusted fee (Rs):</span>
                    <input
                      type="number"
                      min={0}
                      value={customFeeRupees}
                      onChange={(e) => setCustomFeeRupees(Math.max(0, Number(e.target.value) || 0))}
                      style={{
                        padding: '4px 8px',
                        width: 120,
                        borderRadius: 'var(--r-btn)',
                        border: '1px solid var(--border)',
                        background: 'var(--card)',
                        color: 'var(--text)',
                        fontSize: 'var(--t-meta)',
                      }}
                    />
                  </div>

                  <input
                    placeholder="Reason for waiving/adjusting fee (min 10 characters)..."
                    value={feeOverrideReason}
                    onChange={(e) => setFeeOverrideReason(e.target.value)}
                    style={{
                      padding: '6px 10px',
                      borderRadius: 'var(--r-btn)',
                      border: '1px solid var(--border)',
                      background: 'var(--card)',
                      color: 'var(--text)',
                      fontSize: 'var(--t-meta)',
                    }}
                  />
                </div>
              )}
            </div>
          </div>
        )}

        {isPacked && (
          <div
            style={{
              padding: '8px 12px',
              borderRadius: 'var(--r-btn)',
              background: 'var(--chip-amber-bg)',
              border: '1px solid color-mix(in srgb, var(--chip-amber-fg) 35%, transparent)',
              color: 'var(--text)',
              fontSize: 'var(--t-meta)',
            }}
          >
            <strong style={{ color: 'var(--chip-amber-fg)' }}>Manager Authority Required:</strong> Because this booking has already been packed, cancellation
            requires Manager, Admin, or Owner credentials per database gate rule (0115).
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <label htmlFor="cancel-reason" style={{ fontSize: 'var(--t-meta)', fontWeight: 600, color: 'var(--text)' }}>
              Reason for Cancellation <span style={{ color: 'var(--danger)' }}>*</span>
            </label>
            <span
              style={{
                fontSize: 'var(--t-caption)',
                color: isReasonValid ? 'var(--muted)' : 'var(--danger)',
              }}
            >
              {trimmedReason.length}/10 characters minimum
            </span>
          </div>
          <textarea
            id="cancel-reason"
            aria-label="Cancellation reason"
            rows={3}
            placeholder="State the operational reason for cancelling this booking (client cancelled shoot, scheduling conflict, etc.)..."
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            style={{
              padding: '8px 12px',
              borderRadius: 'var(--r-btn)',
              border: '1px solid var(--border)',
              background: 'var(--card)',
              color: 'var(--text)',
              fontSize: 'var(--t-meta)',
              resize: 'vertical',
            }}
          />
        </div>

        <label
          style={{
            display: 'flex',
            alignItems: 'flex-start',
            gap: 'var(--sp-sm)',
            fontSize: 'var(--t-meta)',
            color: 'var(--text)',
            cursor: 'pointer',
          }}
        >
          <input
            type="checkbox"
            aria-label="I confirm that this booking is to be cancelled and all reserved equipment released back into stock"
            checked={confirmed}
            onChange={(e) => setConfirmed(e.target.checked)}
            style={{ marginTop: 2 }}
          />
          <span>I confirm that this booking is to be cancelled and all reserved equipment released back into stock.</span>
        </label>
      </form>
    </Modal>
  )
}
