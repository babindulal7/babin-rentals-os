import { formatAd, toBs, formatBs } from '../../../lib/bs'
import { useState, useEffect, useCallback, useMemo, useId } from 'react'
import { Modal } from '../../../components/ui/Modal'
import { Button } from '../../../components/ui/Button'
import Icon from '../../../components/ui/Icon'
import { rupees, formatMoney, type Paisa } from '../../../lib/money'
import { extendRental } from '../../../actions/rentals/extendRental'
import { useAuth } from '../../../lib/auth'
import { canViewMoney } from '../../../lib/rbac'
import { checkExtensionClash, type ExtensionClashDetail } from '../../../lib/queries/extensionClash'
import { supabase } from '../../../lib/supabase'

export interface ExtendRentalModalProps {
  isOpen: boolean
  onClose: () => void
  bookingId: string
  bookingNo?: string | undefined
  client?: string | null | undefined
  currentReturnDate?: string | null | undefined
  lines?: Array<{
    id: string
    description?: string | null
    qty?: number | null
    rate?: number | null
    discountAmount?: number | null
    days?: number | null
    item_name?: string | null
    quantity?: number | null
    unit_price_paisa?: number | null
    discount_amount_paisa?: number | null
  }> | undefined
  onSuccess?: (extension: {
    days: number
    extraAmountPaisa?: Paisa
    newReturnDate: string
    reason?: string
    pricingOption?: 'same_rate' | 'standard_rate'
  }) => void
}

const COMMON_REASONS = [
  'Shoot extension requested by client',
  'Weather delay on shoot schedule',
  'Client running late on return',
  'Equipment needed for additional shoot day',
]

