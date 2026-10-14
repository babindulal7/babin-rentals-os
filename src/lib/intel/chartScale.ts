import { grouped, type Paisa } from '../money'

/**
 * Axis arithmetic for the shared SVG chart kit — pure, so a chart's ticks can be
 * asserted without rendering it.
 *
 * Ticks are a reading aid, never a figure: a tick label may be compacted to
 * lakh/crore, but every exact value (tooltip, table, CSV) still goes through
 * `formatMoney`. Authoritative amounts stay integer paisa end to end.
 */

export interface ChartScale {
  min: number
  max: number
  /** Ascending, evenly spaced, always containing 0 when the data spans it. */
  ticks: number[]
}

/** 1 · 2 · 2.5 · 5 · 10 × 10ⁿ — the steps a reader can add up in their head. */
function niceStep(raw: number): number {
  const exponent = Math.floor(Math.log10(raw))
  const magnitude = 10 ** exponent
  const fraction = raw / magnitude
  const nice = fraction <= 1 ? 1 : fraction <= 2 ? 2 : fraction <= 2.5 ? 2.5 : fraction <= 5 ? 5 : 10
  return nice * magnitude
}

/**
 * A zero-based (or zero-spanning) linear scale over the finite values given.
 *
 * `null` is a missing value and is ignored — it is never read as zero. `minStep`
 * keeps money ticks on whole rupees (pass 100 for paisa) and count ticks on
 * whole numbers (pass 1).
 */
export function niceScale(
  values: ReadonlyArray<number | null>,
  opts: { minStep?: number; targetTicks?: number } = {},
): ChartScale {
  const minStep = opts.minStep ?? 0
  const target = Math.max(2, opts.targetTicks ?? 4)
  const finite = values.filter((v): v is number => v !== null && Number.isFinite(v))

  const lo = Math.min(0, ...finite)
  const hi = Math.max(0, ...finite)

  // Every value is zero (or there are none): one baseline, no invented spread.
  if (hi === lo) return { min: lo, max: lo + 1, ticks: [lo] }

  let step = niceStep((hi - lo) / target)
  if (step < minStep) step = minStep
  if (minStep >= 1) step = Math.round(step)

  const min = Math.floor(lo / step) * step
  const max = Math.ceil(hi / step) * step
  const ticks: number[] = []
  for (let i = 0; min + i * step <= max + step / 1e6; i += 1) {
    // Round away float dust (0.1 + 0.2) without changing an integer step.
    ticks.push(Math.round((min + i * step) * 1e6) / 1e6)
  }
  return { min, max, ticks }
}

/** "2.5", "12", "1.25" — at most two decimals, no trailing zeros. */
function short(n: number): string {
  return String(Math.round(n * 100) / 100)
}

/**
 * Axis label for a paisa amount: `Rs 45,000`, `Rs 2.5 L`, `Rs 1.6 Cr`.
 *
 * Labels only. Lakh and crore are the units this business reads in (Settings ▸
 * Number format), and an axis of `Rs 1,60,00,000` ticks crowds a 360px screen.
 */
export function compactMoneyLabel(p: Paisa | number): string {
  const sign = p < 0 ? '-' : ''
  const rupeesAbs = Math.abs(p) / 100
  if (rupeesAbs >= 1e7) return `${sign}Rs ${short(rupeesAbs / 1e7)} Cr`
  if (rupeesAbs >= 1e5) return `${sign}Rs ${short(rupeesAbs / 1e5)} L`
  return `${sign}Rs ${grouped(rupeesAbs)}`
}

/** Axis label for a count. Whole numbers, lakh-grouped. */
export function countLabel(n: number): string {
  return grouped(n)
}

/**
 * Which of `count` x-axis labels to print so they never overlap. Every data
 * point is still drawn and still selectable — only the printed labels thin out.
 * The first and last are always kept; a label adjacent to the last is dropped
 * rather than drawn over it.
 */
export function visibleLabelIndexes(count: number, plotWidth: number, minLabelWidth = 64): number[] {
  if (count <= 0) return []
  if (count === 1) return [0]
  const fit = Math.max(2, Math.floor(plotWidth / minLabelWidth))
  if (count <= fit) return Array.from({ length: count }, (_, i) => i)
  const step = Math.ceil((count - 1) / (fit - 1))
  const out: number[] = []
  for (let i = 0; i < count - 1; i += step) out.push(i)
  const last = count - 1
  const prev = out[out.length - 1] as number
  if (last - prev < step / 2 && out.length > 1) out.pop()
  out.push(last)
  return out
}
