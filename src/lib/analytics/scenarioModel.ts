export interface ScenarioInput {
  baselineAnnualNpr: number
  baseYear: number
  targetYear: number
  growthPercent: number
}

export interface ScenarioPoint {
  year: number
  displayLabel: string
  values: Record<string, number>
}

/**
 * Pure what-if scenario calculator.
 * Strictly computes hypothetical growth projections without altering production financial records.
 */
export function scenarioRevenueNpr(input: ScenarioInput): number {
  const { baselineAnnualNpr, baseYear, targetYear, growthPercent } = input
  if (!Number.isFinite(baselineAnnualNpr) || baselineAnnualNpr < 0) {
    throw new Error('Invalid baseline')
  }
  if (
    !Number.isInteger(baseYear) ||
    !Number.isInteger(targetYear) ||
    targetYear < baseYear ||
    targetYear - baseYear > 5
  ) {
    throw new Error('Invalid scenario period')
  }
  if (!Number.isFinite(growthPercent) || growthPercent < -100 || growthPercent > 300) {
    throw new Error('Growth assumption is outside allowed range')
  }
  const value = baselineAnnualNpr * (1 + growthPercent / 100) ** (targetYear - baseYear)
  if (!Number.isFinite(value) || !Number.isSafeInteger(Math.round(value))) {
    throw new Error('Scenario result exceeds safe display range')
  }
  return Math.round(value)
}

/**
 * Generates multi-year comparative curves for 1 to 5 years horizon.
 */
export function generateScenarioCurves(
  baselineAnnualNpr: number,
  baseYear: number,
  horizonYears: number,
  growthRates: Record<string, number>, // e.g. { "Conservative (10%)": 10, "Base (20%)": 20, "Accelerated (30%)": 30 }
): ScenarioPoint[] {
  const points: ScenarioPoint[] = []

  for (let offset = 0; offset <= horizonYears; offset++) {
    const year = baseYear + offset
    const values: Record<string, number> = {}

    for (const [scenarioKey, growthRate] of Object.entries(growthRates)) {
      values[scenarioKey] = scenarioRevenueNpr({
        baselineAnnualNpr,
        baseYear,
        targetYear: year,
        growthPercent: growthRate,
      })
    }

    points.push({
      year,
      displayLabel: String(year),
      values,
    })
  }

  return points
}
