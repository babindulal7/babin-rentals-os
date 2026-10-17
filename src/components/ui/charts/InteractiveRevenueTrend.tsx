import { useState, useId, type KeyboardEvent } from 'react'
import { catColor } from '../Charts'
import { formatMoney, type Paisa } from '../../../lib/money'
import type { RevenueMonth } from '../../../lib/intel/revenueTrend'
import { ChartSourceNote } from '../analytics/ChartSourceNote'
import type { AnalyticsContext } from '../../../lib/analytics/contracts'

interface Props {
  months: readonly RevenueMonth[]
  totalPaisa?: Paisa
  onActivate?: (periodStartUtc: string) => void
  className?: string
}

/**
 * Interactive, accessible SVG trend chart with crosshair, touch tap-to-lock,
 * keyboard roving focus, synchronized metric row, and provenance note.
 *
 * Enforces Babin Rentals OS design rules:
 * - Categorical palette token var(--cat-1) (never status colors)
 * - Integer Paisa formatting via formatMoney
 * - Zero external charting dependencies (pure SVG)
 * - Accessible HTML table in <details> for assistive technology
 * - Touch hit targets >= 44px
 */
export function InteractiveRevenueTrend({ months, totalPaisa: explicitTotal, onActivate, className }: Props) {
  const [selected, setSelected] = useState<number | null>(null)
  const [hovered, setHovered] = useState<number | null>(null)
  const gradientId = useId()

  const activeIndex = hovered !== null ? hovered : selected

  if (months.length === 0) {
    return (
      <div style={{ padding: 'var(--sp-md)', color: 'var(--text2)' }}>
        <p style={{ margin: 0 }}>No recorded invoices in this period.</p>
      </div>
    )
  }

  const computedTotalPaisa = explicitTotal ?? (months.reduce((acc, m) => acc + m.amountPaisa, 0) as Paisa)
  const totalInvoices = months.reduce((acc, m) => acc + m.invoiceCount, 0)
  const max = Math.max(1, ...months.map(m => m.amountPaisa))

  const width = 760
  const height = 240
  const pad = 24

  const x = (i: number) =>
    pad + (months.length <= 1 ? (width - pad * 2) / 2 : (i * (width - pad * 2)) / (months.length - 1))
  const y = (value: number) => height - pad - (value / max) * (height - pad * 2)

  const points = months.map((m, i) => `${x(i)},${y(m.amountPaisa)}`).join(' ')
  const areaPoints = `${x(0)},${height - pad} ${points} ${x(months.length - 1)},${height - pad}`

  const activeDetails = activeIndex !== null ? months[activeIndex] : null

  const handleKey = (event: KeyboardEvent<SVGCircleElement>, index: number) => {
    if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') {
      event.preventDefault()
      const next = Math.min(months.length - 1, Math.max(0, index + (event.key === 'ArrowRight' ? 1 : -1)))
      setSelected(next)
      setHovered(null)
      const group = event.currentTarget.parentElement
      group?.querySelectorAll<SVGCircleElement>('circle[tabindex]')[next]?.focus()
    } else if (event.key === 'Home') {
      event.preventDefault()
      setSelected(0)
      setHovered(null)
      const group = event.currentTarget.parentElement
      group?.querySelectorAll<SVGCircleElement>('circle[tabindex]')[0]?.focus()
    } else if (event.key === 'End') {
      event.preventDefault()
      setSelected(months.length - 1)
      setHovered(null)
      const group = event.currentTarget.parentElement
      group?.querySelectorAll<SVGCircleElement>('circle[tabindex]')[months.length - 1]?.focus()
    } else if (event.key === 'Escape') {
      setSelected(null)
      setHovered(null)
    } else if ((event.key === 'Enter' || event.key === ' ') && onActivate && months[index]) {
      event.preventDefault()
      onActivate(months[index].periodStartUtc)
    }
  }

  const firstDate = months[0]?.periodStartUtc.slice(0, 10) ?? ''
  const lastDate = months[months.length - 1]?.periodStartUtc.slice(0, 10) ?? ''

  const context: AnalyticsContext = {
    fromAd: firstDate,
    toAd: lastDate,
    dateBasis: 'invoice-issue-month',
    provenance: 'actual',
    sourceLabel: 'Verified non-void issued invoices ledger',
  }

  return (
    <div className={className} style={{ minWidth: 0, display: 'flex', flexDirection: 'column', gap: 'var(--sp-sm)' }}>
      {/* Synchronized Headline / Crosshair Detail Strip */}
      <div
        aria-live="polite"
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 12,
          padding: '10px 14px',
          background: 'var(--surface)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--r-md)',
          minHeight: 52,
        }}
      >
        {activeDetails ? (
          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'baseline', gap: 14 }}>
            <div>
              <span style={{ fontSize: 'var(--t-meta)', color: 'var(--text2)', marginRight: 6 }}>Month:</span>
              <strong style={{ color: 'var(--text)', fontSize: '15px' }}>{activeDetails.label}</strong>
            </div>
            <div>
              <span style={{ fontSize: 'var(--t-meta)', color: 'var(--text2)', marginRight: 6 }}>Taxable Revenue:</span>
              <strong style={{ color: 'var(--cat-1)', fontSize: '16px', fontFamily: 'var(--font-mono, monospace)' }}>
                {formatMoney(activeDetails.amountPaisa)}
              </strong>
            </div>
            <div style={{ fontSize: 'var(--t-meta)', color: 'var(--text2)' }}>
              <span>{activeDetails.invoiceCount} issued invoice{activeDetails.invoiceCount === 1 ? '' : 's'}</span>
              {computedTotalPaisa > 0 && (
                <span style={{ marginLeft: 8, padding: '2px 6px', background: 'var(--card)', borderRadius: 'var(--r-sm)', border: '1px solid var(--border)' }}>
                  {((activeDetails.amountPaisa / computedTotalPaisa) * 100).toFixed(1)}% of window
                </span>
              )}
            </div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'baseline', gap: 14 }}>
            <div>
              <span style={{ fontSize: 'var(--t-meta)', color: 'var(--text2)', marginRight: 6 }}>Period Total:</span>
              <strong style={{ color: 'var(--text)', fontSize: '15px', fontFamily: 'var(--font-mono, monospace)' }}>
                {formatMoney(computedTotalPaisa)}
              </strong>
            </div>
            <div style={{ fontSize: 'var(--t-meta)', color: 'var(--text2)' }}>
              {totalInvoices} invoices across {months.length} calendar month{months.length === 1 ? '' : 's'}
            </div>
          </div>
        )}

        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {selected !== null && (
            <button
              type="button"
              onClick={() => setSelected(null)}
              style={{
                minHeight: 36,
                padding: '0 10px',
                border: '1px solid var(--border)',
                borderRadius: 'var(--r-sm)',
                background: 'var(--card)',
                color: 'var(--text)',
                fontSize: 'var(--t-meta)',
                cursor: 'pointer',
              }}
            >
              Clear lock
            </button>
          )}
          <span style={{ fontSize: 'var(--t-caption)', color: 'var(--text2)' }}>
            {selected !== null ? 'Locked · Tap another point to change' : 'Hover, tap or use arrow keys'}
          </span>
        </div>
      </div>

      {/* SVG Chart Plot */}
      <div style={{ position: 'relative', width: '100%' }}>
        <svg
          viewBox={`0 0 ${width} ${height}`}
          width="100%"
          role="group"
          aria-label="Issued taxable revenue by AD month. Use left and right arrow keys to inspect data points."
          style={{ display: 'block', maxHeight: 320, overflow: 'visible' }}
          onMouseLeave={() => setHovered(null)}
        >
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={catColor(0)} stopOpacity="0.22" />
              <stop offset="100%" stopColor={catColor(0)} stopOpacity="0.01" />
            </linearGradient>
          </defs>

          {/* Grid lines */}
          {[0, 0.25, 0.5, 0.75, 1].map(level => (
            <line
              key={level}
              x1={pad}
              x2={width - pad}
              y1={y(max * level)}
              y2={y(max * level)}
              stroke="var(--chart-grid)"
              strokeDasharray="4 5"
            />
          ))}

          {/* Area gradient under curve */}
          <polygon points={areaPoints} fill={`url(#${gradientId})`} pointerEvents="none" />

          {/* Main trend line */}
          <polyline
            points={points}
            fill="none"
            stroke={catColor(0)}
            strokeWidth={3}
            strokeLinecap="round"
            strokeLinejoin="round"
            vectorEffect="non-scaling-stroke"
          />

          {/* Active crosshair vertical guideline */}
          {activeIndex !== null && (
            <line
              x1={x(activeIndex)}
              x2={x(activeIndex)}
              y1={pad}
              y2={height - pad}
              stroke="var(--cat-1)"
              strokeWidth={1.5}
              strokeDasharray="3 3"
              pointerEvents="none"
            />
          )}

          {/* Transparent full-height hit columns for mouse/touch */}
          {months.map((month, index) => {
            const colW = months.length <= 1 ? width - pad * 2 : (width - pad * 2) / (months.length - 1)
            const colX = months.length <= 1 ? pad : Math.max(0, x(index) - colW / 2)
            return (
              <rect
                key={`hit-${month.periodStartUtc}`}
                x={colX}
                y={0}
                width={colW}
                height={height}
                fill="transparent"
                style={{ cursor: 'pointer' }}
                onMouseEnter={() => setHovered(index)}
                onClick={() => {
                  setSelected(prev => (prev === index ? null : index))
                  if (onActivate) onActivate(month.periodStartUtc)
                }}
              />
            )
          })}

          {/* Data point circles */}
          {months.map((month, index) => {
            const isActive = activeIndex === index
            const isLocked = selected === index
            return (
              <g key={month.periodStartUtc}>
                {isActive && (
                  <circle
                    cx={x(index)}
                    cy={y(month.amountPaisa)}
                    r={11}
                    fill="none"
                    stroke={catColor(0)}
                    strokeWidth={1.5}
                    opacity={0.4}
                    pointerEvents="none"
                  />
                )}
                <circle
                  cx={x(index)}
                  cy={y(month.amountPaisa)}
                  r={isLocked ? 7 : isActive ? 6 : 4.5}
                  fill="var(--card)"
                  stroke={catColor(0)}
                  strokeWidth={isLocked ? 3.5 : 2.5}
                  tabIndex={0}
                  role="button"
                  aria-label={`${month.label}: ${formatMoney(month.amountPaisa)}, ${month.invoiceCount} invoices`}
                  aria-pressed={isLocked}
                  onClick={() => setSelected(prev => (prev === index ? null : index))}
                  onFocus={() => setSelected(index)}
                  onKeyDown={event => handleKey(event, index)}
                  style={{ cursor: 'pointer', outlineOffset: 4 }}
                />
              </g>
            )
          })}
        </svg>

        {/* X-axis start/end label */}
        <div
          aria-hidden="true"
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            fontSize: 'var(--t-meta)',
            color: 'var(--text2)',
            marginTop: 6,
          }}
        >
          <span>{months[0]?.label}</span>
          <span>{months.length > 1 ? months[months.length - 1]?.label : ''}</span>
        </div>
      </div>

      {/* Accessible month-by-month table */}
      <details style={{ marginTop: 'var(--sp-xs)' }}>
        <summary
          style={{
            cursor: 'pointer',
            padding: '8px 0',
            minHeight: 44,
            display: 'flex',
            alignItems: 'center',
            fontSize: 'var(--t-meta)',
            color: 'var(--text2)',
          }}
        >
          View accessible month-by-month table
        </summary>
        <div style={{ overflowX: 'auto', marginTop: 6, border: '1px solid var(--border)', borderRadius: 'var(--r-sm)' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: 'var(--t-meta)' }}>
            <thead>
              <tr style={{ background: 'var(--surface)', borderBottom: '1px solid var(--border)' }}>
                <th scope="col" style={{ padding: '8px 12px' }}>AD month</th>
                <th scope="col" style={{ padding: '8px 12px' }}>Taxable revenue</th>
                <th scope="col" style={{ padding: '8px 12px' }}>Invoices</th>
                <th scope="col" style={{ padding: '8px 12px' }}>Share</th>
              </tr>
            </thead>
            <tbody>
              {months.map(m => (
                <tr key={m.periodStartUtc} style={{ borderBottom: '1px solid var(--border)' }}>
                  <th scope="row" style={{ padding: '8px 12px', fontWeight: 500 }}>{m.label}</th>
                  <td style={{ padding: '8px 12px', fontFamily: 'var(--font-mono, monospace)' }}>
                    {formatMoney(m.amountPaisa as Paisa)}
                  </td>
                  <td style={{ padding: '8px 12px' }}>{m.invoiceCount}</td>
                  <td style={{ padding: '8px 12px', color: 'var(--text2)' }}>
                    {computedTotalPaisa > 0 ? `${((m.amountPaisa / computedTotalPaisa) * 100).toFixed(1)}%` : '0%'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>

      {/* Provenance note */}
      <ChartSourceNote context={context} />
    </div>
  )
}
