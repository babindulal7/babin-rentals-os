import { formatMoney, roundHalfUp, type Paisa } from '../money'

/** Axis values use the same integer-paisa contract as the table and CSV.
 * When unit === 'paisa', values are converted from integer paisa to rupees
 * and formatted with concise Lakh (L) / Crore (Cr) / thousand (k) labels.
 */
export function formatReportAxisValue(value: number, unit: 'count' | 'paisa'): string {
  if (!Number.isFinite(value)) return '—'
  if (unit === 'paisa') {
    const paisa = roundHalfUp(value)
    const rupees = roundHalfUp(paisa / 100)
    const absRupees = Math.abs(rupees)
    const sign = rupees < 0 ? '-' : ''
    if (absRupees >= 10_000_000) {
      const cr = (absRupees / 10_000_000).toFixed(1).replace(/\.0$/, '')
      return `${sign}Rs ${cr}Cr`
    }
    if (absRupees >= 100_000) {
      const lk = (absRupees / 100_000).toFixed(1).replace(/\.0$/, '')
      return `${sign}Rs ${lk}L`
    }
    if (absRupees >= 1_000) {
      const k = (absRupees / 1_000).toFixed(1).replace(/\.0$/, '')
      return `${sign}Rs ${k}k`
    }
    return formatMoney(paisa as Paisa)
  }
  return String(roundHalfUp(value))
}

/** Immediately preceding inclusive AD date window with exactly the same day count. */
export function precedingReportWindow(fromAd: string, toAd: string): { fromAd: string; toAd: string } {
  const from = new Date(`${fromAd}T00:00:00Z`).getTime()
  const to = new Date(`${toAd}T00:00:00Z`).getTime()
  if (!Number.isFinite(from) || !Number.isFinite(to) || to < from || new Date(from).toISOString().slice(0, 10) !== fromAd || new Date(to).toISOString().slice(0, 10) !== toAd) throw new Error('Invalid comparison window')
  const day = 86_400_000
  return {
    fromAd: new Date(from - (to - from + day)).toISOString().slice(0, 10),
    toAd: new Date(from - day).toISOString().slice(0, 10),
  }
}

export function averageReportAmount(total: Paisa, count: number): Paisa {
  return (count > 0 ? roundHalfUp(total / count) : 0) as Paisa
}

/** A void/credit population must keep reconciliation visible even without issued sales. */
export function hasRevenueActivity(report: { issuedCount: number; creditReconciliation: { voidedInvoiceCount: number; creditNoteCount: number; paidVoidMismatchCount: number; activeInvoiceCreditNoteCount: number } }): boolean {
  const credits = report.creditReconciliation
  return report.issuedCount > 0 || credits.voidedInvoiceCount > 0 || credits.creditNoteCount > 0 || credits.paidVoidMismatchCount > 0 || credits.activeInvoiceCreditNoteCount > 0
}

export function reportMoneyChange(current: Paisa, previous: Paisa): { value: string; isPositive: boolean; isNeutral: boolean } {
  const difference = current - previous
  if (!Number.isSafeInteger(difference)) throw new Error('Comparison exceeds safe integer paisa')
  return { value: `${difference > 0 ? '+' : ''}${formatMoney(difference as Paisa)}`, isPositive: difference > 0, isNeutral: difference === 0 }
}
