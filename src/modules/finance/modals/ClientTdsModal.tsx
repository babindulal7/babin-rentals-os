import { useEffect, useState } from 'react'
import { Modal } from '../../../components/ui/Modal'
import { Button } from '../../../components/ui/Page'
import { formatMoney } from '../../../lib/money'
import { formatBsOrAd } from '../../../lib/bs'
import { getClientTdsStatus, type ClientTdsStatus } from '../../../lib/queries/clientTds'
import { recordClientTds, reverseClientTds, TDS_REASON_MIN, CERTIFICATE_MAX } from '../../../actions/finance/recordClientTds'
import { useAuth } from '../../../lib/auth'
import { useNetwork } from '../../../lib/network'
import { newClientUuid } from '../../../lib/supabase'

/**
 * # Client TDS — record or reverse the tax a client deducted from a rental invoice
 *
 * RULING 2026-11-17: R-17.1, R-17.3. The screen SHOWS the TDS the system computed
 * (`client_tds_status`) and never works the figure out itself: pages never implement
 * business logic. Recording is one tap after the optional certificate number (R-39).
 * The rate, the base and the "once per invoice" rule live in the database.
 *
 * Who: recording is Owner · Coordinator · Accounts (as a payment); reversing is Owner ·
 * Admin · Manager. The caller says which this session may do; the actions and the
 * database enforce it regardless (B-1: stricter wins).
 */

export interface ClientTdsModalProps {
  isOpen: boolean
  onClose: () => void
  /** `invoices.id` and the number shown to the operator (null on a Draft, R-15). */
  invoice: { id: string; invoiceNo: string | null; clientName: string }
  canRecord: boolean
  canReverse: boolean
  /** Raised after a write, with the sentence for the success toast. */
  onDone: (message: string) => void
}

const box = {
  padding: '10px 14px',
  borderRadius: 'var(--r-btn)',
  fontSize: 'var(--t-meta)',
} as const

const field = {
  minHeight: 'var(--tap)',
  padding: '0 12px',
  borderRadius: 'var(--r-btn)',
  border: '1px solid var(--border)',
  background: 'var(--card)',
  color: 'var(--text)',
  fontSize: 'var(--t-meta)',
} as const

/** `YYYY-MM-DD` (AD, Kathmandu day) → "16 Shrawan (4/8/2026)". BS is rendered, never stored. */
function dayLabel(adDate: string): string {
  const at = new Date(`${adDate}T00:00:00+05:45`)
  if (Number.isNaN(at.getTime())) return adDate
  const [y, m, d] = adDate.split('-')
  return `${formatBsOrAd(at)} (${Number(d)}/${Number(m)}/${y})`
}

