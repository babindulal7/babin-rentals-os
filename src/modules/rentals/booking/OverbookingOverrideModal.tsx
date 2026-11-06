import { useEffect, useState } from 'react'
import Icon from '../../../components/ui/Icon'
import { Modal } from '../../../components/ui/Modal'
import { Button } from '../../../components/ui/Button'
import type { EquipmentResult } from './itemCatalogue'

/**
 * redesign v1 §3 — the overbooking valve's override dialog. Only reachable
 * when Settings ▸ Financial ▸ Booking rules ▸ Allow overbooking is on
 * (`lib/bookingRules.ts`); a row or chip that cannot be added is otherwise
 * inert.
 *
 * ## ⛔ NR-11 — it asked for a reason and an approver, and threw both away
 *
 * This required a reason of at least 10 characters **and** a named approver
 * before the confirm button — then labelled "Book it anyway", now "Add it
 * anyway" — could be pressed. Neither field went anywhere:
 * `onOverbook(unit)` hands the caller the unit and nothing else, and
 * `AddItemPanel` adds it exactly as any other pick. The operator was made to
 * justify an override to a dialog that forgot the justification the moment it
 * closed.
 *
 * **Checked before removing them (option b of the two).** Nothing in this build
 * can carry an overbooking reason or approver:
 *
 * - `actions/rentals/createRental.ts` accepts `reason` / `approverId` on a
 *   **discount** (`CreateRentalDiscount`) and on nothing else; `CreateRentalLine`
 *   carries `lineNote` and no approval field of any kind;
 * - the word "overbook" appears in `supabase/migrations/**` only as the
 *   `fulfillment_status` enum member `'Overbooked'` (`0001_enums.sql`) and a
 *   TODO comment about it. That member belongs to `fulfillment_outcomes`
 *   (`0003_operations.sql:1509`), which is a real table recording a per-line
 *   shortage — but it has **no reason and no approver column**, it requires a
 *   `booking_id not null` (this screen is a draft with no booking row), and no
 *   code in `src/` reads or writes it: the only occurrences outside the
 *   migrations are in the generated `types/supabase.ts`;
 * - `lib/bookingRules.ts` is a `localStorage` flag, not a record.
 *
 * So the fields are gone rather than collected and dropped. Where an
 * overbooking override should be recorded — a `booking_lines` note, an audit
 * row, columns added to `fulfillment_outcomes`, or its own table with an
 * approver FK — is a schema question. TODO(decision), PLAN.md §4: nothing here
 * invents a column for it.
 *
 * ## What the override actually does, stated on the dialog
 *
 * It adds the unit. It does **not** clear the conflict: `confirmRental` plans
 * the assignment and throws `AssignmentIncompleteError` unless every line has
 * units free for the booking's window (`confirmRental.ts:435-436`), so Confirm
 * stays refused while nothing is free — by the database, not by this screen's
 * opinion. What it buys is a draft or quote that holds the item the client
 * asked for while the clash is sorted out, which is why it is not simply a
 * disabled row.
 *
 * Sub-rent is listed first and marked preferred, per the 27 Jul lock this spec
 * cites. It has nowhere to dispatch to, though: sub-renting attaches to a
 * *confirmed* booking (`BookingDetail.tsx`'s Create Sub-Rental), and this
 * screen is still a draft with no booking id. Rather than fabricate that
 * workflow for a row that does not exist yet, choosing it disables "Add it anyway" and
 * states the honest reason plainly instead.
 */

export interface OverbookingOverrideModalProps {
  isOpen: boolean
  onClose: () => void
  unit: EquipmentResult | null
  /**
   * §3 — Settings ▸ Financial ▸ Booking rules ▸ Allow overbooking.
   * When false (default), "Add it anyway" cannot be chosen and overbooking is blocked.
   */
  allowOverbooking?: boolean
  /** Fires for "Add it anyway" — the caller adds the unit as an internal pick with the clash listed. */
  onOverbook: (unit: EquipmentResult) => void
  /** Fires when sub-renting — adds the unit as a Sub-rental line to be cross-hired from partner. */
  onSubRent?: (unit: EquipmentResult) => void
}

