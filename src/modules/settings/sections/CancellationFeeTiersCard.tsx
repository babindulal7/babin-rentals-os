import { Card } from '../../../components/ui/Page'

/**
 * =============================================================================
 * CancellationFeeTiersCard.tsx — T3-03: Cancellation Fee Policy (Option A)
 *
 * Settings ▸ Financial ▸ "Cancellation fees"
 * Reflects owner approval of 2 Nov 2026 (RULINGS-2026-11-02-OWNER.md):
 * Option A matrix for confirmed pre-start bookings.
 * =============================================================================
 */

const OPTION_A_ROWS = [
  {
    timeframe: '> 48 hours',
    shortDuration: 'Free',
    longDuration: 'Free',
    isFree: true,
  },
  {
    timeframe: '> 24 to 48 hours',
    shortDuration: 'Free',
    longDuration: '50% of rental subtotal',
    isFree: false,
  },
  {
    timeframe: 'Final 24 hours (≤ 24h)',
    shortDuration: 'One rental day charge',
    longDuration: 'Higher of 1 day charge or 50%',
    isFree: false,
  },
] as const

export function CancellationFeeTiersCard() {
  return (
    <Card title="Cancellation fees (Option A)">
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-md)' }}>
        <p style={{ color: 'var(--muted)', fontSize: 'var(--t-meta)', lineHeight: 1.5, margin: 0 }}>
          Owner-approved cancellation policy (Ruling 2 Nov 2026). Applied automatically to confirmed bookings cancelled prior to scheduled pickup.
        </p>

        <div style={{ overflowX: 'auto', border: '1px solid var(--border)', borderRadius: 'var(--r-sm)' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 'var(--t-meta)' }}>
            <thead>
              <tr style={{ background: 'var(--card2)', borderBottom: '1px solid var(--border)' }}>
                <th style={{ padding: '8px 12px', textAlign: 'left', fontWeight: 600, color: 'var(--text)' }}>
                  Time before scheduled start
                </th>
                <th style={{ padding: '8px 12px', textAlign: 'left', fontWeight: 600, color: 'var(--text)' }}>
                  Duration 1–2 rental days
                </th>
                <th style={{ padding: '8px 12px', textAlign: 'left', fontWeight: 600, color: 'var(--text)' }}>
                  Duration &gt;2 rental days
                </th>
              </tr>
            </thead>
            <tbody>
              {OPTION_A_ROWS.map((row) => (
                <tr key={row.timeframe} style={{ borderBottom: '1px solid var(--border)' }}>
                  <td style={{ padding: '10px 12px', fontWeight: 600, color: 'var(--text)' }}>
                    {row.timeframe}
                  </td>
                  <td style={{ padding: '10px 12px', color: row.isFree ? 'var(--st-completed-fg)' : 'var(--text2)' }}>
                    {row.shortDuration}
                  </td>
                  <td style={{ padding: '10px 12px', color: row.isFree ? 'var(--st-completed-fg)' : 'var(--text2)' }}>
                    {row.longDuration}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div
          style={{
            padding: '10px 14px',
            borderRadius: 'var(--r-sm)',
            background: 'var(--card2)',
            border: '1px solid var(--border)',
            display: 'flex',
            flexDirection: 'column',
            gap: 6,
            fontSize: 'var(--t-caption)',
            color: 'var(--muted)',
            lineHeight: 1.5,
          }}
        >
          <div>
            <strong style={{ color: 'var(--text2)' }}>Fee base (Ruling O-13):</strong> Equipment rental subtotal before VAT. Deposits, delivery, crew, and pass-through charges are excluded.
          </div>
          <div>
            <strong style={{ color: 'var(--text2)' }}>Staff overrides:</strong> Authorized staff (Coordinator+) may lower or waive the suggested fee with a mandatory recorded reason.
          </div>
          <div>
            <strong style={{ color: 'var(--text2)' }}>Reversals (Law 4):</strong> Any client advance paid in excess of the cancellation fee is refunded via an immutable reversal row.
          </div>
          <div>
            <strong style={{ color: 'var(--text2)' }}>Statutory note (Ruling O-7):</strong> VAT application on cancellation fee awaits final accountant review; charges rendered before VAT.
          </div>
        </div>
      </div>
    </Card>
  )
}