export function ClientTdsModal({ isOpen, onClose, invoice, canRecord, canReverse, onDone }: ClientTdsModalProps) {
  const { user } = useAuth()
  const isOnline = useNetwork()
  const [status, setStatus] = useState<ClientTdsStatus | null>(null)
  const [loading, setLoading] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [certificate, setCertificate] = useState('')
  const [reversing, setReversing] = useState(false)
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [reloadTick, setReloadTick] = useState(0)
  // Law 8: one key per attempt, kept across retries of the same request, re-minted after success.
  const [recordKey, setRecordKey] = useState(() => newClientUuid())
  const [reverseKey, setReverseKey] = useState(() => newClientUuid())

  useEffect(() => {
    if (!isOpen) return
    setCertificate('')
    setReversing(false)
    setReason('')
    setError(null)
    setRecordKey(newClientUuid())
    setReverseKey(newClientUuid())
  }, [isOpen, invoice.id])

  useEffect(() => {
    if (!isOpen) return
    let cancelled = false
    setLoading(true)
    setLoadError(null)
    getClientTdsStatus(invoice.id)
      .then((s) => {
        if (!cancelled) setStatus(s)
      })
      .catch((e: unknown) => {
        if (!cancelled) {
          setStatus(null)
          setLoadError(e instanceof Error ? e.message : String(e))
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [isOpen, invoice.id, reloadTick])

  const guard = (): { userId: string; role: NonNullable<typeof user>['role'] } | null => {
    if (!user) {
      setError('You are not signed in, so this cannot be attributed to anyone. Sign in and try again.')
      return null
    }
    if (!isOnline) {
      setError('This device is offline. TDS is not queued for later; record it once you are back online.')
      return null
    }
    return { userId: user.id, role: user.role }
  }

  const handleRecord = async () => {
    const who = guard()
    if (!who) return
    setBusy(true)
    setError(null)
    try {
      const out = await recordClientTds(
        { invoiceId: invoice.id, clientUuid: recordKey, certificateNumber: certificate },
        { userId: who.userId, role: who.role, isOnline },
      )
      setRecordKey(newClientUuid())
      onDone(
        `TDS ${formatMoney(out.amountPaisa)} recorded.` +
          (out.outstandingPaisa > 0 ? ` ${formatMoney(out.outstandingPaisa)} still outstanding.` : ' Invoice settled.'),
      )
      onClose()
    } catch (e) {
      setError(e instanceof Error && e.message ? e.message : 'Could not record the TDS. Nothing was saved.')
    } finally {
      setBusy(false)
    }
  }

  const handleReverse = async () => {
    const who = guard()
    if (!who || !status?.active) return
    setBusy(true)
    setError(null)
    try {
      const out = await reverseClientTds(
        { ledgerId: status.active.ledgerId, clientUuid: reverseKey, reason },
        { userId: who.userId, role: who.role, isOnline },
      )
      setReverseKey(newClientUuid())
      onDone(`TDS ${formatMoney(out.amountPaisa)} reversed. ${formatMoney(out.outstandingPaisa)} outstanding again.`)
      onClose()
    } catch (e) {
      setError(e instanceof Error && e.message ? e.message : 'Could not reverse the TDS. Nothing was saved.')
    } finally {
      setBusy(false)
    }
  }

  const label = invoice.invoiceNo ?? 'Draft (no number)'
  const reasonOk = reason.trim().length >= TDS_REASON_MIN
  const showRecord = !!status && !status.active && status.canRecord && canRecord

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Client TDS"
      subtitle={`${label} — ${invoice.clientName}`}
      size="md"
      footer={
        <div style={{ display: 'flex', gap: 'var(--sp-sm)', width: '100%', justifyContent: 'flex-end', flexWrap: 'wrap' }}>
          <Button variant="secondary" onClick={onClose} disabled={busy} style={{ minHeight: 44, flex: '1 1 120px' }}>
            Close
          </Button>
          {showRecord && status && (
            <Button variant="primary" onClick={() => void handleRecord()} disabled={busy} style={{ minHeight: 44, flex: '2 1 160px' }}>
              {busy ? 'Recording...' : `Record TDS ${formatMoney(status.amountPaisa)}`}
            </Button>
          )}
          {status?.active && canReverse && reversing && (
            <Button variant="primary" onClick={() => void handleReverse()} disabled={busy || !reasonOk} style={{ minHeight: 44, flex: '2 1 160px' }}>
              {busy ? 'Reversing...' : 'Reverse TDS'}
            </Button>
          )}
        </div>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-md)' }}>
        {error && (
          <div role="alert" style={{ ...box, background: 'var(--st-danger-bg)', color: 'var(--st-danger-fg)' }}>
            {error}
          </div>
        )}
        {loading && <span role="status" style={{ fontSize: 'var(--t-meta)', color: 'var(--muted)' }}>Reading the TDS for this invoice…</span>}
        {loadError && (
          <div role="alert" style={{ ...box, background: 'var(--st-danger-bg)', color: 'var(--st-danger-fg)' }}>
            {loadError}{' '}
            <button
              type="button"
              onClick={() => setReloadTick((n) => n + 1)}
              style={{ background: 'none', border: 'none', padding: 0, minHeight: 'var(--tap)', color: 'inherit', font: 'inherit', fontWeight: 700, textDecoration: 'underline', cursor: 'pointer' }}
            >
              Try again
            </button>
          </div>
        )}

        {status && !status.active && (
          <>
            <div style={{ ...box, background: 'var(--card2, #f1f5f9)', border: '1px solid var(--border)', color: 'var(--text)' }}>
              <div style={{ fontSize: 'var(--t-meta)', color: 'var(--muted)' }}>TDS the client deducted</div>
              <div style={{ fontSize: 'var(--t-h3, 1.25rem)', fontWeight: 700 }}>{formatMoney(status.amountPaisa)}</div>
              <div style={{ fontSize: 'var(--t-meta)', color: 'var(--muted)' }}>
                {status.ratePercent}% of {formatMoney(status.basePaisa)} taxable value, before VAT. Counted as paid on this
                invoice; it is not cash.
              </div>
            </div>
            {!status.canRecord && status.blockedReason && (
              <div role="alert" style={{ ...box, background: 'var(--card2, #f1f5f9)', border: '1px solid var(--border)', color: 'var(--text)' }}>
                {status.blockedReason}
              </div>
            )}
            {status.canRecord && !canRecord && (
              <div role="status" style={{ ...box, background: 'var(--card2, #f1f5f9)', border: '1px solid var(--border)', color: 'var(--text)' }}>
                Your role cannot record TDS. Ask the Owner, a Coordinator or Accounts.
              </div>
            )}
            {showRecord && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <label htmlFor="tds-certificate" style={{ fontSize: 'var(--t-meta)', fontWeight: 600, color: 'var(--text)' }}>
                  Certificate number (optional)
                </label>
                <input
                  id="tds-certificate"
                  type="text"
                  maxLength={CERTIFICATE_MAX}
                  placeholder="The client's TDS certificate reference"
                  value={certificate}
                  onChange={(e) => setCertificate(e.target.value)}
                  style={field}
                />
              </div>
            )}
          </>
        )}

        {status?.active && (
          <>
            <div style={{ ...box, background: 'var(--card2, #f1f5f9)', border: '1px solid var(--border)', color: 'var(--text)' }}>
              <div style={{ fontSize: 'var(--t-meta)', color: 'var(--muted)' }}>TDS recorded</div>
              <div style={{ fontSize: 'var(--t-h3, 1.25rem)', fontWeight: 700 }}>{formatMoney(status.active.amountPaisa)}</div>
              <div style={{ fontSize: 'var(--t-meta)', color: 'var(--muted)' }}>
                Deducted {dayLabel(status.active.deductedOn)}
                {status.active.certificateNumber ? ` · Certificate ${status.active.certificateNumber}` : ' · No certificate number'}
              </div>
            </div>
            {canReverse ? (
              reversing ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <label htmlFor="tds-reason" style={{ fontSize: 'var(--t-meta)', fontWeight: 600, color: 'var(--text)' }}>
                    Why is this TDS wrong? <span style={{ color: 'var(--danger)' }}>*</span>
                  </label>
                  <textarea
                    id="tds-reason"
                    rows={2}
                    placeholder={`At least ${TDS_REASON_MIN} characters, e.g. Entered on the wrong invoice`}
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    style={{ ...field, padding: '8px 12px', resize: 'vertical' }}
                  />
                  <span style={{ fontSize: 'var(--t-meta)', color: 'var(--muted)' }}>
                    The entry stays in the ledger and a reversal is added. The invoice owes this amount again.
                  </span>
                </div>
              ) : (
                <Button variant="secondary" onClick={() => setReversing(true)} style={{ minHeight: 44 }}>
                  Reverse this TDS
                </Button>
              )
            ) : (
              <span role="status" style={{ fontSize: 'var(--t-meta)', color: 'var(--muted)' }}>
                Only the Owner, Admin or a Manager can reverse TDS.
              </span>
            )}
          </>
        )}
      </div>
    </Modal>
  )
}
