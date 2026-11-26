import { useEffect, useState } from 'react'
import { Card } from '../../../components/ui/Page'
import { fetchCancellationFeeTiers, type CancellationFeeTier } from '../../../lib/queries/cancellationFeeTiers'

export function CancellationFeeTiersCard() {
  const [tiers, setTiers] = useState<CancellationFeeTier[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    void fetchCancellationFeeTiers()
      .then((data) => {
        if (!cancelled) setTiers(data)
      })
      .catch(() => {
        if (!cancelled) setTiers([])
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  if (loading) {
    return (
      <Card title="Cancellation fee tiers">
        <p style={{ color: 'var(--muted)', fontSize: 'var(--t-meta)' }}>Loading…</p>
      </Card>
    )
  }

  return (
    <Card title="Cancellation fee tiers">
      {tiers.length === 0 ? (
        <p style={{ color: 'var(--muted)', fontSize: 'var(--t-meta)', lineHeight: 1.5 }}>
          No cancellation fee tiers are defined. Cancelling a booking does not calculate a fee.
          Add tiers below to enable fee suggestions on the cancel sheet.
        </p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-sm)' }}>
          {tiers.map((tier) => (
            <div
              key={tier.id}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                padding: '8px 12px',
                borderRadius: 'var(--r-btn)',
                border: '1px solid var(--border)',
                background: 'var(--card2)',
              }}
            >
              <span style={{ fontSize: 'var(--t-meta)', fontWeight: 600, color: 'var(--text)' }}>
                {tier.noticeHours}h notice
              </span>
              <span style={{ fontSize: 'var(--t-meta)', color: 'var(--text2)' }}>
                → {tier.feePercent}% fee
              </span>
            </div>
          ))}
        </div>
      )}
    </Card>
  )
}
