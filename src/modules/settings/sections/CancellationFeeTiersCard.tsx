import { useEffect, useState } from 'react'
import { Card } from '../../../components/ui/Page'
import { fetchCancellationFeeTiers, type CancellationFeeTier } from '../../../lib/queries/cancellationFeeTiers'

export function CancellationFeeTiersCard() {
  const [tiers, setTiers] = useState<CancellationFeeTier[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const loadTiers = () => {
    setLoading(true)
    setError(null)
    void fetchCancellationFeeTiers()
      .then((data) => {
        setTiers(data)
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : 'Failed to load cancellation fee tiers')
      })
      .finally(() => {
        setLoading(false)
      })
  }

  useEffect(() => {
    loadTiers()
  }, [])

  if (loading) {
    return (
      <Card title="Cancellation fee tiers">
        <p style={{ color: 'var(--muted)', fontSize: 'var(--t-meta)' }}>Loading…</p>
      </Card>
    )
  }

  if (error) {
    return (
      <Card title="Cancellation fee tiers">
        <div role="alert" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <p style={{ color: 'var(--danger-text)', fontSize: 'var(--t-meta)' }}>
            {error}. Could not retrieve policy tiers from the database.
          </p>
          <button
            type="button"
            className="press"
            onClick={loadTiers}
            style={{
              alignSelf: 'flex-start',
              padding: '4px 10px',
              fontSize: 'var(--t-meta)',
              borderRadius: 'var(--r-btn)',
              border: '1px solid var(--border)',
              background: 'var(--card2)',
              color: 'var(--text)',
              cursor: 'pointer',
            }}
          >
            Retry
          </button>
        </div>
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
