import { useState, type KeyboardEvent } from 'react'
import { catColor } from '../Charts'
import { formatMoney, type Paisa } from '../../../lib/money'
import { ChartSourceNote } from './ChartSourceNote'
import type { AnalyticsContext, ChartPoint, ChartSeriesSpec } from '../../../lib/analytics/contracts'

export interface MultiSeriesTrendProps {
  points: readonly ChartPoint[]
  series: readonly ChartSeriesSpec[]
  context?: AnalyticsContext
  title?: string
  height?: number
  onActivatePoint?: (point: ChartPoint) => void
  className?: string
}

function formatSeriesValue(val: number | null | undefined, unit: ChartSeriesSpec['unit']): string {
  if (val === null || val === undefined) return '—'
  switch (unit) {
    case 'paisa':
      return formatMoney(val as Paisa)
    case 'count':
      return val.toLocaleString('en-IN')
    case 'percent':
      return `${val.toFixed(1)}%`
    case 'days':
      return `${val} day${val === 1 ? '' : 's'}`
    default:
      return String(val)
  }
}

/**
 * Reusable, responsive multi-series SVG line chart kit with interactive crosshair,
 * legend series toggles, keyboard roving navigation, and accessible data table.
 *
 * Rules:
 * - 1 to 8 series with strict categorical token colors (--cat-1 .. --cat-8)
 * - Zero charting libraries (pure SVG)
 * - Touch hit targets >= 44px
 * - Accessible HTML table in <details>
 */
