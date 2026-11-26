import type { Bar } from '../data/calendar'

export interface ResourceConflict { start: string; end: string; ids: string[]; labels: string[] }

/** Pure sweep over exact half-open intervals. End-at-start turnover never overlaps. */
export function resourceConflicts(bars: readonly Bar[], capacity = 1): ResourceConflict[] {
  const active = bars.filter(bar => !['Completed', 'Draft', 'Quote', 'Conflict'].includes(bar.kind)).map(bar => ({
    bar,
    start: Date.parse(bar.intervalStart ?? bar.from.toISOString()),
    end: Date.parse(bar.intervalEnd ?? bar.to.toISOString()),
    quantity: bar.quantity ?? 1,
  })).filter(row => Number.isFinite(row.start) && Number.isFinite(row.end) && row.start < row.end)
  const points = [...new Set(active.flatMap(row => [row.start, row.end]))].sort((a, b) => a - b)
  const conflicts: ResourceConflict[] = []
  for (let i = 0; i < points.length - 1; i++) {
    const start = points[i]
    const end = points[i + 1]
    if (start === undefined || end === undefined) continue
    const rows = active.filter(row => row.start <= start && start < row.end)
    if (rows.reduce((sum, row) => sum + row.quantity, 0) <= capacity) continue
    conflicts.push({ start: new Date(start).toISOString(), end: new Date(end).toISOString(),
      ids: rows.map(row => row.bar.id), labels: rows.map(row => row.bar.label) })
  }
  return conflicts
}

/** Preserve duration and Kathmandu wall-clock times by shifting whole days. */
export function shiftedRentalWindow(pickup: string, returned: string, days: number): { pickupAt: string; returnAt: string } {
  const from = Date.parse(pickup), to = Date.parse(returned)
  if (!Number.isFinite(from) || !Number.isFinite(to) || from >= to || !Number.isSafeInteger(days)) {
    throw new Error('Reload the rental before adjusting its dates.')
  }
  return { pickupAt: new Date(from + days * 86400000).toISOString(), returnAt: new Date(to + days * 86400000).toISOString() }
}
