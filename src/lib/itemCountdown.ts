export interface CountdownResult {
  isOverdue: boolean
  text: string
  diffMs: number
}

/**
 * Live due-back countdown for rented items (T2-14, W91).
 * Formats time remaining or overdue duration with exact minute/hour/day units.
 */
export function formatDueCountdown(
  returnAtIso: string | Date | null | undefined,
  now: Date = new Date(),
): CountdownResult {
  if (!returnAtIso) {
    return { isOverdue: false, text: 'No due date', diffMs: 0 }
  }

  const due = typeof returnAtIso === 'string' ? new Date(returnAtIso) : returnAtIso
  if (isNaN(due.getTime())) {
    return { isOverdue: false, text: 'Invalid date', diffMs: 0 }
  }

  const diffMs = due.getTime() - now.getTime()
  const isOverdue = diffMs < 0
  const absMs = Math.abs(diffMs)

  const minutes = Math.floor(absMs / 60_000)
  const hours = Math.floor(minutes / 60)
  const days = Math.floor(hours / 24)

  const remHours = hours % 24
  const remMinutes = minutes % 60

  let durationText = ''
  if (days > 0) {
    durationText = remHours > 0 ? `${days}d ${remHours}h` : `${days}d`
  } else if (hours > 0) {
    durationText = remMinutes > 0 ? `${hours}h ${remMinutes}m` : `${hours}h`
  } else {
    durationText = `${Math.max(1, remMinutes)}m`
  }

  if (isOverdue) {
    return {
      isOverdue: true,
      text: `Overdue by ${durationText}`,
      diffMs,
    }
  }

  return {
    isOverdue: false,
    text: `Due in ${durationText}`,
    diffMs,
  }
}

/**
 * Relative time summary for upcoming bookings.
 */
export function formatRelativeUpcoming(
  startDateIso: string | Date | null | undefined,
  now: Date = new Date(),
): string {
  if (!startDateIso) return ''
  const start = typeof startDateIso === 'string' ? new Date(startDateIso) : startDateIso
  if (isNaN(start.getTime())) return ''

  const diffMs = start.getTime() - now.getTime()
  if (diffMs <= 0) return 'Starts now'

  const minutes = Math.floor(diffMs / 60_000)
  const hours = Math.floor(minutes / 60)
  const days = Math.floor(hours / 24)

  if (days > 1) return `Starts in ${days} days`
  if (days === 1) return 'Starts tomorrow'
  if (hours > 0) return `Starts in ${hours}h`
  return `Starts in ${Math.max(1, minutes)}m`
}
