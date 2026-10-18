import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent, type RefObject } from 'react'
import { catColor } from '../Charts'
import { niceScale, visibleLabelIndexes } from '../../../lib/intel/chartScale'

/**
 * # InteractiveTrendChart — the shared time-series chart
 *
 * Plain SVG on the `Charts.tsx` token rules (fixed `--cat-1…8` order, one axis,
 * text in text tokens, never colour alone), plus the interaction the static
 * kit lacks:
 *
 *  · **Readable without hovering** — a labelled value axis, thinned period
 *    labels, and a legend that names each series AND its data status in words.
 *  · **Mouse** — hover shows one vertical guide and a tooltip with every
 *    series' exact value for that period. Click freezes it.
 *  · **Touch** — tap freezes a period; tap another to move; tap it again, tap
 *    outside, or press Clear to dismiss. Hover is ignored for touch.
 *  · **Keyboard** — the chart is one tab stop. ←/→ move between periods,
 *    Home/End jump, Esc clears, Enter/Space activate only when the page passes
 *    a real destination (`onActivate`). The selected period is announced.
 *  · **Narrow screens** (< 560px of chart) — no floating tooltip that could
 *    leave the viewport; the selected period's values print below the chart.
 *
 * Status is drawn as well as written: Actual = solid, Illustrative / Estimated
 * = dashed. A second actual series (a comparison) is told apart by its square
 * markers and thinner line, not by hue alone. `null` is a gap in the line —
 * missing is never drawn as zero. No animation, so reduced-motion holds.
 */

export type SeriesStatus = 'actual' | 'illustrative' | 'estimated' | 'partial'

export const SERIES_STATUS_LABEL: Record<SeriesStatus, string> = {
  actual: 'Actual',
  illustrative: 'Illustrative',
  estimated: 'Estimated',
  partial: 'Partial data',
}

export interface TrendSeries {
  key: string
  label: string
  status: SeriesStatus
  /** Aligned with `points`. `null` = no value for that period (a gap, not zero). */
  values: ReadonlyArray<number | null>
  /** Palette slot, 0-based into `--cat-1…8`. Defaults to the series' position. */
  slot?: number
  marker?: 'circle' | 'square'
}

export interface TrendPoint {
  key: string
  /** Short axis text, e.g. "Oct 2026". */
  axisLabel: string
  /** Full text for the tooltip / readout, e.g. "1–14 October 2026 (month to date)". */
  longLabel: string
}

export interface InteractiveTrendChartProps {
  /** Accessible name, e.g. "Billed revenue by month". */
  title: string
  points: readonly TrendPoint[]
  series: readonly TrendSeries[]
  /** Exact value text for tooltip, readout and table. */
  formatValue: (v: number) => string
  /** Compact axis tick text. */
  formatTick: (v: number) => string
  /** Smallest tick step: 100 for paisa (whole rupees), 1 for counts. */
  minStep?: number
  height?: number
  /** An extra line for a period, e.g. the change against the comparison. */
  describePoint?: (index: number) => string | null
  /** Only pass when a real, filter-preserving destination exists. */
  onActivate?: (index: number) => void
  /** Show the built-in values table. Off when the page renders its own. */
  showTable?: boolean
}

const MARGIN = { top: 12, right: 14, bottom: 30 }
const NARROW = 560
const FALLBACK_WIDTH = 640
const CHAR_PX = 7

function dashFor(status: SeriesStatus): string | undefined {
  return status === 'illustrative' || status === 'estimated' ? '7 5' : undefined
}

/** `mounted` re-arms the measurement when the measured element first appears (a chart that mounted empty). */
function useWidth(mounted: boolean): [RefObject<HTMLDivElement>, number] {
  const ref = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(FALLBACK_WIDTH)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const measure = (w: number) => {
      if (w > 0) setWidth(Math.round(w))
    }
    measure(el.getBoundingClientRect().width)
    if (typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0]
      if (entry) measure(entry.contentRect.width)
    })
    observer.observe(el)
    return () => observer.disconnect()
  }, [mounted])
  return [ref, width]
}

function Marker({ shape, x, y, size, color }: { shape: 'circle' | 'square'; x: number; y: number; size: number; color: string }) {
  return shape === 'square' ? (
    <rect x={x - size} y={y - size} width={size * 2} height={size * 2} fill="var(--card)" stroke={color} strokeWidth={2} />
  ) : (
    <circle cx={x} cy={y} r={size} fill="var(--card)" stroke={color} strokeWidth={2} />
  )
}