export function OverbookingOverrideModal({
  isOpen,
  onClose,
  unit,
  allowOverbooking = false,
  onOverbook,
  onSubRent,
}: OverbookingOverrideModalProps) {
  const hasSubRent = typeof onSubRent === 'function'
  const hasOverbook = Boolean(allowOverbooking)

  // Default to Sub-rent (preferred) if supported; otherwise fallback to overbooking if allowed.
  const defaultChoice: 'sub-rent' | 'overbook' = hasSubRent ? 'sub-rent' : 'overbook'
  const [choice, setChoice] = useState<'sub-rent' | 'overbook'>(defaultChoice)

  useEffect(() => {
    if (isOpen) {
      if (hasSubRent) {
        setChoice('sub-rent')
      } else if (hasOverbook) {
        setChoice('overbook')
      } else {
        setChoice('sub-rent')
      }
    }
  }, [isOpen, hasSubRent, hasOverbook])

  const close = () => {
    setChoice(defaultChoice)
    onClose()
  }

  if (!unit) return null

  /* A serialised unit is named by its serial and has a status; a live product
     row has neither — it is a product, and what is known about it is the
     window verdict. Both are stated in the words the row itself carries. */
  const what = unit.serial !== '—' ? unit.serial : unit.name
  const why = unit.status ?? unit.availability.detail

  const isActionAllowed = choice === 'sub-rent' ? hasSubRent : hasOverbook

  const handleConfirm = () => {
    if (choice === 'sub-rent') {
      if (hasSubRent && onSubRent) {
        onSubRent(unit)
        close()
      }
      return
    }
    if (choice === 'overbook') {
      if (hasOverbook) {
        onOverbook(unit)
        close()
      }
      return
    }
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={close}
      size="sm"
      title={`${what} is not free for these dates`}
      subtitle={unit.committedTo !== '—' ? `${why} · ${unit.committedTo}` : why}
      footer={
        <>
          <Button variant="ghost" onClick={close}>Cancel</Button>
          <Button
            variant="primary"
            disabled={!isActionAllowed}
            onClick={handleConfirm}
          >
            {choice === 'sub-rent' ? 'Add as Sub-Rental' : 'Add it anyway'}
          </Button>
        </>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-md)' }}>
        <label
          htmlFor="overbooking-subrent"
          style={{
            display: 'flex',
            gap: 'var(--sp-sm)',
            alignItems: 'flex-start',
            cursor: hasSubRent ? 'pointer' : 'not-allowed',
            opacity: hasSubRent ? 1 : 0.6,
          }}
        >
          <input
            id="overbooking-subrent"
            type="radio"
            name="overbooking-choice"
            value="sub-rent"
            checked={choice === 'sub-rent'}
            disabled={!hasSubRent}
            onChange={() => setChoice('sub-rent')}
            style={{ marginTop: 3 }}
            aria-label="Sub-rent this item instead"
          />
          <span>
            <span style={{ display: 'block', fontSize: 'var(--t-meta)', fontWeight: 600, color: 'var(--text)' }}>
              Sub-rent this item instead
            </span>
            <span
              style={{
                display: 'block',
                fontSize: 'var(--t-th)',
                color: hasSubRent ? 'var(--link)' : 'var(--muted)',
                fontWeight: 700,
                textTransform: 'uppercase',
                letterSpacing: '0.03em',
              }}
            >
              {hasSubRent ? 'Preferred' : 'Not available'}
            </span>
          </span>
        </label>
        <label
          htmlFor="overbooking-overbook"
          style={{
            display: 'flex',
            gap: 'var(--sp-sm)',
            alignItems: 'flex-start',
            cursor: hasOverbook ? 'pointer' : 'not-allowed',
            opacity: hasOverbook ? 1 : 0.6,
          }}
        >
          <input
            id="overbooking-overbook"
            type="radio"
            name="overbooking-choice"
            value="overbook"
            checked={choice === 'overbook'}
            disabled={!hasOverbook}
            onChange={() => setChoice('overbook')}
            style={{ marginTop: 3 }}
            aria-label={
              hasOverbook
                ? 'Add it to this booking anyway'
                : 'Add it to this booking anyway (Disabled: overbooking is turned off in Settings)'
            }
          />
          <span>
            <span style={{ display: 'block', fontSize: 'var(--t-meta)', fontWeight: 600, color: 'var(--text)' }}>
              Add it to this booking anyway
            </span>
            {!hasOverbook && (
              <span style={{ display: 'block', fontSize: 'var(--t-caption)', color: 'var(--muted)' }}>
                Disabled in Settings ▸ Financial ▸ Booking rules
              </span>
            )}
          </span>
        </label>

        {choice === 'sub-rent' ? (
          hasSubRent ? (
            <p style={{ margin: 0, display: 'flex', gap: 7, alignItems: 'flex-start', fontSize: 'var(--t-meta)', color: 'var(--text2)', lineHeight: 1.45 }}>
              <Icon name="info" size={13} style={{ flexShrink: 0, marginTop: 2, color: 'var(--muted)' }} />
              The equipment is added to this booking as a <strong>Sub-Rental</strong> line. It will be cross-hired
              from an external partner/supplier, bypassing the internal inventory conflict for these dates.
            </p>
          ) : (
            <p style={{ margin: 0, display: 'flex', gap: 7, alignItems: 'flex-start', fontSize: 'var(--t-meta)', color: 'var(--text2)', lineHeight: 1.45 }}>
              <Icon name="info" size={13} style={{ flexShrink: 0, marginTop: 2, color: 'var(--muted)' }} />
              Sub-rental is not supported for this selection.
            </p>
          )
        ) : (
          hasOverbook ? (
            <p style={{ margin: 0, display: 'flex', gap: 7, alignItems: 'flex-start', fontSize: 'var(--t-meta)', color: 'var(--text2)', lineHeight: 1.45 }}>
              <Icon name="alert_triangle" size={13} style={{ flexShrink: 0, marginTop: 2, color: 'var(--warn-text)' }} />
              <span>
                The item goes onto this booking and the clash stays listed. <strong>Confirm remains blocked</strong>
                {' '}until a unit is free for these dates — reserving is enforced by the database, not by this screen —
                so use this to hold the item on a draft or quote while the clash is resolved.
              </span>
            </p>
          ) : (
            <p style={{ margin: 0, display: 'flex', gap: 7, alignItems: 'flex-start', fontSize: 'var(--t-meta)', color: 'var(--st-danger-fg)', lineHeight: 1.45 }}>
              <Icon name="alert_triangle" size={13} style={{ flexShrink: 0, marginTop: 2, color: 'var(--st-danger-fg)' }} />
              <span>
                Overbooking is disabled in Settings. To allow drafting conflicted equipment, turn on
                {' '}<strong>Allow overbooking</strong> under Settings ▸ Financial ▸ Booking rules.
              </span>
            </p>
          )
        )}
      </div>
    </Modal>
  )
}
