import React, { useState } from 'react'
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from 'recharts'
import { LoadingSkeleton } from '../StateViews'
import Icon from '../Icon'
import { ReportEmpty } from './ReportEmpty'

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
  payload?: Array<{ payload?: ReportChartPoint }> | undefined
  metricLabel: string
  onClose?: (() => void) | undefined
}

function AccessibleTooltip({ active, payload, metricLabel, onClose }: CustomTooltipProps) {
  if (!active || !payload || payload.length === 0) return null
  const point = payload[0]?.payload
  if (!point) return null

  return (
    <div className="babin-report-tooltip" role="status" aria-live="polite">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
        <div className="babin-report-tooltip__title">{point.periodLabel}</div>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            aria-label="Close tooltip"
            style={{
              background: 'transparent',
              border: 'none',
              color: 'var(--muted)',
              cursor: 'pointer',
              padding: 2,
              minHeight: 24,
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
  const [selectedPoint, setSelectedPoint] = useState<ReportChartPoint | null>(null)

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
          {metricLabel}
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
        <div style={{ width: '100%', height }} aria-label={ariaLabel}>
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart
              data={data}
              margin={{ top: 10, right: 10, left: -10, bottom: 0 }}
              onClick={(state) => {
                const point = (state as { activePayload?: Array<{ payload?: ReportChartPoint }> } | null)?.activePayload?.[0]?.payload
                if (point) setSelectedPoint(point)
              }}
            >
              <defs>
                <linearGradient id="reportChartGradient" x1="0" y1="0" x2="0" y2="1">
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
                axisLine={false}
                tickLine={false}
                tick={{ fill: 'var(--chart-text, #64748b)', fontSize: 11 }}
                tickFormatter={(val) => {
                  if (val >= 10000000) return `${Math.round(val / 10000000)}Cr`
                  if (val >= 100000) return `${Math.round(val / 100000)}L`
                  if (val >= 1000) return `${Math.round(val / 1000)}k`
                  return String(val)
                }}
              />

              <Tooltip
                content={
                  <AccessibleTooltip
                    metricLabel={metricLabel}
                    onClose={() => setSelectedPoint(null)}
                  />
                }
              />

              <Area
                type="monotone"
                dataKey="value"
                stroke={strokeColor}
                strokeWidth={2}
                fillOpacity={1}
                fill="url(#reportChartGradient)"
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  )
}
