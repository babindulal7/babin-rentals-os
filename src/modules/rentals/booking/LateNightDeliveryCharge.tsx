import { useState } from 'react'
import { Button } from '../../../components/ui/Button'
import { Input } from '../../../components/ui'
import { getSetting } from '../../../lib/settingsStore'
import { newClientUuid } from '../../../lib/supabase'
import { rupees, type Paisa } from '../../../lib/money'
import type { Line } from './RentalLineItemsTree'

/*
 * RULING 2026-11-19 (O-28b follow-up, RULINGS-2026-11-19 S2 row 5): a late-night or emergency delivery
 * carries a flat extra charge. The amount is a Settings figure Babin types (Settings ▸ Financial); this
 * file invents none. One tap adds the line at that amount, shown in the booking before confirming. When
 * no amount is set (0 = not set) a small amount box asks for one, so a free late-night charge is never
 * assumed. The line is an ordinary Service line, so staff can edit it like any other.
 */

export const LATE_NIGHT_LINE_NAME = 'Late-night / emergency delivery'

export function hasLateNightLine(lines: readonly Line[]): boolean {
  return lines.some((l) => l.name === LATE_NIGHT_LINE_NAME && l.lineType === 'Service')
}

export function lateNightDeliveryLine(ratePaisa: Paisa): Line {
  return {
    id: newClientUuid(),
    lineType: 'Service',
    name: LATE_NIGHT_LINE_NAME,
    serial: '—',
    category: 'Service',
    ratePaisa,
    days: 1,
    daysOverridden: true,
    qty: 1,
    discountPct: 0,
    serviceBasis: 'Flat',
    location: 'Not inventory-tracked',
    committedTo: '—',
  }
}

/** The Settings amount in rupees, or 0 when none is set. */
export function configuredLateNightRupees(): number {
  const n = Number(getSetting('lateNightDeliveryRupees'))
  return Number.isFinite(n) && n > 0 ? n : 0
}

interface Props {
  lines: readonly Line[]
  setLines: React.Dispatch<React.SetStateAction<Line[]>>
}

export function LateNightDeliveryCharge({ lines, setLines }: Props) {
  const [asking, setAsking] = useState(false)
  const [amount, setAmount] = useState('')
  const [error, setError] = useState<string | null>(null)
  const added = hasLateNightLine(lines)

  const addAt = (rupeesAmount: number) => {
    setLines((prev) => (hasLateNightLine(prev) ? prev : [...prev, lateNightDeliveryLine(rupees(rupeesAmount) as Paisa)]))
    setAsking(false)
    setAmount('')
    setError(null)
  }

  const onTap = () => {
    const configured = configuredLateNightRupees()
    if (configured > 0) {
      addAt(configured)
      return
    }
    setAsking((prev) => !prev)
    setError(null)
  }

  const onConfirmAmount = () => {
    const n = Number(amount.trim())
    if (!amount.trim() || !Number.isFinite(n) || n <= 0) {
      setError('Enter the late-night charge in Rs, more than 0. Set a standing amount in Settings ▸ Financial.')
      return
    }
    addAt(n)
  }

  return (
    <>
      <Button
        icon="clock"
        variant="outline"
        size="sm"
        aria-expanded={asking}
        disabled={added}
        onClick={onTap}
      >
        {added ? 'Late-night added' : 'Add late-night delivery'}
      </Button>
      {asking && !added && (
        <span role="group" aria-label="Late-night delivery charge" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <Input
            type="number"
            min={0}
            autoFocus
            placeholder="Amount (Rs)"
            aria-label="Late-night delivery charge in Rupees"
            value={amount}
            onChange={(e) => {
              setAmount(e.target.value)
              if (error) setError(null)
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                onConfirmAmount()
              } else if (e.key === 'Escape') {
                e.preventDefault()
                setAsking(false)
                setAmount('')
                setError(null)
              }
            }}
            style={{ width: 130 }}
          />
          <Button size="sm" onClick={onConfirmAmount}>
            Add
          </Button>
          {error && (
            <span role="alert" style={{ fontSize: 'var(--t-meta)', color: 'var(--st-danger-fg)' }}>
              {error}
            </span>
          )}
        </span>
      )}
    </>
  )
}