export function MultiSeriesTrend({
  points,
  series,
  context,
  title,
  height = 260,
  onActivatePoint,
  className,
}: MultiSeriesTrendProps) {
  const [selected, setSelected] = useState<number | null>(null)
  const [hovered, setHovered] = useState<number | null>(null)
  const [hiddenSeries, setHiddenSeries] = useState<ReadonlySet<string>>(new Set())

  const activeIndex = hovered !== null ? hovered : selected

  if (points.length === 0 || series.length === 0) {
    return (
      <div style={{ padding: 'var(--sp-md)', color: 'var(--text2)' }}>
        <p style={{ margin: 0 }}>No chart data available for the selected period.</p>
      </div>
    )
  }

  const activeSeries = series.filter(s => !hiddenSeries.has(s.key))

  // Find max value across all visible series to establish single Y-axis scale
  let max = 1
  for (const p of points) {
    for (const s of activeSeries) {
      const val = p.series[s.key]
      if (typeof val === 'number' && val > max) {
        max = val
      }
    }
  }

  const width = 760
  const pad = 24

  const x = (i: number) =>
    pad + (points.length <= 1 ? (width - pad * 2) / 2 : (i * (width - pad * 2)) / (points.length - 1))
  const y = (value: number) => height - pad - (value / max) * (height - pad * 2)

  const activePoint = activeIndex !== null ? points[activeIndex] : null

  const toggleSeries = (key: string) => {
    setHiddenSeries(prev => {
      const next = new Set(prev)
      if (next.has(key)) {
        next.delete(key)
      } else {
        // Keep at least one series visible
        if (next.size < series.length - 1) {
          next.add(key)
        }
      }
      return next
    })
  }

  const handleKey = (event: KeyboardEvent<SVGCircleElement>, index: number) => {
    if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') {
      event.preventDefault()
      const next = Math.min(points.length - 1, Math.max(0, index + (event.key === 'ArrowRight' ? 1 : -1)))
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
      setSelected(points.length - 1)
      setHovered(null)
      const group = event.currentTarget.parentElement
      group?.querySelectorAll<SVGCircleElement>('circle[tabindex]')[points.length - 1]?.focus()
    } else if (event.key === 'Escape') {
      setSelected(null)
      setHovered(null)
    } else if ((event.key === 'Enter' || event.key === ' ') && onActivatePoint && points[index]) {
      event.preventDefault()
      onActivatePoint(points[index])
    }
  }

  return (
    <div className={className} style={{ minWidth: 0, display: 'flex', flexDirection: 'column', gap: 'var(--sp-sm)' }}>
      {title && <h4 style={{ margin: 0, color: 'var(--text)' }}>{title}</h4>}

      {/* Synchronized Crosshair Header / Metric Strip */}
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
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 14 }}>
          {activePoint ? (
            <>
              <div>
                <span style={{ fontSize: 'var(--t-meta)', color: 'var(--text2)', marginRight: 6 }}>Period:</span>
                <strong style={{ color: 'var(--text)', fontSize: '15px' }}>{activePoint.displayLabel}</strong>
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 10 }}>
                {activeSeries.map(s => {
                  const val = activePoint.series[s.key]
                  return (
                    <div
                      key={s.key}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 6,
                        padding: '2px 8px',
                        background: 'var(--card)',
                        border: '1px solid var(--border)',
                        borderRadius: 'var(--r-sm)',
                        fontSize: 'var(--t-meta)',
                      }}
                    >
                      <span
                        aria-hidden="true"
                        style={{
                          width: 8,
                          height: 8,
                          borderRadius: '50%',
                          background: catColor(s.colorIndex),
                          display: 'inline-block',
                        }}
                      />
                      <span style={{ color: 'var(--text2)' }}>{s.label}:</span>
                      <strong
                        style={{
                          color: 'var(--text)',
                          fontFamily: s.unit === 'paisa' ? 'var(--font-mono, monospace)' : undefined,
                        }}
                      >
                        {formatSeriesValue(val, s.unit)}
                      </strong>
                    </div>
                  )
                })}
              </div>
            </>
          ) : (
            <div style={{ fontSize: 'var(--t-meta)', color: 'var(--text2)' }}>
              Showing {points.length} periods across {activeSeries.length} visible series. Hover, tap or use arrow keys
              to inspect values.
            </div>
          )}
        </div>

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
            Clear selection
          </button>
        )}
      </div>

      {/* SVG Chart Plot */}
      <div style={{ position: 'relative', width: '100%' }}>
        <svg
          viewBox={`0 0 ${width} ${height}`}
          width="100%"
          role="group"
          aria-label={`${title ?? 'Multi-series trend chart'}. Use arrow keys to navigate points.`}
          style={{ display: 'block', maxHeight: 340, overflow: 'visible' }}
          onMouseLeave={() => setHovered(null)}
        >
          {/* Horizontal grid lines */}
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

          {/* Series polylines */}
          {activeSeries.map(s => {
            const seriesPoints = points
              .map((p, i) => {
                const val = p.series[s.key]
                if (val === null || val === undefined) return null
                return `${x(i)},${y(val)}`
              })
              .filter(Boolean)
              .join(' ')

            return (
              <polyline
                key={s.key}
                points={seriesPoints}
                fill="none"
                stroke={catColor(s.colorIndex)}
                strokeWidth={2.75}
                strokeLinecap="round"
                strokeLinejoin="round"
                vectorEffect="non-scaling-stroke"
              />
            )
          })}

          {/* Active crosshair vertical line */}
          {activeIndex !== null && (
            <line
              x1={x(activeIndex)}
              x2={x(activeIndex)}
              y1={pad}
              y2={height - pad}
              stroke="var(--text2)"
              strokeWidth={1.5}
              strokeDasharray="3 3"
              pointerEvents="none"
            />
          )}

          {/* Transparent full-height hit columns for mouse/touch */}
          {points.map((point, index) => {
            const colW = points.length <= 1 ? width - pad * 2 : (width - pad * 2) / (points.length - 1)
            const colX = points.length <= 1 ? pad : Math.max(0, x(index) - colW / 2)
            return (
              <rect
                key={`hit-${point.periodKey}`}
                x={colX}
                y={0}
                width={colW}
                height={height}
                fill="transparent"
                style={{ cursor: 'pointer' }}
                onMouseEnter={() => setHovered(index)}
                onClick={() => {
                  setSelected(prev => (prev === index ? null : index))
                  if (onActivatePoint) onActivatePoint(point)
                }}
              />
            )
          })}

          {/* Data point markers for active series */}
          {activeSeries.map(s => {
            return points.map((point, index) => {
              const val = point.series[s.key]
              if (val === null || val === undefined) return null

              const isActive = activeIndex === index
              const isLocked = selected === index

              return (
                <circle
                  key={`pt-${s.key}-${point.periodKey}`}
                  cx={x(index)}
                  cy={y(val)}
                  r={isLocked ? 6.5 : isActive ? 5.5 : 3.5}
                  fill="var(--card)"
                  stroke={catColor(s.colorIndex)}
                  strokeWidth={isLocked ? 3 : 2}
                  tabIndex={s === activeSeries[0] ? 0 : -1}
                  role="button"
                  aria-label={`${point.displayLabel}, ${s.label}: ${formatSeriesValue(val, s.unit)}`}
                  aria-pressed={isLocked}
                  onClick={() => setSelected(prev => (prev === index ? null : index))}
                  onFocus={() => setSelected(index)}
                  onKeyDown={event => handleKey(event, index)}
                  style={{ cursor: 'pointer', outlineOffset: 4 }}
                />
              )
            })
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
          <span>{points[0]?.displayLabel}</span>
          <span>{points.length > 1 ? points[points.length - 1]?.displayLabel : ''}</span>
        </div>
      </div>

      {/* Interactive Legend with Toggles (>= 44px touch targets) */}
      <div
        role="group"
        aria-label="Chart series legend, click to toggle series visibility"
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          gap: 8,
          marginTop: 'var(--sp-xs)',
        }}
      >
        {series.map(s => {
          const isVisible = !hiddenSeries.has(s.key)
          return (
            <button
              key={s.key}
              type="button"
              aria-pressed={isVisible}
              onClick={() => toggleSeries(s.key)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                minHeight: 44,
                padding: '0 14px',
                border: '1px solid var(--border)',
                borderRadius: 'var(--r-sm)',
                background: isVisible ? 'var(--card)' : 'var(--surface)',
                color: isVisible ? 'var(--text)' : 'var(--muted)',
                opacity: isVisible ? 1 : 0.6,
                cursor: 'pointer',
                fontSize: 'var(--t-meta)',
              }}
            >
              <span
                aria-hidden="true"
                style={{
                  width: 12,
                  height: 12,
                  borderRadius: '50%',
                  background: isVisible ? catColor(s.colorIndex) : 'var(--muted)',
                  display: 'inline-block',
                }}
              />
              <span style={{ textDecoration: isVisible ? 'none' : 'line-through' }}>{s.label}</span>
              {s.kind !== 'actual' && (
                <span
                  style={{
                    fontSize: '11px',
                    padding: '1px 5px',
                    borderRadius: 3,
                    background: 'var(--surface-2, #eceff1)',
                    color: 'var(--text2)',
                  }}
                >
                  {s.kind}
                </span>
              )}
            </button>
          )
        })}
      </div>

      {/* Accessible data table */}
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
          View accessible data table
        </summary>
        <div style={{ overflowX: 'auto', marginTop: 6, border: '1px solid var(--border)', borderRadius: 'var(--r-sm)' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: 'var(--t-meta)' }}>
            <thead>
              <tr style={{ background: 'var(--surface)', borderBottom: '1px solid var(--border)' }}>
                <th scope="col" style={{ padding: '8px 12px' }}>Period</th>
                {series.map(s => (
                  <th key={s.key} scope="col" style={{ padding: '8px 12px' }}>
                    {s.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {points.map(p => (
                <tr key={p.periodKey} style={{ borderBottom: '1px solid var(--border)' }}>
                  <th scope="row" style={{ padding: '8px 12px', fontWeight: 500 }}>
                    {p.displayLabel}
                  </th>
                  {series.map(s => (
                    <td
                      key={s.key}
                      style={{
                        padding: '8px 12px',
                        fontFamily: s.unit === 'paisa' ? 'var(--font-mono, monospace)' : undefined,
                      }}
                    >
                      {formatSeriesValue(p.series[s.key], s.unit)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>

      {/* Provenance note */}
      {context && <ChartSourceNote context={context} />}
    </div>
  )
}
