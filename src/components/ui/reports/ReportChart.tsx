import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react'
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  type MouseHandlerDataParam,
} from 'recharts'
import { LoadingSkeleton } from '../StateViews'
import Icon from '../Icon'
import { ReportEmpty } from './ReportEmpty'
import { formatReportAxisValue } from '../../../lib/intel/reportPresentation'

export interface ReportChartPoint {
  periodKey: string // Unique identifier / date (e.g. 2026-07-01)
  periodLabel: string // Formatted label (e.g. 'Jul 2026')
  value: number // Raw numeric value (integer paisa or count)
  formattedValue: string // Formatted representation (e.g. Rs 1,50,000)
  secondaryValue?: number | undefined
  secondaryFormatted?: string | undefined
  subText?: string | undefined
  [key: string]: unknown
}

export interface ReportChartProps {
  data: ReportChartPoint[]
  ariaLabel: string
  metricLabel: string
  currency?: string | undefined
  valueUnit?: 'count' | 'paisa' | undefined
  loading?: boolean | undefined
  error?: string | null | undefined
  empty?: boolean | undefined
  emptyMessage?: string | undefined
  height?: number | undefined
  showTableDefault?: boolean | undefined
  strokeColor?: string | undefined
  fillColor?: string | undefined
}

interface CustomTooltipProps {
  active?: boolean | undefined
  point: ReportChartPoint | null
  metricLabel: string
  onClose?: (() => void) | undefined
}

function AccessibleTooltip({ active, point, metricLabel, onClose }: CustomTooltipProps) {
  if (!active || !point) return null

  return (
    <div className="babin-report-tooltip" role="status" aria-live="polite">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
        <div className="babin-report-tooltip__title">{point.periodLabel}</div>
        {onClose && (
          <button
            type="button"
            onClick={event => { event.stopPropagation(); onClose() }}
            aria-label="Close tooltip"
            style={{
              background: 'transparent',
              border: 'none',
              color: 'var(--muted)',
              cursor: 'pointer',
              padding: 2,
              minHeight: 44,
              minWidth: 44,
            }}
          >
            <Icon name="close" size={12} />
          </button>
        )}
      </div>

      <div className="babin-report-tooltip__item">
        <span style={{ color: 'var(--muted)' }}>{metricLabel}:</span>
        <span className="babin-report-tooltip__value">{point.formattedValue}</span>
      </div>

      {point.secondaryFormatted && (
        <div className="babin-report-tooltip__item" style={{ marginTop: 2 }}>
          <span style={{ color: 'var(--muted)' }}>Prior:</span>
          <span className="babin-report-tooltip__value">{point.secondaryFormatted}</span>
        </div>
      )}

      {point.subText && (
        <div style={{ marginTop: 4, fontSize: 11, color: 'var(--text2)' }}>
          {point.subText}
        </div>
      )}
    </div>
  )
}

