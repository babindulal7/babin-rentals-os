import type { Paisa } from '../money'

export type Provenance = 'actual' | 'derived' | 'scenario'

export type DataState = 'ready' | 'loading' | 'empty' | 'error' | 'stale' | 'restricted'

export type NumericValue =
  | { kind: 'money'; paisa: Paisa; currency: 'NPR' }
  | { kind: 'count'; value: number }
  | { kind: 'percent'; value: number }
  | { kind: 'duration'; value: number; unit: 'days' | 'hours' }

export interface AnalyticsContext {
  fromAd: string // YYYY-MM-DD
  toAd: string // YYYY-MM-DD
  dateBasis: 'invoice-issue-month' | 'payment-date' | 'business-day' | 'calendar-day' | 'booking-period'
  currency?: 'NPR'
  provenance: Provenance
  sourceLabel: string // e.g. "Issued nonvoid invoices"
  generatedAtIso?: string
  incompleteReason?: string
}

export interface SparklinePoint {
  readonly period: string
  readonly value: number
}

export interface KpiViewModel {
  id: string
  label: string
  value: NumericValue | null // null = unknown/unavailable, never automatic zero
  previous?: NumericValue | null
  comparisonLabel?: string // e.g. "vs previous 30 days"
  definition: string // exact denominator, time basis, and exclusions
  context: AnalyticsContext
  href?: string // valid, permission-checked drilldown only
  trend?: readonly SparklinePoint[]
  accent?: 'primary' | 'secondary' | 'neutral'
}

export interface ChartPoint {
  periodKey: string // AD ISO YYYY-MM-DD or YYYY-MM; ordered
  displayLabel: string
  series: Readonly<Record<string, number | null>>
}

export interface ChartSeriesSpec {
  key: string
  label: string
  unit: 'paisa' | 'count' | 'percent' | 'days'
  colorIndex: number // stable slot 0..7 in CAT; clamped at 7
  kind: Provenance
}

export type Delta =
  | { kind: 'unavailable'; reason: string }
  | { kind: 'new'; current: number }
  | { kind: 'changed'; absolute: number; percentage: number; isGood?: boolean }
