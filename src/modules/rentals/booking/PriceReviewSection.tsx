import type { Dispatch, SetStateAction } from 'react'
import { formatMoney, rupees } from '../../../lib/money'
import { requiresDeskPriceReview, type BookingChangeLine } from '../../../lib/queries/changeBooking'
import { inputStyle } from './BookingFormWidgets'

export type PriceReviews = Record<string, { amount: string; confirmed: boolean }>

/** Explicit review for totals that cannot be reconstructed from the saved terms. */
export function PriceReviewSection({ lines, reviews, setReviews, activeLineIds }: {
  lines: readonly BookingChangeLine[]
  activeLineIds?: readonly string[]
  reviews: PriceReviews
  setReviews: Dispatch<SetStateAction<PriceReviews>>
}) {
  const protectedLines = lines.filter(requiresDeskPriceReview)
  if (protectedLines.length === 0) return null
  return (
    <section className="new-rental-price-review" aria-labelledby="price-review-heading">
      <h2 id="price-review-heading">Review custom prices</h2>
      <p>When changing items or dates, review each affected custom price and enter its new total.</p>
      {protectedLines.map((line) => {
        const removed = activeLineIds != null && !activeLineIds.includes(line.id)
        const review = reviews[line.id] ?? { amount: removed ? '0' : '', confirmed: false }
        const amountId = `reviewed-price-${line.id}`
        return (
          <div key={line.id} className="new-rental-price-review__line">
            <strong>{line.name || line.description || 'Item'}</strong>
            {line.line_total != null && <span>Previous total: {formatMoney(rupees(line.line_total))}</span>}
            {removed && <span>Removed item: new total Rs 0</span>}
            {!removed && <><label htmlFor={amountId}>New total (Rs)</label>
            <input id={amountId} type="text" inputMode="decimal" value={review.amount} style={{ ...inputStyle, minHeight: 44 }}
              onChange={(event) => {
                const amount = event.target.value
                setReviews((previous) => {
                  const next = { ...previous }
                  if (!amount.trim()) delete next[line.id]
                  else next[line.id] = { amount, confirmed: false }
                  return next
                })
              }} /></>}
            <label className="new-rental-price-review__confirm">
              <input type="checkbox" checked={review.confirmed} disabled={!removed && !review.amount.trim()}
                onChange={(event) => setReviews((previous) => ({ ...previous,
                  [line.id]: { amount: removed ? '0' : review.amount, confirmed: event.target.checked } }))} />
              I reviewed this new total
            </label>
          </div>
        )
      })}
    </section>
  )
}