export function ReportAreaChart({
  data,
  ariaLabel,
  metricLabel,
  currency,
  valueUnit = 'count',
  loading = false,
  error = null,
  empty = false,
  emptyMessage = 'No data points recorded for this period.',
  height = 280,
  showTableDefault = false,
  strokeColor = 'var(--chart-1, #0284c7)',
  fillColor = 'var(--chart-1, #0284c7)',
}: ReportChartProps) {
  const [viewTable, setViewTable] = useState(showTableDefault)
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null)
  const dismissedIndex = useRef<number | null>(null)
  const chartRef = useRef<HTMLDivElement>(null)
  const selectedPoint = selectedIndex === null ? null : data[selectedIndex] ?? null
  const gradientId = `report-chart-${useId().replace(/:/g, '')}`
  useEffect(() => { setSelectedIndex(null); dismissedIndex.current = null }, [data])

  function selectPoint(state: MouseHandlerDataParam, explicit: boolean) {
    const rawIndex = state.activeTooltipIndex ?? state.activeIndex
    if (rawIndex === undefined || rawIndex === null) return
    const index = Number(rawIndex)
    if (!Number.isInteger(index) || !data[index]) return
    if (explicit) dismissedIndex.current = null
    if (dismissedIndex.current !== index) setSelectedIndex(index)
  }
  function dismissTooltip() {
    dismissedIndex.current = selectedIndex
    setSelectedIndex(null)
    chartRef.current?.focus({ preventScroll: true })
  }
  function navigatePoint(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === 'Escape') { event.preventDefault(); dismissTooltip(); return }
    if (event.target !== event.currentTarget) return
    let index = selectedIndex ?? 0
    if (event.key === 'ArrowRight') index = selectedIndex === null ? 0 : Math.min(data.length - 1, index + 1)
    else if (event.key === 'ArrowLeft') index = selectedIndex === null ? data.length - 1 : Math.max(0, index - 1)
    else if (event.key === 'Home') index = 0
    else if (event.key === 'End') index = data.length - 1
    else return
    event.preventDefault()
    dismissedIndex.current = null
    setSelectedIndex(index)
  }

  if (loading) {
    return (
      <div style={{ height, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <LoadingSkeleton />
      </div>
    )
  }

  if (error) {
    return (
      <ReportEmpty
        title="Failed to load chart"
        description={error}
        icon="alert_triangle"
        sourceMissing={true}
      />
    )
  }

  if (empty || data.length === 0) {
    return (
      <ReportEmpty
        title="No chart data"
        description={emptyMessage}
        icon="chart"
      />
    )
  }

  return (
    <div className="babin-report-chart-wrapper" style={{ width: '100%', position: 'relative' }}>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 10,
          flexWrap: 'wrap',
          gap: 8,
        }}
      >
        <span
          style={{
            fontSize: 'var(--t-meta, 12px)',
            color: 'var(--muted, #64748b)',
            fontWeight: 600,
          }}
        >
          {metricLabel}{currency ? ` · ${currency}` : ''}
        </span>

        <button
          type="button"
          onClick={() => setViewTable((v) => !v)}
          aria-pressed={viewTable}
          aria-label={viewTable ? 'Switch to interactive chart' : 'View report data as table'}
          style={{
            minHeight: 'var(--tap, 44px)',
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            background: 'transparent',
            border: 'none',
            color: 'var(--link, #0284c7)',
            fontSize: 'var(--t-meta, 12px)',
            fontWeight: 600,
            cursor: 'pointer',
            padding: '4px 8px',
          }}
        >
          <Icon name={viewTable ? 'chart' : 'checklist'} size={14} />
          {viewTable ? 'View as chart' : 'View as table'}
        </button>
      </div>

      {/* Screen Reader ARIA Live status region */}
      <div
        role="status"
        aria-live="polite"
        style={{
          position: 'absolute',
          width: 1,
          height: 1,
          padding: 0,
          margin: -1,
          overflow: 'hidden',
          clip: 'rect(0, 0, 0, 0)',
          whiteSpace: 'nowrap',
          border: 0,
        }}
      >
        {selectedPoint
          ? `Selected ${selectedPoint.periodLabel}: ${selectedPoint.formattedValue}${selectedPoint.subText ? `, ${selectedPoint.subText}` : ''}`
          : `${data.length} periods plotted for ${metricLabel}`}
      </div>

      {viewTable ? (
        <div style={{ overflowX: 'auto', maxHeight: height + 60 }}>
          <table
            style={{
              width: '100%',
              borderCollapse: 'collapse',
              fontSize: 'var(--t-meta, 12px)',
            }}
          >
            <thead>
              <tr style={{ background: 'var(--card2)', borderBottom: '1px solid var(--border)' }}>
                <th style={{ textAlign: 'left', padding: '8px 12px', fontWeight: 600 }}>Period</th>
                <th style={{ textAlign: 'right', padding: '8px 12px', fontWeight: 600 }}>{metricLabel}</th>
                {data.some((d) => d.subText) && (
                  <th style={{ textAlign: 'left', padding: '8px 12px', fontWeight: 600 }}>Details</th>
                )}
              </tr>
            </thead>
            <tbody>
              {data.map((d) => (
                <tr key={d.periodKey} style={{ borderBottom: '1px solid var(--border)' }}>
                  <td style={{ padding: '8px 12px' }}>{d.periodLabel}</td>
                  <td
                    style={{
                      padding: '8px 12px',
                      textAlign: 'right',
                      fontFamily: 'JetBrains Mono Variable, monospace',
                      fontWeight: 600,
                    }}
                  >
                    {d.formattedValue}
                  </td>
                  {data.some((item) => item.subText) && (
                    <td style={{ padding: '8px 12px', color: 'var(--text2)' }}>{d.subText || '—'}</td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div ref={chartRef} style={{ width: '100%', height }} aria-label={`${ariaLabel}. Use Left and Right arrows to select a period; Escape closes its tooltip.`} role="group" tabIndex={0} onKeyDown={navigatePoint}>
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart
              data={data}
              margin={{ top: 10, right: 10, left: -10, bottom: 0 }}
              accessibilityLayer={false}
              onClick={(state, event) => { if (!(event.target instanceof Element && event.target.closest('.babin-report-tooltip'))) selectPoint(state, true) }}
              onMouseMove={(state, event) => { if (!(event.target instanceof Element && event.target.closest('.babin-report-tooltip'))) selectPoint(state, false) }}
            >
              <defs>
                <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={fillColor} stopOpacity={0.25} />
                  <stop offset="95%" stopColor={fillColor} stopOpacity={0.0} />
                </linearGradient>
              </defs>

              <CartesianGrid
                strokeDasharray="3 3"
                vertical={false}
                stroke="var(--chart-grid, #e2e8f0)"
              />

              <XAxis
                dataKey="periodLabel"
                axisLine={false}
                tickLine={false}
                tick={{ fill: 'var(--chart-text, #64748b)', fontSize: 11 }}
                dy={6}
              />

              <YAxis
                width={valueUnit === 'paisa' ? 100 : 48}
                axisLine={false}
                tickLine={false}
                tick={{ fill: 'var(--chart-text, #64748b)', fontSize: 11 }}
                tickFormatter={(val: number) => formatReportAxisValue(val, valueUnit)}
              />

              <Tooltip
                active={selectedPoint !== null}
                {...(selectedIndex !== null ? { defaultIndex: selectedIndex } : {})}
                wrapperStyle={{ pointerEvents: 'auto', maxWidth: '100%' }}
                content={
                  <AccessibleTooltip
                    active={selectedPoint !== null}
                    point={selectedPoint}
                    metricLabel={metricLabel}
                    onClose={dismissTooltip}
                  />
                }
              />

              <Area
                type="monotone"
                dataKey="value"
                stroke={strokeColor}
                strokeWidth={2}
                fillOpacity={1}
                fill={`url(#${gradientId})`}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  )
}
