import React, { useState } from 'react'
import Modal from '../../../components/ui/Modal'
import Button from '../../../components/ui/Button'
import Badge from '../../../components/ui/Badge'
import Icon from '../../../components/ui/Icon'
import type { LineEvaluationResult, FreeDateWindow } from '../../../lib/availabilityEvaluation'
import type { RentalWindow } from '../../../lib/availability'

export interface BookingConflictModalProps {
  isOpen: boolean
  onClose: () => void
  bookingNo?: string
  rentalWindow?: RentalWindow
  conflicts: readonly LineEvaluationResult[]
  onKeepDraft: () => void
  onReassignUnit?: (lineId: string, unitId: string) => void
  onSelectSubstitute?: (lineId: string, productId: string) => void
  onAdjustDates?: (window: FreeDateWindow) => void
  onRemoveItem?: (lineId: string) => void
  onSubRent?: (lineId: string) => void
}

export const BookingConflictModal: React.FC<BookingConflictModalProps> = ({
  isOpen,
  onClose,
  bookingNo,
  rentalWindow,
  conflicts,
  onKeepDraft,
  onReassignUnit,
  onSelectSubstitute,
  onAdjustDates,
  onRemoveItem,
  onSubRent,
}) => {
  const [expandedLineId, setExpandedLineId] = useState<string | null>(
    conflicts.length > 0 ? (conflicts[0]?.lineId ?? null) : null,
  )

  const conflictCount = conflicts.length
  const subtitle =
    conflictCount === 1
      ? '1 item is unavailable during this rental.'
      : `${conflictCount} items are unavailable during this rental.`

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Booking conflict"
      size="lg"
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-md, 1rem)' }}>
        {/* Subtitle / notice header */}
        <div
          style={{
            padding: 'var(--space-md, 1rem)',
            borderRadius: 'var(--radius-md, 8px)',
            backgroundColor: 'var(--danger-soft, rgba(239, 68, 68, 0.1))',
            border: '1px solid var(--danger, #ef4444)',
            color: 'var(--text-primary, inherit)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: 600 }}>
            <Icon name="alert-triangle" size={18} />
            <span>{subtitle}</span>
          </div>
          <p style={{ margin: '0.25rem 0 0 0', fontSize: '0.875rem', opacity: 0.9 }}>
            Booking cannot be confirmed until resolved. Draft remains safely preserved.
          </p>
        </div>

        {/* Conflicting line items list */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          {conflicts.map((item) => {
            const isExpanded = expandedLineId === item.lineId
            return (
              <div
                key={item.lineId}
                style={{
                  border: '1px solid var(--border-subtle, #e5e7eb)',
                  borderRadius: 'var(--radius-md, 8px)',
                  padding: 'var(--space-md, 1rem)',
                  backgroundColor: 'var(--surface-raised, #ffffff)',
                }}
              >
                {/* Header row */}
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    cursor: 'pointer',
                    userSelect: 'none',
                  }}
                  onClick={() => setExpandedLineId(isExpanded ? null : item.lineId)}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                    <Badge variant="danger">{item.status === 'hold_conflict' ? 'Hold Conflict' : 'Unavailable'}</Badge>
                    <span style={{ fontWeight: 600, fontSize: '1rem' }}>{item.productName}</span>
                    <span style={{ fontSize: '0.875rem', color: 'var(--text-muted, #6b7280)' }}>
                      (requested {item.requestedQty}, available {item.availableQty})
                    </span>
                  </div>
                  <Button variant="ghost" size="sm" type="button">
                    {isExpanded ? 'Hide solutions' : 'Resolve'}
                  </Button>
                </div>

                {/* Conflict Details */}
                <div style={{ marginTop: '0.5rem', fontSize: '0.875rem', color: 'var(--text-secondary, #4b5563)' }}>
                  <div>
                    <strong>Reason:</strong> {item.conflictingReason ?? 'Capacity conflict'}
                  </div>
                  {item.unavailablePeriod && (
                    <div style={{ marginTop: '0.25rem' }}>
                      <strong>Unavailable period:</strong> {item.unavailablePeriod.fromAd.slice(0, 10)} →{' '}
                      {item.unavailablePeriod.toAd.slice(0, 10)}
                    </div>
                  )}
                </div>

                {/* Expanded Solutions Drawer */}
                {isExpanded && (
                  <div
                    style={{
                      marginTop: '1rem',
                      paddingTop: '1rem',
                      borderTop: '1px solid var(--border-subtle, #e5e7eb)',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '0.75rem',
                    }}
                  >
                    <div style={{ fontWeight: 600, fontSize: '0.875rem', color: 'var(--text-primary, inherit)' }}>
                      Suggested solutions:
                    </div>

                    {/* Solution 1: Assign another same-model unit */}
                    {item.suggestedSolutions.alternativeUnits && item.suggestedSolutions.alternativeUnits.length > 0 && (
                      <div
                        style={{
                          padding: '0.75rem',
                          borderRadius: 'var(--radius-sm, 6px)',
                          backgroundColor: 'var(--surface-sunken, #f9fafb)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                        }}
                      >
                        <div>
                          <div style={{ fontWeight: 500, fontSize: '0.875rem' }}>
                            1. Assign another same-model unit
                          </div>
                          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted, #6b7280)' }}>
                            {item.suggestedSolutions.alternativeUnits.length} alternate unit(s) available for entire period.
                          </div>
                        </div>
                        <div style={{ display: 'flex', gap: '0.5rem' }}>
                          {item.suggestedSolutions.alternativeUnits.slice(0, 2).map((alt) => (
                            <Button
                              key={alt.unitId}
                              size="sm"
                              variant="secondary"
                              onClick={() => onReassignUnit?.(item.lineId, alt.unitId)}
                            >
                              Assign {alt.assetTag}
                            </Button>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Solution 2: Offer compatible replacement */}
                    {item.suggestedSolutions.compatibleSubstitutes &&
                      item.suggestedSolutions.compatibleSubstitutes.length > 0 && (
                        <div
                          style={{
                            padding: '0.75rem',
                            borderRadius: 'var(--radius-sm, 6px)',
                            backgroundColor: 'var(--surface-sunken, #f9fafb)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                          }}
                        >
                          <div>
                            <div style={{ fontWeight: 500, fontSize: '0.875rem' }}>
                              2. Offer approved compatible replacement
                            </div>
                            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted, #6b7280)' }}>
                              Requires client confirmation of substitute model.
                            </div>
                          </div>
                          <div style={{ display: 'flex', gap: '0.5rem' }}>
                            {item.suggestedSolutions.compatibleSubstitutes.slice(0, 2).map((sub) => (
                              <Button
                                key={sub.productId}
                                size="sm"
                                variant="secondary"
                                onClick={() => onSelectSubstitute?.(item.lineId, sub.productId)}
                              >
                                Substitute {sub.name}
                              </Button>
                            ))}
                          </div>
                        </div>
                      )}

                    {/* Solution 3: Change quantity / remove item */}
                    <div
                      style={{
                        padding: '0.75rem',
                        borderRadius: 'var(--radius-sm, 6px)',
                        backgroundColor: 'var(--surface-sunken, #f9fafb)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                      }}
                    >
                      <div>
                        <div style={{ fontWeight: 500, fontSize: '0.875rem' }}>
                          3. Remove item or revise quantity
                        </div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted, #6b7280)' }}>
                          Remove conflicting line from draft; quote recalculates.
                        </div>
                      </div>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => onRemoveItem?.(item.lineId)}
                      >
                        Remove Line
                      </Button>
                    </div>

                    {/* Solution 4: Arrange sub-rental */}
                    <div
                      style={{
                        padding: '0.75rem',
                        borderRadius: 'var(--radius-sm, 6px)',
                        backgroundColor: 'var(--surface-sunken, #f9fafb)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                      }}
                    >
                      <div>
                        <div style={{ fontWeight: 500, fontSize: '0.875rem' }}>
                          4. Arrange partner sub-rental
                        </div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted, #6b7280)' }}>
                          Mark as pending external confirmation until partner commits.
                        </div>
                      </div>
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => onSubRent?.(item.lineId)}
                      >
                        Request Sub-Rent
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>

        {/* Modal actions footer */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            paddingTop: 'var(--space-md, 1rem)',
            borderTop: '1px solid var(--border-subtle, #e5e7eb)',
          }}
        >
          <div style={{ fontSize: '0.8125rem', color: 'var(--text-muted, #6b7280)' }}>
            {bookingNo ? `Booking ${bookingNo}` : 'Rental draft'}
          </div>
          <div style={{ display: 'flex', gap: '0.75rem' }}>
            <Button variant="secondary" onClick={onClose}>
              View conflict
            </Button>
            <Button
              variant="primary"
              onClick={() => {
                onKeepDraft()
                onClose()
              }}
            >
              Keep as draft
            </Button>
          </div>
        </div>
      </div>
    </Modal>
  )
}

export default BookingConflictModal
