/**
 * src/modules/rentals/actions/RebookDialog.tsx — Babin Rentals OS
 *
 * The D9 chooser for Re-book (T3-01). One small modal, three honest facts:
 *
 *  1. WHAT will be copied by default — client, products and quantities as a
 *     new Quote at today's rates, dates left at the L1 default, serials
 *     picked fresh at confirm. That part is not a choice (D9: "1").
 *  2. WHAT STAFF MAY ADD — the three ticks: crew, delivery, discounts. Each
 *     tick shows what is actually there to copy, or is disabled with the
 *     reason there is nothing ("No crew on this booking", "Client pickup —
 *     no delivery to copy", "No discount on this booking").
 *  3. WHAT IS NOT WRITTEN — nothing. D9 forbids the eager draft: the confirm
 *     opens New Rental prefilled, and no row exists until staff save there.
 *
 * The dialog collects ticks and hands them to the caller; it never builds the
 * prefill (the engine in `lib/rebook.ts` does) and never writes.
 */

import { useEffect, useState } from 'react'
import { Modal } from '../../../components/ui/Modal'
import { Button } from '../../../components/ui/Button'
import Icon from '../../../components/ui/Icon'
import { useAuth } from '../../../lib/auth'
import { fetchRebookSource, type RebookFacts, type RebookSourceResult } from '../../../lib/queries/rebook'
import {
  REBOOK_COPY_KEYS,
  rebookTickSummary,
  type RebookCopyKey,
  type RebookCopyOptions,
  type RebookSource,
} from '../../../lib/rebook'

export interface RebookDialogProps {
  isOpen: boolean
  onClose: () => void
  /** The booking to re-book, by number (BK-…). */
  bookingNo: string
  /** The confirm button's label: "Open in New Rental" or "Add to this booking". */
  confirmLabel: string
  /**
   * Receives the ticks and the fetched facts. The caller navigates or injects;
   * this dialog never writes. The facts ride along so the in-form
   * "Copy a past booking" path can build its prefill without a second read.
   */
  onConfirm: (options: RebookCopyOptions, facts: RebookFacts) => void
}

/** One tick row: native checkbox, 44px row, label plus the honest summary (or the reason it cannot be ticked). */
function TickRow({
  kind,
  label,
  summary,
  unavailableReason,
  checked,
  onToggle,
}: {
  kind: RebookCopyKey
  label: string
  summary: string | null
  unavailableReason: string
  checked: boolean
  onToggle: (kind: RebookCopyKey, next: boolean) => void
}) {
  const disabled = summary === null
  const inputId = `rebook-copy-${kind}`
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        minHeight: 44,
        padding: '2px 4px',
        opacity: disabled ? 0.6 : 1,
      }}
    >
      <input
        id={inputId}
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onToggle(kind, e.target.checked)}
        style={{ width: 18, height: 18, accentColor: 'var(--primary)', flexShrink: 0 }}
      />
      <label
        htmlFor={inputId}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          flex: 1,
          cursor: disabled ? 'not-allowed' : 'pointer',
          fontSize: 'var(--t-ui)',
          color: disabled ? 'var(--muted)' : 'var(--text)',
        }}
      >
        {label}
        {summary !== null && (
          <span style={{ fontSize: 'var(--t-meta)', color: 'var(--text2)' }}>{summary}</span>
        )}
      </label>
      {disabled && (
        <span style={{ fontSize: 'var(--t-meta)', color: 'var(--muted)', textAlign: 'right' }}>
          {unavailableReason}
        </span>
      )}
    </div>
  )
}

const TICK_META: Record<RebookCopyKey, { label: string; unavailableReason: string }> = {
  crew: { label: 'Crew', unavailableReason: 'No crew on this booking' },
  delivery: { label: 'Delivery', unavailableReason: 'Nothing to copy' },
  discounts: { label: 'Discounts', unavailableReason: 'No discount on this booking' },
}

export function RebookDialog({ isOpen, onClose, bookingNo, confirmLabel, onConfirm }: RebookDialogProps) {
  const { user } = useAuth()
  const [result, setResult] = useState<RebookSourceResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [ticks, setTicks] = useState<RebookCopyOptions>({ crew: false, delivery: false, discounts: false })

  /* Fetch the source once per open. The engine and the dialog never see a
     stale source: closing resets, reopening re-reads. */
  useEffect(() => {
    if (!isOpen) {
      setResult(null)
      setError(null)
      setLoading(false)
      setTicks({ crew: false, delivery: false, discounts: false })
      return
    }
    let cancelled = false
    setLoading(true)
    setError(null)
    setResult(null)
    void fetchRebookSource(bookingNo, user?.role ?? null)
      .then((res) => {
        if (!cancelled) setResult(res)
      })
      .catch((e: unknown) => {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e))
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [isOpen, bookingNo, user?.role])

  const source: RebookSource | null = result?.kind === 'ok' ? result.source : null
  const refusal = result?.kind === 'refused' ? result.reason : null

  const handleConfirm = () => {
    if (!result || result.kind !== 'ok') return
    onConfirm(ticks, result)
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={`Re-book ${bookingNo}`}
      subtitle={
        source?.clientName
          ? `Client ${source.clientName} · products and quantities copy at today's rates`
          : 'Client, products and quantities copy at today\'s rates'
      }
      size="sm"
      footer={
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, width: '100%' }}>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            icon="copy"
            onClick={handleConfirm}
            disabled={loading || Boolean(error) || Boolean(refusal) || !source}
          >
            {confirmLabel}
          </Button>
        </div>
      }
    >
      {loading && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, color: 'var(--text2)', fontSize: 'var(--t-ui)' }}>
          <Icon name="refresh" size={16} style={{ animation: 'spin 0.8s linear infinite' }} />
          Reading {bookingNo}…
        </div>
      )}

      {!loading && error && (
        <div role="alert" style={{ display: 'flex', alignItems: 'flex-start', gap: 8, color: 'var(--danger-text)', fontSize: 'var(--t-ui)' }}>
          <Icon name="error" size={16} />
          <span>
            {error}{' '}
            <button
              type="button"
              onClick={() => {
                setError(null)
                setLoading(true)
                void fetchRebookSource(bookingNo, user?.role ?? null)
                  .then(setResult)
                  .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)))
                  .finally(() => setLoading(false))
              }}
              style={{ border: 'none', background: 'none', color: 'var(--primary)', cursor: 'pointer', fontWeight: 600, padding: 0, font: 'inherit' }}
            >
              Try again
            </button>
          </span>
        </div>
      )}

      {!loading && !error && refusal && (
        <div role="alert" style={{ display: 'flex', alignItems: 'flex-start', gap: 8, color: 'var(--text2)', fontSize: 'var(--t-ui)' }}>
          <Icon name="error" size={16} />
          <span>{refusal}</span>
        </div>
      )}

      {!loading && !error && source && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-sm)' }}>
          <p style={{ margin: 0, fontSize: 'var(--t-meta)', color: 'var(--text2)', lineHeight: 1.5 }}>
            Copies the client, products and quantities as a new Quote at <strong>today's rates</strong>,
            with fresh dates and serials. Nothing is written until you save in New Rental.
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            {REBOOK_COPY_KEYS.map((kind) => (
              <TickRow
                key={kind}
                kind={kind}
                label={TICK_META[kind].label}
                summary={rebookTickSummary(kind, source)}
                unavailableReason={TICK_META[kind].unavailableReason}
                checked={ticks[kind]}
                onToggle={(k, next) => setTicks((prev) => ({ ...prev, [k]: next }))}
              />
            ))}
          </div>
        </div>
      )}
    </Modal>
  )
}
