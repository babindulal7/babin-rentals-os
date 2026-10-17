import { useId } from 'react'
import type { SparklinePoint } from '../../../lib/analytics/contracts'

interface TrendSparklineProps {
  points: readonly (SparklinePoint | number)[]
  color?: string
  width?: number
  height?: number
  ariaLabel?: string
}

export function TrendSparkline({
  points,
  color = 'var(--cat-1)',
  width = 90,
  height = 24,
  ariaLabel,
}: TrendSparklineProps) {
  const id = useId()
  const rawValues = points.map((p) => (typeof p === 'number' ? p : p.value))
  if (rawValues.length < 2) return null

  const min = Math.min(...rawValues)
  const max = Math.max(...rawValues)
  const span = max - min || 1
  const pad = 2

  const d = rawValues
    .map((val, i) => {
      const x = (i / (rawValues.length - 1)) * width
      const y = height - pad - ((val - min) / span) * (height - pad * 2)
      return `${x.toFixed(1)},${y.toFixed(1)}`
    })
    .join(' ')

  const fillPath = `M0,${height} ${rawValues
    .map((val, i) => {
      const x = (i / (rawValues.length - 1)) * width
      const y = height - pad - ((val - min) / span) * (height - pad * 2)
      return `L${x.toFixed(1)},${y.toFixed(1)}`
    })
    .join(' ')} L${width},${height} Z`

  const first = rawValues[0] ?? 0
  const last = rawValues[rawValues.length - 1] ?? 0
  const trendDir = last > first ? 'upward' : last < first ? 'downward' : 'flat'

  return (
    <div style={{ position: 'relative', width, height, flexShrink: 0 }}>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        preserveAspectRatio="none"
        role="img"
        aria-label={ariaLabel ?? `Trend sparkline indicating ${trendDir} trajectory over ${rawValues.length} intervals`}
        style={{ width: '100%', height: '100%', display: 'block', overflow: 'visible' }}
      >
        <defs>
          <linearGradient id={`spark-fill-${id}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity={0.25} />
            <stop offset="100%" stopColor={color} stopOpacity={0.0} />
          </linearGradient>
        </defs>
        <path d={fillPath} fill={`url(#spark-fill-${id})`} aria-hidden />
        <polyline
          points={d}
          fill="none"
          stroke={color}
          strokeWidth={1.8}
          strokeLinecap="round"
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
        />
      </svg>
    </div>
  )
}
