import { formatMoney, type Paisa } from '../money'
import type { NumericValue } from './contracts'

/**
 * South Asian display formatting for compact analytics cards.
 *
 * NOTE: Compact notation (Cr/L) is for visual display ONLY.
 * Drilldowns, tooltips, accessible labels, and CSVs must ALWAYS
 * expose the full exact rupee/paisa amount.
 */
export function formatCompactRupees(paisa: Paisa): string {
  const isNegative = paisa < 0
  const absPaisa = Math.abs(paisa)
  const rupees = absPaisa / 100
  const sign = isNegative ? '-' : ''

  // 1 Crore = 10,000,000 rupees (10^7)
  if (rupees >= 10_000_000) {
    const cr = rupees / 10_000_000
    const formatted = cr >= 10 ? cr.toFixed(1) : cr.toFixed(2)
    return `${sign}Rs ${formatted.replace(/\.0+$/, '')} Cr`
  }

  // 1 Lakh = 100,000 rupees (10^5)
  if (rupees >= 100_000) {
    const l = rupees / 100_000
    const formatted = l >= 10 ? l.toFixed(1) : l.toFixed(2)
    return `${sign}Rs ${formatted.replace(/\.0+$/, '')} L`
  }

  // Standard integer rupee formatting for smaller amounts
  return formatMoney(paisa)
}

/** Formats a NumericValue into both a compact visual and an exact accessible label. */
export function formatNumericValue(val: NumericValue | null): {
  compact: string
  exact: string
} {
  if (val === null) {
    return { compact: '—', exact: 'Unavailable' }
  }

  switch (val.kind) {
    case 'money': {
      return {
        compact: formatCompactRupees(val.paisa),
        exact: formatMoney(val.paisa),
      }
    }
    case 'count': {
      const formatted = new Intl.NumberFormat('en-IN').format(val.value)
      return {
        compact: formatted,
        exact: formatted,
      }
    }
    case 'percent': {
      const formatted = `${val.value >= 0 ? '' : ''}${val.value.toFixed(1)}%`
      return {
        compact: formatted,
        exact: `${val.value.toFixed(2)}%`,
      }
    }
    case 'duration': {
      const formatted = `${val.value} ${val.unit}`
      return {
        compact: formatted,
        exact: formatted,
      }
    }
  }
}
