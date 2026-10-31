import React, { useState } from 'react'
import { Modal } from '../../../components/ui/Modal'
import { Button } from '../../../components/ui/Button'
import { Badge } from '../../../components/ui/Badge'
import Icon from '../../../components/ui/Icon'
import type { LineEvaluationResult, FreeDateWindow } from '../../../lib/availabilityEvaluation'
import type { RentalWindow } from '../../../lib/availability'

export interface BookingConflictModalProps {
  isOpen: boolean
  onClose: () => void
  bookingNo?: string | undefined
  rentalWindow?: RentalWindow | undefined
  conflicts: readonly LineEvaluationResult[]
  onKeepDraft: () => void
  onReassignUnit?: ((lineId: string, unitId: string) => void) | undefined
  onSelectSubstitute?: ((lineId: string, productId: string) => void) | undefined
  onAdjustDates?: ((window: FreeDateWindow) => void) | undefined
  onRemoveItem?: ((lineId: string) => void) | undefined
  onSubRent?: ((lineId: string) => void) | undefined
}

export const BookingConflictModal: React.FC<BookingConflictModalProps> = ({
  isOpen,
  onClose,
  bookingNo: _bookingNo,
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
            <Icon name="alert_triangle" size={18} />
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
                    <Badge tone="danger" label={item.status === 'hold_conflict' ? 'Hold Conflict' : 'Unavailable'} />
                    <span style={{ fontWeight: 600, fontSize: '1rem' }}>{item.productName}</span>
                    <span style={{ fontSize: '0.875rem', color: 'var(--text-muted, #6b7280)' }}>
                      requested {item.requestedQty}, available {item.availableQty}
                    </span>
                  </div>
                  <Icon name={isExpanded ? 'chevron_up' : 'chevron_down'} size={18} />
                </div>

                {/* Conflict Details and Solutions */}
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
                    {/* Time & Conflict Reason */}
                    <div
                      style={{
                        fontSize: '0.875rem',
                        lineHeight: 1.5,
                        backgroundColor: 'var(--surface-subtle, #f3f4f6)',
                        padding: '0.75rem',
                        borderRadius: 'var(--radius-sm, 6px)',
                      }}
                    >
                      {rentalWindow && (
                        <div>
                          <strong>Requested:</strong> {rentalWindow.fromAd.slice(0, 16).replace('T', ' ')} → {rentalWindow.toAd.slice(0, 16).replace('T', ' ')}
                        </div>
                      )}
                      {item.unavailablePeriod && (
                        <div>
                          <strong>Unavailable:</strong> {item.unavailablePeriod.fromAd.slice(0, 16).replace('T', ' ')} →{' '}
                          {item.unavailablePeriod.toAd.slice(0, 16).replace('T', ' ')}
                        </div>
                      )}
                      <div>
                        <strong>Reason:</strong>{' '}
                        {item.conflictingReason ?? (item.conflictingBookingNo ? `Reserved by ${item.conflictingBookingNo}` : 'Physical unit capacity exceeded')}
                      </div>
                    </div>

                    {/* Solutions Heading */}
                    <div style={{ fontWeight: 600, fontSize: '0.875rem', marginTop: '0.25rem' }}>
                      Suggested Solutions (Select one):
                    </div>

                    {/* Solution 1: Assign another same-model unit */}
                    {item.suggestedSolutions.alternativeUnits &&
                      item.suggestedSolutions.alternativeUnits.length > 0 && (
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

                    {/* Solution 3: Change dates */}
                    {item.suggestedSolutions.freeDateWindows && item.suggestedSolutions.freeDateWindows.length > 0 && (
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
                            3. Adjust dates to open window
                          </div>
                          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted, #6b7280)' }}>
                            Genuinely free dates available for this stock.
                          </div>
                        </div>
                        <div style={{ display: 'flex', gap: '0.5rem' }}>
                          {item.suggestedSolutions.freeDateWindows.slice(0, 2).map((w, idx) => (
                            <Button
                              key={idx}
                              size="sm"
                              variant="secondary"
                              onClick={() => onAdjustDates?.(w)}
                            >
                              Shift to {w.fromIso.slice(5, 10)}
                            </Button>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Solution 4: Change quantity / remove item */}
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
                          4. Remove item or revise quantity
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

                    {/* Solution 5: Arrange sub-rental */}
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
                          5. Arrange external sub-rental
                        </div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted, #6b7280)' }}>
                          Secure stock from external partner.
                        </div>
                      </div>
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => onSubRent?.(item.lineId)}
                      >
                        Source Sub-rental
                      </Button>
                    </div>

                    {/* Solution 6: Keep draft and contact customer */}
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
                          6. Keep draft & contact the client
                        </div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted, #6b7280)' }}>
                          Retain original details; create a staff follow-up note.
                        </div>
                      </div>
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={onKeepDraft}
                      >
                        Keep Draft
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>

        {/* Modal footer actions */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'flex-end',
            gap: '0.75rem',
            paddingTop: 'var(--space-md, 1rem)',
            borderTop: '1px solid var(--border-subtle, #e5e7eb)',
          }}
        >
          <Button variant="ghost" onClick={onKeepDraft}>
            Keep as draft
          </Button>
          <Button variant="secondary" onClick={onClose}>
            View conflict
          </Button>
          {conflicts.some((c) => (c.suggestedSolutions.alternativeUnits?.length ?? 0) > 0 || (c.suggestedSolutions.compatibleSubstitutes?.length ?? 0) > 0) && (
            <Button
              variant="primary"
              onClick={() => {
                const first = conflicts[0]
                if (first?.suggestedSolutions.alternativeUnits?.[0]) {
                  onReassignUnit?.(first.lineId, first.suggestedSolutions.alternativeUnits[0].unitId)
                } else if (first?.suggestedSolutions.compatibleSubstitutes?.[0]) {
                  onSelectSubstitute?.(first.lineId, first.suggestedSolutions.compatibleSubstitutes[0].productId)
                }
              }}
            >
              Find alternatives
            </Button>
          )}
        </div>
      </div>
    </Modal>
  )
}