function SeriesKey({ s, index }: { s: TrendSeries; index: number }) {
  const color = catColor(s.slot ?? index)
  return (
    <svg width={30} height={12} aria-hidden style={{ flexShrink: 0 }}>
      <line x1={1} x2={29} y1={6} y2={6} stroke={color} strokeWidth={s.marker === 'square' ? 2 : 2.5} strokeDasharray={dashFor(s.status)} />
      <Marker shape={s.marker ?? 'circle'} x={15} y={6} size={3} color={color} />
    </svg>
  )
}

export function InteractiveTrendChart({
  title,
  points,
  series,
  formatValue,
  formatTick,
  minStep = 0,
  height = 240,
  describePoint,
  onActivate,
  showTable = true,
}: InteractiveTrendChartProps) {
  const n = points.length
  const [wrapRef, width] = useWidth(n > 0)
  const rootRef = useRef<HTMLDivElement>(null)
  const [hover, setHover] = useState<number | null>(null)
  const [selected, setSelected] = useState<number | null>(null)
  const descId = useId()
  const narrow = width < NARROW

  // A stale index from a previous data set must not survive a period change.
  // Keyed on the period keys, not the array, so a re-render does not clear it.
  const pointsKey = points.map((p) => p.key).join('|')
  useEffect(() => {
    setHover(null)
    setSelected(null)
  }, [pointsKey])

  // A tap or click outside the whole chart (legend, plot, readout, table)
  // dismisses a frozen selection. `click`, not `pointerdown`: a scroll that
  // starts anywhere on the page fires no click, so scrolling keeps it.
  useEffect(() => {
    if (selected === null) return
    const onClick = (e: MouseEvent) => {
      if (rootRef.current && e.target instanceof Node && !rootRef.current.contains(e.target)) setSelected(null)
    }
    document.addEventListener('click', onClick)
    return () => document.removeEventListener('click', onClick)
  }, [selected])

  const scale = useMemo(() => niceScale(series.flatMap((s) => [...s.values]), { minStep }), [series, minStep])
  const tickText = scale.ticks.map(formatTick)
  const left = Math.max(44, Math.max(...tickText.map((t) => t.length)) * CHAR_PX + 12)
  const plotW = Math.max(40, width - left - MARGIN.right)
  const plotH = height - MARGIN.top - MARGIN.bottom
  const span = scale.max - scale.min || 1
  const x = (i: number) => (n <= 1 ? left + plotW / 2 : left + (i * plotW) / (n - 1))
  const y = (v: number) => MARGIN.top + plotH * (1 - (v - scale.min) / span)
  const colW = n <= 1 ? plotW : plotW / (n - 1)
  const showMarkers = n <= 1 || colW >= 12
  // Dense charts still draw a marker every ~14px, so each series keeps its
  // shape (circle / square) and two series never differ by colour alone.
  const markerStride = showMarkers ? 1 : Math.ceil(14 / colW)
  const markerAt = (i: number) => i === active || i % markerStride === 0 || i === n - 1
  const labelIdx = new Set(visibleLabelIndexes(n, plotW))
  const active = selected ?? hover

  const linePath = (values: ReadonlyArray<number | null>) => {
    let d = ''
    let pen = false
    values.forEach((v, i) => {
      if (v === null || !Number.isFinite(v)) {
        pen = false
        return
      }
      d += `${pen ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)} `
      pen = true
    })
    return d.trim()
  }

  const valueLines = (i: number) =>
    series.map((s) => {
      const v = s.values[i]
      return { s, text: v === null || v === undefined ? 'No value' : formatValue(v) }
    })

  const detailText = (i: number) => {
    const p = points[i]
    if (!p) return ''
    const parts = valueLines(i).map(({ s, text }) => `${s.label} (${SERIES_STATUS_LABEL[s.status]}): ${text}`)
    const extra = describePoint?.(i)
    return `${p.longLabel}. ${parts.join('. ')}${extra ? `. ${extra}` : ''}.`
  }

  const move = (next: number) => setSelected(Math.max(0, Math.min(n - 1, next)))

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (n === 0) return
    switch (e.key) {
      case 'ArrowRight':
        e.preventDefault()
        move(selected === null ? 0 : selected + 1)
        break
      case 'ArrowLeft':
        e.preventDefault()
        move(selected === null ? n - 1 : selected - 1)
        break
      case 'Home':
        e.preventDefault()
        move(0)
        break
      case 'End':
        e.preventDefault()
        move(n - 1)
        break
      case 'Escape':
        if (selected !== null || hover !== null) {
          e.preventDefault()
          setSelected(null)
          setHover(null)
        }
        break
      case 'Enter':
      case ' ':
        if (onActivate && selected !== null) {
          e.preventDefault()
          onActivate(selected)
        }
        break
      default:
    }
  }

  if (n === 0) {
    return <p style={{ margin: 0, fontSize: 'var(--t-meta)', color: 'var(--text2)' }}>No periods to show.</p>
  }

  // Beside the guide, on the side with more room — never centred on it, where it
  // would cover the very markers it describes. Capped to that room so it wraps
  // rather than running off the chart.
  const tipAlign = active !== null && x(active) > width / 2 ? 'end' : 'start'
  const tipRoom = active === null ? 0 : Math.max(160, Math.floor(tipAlign === 'end' ? x(active) - 16 : width - x(active) - 16))

  const clearSelection = () => {
    setSelected(null)
    // The Clear button unmounts with the selection; keep keyboard focus on the chart.
    wrapRef.current?.focus()
  }

  const stepButton = {
    minHeight: 44,
    minWidth: 44,
    padding: '0 12px',
    border: '1px solid var(--border)',
    borderRadius: 'var(--r-btn, var(--r-sm))',
    background: 'var(--card)',
    color: 'var(--text)',
    fontSize: 'var(--t-meta)',
    cursor: 'pointer',
  } as const

  return (
    <div ref={rootRef} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-sm)', minWidth: 0 }}>
      <ul aria-label="Series" style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexWrap: 'wrap', gap: '6px 18px' }}>
        {series.map((s, i) => (
          <li key={s.key} style={{ display: 'inline-flex', alignItems: 'center', gap: 7, fontSize: 'var(--t-meta)', color: 'var(--text2)' }}>
            <SeriesKey s={s} index={i} />
            <span style={{ color: 'var(--text)' }}>{s.label}</span>
            <span>· {SERIES_STATUS_LABEL[s.status]}</span>
          </li>
        ))}
      </ul>

      <div
        ref={wrapRef}
        tabIndex={0}
        role="group"
        aria-roledescription="interactive chart"
        aria-label={`${title}. ${n} ${n === 1 ? 'period' : 'periods'}. Use the left and right arrow keys to read each period.`}
        aria-describedby={descId}
        onKeyDown={onKeyDown}
        onPointerLeave={() => setHover(null)}
        style={{ position: 'relative', width: '100%', minWidth: 0, borderRadius: 'var(--r-sm)' }}
      >
        <svg width={width} height={height} aria-hidden style={{ display: 'block', maxWidth: '100%', overflow: 'visible' }}>
          {scale.ticks.map((t, i) => (
            <g key={t}>
              <line
                x1={left}
                x2={left + plotW}
                y1={y(t)}
                y2={y(t)}
                stroke={t === 0 ? 'var(--border-strong, var(--chart-grid))' : 'var(--chart-grid)'}
                strokeWidth={1}
              />
              <text x={left - 8} y={y(t)} dy="0.32em" textAnchor="end" className="figure" style={{ fontSize: 'var(--t-micro, 11px)', fill: 'var(--muted)' }}>
                {tickText[i]}
              </text>
            </g>
          ))}

          {points.map((p, i) =>
            labelIdx.has(i) ? (
              <text
                key={p.key}
                x={x(i)}
                y={height - 8}
                textAnchor={n > 1 && i === 0 ? 'start' : n > 1 && i === n - 1 ? 'end' : 'middle'}
                style={{ fontSize: 'var(--t-micro, 11px)', fill: 'var(--muted)' }}
              >
                {p.axisLabel}
              </text>
            ) : null,
          )}

          {active !== null && (
            <line x1={x(active)} x2={x(active)} y1={MARGIN.top} y2={MARGIN.top + plotH} stroke="var(--text2)" strokeWidth={1} strokeDasharray="3 4" />
          )}

          {series.map((s, si) => {
            const color = catColor(s.slot ?? si)
            const thin = s.marker === 'square'
            return (
              <g key={s.key}>
                <path
                  d={linePath(s.values)}
                  fill="none"
                  stroke={color}
                  strokeWidth={thin ? 2 : 2.75}
                  strokeDasharray={dashFor(s.status)}
                  strokeLinejoin="round"
                  strokeLinecap="round"
                />
                {s.values.map((v, i) =>
                  v === null || !markerAt(i) ? null : (
                    <Marker key={i} shape={s.marker ?? 'circle'} x={x(i)} y={y(v)} size={i === active ? 5 : 3.25} color={color} />
                  ),
                )}
              </g>
            )
          })}

          {points.map((p, i) => {
            const lo = i === 0 ? left : (x(i - 1) + x(i)) / 2
            const hi = i === n - 1 ? left + plotW : (x(i) + x(i + 1)) / 2
            return (
              <rect
                key={p.key}
                data-point={i}
                x={n <= 1 ? left : lo}
                y={MARGIN.top}
                width={n <= 1 ? plotW : Math.max(1, hi - lo)}
                height={plotH}
                fill="transparent"
                style={{ cursor: 'pointer' }}
                onPointerMove={(e: PointerEvent<SVGRectElement>) => {
                  if (e.pointerType === 'mouse' && hover !== i) setHover(i)
                }}
                onClick={() => setSelected((cur) => (cur === i ? null : i))}
              />
            )
          })}
        </svg>

        {!narrow && active !== null && points[active] && (
          <div
            aria-hidden
            data-testid="trend-tooltip"
            style={{
              position: 'absolute',
              top: 0,
              left: x(active),
              transform: tipAlign === 'start' ? 'translateX(8px)' : 'translateX(calc(-100% - 8px))',
              maxWidth: tipRoom,
              pointerEvents: 'none',
              background: 'var(--dropdown)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--r-sm)',
              boxShadow: 'var(--shadow-modal)',
              padding: '8px 10px',
              fontSize: 'var(--t-meta)',
              color: 'var(--text)',
              width: 'max-content',
              zIndex: 5,
            }}
          >
            <div style={{ fontWeight: 700, marginBottom: 4 }}>{points[active].longLabel}</div>
            {valueLines(active).map(({ s, text }, si) => (
              <div key={s.key} style={{ display: 'flex', alignItems: 'center', gap: 7, whiteSpace: 'nowrap' }}>
                <SeriesKey s={s} index={si} />
                <span style={{ color: 'var(--text2)' }}>{s.label}</span>
                <span className="figure" style={{ marginLeft: 'auto', fontWeight: 600 }}>
                  {text}
                </span>
              </div>
            ))}
            {describePoint?.(active) && <div style={{ marginTop: 4, color: 'var(--text2)' }}>{describePoint(active)}</div>}
          </div>
        )}
      </div>

      <div
        id={descId}
        aria-live="polite"
        style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 'var(--sp-sm)', minHeight: 44, fontSize: 'var(--t-meta)', color: 'var(--text2)' }}
      >
        {selected === null ? (
          <span>{narrow ? 'Tap a point to see its exact values.' : 'Hover, tap or use the arrow keys to read each period.'}</span>
        ) : (
          <span className={narrow ? undefined : 'sr-only'} data-testid="trend-readout" style={{ color: 'var(--text)' }}>
            {detailText(selected)}
          </span>
        )}
        {selected !== null && (
          <div style={{ display: 'flex', gap: 'var(--sp-xs, 6px)', marginLeft: narrow ? 0 : 'auto' }}>
            {/* Precise stepping where a finger cannot hit an 8px column. */}
            <button type="button" className="tap" aria-label="Previous period" disabled={selected === 0} onClick={() => move(selected - 1)} style={stepButton}>
              ‹ Previous
            </button>
            <button type="button" className="tap" aria-label="Next period" disabled={selected === n - 1} onClick={() => move(selected + 1)} style={stepButton}>
              Next ›
            </button>
            <button type="button" className="tap" onClick={clearSelection} style={stepButton}>
              Clear selection
            </button>
          </div>
        )}
      </div>

      {showTable && (
        <details>
          <summary style={{ cursor: 'pointer', minHeight: 44, display: 'flex', alignItems: 'center', fontSize: 'var(--t-meta)', color: 'var(--text2)' }}>
            Show values as a table
          </summary>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 'var(--t-meta)' }}>
              <caption className="sr-only">{title}</caption>
              <thead>
                <tr>
                  <th scope="col" style={{ textAlign: 'left', padding: '8px 10px', borderBottom: '1px solid var(--border)', color: 'var(--text2)' }}>
                    Period
                  </th>
                  {series.map((s) => (
                    <th key={s.key} scope="col" style={{ textAlign: 'right', padding: '8px 10px', borderBottom: '1px solid var(--border)', color: 'var(--text2)' }}>
                      {s.label} ({SERIES_STATUS_LABEL[s.status]})
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {points.map((p, i) => (
                  <tr key={p.key}>
                    <th scope="row" style={{ textAlign: 'left', padding: '8px 10px', borderBottom: '1px solid var(--border)', fontWeight: 500, color: 'var(--text)' }}>
                      {p.longLabel}
                    </th>
                    {valueLines(i).map(({ s, text }) => (
                      <td key={s.key} className="figure" style={{ textAlign: 'right', padding: '8px 10px', borderBottom: '1px solid var(--border)', color: 'var(--text)' }}>
                        {text}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      )}
    </div>
  )
}