export function ExtendRentalModal({
  isOpen,
  onClose,
  onSuccess,
  bookingId,
  bookingNo,
  client,
  currentReturnDate,
  lines: initialLines,
}: ExtendRentalModalProps) {
  const { user } = useAuth()
  const userRole = user?.role
  const canSeeMoney = userRole ? canViewMoney(userRole) : false
  const radioGroupId = useId()

  // 1. Day selection: +1 day default (1-tap budget), +2 days, or custom
  const [dayChoice, setDayChoice] = useState<'1' | '2' | 'custom'>('1')
  const [customDays, setCustomDays] = useState<number>(3)

  // 2. W41: Price of extra days — two one-tap choices every time
  const [pricingOption, setPricingOption] = useState<'same_rate' | 'standard_rate'>('same_rate')

  // 3. Reason (default >= 10 chars)
  const [reason, setReason] = useState(COMMON_REASONS[0]!)

  // 4. Authorization confirm checkbox
  const [confirmed, setConfirmed] = useState(true)

  // 5. Booking lines for rate calculation
  const [lines, setLines] = useState<
    Array<{
      id: string
      qty: number
      rate: number
      discountAmount: number
      days: number
    }>
  >(
    (initialLines ?? []).map((l) => ({
      id: l.id,
      qty: l.qty ?? l.quantity ?? 1,
      rate: l.rate ?? (l.unit_price_paisa != null ? l.unit_price_paisa / 100 : 0),
      discountAmount: l.discountAmount ?? (l.discount_amount_paisa != null ? l.discount_amount_paisa / 100 : 0),
      days: l.days ?? 1,
    })),
  )

  // 6. Availability clash state
  const [isCheckingClash, setIsCheckingClash] = useState(false)
  const [clashes, setClashes] = useState<ExtensionClashDetail[]>([])

  // 7. Form submission state
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const days = dayChoice === '1' ? 1 : dayChoice === '2' ? 2 : customDays

  // Fetch lines from booking_lines_v if not provided
  useEffect(() => {
    if (!isOpen || !bookingId) return
    if (initialLines && initialLines.length > 0) return

    let cancelled = false
    void (async () => {
      try {
        const { data, error: qErr } = await supabase
          .from('booking_lines_v')
          .select('id, qty, rate, discount_amount, days')
          .eq('booking_id', bookingId)
          .is('voided_at', null)

        if (!cancelled && !qErr && data) {
          setLines(
            data.map((l: { id: string; qty?: number; rate?: number; discount_amount?: number; days?: number }) => ({
              id: l.id,
              qty: l.qty ?? 1,
              rate: l.rate ?? 0,
              discountAmount: l.discount_amount ?? 0,
              days: l.days ?? 1,
            })),
          )
        }
      } catch {
        // Fallback gracefully
      }
    })()

    return () => {
      cancelled = true
    }
  }, [isOpen, bookingId, initialLines])

  // Projected return date calculation
  const newReturnDate = useMemo((): Date | null => {
    if (!currentReturnDate || days <= 0) return null
    const base = new Date(currentReturnDate)
    if (Number.isNaN(base.getTime())) return null
    base.setDate(base.getDate() + days)
    return base
  }, [currentReturnDate, days])

  const newReturnDateStr = newReturnDate ? formatAd(newReturnDate) : null
  const newReturnDateBs = newReturnDate
    ? (() => {
        const b = toBs(newReturnDate)
        return b ? formatBs(b) : null
      })()
    : null

  // Rate calculations
  const { sameRatePerDay, standardRatePerDay } = useMemo((): { sameRatePerDay: number; standardRatePerDay: number } => {
    let std = 0
    let same = 0
    for (const l of lines) {
      const lineDailyStd = l.qty * l.rate
      std += lineDailyStd
      const dailyDiscount = l.days > 0 ? l.discountAmount / l.days : 0
      same += Math.max(0, lineDailyStd - dailyDiscount)
    }
    return {
      sameRatePerDay: Math.round(std > 0 ? same : 0),
      standardRatePerDay: Math.round(std),
    }
  }, [lines])

  const extraAmount = pricingOption === 'same_rate' ? days * sameRatePerDay : days * standardRatePerDay

  // Check for reservation clashes whenever return date or days changes
  const runClashCheck = useCallback(async () => {
    if (!currentReturnDate || days <= 0) {
      setClashes([])
      return
    }
    const base = new Date(currentReturnDate)
    if (Number.isNaN(base.getTime())) {
      setClashes([])
      return
    }
    const target = new Date(base)
    target.setDate(target.getDate() + days)

    setIsCheckingClash(true)
    try {
      const res = await checkExtensionClash(
        bookingId,
        base.toISOString(),
        target.toISOString(),
      )
      setClashes(res.clashes ?? [])
    } catch {
      setClashes([])
    } finally {
      setIsCheckingClash(false)
    }
  }, [bookingId, currentReturnDate, days])

  useEffect(() => {
    if (isOpen) {
      void runClashCheck()
    }
  }, [isOpen, runClashCheck])

  const handleSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault()
    if (!Number.isFinite(days) || days <= 0) {
      setError('Extension days must be a whole number of at least 1.')
      return
    }
    if (!reason.trim() || reason.trim().length < 10) {
      setError('Please state an extension reason of at least 10 characters.')
      return
    }
    if (!confirmed) {
      setError('Confirm that the client has authorized the extension and additional charges before recording it.')
      return
    }
    if (!newReturnDateStr) {
      setError('Current return date is missing, so projected return date cannot be determined.')
      return
    }
    if (!user) {
      setError('You are not signed in, so this extension cannot be recorded. Please sign in.')
      return
    }
    if (clashes.length > 0) {
      setError('Cannot extend booking: availability clash detected with an upcoming reservation on one or more items.')
      return
    }

    setIsSubmitting(true)
    setError(null)

    try {
      await extendRental(
        {
          id: bookingId,
          days,
          reason: reason.trim(),
          pricingOption,
        },
        { userId: user.id, role: user.role },
      )

      onSuccess?.({
        days,
        extraAmountPaisa: rupees(extraAmount),
        newReturnDate: newReturnDateStr ?? '',
        reason: reason.trim(),
        pricingOption,
      })
      onClose()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to extend rental')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={`Extend Rental — ${bookingNo ? `#${bookingNo}` : bookingId.slice(0, 8)}`}
      subtitle={
        <>
          Client: <strong>{client}</strong>
          {currentReturnDate && (
            <>
              {' · Current Return: '}
              <span style={{ color: 'var(--booking-date-text)', fontWeight: 600 }}>
                {formatAd(new Date(currentReturnDate))}
                {(() => {
                  const b = toBs(new Date(currentReturnDate))
                  return b ? ` (${formatBs(b)})` : ''
                })()}
              </span>
            </>
          )}
        </>
      }
      size="md"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={isSubmitting} style={{ minHeight: 44 }}>
            Cancel
          </Button>
          <Button
            variant="primary"
            onClick={() => handleSubmit()}
            disabled={isSubmitting || (clashes ?? []).length > 0}
            style={{ minHeight: 44, fontWeight: 700 }}
          >
            {isSubmitting ? 'Extending...' : `Confirm Extension (+${days} day${days === 1 ? '' : 's'})`}
          </Button>
        </>
      }
    >
      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-md)' }}>
        {error && (
          <div
            role="alert"
            style={{
              display: 'flex',
              alignItems: 'flex-start',
              gap: 'var(--sp-sm)',
              padding: '10px 14px',
              borderRadius: 'var(--r-btn)',
              border: '1px solid var(--danger, #dc2626)',
              background: 'var(--st-danger-bg, rgba(220, 38, 38, 0.08))',
              color: 'var(--st-danger-fg, #b91c1c)',
              fontSize: 'var(--t-meta)',
            }}
          >
            <Icon name="alert_triangle" size={16} />
            <div style={{ flex: 1 }}>{error}</div>
          </div>
        )}

        {/* 1. Quick Chips for Days Picker */}
        <div>
          <label style={{ display: 'block', fontSize: 'var(--t-meta)', fontWeight: 600, color: 'var(--text)', marginBottom: 8 }}>
            Extension Duration <span style={{ color: 'var(--danger)' }}>*</span>
          </label>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button
              type="button"
              onClick={() => setDayChoice('1')}
              style={{
                minHeight: 44, // Law 14 touch target
                minWidth: 80,
                padding: '0 16px',
                borderRadius: 'var(--r-btn)',
                border: dayChoice === '1' ? '2px solid var(--primary)' : '1px solid var(--border)',
                background: dayChoice === '1' ? 'var(--card2)' : 'var(--card)',
                color: dayChoice === '1' ? 'var(--primary-text)' : 'var(--text)',
                fontWeight: dayChoice === '1' ? 700 : 500,
                fontSize: 'var(--t-ui)',
                cursor: 'pointer',
              }}
            >
              +1 Day
            </button>
            <button
              type="button"
              onClick={() => setDayChoice('2')}
              style={{
                minHeight: 44,
                minWidth: 80,
                padding: '0 16px',
                borderRadius: 'var(--r-btn)',
                border: dayChoice === '2' ? '2px solid var(--primary)' : '1px solid var(--border)',
                background: dayChoice === '2' ? 'var(--card2)' : 'var(--card)',
                color: dayChoice === '2' ? 'var(--primary-text)' : 'var(--text)',
                fontWeight: dayChoice === '2' ? 700 : 500,
                fontSize: 'var(--t-ui)',
                cursor: 'pointer',
              }}
            >
              +2 Days
            </button>
            <button
              type="button"
              onClick={() => setDayChoice('custom')}
              style={{
                minHeight: 44,
                minWidth: 80,
                padding: '0 16px',
                borderRadius: 'var(--r-btn)',
                border: dayChoice === 'custom' ? '2px solid var(--primary)' : '1px solid var(--border)',
                background: dayChoice === 'custom' ? 'var(--card2)' : 'var(--card)',
                color: dayChoice === 'custom' ? 'var(--primary-text)' : 'var(--text)',
                fontWeight: dayChoice === 'custom' ? 700 : 500,
                fontSize: 'var(--t-ui)',
                cursor: 'pointer',
              }}
            >
              Custom
            </button>
          </div>

          {dayChoice === 'custom' && (
            <div style={{ marginTop: 10, display: 'flex', alignItems: 'center', gap: 10 }}>
              <label htmlFor="custom-days-input" style={{ fontSize: 'var(--t-meta)', color: 'var(--text2)' }}>
                Number of days:
              </label>
              <input
                id="custom-days-input"
                type="number"
                min={1}
                value={customDays}
                onChange={(e) => setCustomDays(Math.max(1, parseInt(e.target.value, 10) || 1))}
                style={{
                  width: 90,
                  height: 44,
                  padding: '0 12px',
                  borderRadius: 'var(--r-btn)',
                  border: '1px solid var(--border)',
                  background: 'var(--card)',
                  color: 'var(--text)',
                  fontSize: 'var(--t-ui)',
                  fontWeight: 600,
                }}
              />
            </div>
          )}
        </div>

        {/* 2. Projected New Return Date */}
        <div
          style={{
            padding: '12px 14px',
            borderRadius: 'var(--r-btn)',
            background: 'var(--card2)',
            border: '1px solid var(--border)',
            display: 'flex',
            flexDirection: 'column',
            gap: 4,
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 'var(--t-meta)', color: 'var(--muted)' }}>New Projected Return:</span>
            <span style={{ fontWeight: 700, fontSize: 'var(--t-ui)', color: 'var(--booking-date-text)' }}>
              {newReturnDateStr ? `${newReturnDateStr} (${newReturnDateBs})` : '—'}
            </span>
          </div>
        </div>

        {/* 3. Availability Clash Detection Box */}
        {isCheckingClash ? (
          <div style={{ fontSize: 'var(--t-meta)', color: 'var(--muted)', display: 'flex', alignItems: 'center', gap: 6 }}>
            <Icon name="refresh" size={14} className="animate-spin" /> Checking availability for extended dates...
          </div>
        ) : (clashes ?? []).length > 0 ? (
          <div
            role="alert"
            style={{
              padding: '12px 14px',
              borderRadius: 'var(--r-btn)',
              background: 'var(--st-danger-bg, rgba(220, 38, 38, 0.08))',
              border: '1px solid var(--danger, #dc2626)',
              color: 'var(--st-danger-fg, #b91c1c)',
              fontSize: 'var(--t-meta)',
            }}
          >
            <div style={{ fontWeight: 700, display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
              <Icon name="alert_triangle" size={16} />
              Reservation Clash Detected
            </div>
            {clashes.map((c, idx) => (
              <div key={idx} style={{ marginTop: 2 }}>
                • {c.detail}
              </div>
            ))}
          </div>
        ) : (
          <div style={{ fontSize: 'var(--t-meta)', color: 'var(--success, #16a34a)', display: 'flex', alignItems: 'center', gap: 6 }}>
            <Icon name="check" size={14} />
            All items free for the extended schedule (no clashes)
          </div>
        )}

        {/* 4. W41: Two one-tap pricing choices */}
        {canSeeMoney && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <span style={{ fontSize: 'var(--t-meta)', fontWeight: 600, color: 'var(--text)' }}>
              Pricing for Extra Days (W41)
            </span>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <button
                type="button"
                onClick={() => setPricingOption('same_rate')}
                role="radio"
                aria-checked={pricingOption === 'same_rate'}
                style={{
                  minHeight: 56, // Law 14 56px verb target
                  padding: '10px 12px',
                  borderRadius: 'var(--r-btn)',
                  border: pricingOption === 'same_rate' ? '2px solid var(--primary)' : '1px solid var(--border)',
                  background: pricingOption === 'same_rate' ? 'var(--card2)' : 'var(--card)',
                  textAlign: 'left',
                  cursor: 'pointer',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 3,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 700, fontSize: 'var(--t-meta)', color: 'var(--text)' }}>
                  <input
                    type="radio"
                    name={`pricing-option-${radioGroupId}`}
                    checked={pricingOption === 'same_rate'}
                    onChange={() => setPricingOption('same_rate')}
                    style={{ pointerEvents: 'none' }}
                  />
                  Same rate &amp; discount
                </div>
                <div style={{ fontSize: 'var(--t-fine, 12px)', color: 'var(--muted)', paddingLeft: 20 }}>
                  Booking line rates &amp; discounts
                </div>
              </button>

              <button
                type="button"
                onClick={() => setPricingOption('standard_rate')}
                role="radio"
                aria-checked={pricingOption === 'standard_rate'}
                style={{
                  minHeight: 56,
                  padding: '10px 12px',
                  borderRadius: 'var(--r-btn)',
                  border: pricingOption === 'standard_rate' ? '2px solid var(--primary)' : '1px solid var(--border)',
                  background: pricingOption === 'standard_rate' ? 'var(--card2)' : 'var(--card)',
                  textAlign: 'left',
                  cursor: 'pointer',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 3,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 700, fontSize: 'var(--t-meta)', color: 'var(--text)' }}>
                  <input
                    type="radio"
                    name={`pricing-option-${radioGroupId}`}
                    checked={pricingOption === 'standard_rate'}
                    onChange={() => setPricingOption('standard_rate')}
                    style={{ pointerEvents: 'none' }}
                  />
                  Standard rate
                </div>
                <div style={{ fontSize: 'var(--t-fine, 12px)', color: 'var(--muted)', paddingLeft: 20 }}>
                  Catalog standard rate (0% discount)
                </div>
              </button>
            </div>

            <div
              style={{
                marginTop: 4,
                padding: '10px 14px',
                borderRadius: 'var(--r-btn)',
                background: 'var(--card2)',
                border: '1px solid var(--border)',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                fontSize: 'var(--t-meta)',
              }}
            >
              <span style={{ color: 'var(--muted)' }}>Additional Charge ({days} day{days === 1 ? '' : 's'}):</span>
              <span style={{ fontWeight: 700, fontSize: 'var(--t-ui)', color: 'var(--text)' }}>
                {extraAmount > 0 ? formatMoney(rupees(extraAmount)) : 'Calculated at invoice'}
              </span>
            </div>
          </div>
        )}

        {/* 5. Extension Reason */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <label htmlFor="extend-reason" style={{ fontSize: 'var(--t-meta)', fontWeight: 600, color: 'var(--text)' }}>
            Reason for Extension <span style={{ color: 'var(--danger)' }}>*</span>
          </label>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 4 }}>
            {COMMON_REASONS.map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => setReason(r)}
                style={{
                  minHeight: 32,
                  padding: '2px 10px',
                  borderRadius: 'var(--r-btn)',
                  border: reason === r ? '1px solid var(--primary)' : '1px solid var(--border)',
                  background: reason === r ? 'var(--card2)' : 'var(--card)',
                  color: reason === r ? 'var(--primary-text)' : 'var(--muted)',
                  fontSize: 'var(--t-fine, 12px)',
                  cursor: 'pointer',
                }}
              >
                {r}
              </button>
            ))}
          </div>
          <textarea
            id="extend-reason"
            rows={2}
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

        {/* 6. Authorization confirmation */}
        <label style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-sm)', fontSize: 'var(--t-meta)', cursor: 'pointer', minHeight: 44 }}>
          <input
            id="extend-auth-check"
            type="checkbox"
            checked={confirmed}
            onChange={(e) => setConfirmed(e.target.checked)}
            style={{ width: 18, height: 18 }}
          />
          <span>Client has authorized the extension and additional rental charges.</span>
        </label>
      </form>
    </Modal>
  )
}
