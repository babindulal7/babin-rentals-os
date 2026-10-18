import { useState, useMemo } from 'react'
import { PageHeader, cardStyle } from '../../components/ui/Page'
import { EmptyState } from '../../components/ui/StateViews'
import { Badge } from '../../components/ui/Badge'
import {
  AnalyticsKpiGrid,
  AnalyticsKpiCard,
  MultiSeriesTrend,
  AnalyticsRestrictedState,
} from '../../components/ui/analytics'
import { generateScenarioCurves } from '../../lib/analytics/scenarioModel'
import type { ChartPoint, ChartSeriesSpec, KpiViewModel, AnalyticsContext } from '../../lib/analytics/contracts'
import { formatMoney, rupees, type Paisa } from '../../lib/money'
import { businessDayAd } from '../../lib/bs'
import { useCanViewMoney } from '../../lib/moneyVisibility'

/*
 * RULING 2026-10-06 & Law 16:
 * Automated predictive forecasting shows NO figures until a validated ML model
 * exists. It never renders fabricated constants or seeded forecasts as actuals.
 *
 * Below the automated status, an isolated What-If Scenario Studio provides
 * mathematical compound growth simulation based on user-selected assumptions.
 * Every figure is explicitly tagged with provenance: 'scenario'.
 */
export default function ForecastingReports() {
  const canSeeMoney = useCanViewMoney()
  const currentYear = parseInt(businessDayAd().slice(0, 4), 10) || 2026

  // Scenario modeler interactive state
  const [baselineRupees, setBaselineRupees] = useState<number>(10000000) // Default Rs 1 Crore (10,000,000)
  const [growthPercent, setGrowthPercent] = useState<number>(15) // Default +15% annual growth
  const [horizonYears, setHorizonYears] = useState<number>(3) // Default 3 years horizon (1..5)

  // Derive conservative, target, and optimistic scenario curves
  const scenarioPoints = useMemo<ChartPoint[]>(() => {
    const baselinePaisa = rupees(baselineRupees)
    const conservativeRate = Math.max(-100, Math.round(growthPercent / 2))
    const optimisticRate = Math.min(300, Math.round(growthPercent * 1.5))

    const rawCurves = generateScenarioCurves(baselinePaisa, currentYear, horizonYears, {
      target: growthPercent,
      conservative: conservativeRate,
      optimistic: optimisticRate,
    })

    return rawCurves.map(pt => ({
      periodKey: String(pt.year),
      displayLabel: pt.year === currentYear ? `${pt.year} (Base)` : `${pt.year}`,
      series: {
        conservative: pt.values['conservative'] ?? null,
        target: pt.values['target'] ?? null,
        optimistic: pt.values['optimistic'] ?? null,
      },
    }))
  }, [baselineRupees, growthPercent, horizonYears, currentYear])

  const seriesSpecs: ChartSeriesSpec[] = useMemo(() => [
    {
      key: 'conservative',
      label: `Conservative (${Math.max(-100, Math.round(growthPercent / 2))}%)`,
      unit: 'paisa',
      colorIndex: 4, // neutral/amber
      kind: 'scenario',
    },
    {
      key: 'target',
      label: `Selected Assumption (${growthPercent > 0 ? '+' : ''}${growthPercent}%)`,
      unit: 'paisa',
      colorIndex: 0, // primary blue
      kind: 'scenario',
    },
    {
      key: 'optimistic',
      label: `Optimistic (${Math.min(300, Math.round(growthPercent * 1.5))}%)`,
      unit: 'paisa',
      colorIndex: 1, // secondary cyan/teal
      kind: 'scenario',
    },
  ], [growthPercent])

  // Summary KPIs for target scenario
  const kpiCards: KpiViewModel[] = useMemo(() => {
    const finalPoint = scenarioPoints[scenarioPoints.length - 1]
    const targetFinalPaisa = (finalPoint?.series['target'] ?? rupees(baselineRupees)) as Paisa
    const baselinePaisa = rupees(baselineRupees)

    let cumulativeProjectedPaisa = 0
    for (const pt of scenarioPoints) {
      cumulativeProjectedPaisa += pt.series['target'] ?? 0
    }

    const context: AnalyticsContext = {
      fromAd: `${currentYear}-01-01`,
      toAd: `${currentYear + horizonYears}-12-31`,
      dateBasis: 'calendar-day',
      provenance: 'scenario',
      sourceLabel: 'Compound annual growth simulation (what-if)',
    }

    return [
      {
        id: 'kpi-baseline-revenue',
        label: 'Baseline Annual Revenue',
        value: { kind: 'money', paisa: baselinePaisa, currency: 'NPR' },
        definition: 'Starting historical or budgeted annual revenue basis for simulation.',
        context,
        accent: 'neutral',
      },
      {
        id: 'kpi-projected-end',
        label: `Projected Year ${currentYear + horizonYears} Revenue`,
        value: { kind: 'money', paisa: targetFinalPaisa, currency: 'NPR' },
        previous: { kind: 'money', paisa: baselinePaisa, currency: 'NPR' },
        comparisonLabel: `vs ${currentYear} base`,
        definition: `Hypothetical revenue at year ${currentYear + horizonYears} under ${growthPercent}% compound annual growth.`,
        context,
        accent: 'primary',
      },
      {
        id: 'kpi-cumulative-projection',
        label: `${horizonYears}-Year Cumulative Projection`,
        value: { kind: 'money', paisa: cumulativeProjectedPaisa as Paisa, currency: 'NPR' },
        definition: `Sum of all projected revenue across the ${horizonYears}-year simulation window.`,
        context,
        accent: 'secondary',
      },
      {
        id: 'kpi-applied-cagr',
        label: 'Applied Annual Growth',
        value: { kind: 'percent', value: growthPercent },
        definition: 'Assumed compound annual growth rate applied in simulation (-20% to +50%).',
        context,
        accent: growthPercent >= 0 ? 'primary' : 'neutral',
      },
    ]
  }, [scenarioPoints, baselineRupees, growthPercent, horizonYears, currentYear])

  const scenarioContext: AnalyticsContext = {
    fromAd: `${currentYear}-01-01`,
    toAd: `${currentYear + horizonYears}-12-31`,
    dateBasis: 'calendar-day',
    provenance: 'scenario',
    sourceLabel: 'Mathematical compound projection (pure simulation)',
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-md)' }}>
      <PageHeader
        icon="activity"
        title="Forecasting & AI"
        description="Predictive intelligence models and what-if financial simulations."
      />

      {/* Official Automated Forecasting Status (Law 16) */}
      <section aria-label="Forecasting status" style={cardStyle}>
        <h3 style={{ margin: '0 0 8px', color: 'var(--text)' }}>Automated Predictive Forecasting</h3>
        <EmptyState
          kind="nothing-yet"
          title="Not computed yet"
          description="No validated machine-learning forecast model backs this report, so it shows no figures rather than invented ones."
        />
      </section>

      {/* Interactive What-If Scenario Studio */}
      {!canSeeMoney ? (
        <AnalyticsRestrictedState reason="Financial scenario simulation involves revenue modeling and is restricted to Owner, Admin, Manager, and Accounts." />
      ) : (
        <section aria-label="What-if scenario studio" style={{ ...cardStyle, padding: 'var(--sp-md)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10, marginBottom: 8 }}>
            <h3 style={{ margin: 0, color: 'var(--text)' }}>Interactive What-If Scenario Studio</h3>
            <Badge tone="neutral" label="Illustrative Scenario · What-If Simulation" />
          </div>

          <p style={{ color: 'var(--text2)', fontSize: 'var(--t-meta)', margin: '0 0 16px' }}>
            Simulate hypothetical multi-year revenue growth trajectories from an adjustable baseline. All projections
            are pure mathematical simulations for strategic exploration, never actual accounting records or commitments.
          </p>

          {/* Interactive Scenario Controls (Law 15: >= 44px touch targets) */}
          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: 16,
              alignItems: 'flex-end',
              padding: '14px',
              background: 'var(--surface)',
              borderRadius: 'var(--r-md)',
              border: '1px solid var(--border)',
              marginBottom: 20,
            }}
          >
            {/* Baseline revenue input */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, minWidth: 200, flex: '1 1 200px' }}>
              <label htmlFor="scenario-baseline" style={{ fontSize: 'var(--t-meta)', fontWeight: 600, color: 'var(--text)' }}>
                Baseline Annual Revenue (NPR)
              </label>
              <input
                id="scenario-baseline"
                type="number"
                min={100000}
                step={100000}
                value={baselineRupees}
                onChange={e => {
                  const val = parseInt(e.target.value, 10)
                  if (Number.isFinite(val) && val > 0) setBaselineRupees(val)
                }}
                style={{
                  minHeight: 44,
                  padding: '0 12px',
                  borderRadius: 'var(--r-sm)',
                  border: '1px solid var(--border)',
                  background: 'var(--card)',
                  color: 'var(--text)',
                  fontSize: 'var(--t-body)',
                  fontFamily: 'var(--font-mono, monospace)',
                }}
              />
              <span style={{ fontSize: '11px', color: 'var(--text2)' }}>
                Current basis: {formatMoney(rupees(baselineRupees))}
              </span>
            </div>

            {/* Growth rate slider & number input */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, minWidth: 200, flex: '1 1 200px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <label htmlFor="scenario-growth" style={{ fontSize: 'var(--t-meta)', fontWeight: 600, color: 'var(--text)' }}>
                  Assumed Annual Growth:
                </label>
                <strong style={{ color: 'var(--cat-1)', fontFamily: 'var(--font-mono, monospace)', fontSize: '14px' }}>
                  {growthPercent > 0 ? '+' : ''}{growthPercent}%
                </strong>
              </div>
              <input
                id="scenario-growth"
                type="range"
                min={-20}
                max={50}
                step={1}
                value={growthPercent}
                onChange={e => setGrowthPercent(parseInt(e.target.value, 10))}
                style={{ minHeight: 44, cursor: 'pointer', width: '100%' }}
              />
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: 'var(--text2)' }}>
                <span>-20% (Contraction)</span>
                <span>0% (Flat)</span>
                <span>+50% (Rapid)</span>
              </div>
            </div>

            {/* Horizon year selector buttons */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <span style={{ fontSize: 'var(--t-meta)', fontWeight: 600, color: 'var(--text)' }}>
                Projection Horizon
              </span>
              <div style={{ display: 'flex', gap: 6 }} role="group" aria-label="Select projection horizon in years">
                {[1, 2, 3, 4, 5].map(yrs => {
                  const isSelected = horizonYears === yrs
                  return (
                    <button
                      key={yrs}
                      type="button"
                      aria-pressed={isSelected}
                      onClick={() => setHorizonYears(yrs)}
                      style={{
                        minHeight: 44,
                        minWidth: 44,
                        padding: '0 12px',
                        borderRadius: 'var(--r-sm)',
                        border: isSelected ? '2px solid var(--cat-1)' : '1px solid var(--border)',
                        background: isSelected ? 'var(--card)' : 'var(--surface)',
                        color: isSelected ? 'var(--cat-1)' : 'var(--text)',
                        fontWeight: isSelected ? 700 : 500,
                        cursor: 'pointer',
                        fontSize: 'var(--t-meta)',
                      }}
                    >
                      {yrs} yr{yrs === 1 ? '' : 's'}
                    </button>
                  )
                })}
              </div>
            </div>
          </div>

          {/* Scenario KPI Summary Cards */}
          <div style={{ marginBottom: 20 }}>
            <AnalyticsKpiGrid>
              {kpiCards.map(model => (
                <AnalyticsKpiCard key={model.id} model={model} />
              ))}
            </AnalyticsKpiGrid>
          </div>

          {/* Multi-Series Scenario Comparison Chart */}
          <MultiSeriesTrend
            points={scenarioPoints}
            series={seriesSpecs}
            context={scenarioContext}
            title="Hypothetical Growth Trajectories"
          />
        </section>
      )}
    </div>
  )
}
